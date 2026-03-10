import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // Recording...

  // Sign in (Reuse)
  await page.getByRole('link', { name: 'Sign In' }).click();
  await page.getByRole('textbox', { name: 'Email' }).click();

  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('PlaywrightBot@1234');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Pick first event (reuse)

  await page.getByText('PPBO - New Nameplaywright-bot@gmail.com+6 (467) 899-045CanadaPlaywright Bot St').click();

  await page.getByRole('link', { name: 'Events' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).first().click();
  await page.getByText('Discover Events').click();
  await page.getByRole('link', { name: 'PBO - Event New Name 1773083142625 PBO - Event New Name 1773083142625 Sample' }).click();
  const page1Promise = page.waitForEvent('popup');
  await page.getByText('Organizer View').click();
  const page1 = await page1Promise;

  // Once in the event portal - go to the event operators tab and add an operator with all policies.
  await page1.getByRole('link', { name: 'Event Operators' }).click();
  await page1.getByRole('textbox', { name: 'Email address' }).click();

  await page1.getByRole('textbox', { name: 'Email address' }).fill('playwright-bot2@gmail.com');
  await page1.getByRole('button', { name: 'Add Operator' }).click();
  await page1.getByRole('checkbox', { name: 'Read Event' }).check();
  await page1.getByRole('checkbox', { name: 'Update Event' }).check();
  await page1.getByRole('checkbox', { name: 'Delete Event' }).check();
  await page1.getByRole('checkbox', { name: 'Read Ticket', exact: true }).check();
  await page1.getByRole('checkbox', { name: 'Scan Ticket' }).check();
  await page1.getByRole('checkbox', { name: 'Read Ticket Type' }).check();
  await page1.getByRole('checkbox', { name: 'Create Ticket Type' }).check();
  await page1.getByRole('checkbox', { name: 'Update Ticket Type' }).check();
  await page1.getByRole('checkbox', { name: 'Delete Ticket Type' }).check();
  await page1.getByRole('checkbox', { name: 'Read Transaction' }).check();
  await page1.getByRole('checkbox', { name: 'Read Refund' }).check();
  await page1.getByRole('checkbox', { name: 'Read External Purchase' }).check();
  await page1.getByRole('checkbox', { name: 'Update External Purchase' }).check();
  await page1.getByRole('button', { name: 'Save Policies' }).click();

  // Page 2 - Sign in as operator and verify access
  await page2.goto('https://testlab-env191.jasspass.com/portal/organizer');

  // Sign out if logged in. Otherwise just login

  // Signout (put this in a try-catch in case we're already signed out)
  await page2.getByRole('button').filter({ hasText: /^$/ }).click();
  await page2.locator('div').filter({ hasText: /^Sign Out$/ }).first().click();

  // Then sign in with the operator account (reuse the sign in logic)
  await page2.getByRole('link', { name: 'Sign In' }).click();
  await page2.getByRole('textbox', { name: 'Email' }).click();
  await page2.getByRole('textbox', { name: 'Email' }).fill('playwright-bot@gmail.com');
  await page2.getByRole('textbox', { name: 'Email' }).click();
  await page2.getByRole('textbox', { name: 'Email' }).fill('playwright-bot@gmail.com2');
  await page2.getByRole('textbox', { name: 'Email' }).press('ControlOrMeta+z');
  await page2.getByRole('textbox', { name: 'Email' }).click();
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).press('ArrowLeft');
  await page2.getByRole('textbox', { name: 'Email' }).fill('playwright-bot2@gmail.com');
  await page2.getByRole('textbox', { name: 'Password' }).click();
  await page2.getByRole('textbox', { name: 'Password' }).fill('PlaywrightBot@1234');
  await page2.getByRole('button', { name: 'Sign in' }).click();

  // Once we're signed in, go to "My Events"
  await page2.getByRole('button').filter({ hasText: /^$/ }).click();
  await page2.locator('div').filter({ hasText: /^My Events$/ }).first().click();

  // Search for the event we're managing (the one we got policies to)
  await page2.getByRole('textbox', { name: 'Search events' }).click();
  await page2.getByRole('textbox', { name: 'Search events' }).fill('PBO - Event New Name');

  // Click the event title to make sure it exists
  await page2.getByRole('heading', { name: 'PBO - Event New Name' }).click();
  // Then click go to event
  await page2.getByRole('button', { name: 'Go to event' }).click();

  // Verify overview (we can see dashboard)
  // Verify we see the dashboard (do regex so the revenue numbers dont cause issues. It should work no matter which revenue it has)
  await page2.getByText('Gross Revenue$0.00Net Revenue$0.00505Event ViewsOverviewFee BreakdownGross').click();

  // Verify we can see Orders and Attendees
  await page2.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Verify we can see orders (any order)
  await page2.getByRole('cell', { name: '#Z6D8BYYOP23Q' }).click(); // Any order number (just the first order found, to make sure it can read orders)
  await page2.getByRole('button', { name: 'Send Confirmation Email' }).click(); // Verify email sent successfully message appears (aka can read orders and send confirmation email policy works)
  await page2.getByText('Email sent successfully!').click();

  // Now verify we can see Attendees (any attendee)
  await page2.getByRole('button', { name: '✕' }).click(); // close the modal
  await page2.getByRole('button', { name: 'Attendees' }).click(); // go to attendees tab
  await page2.getByRole('row', { name: 'General Admission Playwright Bot DB8BE8 Not Scanned Active' }).getByRole('cell').first().click(); // verify if we see any rows (do regex cuz the name might be different)

  // Verify we can see ticket types tab
  await page2.getByRole('link', { name: 'Ticket Types' }).click();
  // Verify we have a "General Admission" ticket type (aka can read ticket types policy works)
  await page2.getByRole('cell', { name: 'General Admission' }).click();

  // Verify adding a ticket type (aka create ticket type policy works) - Reuse create ticket type logic
  await page2.getByRole('button', { name: 'Add Ticket Type' }).click();
  await page2.getByRole('textbox', { name: 'Enter type' }).click();
  await page2.getByRole('textbox', { name: 'Enter type' }).fill('New');
  await page2.getByRole('textbox', { name: 'Enter type' }).press('Tab');
  await page2.getByPlaceholder('Enter quantity').fill('10');
  await page2.getByPlaceholder('Enter quantity').press('Tab');
  await page2.locator('div').filter({ hasText: /^Price \(\$\)$/ }).getByPlaceholder('0.00').fill('10');
  await page2.locator('div').filter({ hasText: /^Price \(\$\)$/ }).getByPlaceholder('0.00').press('Tab');
  await page2.getByRole('button', { name: 'Add Ticket Type' }).nth(1).click();
  await page2.getByText('Ticket Type added successfully').click(); //Verify it actually created

  // Verify edit event tab (also reuse edit event logic)... doesnt matter which field we edit as long as we verify it
  await page2.getByRole('link', { name: 'Edit Event' }).click();
  await page2.getByRole('textbox', { name: 'Event Title*' }).click();
  await page2.getByRole('textbox', { name: 'Event Title*' }).fill('PBO - Event New Name 1773083142625 (Operator)');
  // click save changes (should work)

  // Verify refunds tab
  await page2.getByRole('link', { name: 'Refunds' }).click();
  await page2.getByRole('link', { name: 'Event Settings' }).click();
  await page2.getByRole('heading', { name: 'Widget Generator' }).click();


});