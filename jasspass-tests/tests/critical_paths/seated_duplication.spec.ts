import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import { dismissDateOfBirthPromptIfPresent } from '../../helpers/auth';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import {
  blockSeats,
  numberedSeats,
  readSeatingAvailability,
  type SeatingMapResponse,
} from '../../helpers/seatingHelpers';
import {
  purchaseAutoAssignedFreeTickets,
} from '../../helpers/seatedCheckoutHelpers';
import type { CreatedTicketType } from '../../fixtures/application';

test.describe('seated event duplication', () => {
  test.setTimeout(240_000);

  test('copies an unpublished layout with remapped ticket types and no reservations', async ({
    page,
    ownerPage,
    ownerApi,
    eventFactory,
  }) => {
    const source = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        { type: 'Duplicate Standard', price: 0, totalTickets: 2 },
        { type: 'Duplicate Premium', price: 0, totalTickets: 1 },
      ],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Mixed Duplicate Floor',
            Code: 'DUP',
            TicketTypeId: event.ticketTypes[0].Id,
            StageSide: 1,
            FillPriority: 7,
            Rows: [
              {
                Label: 'A',
                Seats: [
                  { Number: '1' },
                  { Number: '2' },
                  { Number: '3', TicketTypeId: event.ticketTypes[1].Id },
                ],
              },
            ],
          },
        ],
        SelectionRules: {
          NoOrphanSeats: true,
          AutoAssignSeats: true,
          Strategy: 1,
        },
      }),
    });
    await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      source,
      source.ticketTypes[0],
      1,
      'DuplicateSource'
    );
    await blockSeats(ownerApi, source, ['DUP-A2']);

    await ownerPage.goto(
      `${JASS_TEST_URL}/portal/organizer/company/${source.organizerId}/event/${source.id}`
    );
    await dismissDateOfBirthPromptIfPresent(ownerPage, 10_000);
    await ownerPage.getByRole('button', { name: 'Event Settings' }).click();
    await ownerPage.getByRole('button', { name: 'Duplicate Event' }).click();
    await expect(
      ownerPage.getByText(/seating map/i).filter({ visible: true }).first()
    ).toBeVisible();

    const duplicateName = `${source.name} Seating Copy`;
    const textboxes = ownerPage.getByRole('textbox');
    await textboxes.first().fill(duplicateName);
    const start = ownerPage
      .locator('div')
      .filter({ hasText: /^New Start Date and Time$/ })
      .getByRole('textbox');
    const end = ownerPage
      .locator('div')
      .filter({ hasText: /^New End Date and Time$/ })
      .getByRole('textbox');
    await start.fill('2040-08-20T10:00');
    await end.fill('2040-08-20T14:00');

    const duplicateResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/protected/events/${source.id}/duplicate`),
      { timeout: 45_000 }
    );
    await ownerPage
      .getByRole('button', { name: 'Duplicate', exact: true })
      .click();
    const duplicateResponse = await duplicateResponsePromise;
    const duplicateText = await duplicateResponse.text();
    expect(
      duplicateResponse.ok(),
      `Duplicate failed with ${duplicateResponse.status()}: ${duplicateText}`
    ).toBeTruthy();
    const duplicateBody = JSON.parse(duplicateText) as {
      Event?: { Id?: string; Name?: string; IsVisible?: boolean };
      Id?: string;
      Name?: string;
      IsVisible?: boolean;
    };
    const duplicateEvent = duplicateBody.Event ?? duplicateBody;
    const duplicateId = String(duplicateEvent.Id ?? '');
    expect(duplicateId).not.toBe('');
    expect(duplicateEvent).toMatchObject({ Name: duplicateName, IsVisible: false });

    try {
      const [mapResponse, duplicateTypes] = await Promise.all([
        ownerApi.get(
          `/api/protected/organizers/${source.organizerId}/events/${duplicateId}/seating-map`
        ),
        getApiArray<CreatedTicketType>(
          ownerApi.get(`/api/public/events/${duplicateId}/ticket-types`),
          'TicketTypes'
        ),
      ]);
      expect(mapResponse.ok()).toBeTruthy();
      const copiedMap = (await mapResponse.json()) as SeatingMapResponse;
      expect(copiedMap).toMatchObject({
        EventId: duplicateId,
        IsPublished: false,
        SelectionRules: {
          NoOrphanSeats: true,
          AutoAssignSeats: true,
          Strategy: 1,
        },
      });
      expect(copiedMap.Sections).toHaveLength(1);
      expect(copiedMap.Sections[0].Id).not.toBe(source.seatingMap?.Sections[0].Id);
      expect(copiedMap.Sections[0]).toMatchObject({
        Name: 'Mixed Duplicate Floor',
        Code: 'DUP',
        StageSide: 1,
        FillPriority: 7,
      });

      const duplicateIdByName = new Map(
        duplicateTypes.map((type) => [type.Type, type.Id])
      );
      expect(copiedMap.Sections[0].TicketTypeId).toBe(
        duplicateIdByName.get('Duplicate Standard')
      );
      expect(
        copiedMap.Sections[0].Rows[0].Seats.find((seat) => seat.Number === '3')
          ?.TicketTypeId
      ).toBe(duplicateIdByName.get('Duplicate Premium'));
      const sourceTypeIds = new Set(source.ticketTypes.map((type) => type.Id));
      expect(sourceTypeIds.has(copiedMap.Sections[0].TicketTypeId ?? '')).toBe(false);

      const publicDraftMap = await ownerApi.get(
        `/api/public/seating/${duplicateId}/map`
      );
      expect(publicDraftMap.status()).toBe(404);
      const publish = await ownerApi.post(
        `/api/protected/organizers/${source.organizerId}/events/${duplicateId}/seating-map/publish`
      );
      expect(publish.ok()).toBeTruthy();
      const availability = await readSeatingAvailability(ownerApi, duplicateId);
      expect(availability.Seats).toHaveLength(3);
      expect(availability.Seats.every((seat) => seat.Status === 'Available')).toBe(
        true
      );
    } finally {
      const cleanup = await ownerApi.delete(
        `/api/protected/events/${duplicateId}/delete`
      );
      expect([200, 204, 404]).toContain(cleanup.status());
    }
  });
});
