import { test, expect } from '../../fixtures/application';
import {
  createAndPublishSeatingMap,
  expectSeatStatus,
  numberedSeats,
  openOrganizerSeatingMap,
  organizerSeat,
  type HoldResponse,
  type SeatingMapResponse,
} from '../../helpers/seatingHelpers';
import { visibleModalShell } from '../../helpers/eventHelpers';

test.describe('organizer seated-event management', () => {
  test.setTimeout(180_000);

  test('creates, configures, and publishes a seating map from the event portal', async ({
    ownerPage,
    ownerApi,
    eventFactory,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      tickets: [
        {
          type: 'Portal Reserved',
          price: 0,
          totalTickets: 10,
          maxTicketsPerPurchase: 4,
        },
      ],
    });
    const ticketType = created.ticketTypes[0];

    await openOrganizerSeatingMap(
      ownerPage,
      created.organizerId,
      created.id
    );
    await expect(ownerPage.getByText('No map created', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await ownerPage.getByRole('button', { name: 'Add section' }).click();

    const ticketTypeSelect = ownerPage
      .locator('select')
      .filter({ has: ownerPage.locator(`option[value="${ticketType.Id}"]`) })
      .first();
    await expect(ticketTypeSelect).toBeVisible();
    await ticketTypeSelect.selectOption(ticketType.Id);

    const saveDraftResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`
    );
    await ownerPage.getByRole('button', { name: 'Save draft' }).click();
    const saveDraftResponse = await saveDraftResponsePromise;
    expect(saveDraftResponse.status()).toBe(200);
    const draft = (await saveDraftResponse.json()) as SeatingMapResponse;
    expect(draft).toMatchObject({
      EventId: created.id,
      IsPublished: false,
    });
    expect(draft.Sections).toHaveLength(1);
    expect(draft.Sections[0].TicketTypeId).toBe(ticketType.Id);
    expect(draft.Sections[0].Rows[0].Seats).toHaveLength(10);
    await expect(
      ownerPage.getByText('Seating map saved.', { exact: true }).last()
    ).toBeVisible();

    await ownerPage
      .getByRole('button', { name: /Rules & fill/ })
      .click();
    const ruleSwitches = ownerPage.getByRole('switch');
    await expect(ruleSwitches).toHaveCount(2);
    await ruleSwitches.nth(0).click();
    await ruleSwitches.nth(1).click();
    await ownerPage
      .locator('select')
      .filter({
        has: ownerPage.getByRole('option', {
          name: 'Back rows first, centred',
        }),
      })
      .selectOption('1');

    const saveRulesResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`
    );
    await ownerPage.getByRole('button', { name: 'Save changes' }).click();
    const saveRulesResponse = await saveRulesResponsePromise;
    expect(saveRulesResponse.status()).toBe(200);
    const savedRules = (await saveRulesResponse.json()) as SeatingMapResponse & {
      SelectionRules?: {
        NoOrphanSeats: boolean;
        AutoAssignSeats: boolean;
        Strategy: number;
      };
    };
    expect(savedRules.SelectionRules).toEqual({
      NoOrphanSeats: true,
      AutoAssignSeats: true,
      Strategy: 1,
    });

    await ownerPage.getByRole('button', { name: /Publish/ }).first().click();
    await expect(
      ownerPage.getByText('Ready to publish', { exact: true })
    ).toBeVisible();
    const publishResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map/publish`
    );
    await ownerPage.getByRole('button', { name: 'Save & Publish' }).click();
    const publishResponse = await publishResponsePromise;
    expect(publishResponse.status()).toBe(200);
    const published = (await publishResponse.json()) as SeatingMapResponse;
    expect(published.IsPublished).toBe(true);
    if (published.SellableTicketTypeIds) {
      expect(published.SellableTicketTypeIds).toEqual([ticketType.Id]);
    }
    await expect(
      ownerPage.getByText('Live — buyers can select seats', { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      ownerPage.getByText('Seating map published — 10 seats created.', {
        exact: true,
      })
    ).toBeVisible();

    const publicMapResponse = await ownerApi.get(
      `/api/public/seating/${created.id}/map`
    );
    expect(publicMapResponse.status()).toBe(200);
    const publicMap = (await publicMapResponse.json()) as SeatingMapResponse;
    expect(publicMap).toMatchObject({
      EventId: created.id,
      IsPublished: true,
    });
    if (publicMap.SellableTicketTypeIds) {
      expect(publicMap.SellableTicketTypeIds).toEqual([ticketType.Id]);
    }
    await expectSeatStatus(ownerApi, created.id, 'A-A1', 'Available');
  });

  test('stages live seat blocks, restores an abandoned guest booking, and releases the block', async ({
    ownerPage,
    ownerApi,
    eventFactory,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      tickets: [{ type: 'Managed Reserved', price: 0, totalTickets: 4 }],
    });
    const ticketType = created.ticketTypes[0];
    await createAndPublishSeatingMap(ownerApi, created, [
      {
        Name: 'Managed Block',
        Code: 'B',
        TicketTypeId: ticketType.Id,
        Rows: [{ Label: 'A', Seats: numberedSeats(4) }],
      },
    ]);

    await openOrganizerSeatingMap(
      ownerPage,
      created.organizerId,
      created.id
    );
    const availableSeat = organizerSeat(ownerPage, 'B-A1', 'Available');
    await expect(availableSeat).toBeVisible({ timeout: 30_000 });
    await availableSeat.click();
    await expect(ownerPage.getByText(/1 to block/)).toBeVisible();

    const blockResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/seating-map/block`)
    );
    await ownerPage.getByRole('button', { name: 'Apply changes' }).click();
    const blockResponse = await blockResponsePromise;
    expect(blockResponse.status()).toBe(200);
    expect(await blockResponse.json()).toEqual(['B-A1']);
    await expectSeatStatus(ownerApi, created.id, 'B-A1', 'Blocked');
    await expect(
      ownerPage.getByText('1 seat(s) blocked. Book them for a guest?', {
        exact: true,
      })
    ).toBeVisible();

    const holdBlockedResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/seating-map/hold-blocked')
    );
    await ownerPage
      .getByRole('button', { name: 'Book for a guest' })
      .click();
    const holdBlockedResponse = await holdBlockedResponsePromise;
    expect(holdBlockedResponse.status()).toBe(200);
    const blockedHold = (await holdBlockedResponse.json()) as HoldResponse;
    expect(blockedHold.SeatLabels).toEqual(['B-A1']);
    await expectSeatStatus(ownerApi, created.id, 'B-A1', 'Reserved');
    const bookingModal = visibleModalShell(ownerPage, 'Select Tickets');
    await expect(bookingModal).toBeVisible();
    await expect(bookingModal.locator('#FirstName')).toBeVisible();

    const restoreResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/seating-map/restore-blocked')
    );
    await bookingModal.getByRole('button', { name: 'Close' }).click();
    const restoreResponse = await restoreResponsePromise;
    expect(restoreResponse.status()).toBe(200);
    expect(await restoreResponse.json()).toEqual(['B-A1']);
    await expectSeatStatus(ownerApi, created.id, 'B-A1', 'Blocked');

    const blockedSeat = organizerSeat(ownerPage, 'B-A1', 'Blocked');
    await expect(blockedSeat).toBeVisible({ timeout: 30_000 });
    await blockedSeat.click();
    await expect(ownerPage.getByText(/1 to release/)).toBeVisible();
    const unblockResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/seating-map/unblock')
    );
    await ownerPage.getByRole('button', { name: 'Apply changes' }).click();
    const unblockResponse = await unblockResponsePromise;
    expect(unblockResponse.status()).toBe(200);
    expect(await unblockResponse.json()).toEqual(['B-A1']);
    await expectSeatStatus(ownerApi, created.id, 'B-A1', 'Available');
  });
});
