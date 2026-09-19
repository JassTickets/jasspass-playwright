import { expect, test } from '@playwright/test';
import { selectFirstEventStartingWithPBO } from '../../helpers/eventHelpers';

test.setTimeout(120_000);

test('duplicate ticket type validates overrides and creates a copy', async ({
  page,
}) => {
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  await organizerPage
    .getByRole('button', { name: 'Ticket Types', exact: true })
    .first()
    .click();

  const duplicateAction = organizerPage
    .getByRole('button', { name: /^Duplicate .+/ })
    .first();
  await expect(duplicateAction).toBeVisible();

  const actionLabel = await duplicateAction.getAttribute('aria-label');
  const sourceName = actionLabel!.replace(/^Duplicate /, '');
  await duplicateAction.click();

  const form = organizerPage.getByRole('form', {
    name: 'Duplicate Ticket Type',
  });
  await expect(form).toBeVisible();

  const name = form.getByLabel('New name');
  const price = form.getByLabel(/New price/);
  const capacity = form.getByLabel('New capacity');
  const submit = form.getByRole('button', { name: 'Duplicate', exact: true });

  await expect(name).toHaveValue(`${sourceName} Copy`);
  await expect(price).not.toHaveValue('');
  await expect(capacity).not.toHaveValue('');

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

  if (await price.isEnabled()) {
    await price.fill('-0.01');
    await submit.click();
    await expect(form.getByRole('alert')).toContainText(
      'Price must be zero or greater.'
    );
    await price.fill('12.34');
  } else {
    await expect(price).toHaveValue('0');
  }

  await capacity.fill('1.5');
  await submit.click();
  await expect(form.getByRole('alert')).toContainText(
    'Capacity must be a whole number that is zero or greater.'
  );

  await capacity.fill('37');
  await submit.click();

  await expect(form).toBeHidden();
  await expect(
    organizerPage.getByText(
      `Ticket type "${uniqueName}" duplicated successfully.`
    )
  ).toBeVisible();
  await expect(
    organizerPage.getByText(uniqueName, { exact: true })
  ).toBeVisible();
});

test('duplicate ticket type editor stays inline and stacks on mobile', async ({
  page,
}) => {
  const organizerPage = await selectFirstEventStartingWithPBO(page);
  await organizerPage.setViewportSize({ width: 390, height: 844 });

  await organizerPage
    .getByRole('button', { name: 'Ticket Types', exact: true })
    .first()
    .click();

  await organizerPage
    .getByRole('button', { name: /^Duplicate .+/ })
    .first()
    .click();

  const form = organizerPage.getByRole('form', {
    name: 'Duplicate Ticket Type',
  });
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
