import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { JASS_TEST_URL } from '../constants';
import type { CreatedEvent } from '../fixtures/application';
import type {
  HoldResponse,
  SeatStatus,
  SeatingAvailabilityResponse,
  SeatingMapDefinition,
  SeatingMapResponse,
  SeatingSeatInput,
  SeatingSectionInput,
  SeatingSelectionRulesInput,
} from './seatingTypes';

export type {
  HeldSeat,
  HoldResponse,
  SeatStatus,
  SeatingAvailabilityResponse,
  SeatingMapDefinition,
  SeatingMapResponse,
  SeatingSeatInput,
  SeatingSectionInput,
  SeatingSelectionRulesInput,
} from './seatingTypes';

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
  selectionRules: SeatingSelectionRulesInput | null = null,
  props: unknown[] = []
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
      Props: props,
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

export async function updatePublishedSeatingMap(
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  definition: SeatingMapDefinition
): Promise<SeatingMapResponse> {
  const response = await ownerApi.put(
    `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`,
    {
      data: {
        Sections: definition.Sections.map((section) => ({
          ...section,
          StageSide: section.StageSide ?? 0,
          FillPriority: section.FillPriority ?? 0,
        })),
        SelectionRules: definition.SelectionRules ?? null,
        Props: definition.Props ?? [],
      },
    }
  );
  await requireOk(response, `Update seating map for event ${created.id}`);
  const updated = (await response.json()) as SeatingMapResponse;
  expect(updated).toMatchObject({ EventId: created.id, IsPublished: true });
  return updated;
}

export async function readPublicSeatingMap(
  api: APIRequestContext,
  eventId: string
): Promise<SeatingMapResponse> {
  const response = await api.get(`/api/public/seating/${eventId}/map`);
  await requireOk(response, `Read public seating map for event ${eventId}`);
  return (await response.json()) as SeatingMapResponse;
}

export async function blockSeats(
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  seatLabels: string[]
): Promise<string[]> {
  const response = await ownerApi.post(
    `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map/block`,
    { data: { SeatLabels: seatLabels } }
  );
  await requireOk(response, `Block seats for event ${created.id}`);
  return (await response.json()) as string[];
}

export async function readSeatingAvailability(
  api: APIRequestContext,
  eventId: string
): Promise<SeatingAvailabilityResponse> {
  const response = await api.get(`/api/public/seating/${eventId}/availability`);
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

export async function expectSeatStatuses(
  api: APIRequestContext,
  eventId: string,
  expectedStatuses: Record<string, SeatStatus>
): Promise<void> {
  await expect
    .poll(
      async () => {
        const availability = await readSeatingAvailability(api, eventId);
        const byLabel = new Map(
          availability.Seats.map((seat) => [seat.Label, seat.Status])
        );
        return Object.fromEntries(
          Object.keys(expectedStatuses).map((label) => [
            label,
            byLabel.get(label),
          ])
        );
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] }
    )
    .toEqual(expectedStatuses);
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
    !response.url().includes(`/api/public/seating/${eventId}/hold/${operation}`)
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
  return page
    .locator('svg title')
    .filter({ hasText: title })
    .first()
    .locator('..');
}
