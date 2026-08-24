import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import {
  assertOrderConfirmation,
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  openCheckout,
  openTicketPicker,
  submitPurchase,
  ticketRow,
} from '../../helpers/criticalCheckoutHelpers';
import {
  clickSeatAndWaitForHold,
  expectSeatStatus,
  numberedSeats,
  seatButton,
} from '../../helpers/seatingHelpers';

test.describe('seated ticket access controls', () => {
  test.setTimeout(180_000);

  test('hides link-only seats publicly and sells them only through their ticket link', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        { type: 'Public Reserved', price: 0, totalTickets: 1 },
        {
          type: 'Private Reserved',
          price: 0,
          totalTickets: 1,
          showInEventPage: false,
        },
      ],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Public Section',
            Code: 'PUB',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
          {
            Name: 'Private Section',
            Code: 'PRV',
            TicketTypeId: event.ticketTypes[1].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });
    const privateType = created.ticketTypes.find(
      (ticket) => ticket.Type === 'Private Reserved'
    )!;

    await page.goto(`${JASS_TEST_URL}/event/${created.id}`);
    await expect(
      page.getByRole('heading', { name: created.name }).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(seatButton(page, 'PUB-A1')).toBeVisible();
    await expect(seatButton(page, 'PRV-A1')).toHaveCount(0);
    const publicPicker = await openTicketPicker(page);
    await expect(
      publicPicker.getByText(privateType.Type, { exact: true })
    ).toHaveCount(0);
    await publicPicker
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(publicPicker).toBeHidden({ timeout: 15_000 });

    await page.goto(
      `${JASS_TEST_URL}/event/${created.id}?tickets=${privateType.Id}`
    );
    await expect(
      page.getByRole('heading', { name: created.name }).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(seatButton(page, 'PRV-A1')).toBeVisible();
    await expect(seatButton(page, 'PUB-A1')).toHaveCount(0);
    const hold = await clickSeatAndWaitForHold(page, created.id, 'PRV-A1');
    expect(hold.response.ok()).toBeTruthy();
    await openCheckout(page);
    await fillGuestContact(page, createUniqueBuyer('PrivateReserved'));
    const purchase = await submitPurchase(page, 'RSVP');
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);
    await expectSeatStatus(ownerApi, created.id, 'PRV-A1', 'Booked');
  });

  test('keeps access-code seats unavailable until the correct code is unlocked', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    test.fail(
      true,
      'Known bug: SeatingMapPicker does not receive the ticket access-code unlock state.'
    );
    const accessCode = `SEAT${Date.now().toString().slice(-6)}`;
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Code Reserved',
          price: 0,
          totalTickets: 1,
          accessCode,
        },
      ],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Code Section',
            Code: 'CODE',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });

    await page.goto(`${JASS_TEST_URL}/event/${created.id}`);
    await expect(
      page.getByRole('heading', { name: created.name }).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    const ticketPicker = await openTicketPicker(page);
    const row = ticketRow(page, 'Code Reserved');
    await expect(row).toBeVisible();
    const input = page
      .getByPlaceholder('Access Code')
      .filter({ visible: true });
    const unlock = page
      .getByRole('button', { name: 'Unlock' })
      .filter({ visible: true });
    await expect(input).toBeVisible();

    const lockedSeat = seatButton(page, 'CODE-A1');
    const initiallyLocked =
      (await lockedSeat.count()) === 0 || (await lockedSeat.isDisabled());

    await input.fill('WRONG-CODE');
    const wrongResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/access-code/validate') &&
        response.url().includes('WRONG-CODE')
    );
    await unlock.click();
    const wrongResponse = await wrongResponsePromise;
    if (wrongResponse.ok()) {
      const payload = await wrongResponse.json().catch(() => null);
      expect(payload).not.toEqual(
        expect.objectContaining({ Id: created.ticketTypes[0].Id })
      );
    } else {
      expect(wrongResponse.status()).toBeGreaterThanOrEqual(400);
    }
    await expect(input).toBeVisible();
    const remainedLocked =
      (await lockedSeat.count()) === 0 || (await lockedSeat.isDisabled());
    await expectSeatStatus(ownerApi, created.id, 'CODE-A1', 'Available');

    await input.fill(accessCode);
    const validResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/access-code/validate') &&
        response.url().includes(encodeURIComponent(accessCode))
    );
    await unlock.click();
    expect((await validResponsePromise).ok()).toBeTruthy();
    await expect(input).toHaveCount(0);
    await ticketPicker
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(ticketPicker).toBeHidden({ timeout: 15_000 });
    await expect(seatButton(page, 'CODE-A1')).toBeEnabled();

    const hold = await clickSeatAndWaitForHold(page, created.id, 'CODE-A1');
    expect(hold.response.ok()).toBeTruthy();
    await openCheckout(page);
    await fillGuestContact(page, createUniqueBuyer('CodeReserved'));
    const purchase = await submitPurchase(page, 'RSVP');
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
    await expectSeatStatus(ownerApi, created.id, 'CODE-A1', 'Booked');
    expect({ initiallyLocked, remainedLocked }).toEqual({
      initiallyLocked: true,
      remainedLocked: true,
    });
  });
});
