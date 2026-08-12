import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { JASS_TEST_URL } from '../constants';
import type { CreatedEvent } from '../fixtures/application';

export type SeatStatus = 'Available' | 'Reserved' | 'Booked' | 'Blocked';

export type SeatingSeatInput = {
  Number: string;
  TicketTypeId?: string | null;
};

export type SeatingSectionInput = {
  Name: string;
  Code: string;
  TicketTypeId: string | null;
  StageSide?: 0 | 1;
  FillPriority?: number;
  Rows: Array<{
    Label: string;
    Seats: SeatingSeatInput[];
  }>;
};

export type SeatingSelectionRulesInput = {
  NoOrphanSeats: boolean;
  AutoAssignSeats?: boolean;
  Strategy?: 0 | 1 | 2;
};

export type HeldSeat = {
  SeatLabel: string;
  TicketTypeId: string | null;
};

export type HoldResponse = {
  HoldToken: string;
  ExpiresAtUtc: string;
  Seats?: HeldSeat[];
  SeatLabels: string[];
};

export type SeatingMapResponse = {
  Id: string;
  EventId: string;
  IsPublished: boolean;
  SellableTicketTypeIds?: string[];
  Sections: Array<{
    Id: string;
    Name: string;
    Code: string;
    TicketTypeId: string | null;
    Rows: Array<{
      Label: string;
      Seats: Array<{
        Label: string;
        Number: string;
        TicketTypeId?: string | null;
        EffectiveTicketTypeId?: string | null;
      }>;
    }>;
  }>;
};

export type SeatingAvailabilityResponse = {
  EventId: string;
  Seats: Array<{ Label: string; Status: SeatStatus }>;
};

async function requireOk(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
  operation: string
): Promise<void> {
  if (response.ok()) return;
  const body = await response.text().catch(() => '<unreadable>');
  throw new Error(
    `${operation} failed with ${response.status()} ${response.statusText()}: ${body}`
  );
}

export function numberedSeats(
  count: number,
  ticketTypeId?: string | null
): SeatingSeatInput[] {
  return Array.from({ length: count }, (_, index) => ({
    Number: String(index + 1),
    ...(ticketTypeId !== undefined ? { TicketTypeId: ticketTypeId } : {}),
  }));
}

export async function createAndPublishSeatingMap(
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  sections: SeatingSectionInput[],
  selectionRules: SeatingSelectionRulesInput | null = null
): Promise<SeatingMapResponse> {
  const mapPath = `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`;
  const createResponse = await ownerApi.post(mapPath, {
    data: {
      EventId: created.id,
      Sections: sections.map((section) => ({
        ...section,
        StageSide: section.StageSide ?? 0,
        FillPriority: section.FillPriority ?? 0,
      })),
      SelectionRules: selectionRules,
      Props: [],
    },
  });
  await requireOk(createResponse, `Create seating map for event ${created.id}`);
  const draft = (await createResponse.json()) as SeatingMapResponse;
  expect(draft).toMatchObject({ EventId: created.id, IsPublished: false });

  const publishResponse = await ownerApi.post(`${mapPath}/publish`);
  await requireOk(
    publishResponse,
    `Publish seating map for event ${created.id}`
  );
  const published = (await publishResponse.json()) as SeatingMapResponse;
  expect(published).toMatchObject({
    EventId: created.id,
    IsPublished: true,
  });
  return published;
}

export async function readSeatingAvailability(
  api: APIRequestContext,
  eventId: string
): Promise<SeatingAvailabilityResponse> {
  const response = await api.get(
    `/api/public/seating/${eventId}/availability`
  );
  await requireOk(response, `Read seating availability for event ${eventId}`);
  return (await response.json()) as SeatingAvailabilityResponse;
}

export async function expectSeatStatus(
  api: APIRequestContext,
  eventId: string,
  seatLabel: string,
  status: SeatStatus
): Promise<void> {
  await expect
    .poll(
      async () => {
        const availability = await readSeatingAvailability(api, eventId);
        return availability.Seats.find((seat) => seat.Label === seatLabel)
          ?.Status;
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] }
    )
    .toBe(status);
}

export function seatButton(page: Page, seatLabel: string): Locator {
  return page.getByRole('button', { name: seatLabel, exact: true });
}

function isSeatMutation(
  response: Response,
  eventId: string,
  operation: 'add' | 'remove',
  seatLabel: string
): boolean {
  if (response.request().method() !== 'POST') return false;
  if (
    !response
      .url()
      .includes(`/api/public/seating/${eventId}/hold/${operation}`)
  ) {
    return false;
  }
  try {
    const body = response.request().postDataJSON() as { SeatLabel?: string };
    return body.SeatLabel === seatLabel;
  } catch {
    return false;
  }
}

export async function clickSeatAndWaitForHold(
  page: Page,
  eventId: string,
  seatLabel: string
): Promise<{ response: Response; hold: HoldResponse | null }> {
  const responsePromise = page.waitForResponse(
    (response) => isSeatMutation(response, eventId, 'add', seatLabel),
    { timeout: 30_000 }
  );
  await seatButton(page, seatLabel).click();
  const response = await responsePromise;
  return {
    response,
    hold: response.ok() ? ((await response.json()) as HoldResponse) : null,
  };
}

export async function openOrganizerSeatingMap(
  page: Page,
  organizerId: string,
  eventId: string
): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('dobPromptDismissed', '1');
  });
  const navigation = await page.goto(
    `${JASS_TEST_URL}/portal/organizer/company/${organizerId}/event/${eventId}`
  );
  expect(navigation?.ok()).toBeTruthy();
  const seatingTab = page.getByRole('button', {
    name: 'Seating Map',
    exact: true,
  });
  await expect(seatingTab).toBeVisible({ timeout: 30_000 });
  await seatingTab.click();
}

export function organizerSeat(
  page: Page,
  seatLabel: string,
  status?: 'Available' | 'Blocked' | 'Sold' | 'Held'
): Locator {
  const title = status
    ? `${seatLabel} · ${status}`
    : new RegExp(`^${seatLabel} · `);
  return page.locator('svg title').filter({ hasText: title }).first().locator('..');
}
