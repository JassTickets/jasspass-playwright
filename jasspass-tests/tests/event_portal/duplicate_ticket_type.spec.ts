import { expect, test } from '../../fixtures/application';
import { openEventOrganizerPortal } from '../../helpers/eventHelpers';
import { openEventPortalDestination } from '../../helpers/portalNavigationHelpers';

test.setTimeout(120_000);

test('duplicate ticket type validates overrides and creates a copy', async ({
  ownerPage,
  eventFactory,
}) => {
  const created = await eventFactory.create({
    tickets: [{ type: 'General Admission', price: 25, totalTickets: 100 }],
  });
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  await openEventPortalDestination(organizerPage, 'ticketTypes');

  const duplicateAction = organizerPage
    .getByRole('button', { name: 'Duplicate General Admission', exact: true })
    .filter({ visible: true });
  await expect(duplicateAction).toBeVisible();

  const sourceName = created.ticketTypes[0].Type;
  await duplicateAction.click();

  const form = organizerPage
    .getByRole('form', { name: 'Duplicate Ticket Type' })
    .filter({ visible: true });
  await expect(form).toBeVisible();

  const name = form.getByLabel('New name');
  const price = form.getByLabel(/New price/);
  const capacity = form.getByLabel('New capacity');
  const submit = form.getByRole('button', { name: 'Duplicate', exact: true });

  await expect(name).toHaveValue(`${sourceName} Copy`);
  await expect(price).toBeEnabled();
  await expect(price).toHaveValue('25');
  await expect(capacity).toHaveValue('100');

  await name.fill('');
  await submit.click();
  await expect(form.getByRole('alert')).toContainText(
    'Enter a name for the duplicated ticket type.'
  );

  await name.fill('123456789012345678901');
  await submit.click();
  await expect(form.getByRole('alert')).toContainText(
    'Ticket type name must be 20 characters or less.'
  );

  await name.fill(sourceName);
  await submit.click();
  await expect(form.getByRole('alert')).toContainText(
    'A ticket type with this name already exists.'
  );

  const uniqueName = `Copy ${Date.now().toString().slice(-8)}`;
  await name.fill(uniqueName);

  // Native min/step validation blocks submission before React's onSubmit runs.
  await price.fill('-0.01');
  await submit.click();
  expect(
    await price.evaluate(
      (input: HTMLInputElement) => input.validity.rangeUnderflow
    )
  ).toBe(true);
  await expect(form).toBeVisible();
  await price.fill('12.34');

  await capacity.fill('1.5');
  await submit.click();
  expect(
    await capacity.evaluate(
      (input: HTMLInputElement) => input.validity.stepMismatch
    )
  ).toBe(true);
  await expect(form).toBeVisible();

  await capacity.fill('37');
  const [response] = await Promise.all([
    organizerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/protected/events/${created.id}/ticket-types/${created.ticketTypes[0].Id}/duplicate`,
      { timeout: 30_000 }
    ),
    submit.click(),
  ]);
  expect(
    response.ok(),
    `Duplicate ticket type: HTTP ${response.status()}`
  ).toBe(true);
  const duplicate = await response.json();
  expect(duplicate).toMatchObject({
    Type: uniqueName,
    Price: 12.34,
    TotalTickets: 37,
  });
  expect(duplicate.Id).toBeTruthy();
  expect(duplicate.Id).not.toBe(created.ticketTypes[0].Id);

  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(
    organizerPage.getByText(
      `Ticket type "${uniqueName}" duplicated successfully.`
    )
  ).toBeVisible();
  await expect(
    organizerPage
      .getByText(uniqueName, { exact: true })
      .filter({ visible: true })
  ).toBeVisible();
});

test('duplicate ticket type editor stays inline and stacks on mobile', async ({
  ownerPage,
  eventFactory,
}) => {
  const created = await eventFactory.create({
    tickets: [{ type: 'General Admission', price: 25, totalTickets: 100 }],
  });
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);
  await openEventPortalDestination(organizerPage, 'ticketTypes');
  await organizerPage.setViewportSize({ width: 390, height: 844 });

  await organizerPage
    .getByRole('button', { name: 'Duplicate General Admission', exact: true })
    .filter({ visible: true })
    .click();

  const form = organizerPage
    .getByRole('form', { name: 'Duplicate Ticket Type' })
    .filter({ visible: true });
  await expect(form).toBeVisible();
  await expect(
    organizerPage.getByRole('dialog', { name: 'Duplicate Ticket Type' })
  ).toHaveCount(0);

  const nameBox = await form.getByLabel('New name').boundingBox();
  const priceBox = await form.getByLabel(/New price/).boundingBox();
  const capacityBox = await form.getByLabel('New capacity').boundingBox();
  const formBox = await form.boundingBox();

  expect(nameBox).not.toBeNull();
  expect(priceBox).not.toBeNull();
  expect(capacityBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(nameBox!.y).toBeLessThan(priceBox!.y);
  expect(priceBox!.y).toBeLessThan(capacityBox!.y);
  expect(formBox!.x).toBeGreaterThanOrEqual(0);
  expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(390);

  const actions = form.getByRole('button');
  await expect(actions.filter({ hasText: 'Cancel' })).toBeVisible();
  await expect(actions.filter({ hasText: 'Duplicate' })).toBeVisible();

  await actions.filter({ hasText: 'Cancel' }).click();
  await expect(form).toBeHidden();
});
