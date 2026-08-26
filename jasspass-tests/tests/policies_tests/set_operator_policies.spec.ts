import { test, expect } from '../../fixtures/application';
import { signIn } from '../../helpers/auth';
import { addOperatorWithAllPolicies } from '../../helpers/organizerHelpers';
import { PLAYWRIGHT_BOT2_EMAIL } from '../../constants';

test.setTimeout(240_000); // 4 minutes timeout for complex flow

// @Description: This test verifies the complete operator policy flow - adding an operator with all policies and verifying their access
// @Dependencies: Requires existing organizer and event, sign-in functionality
test('operator policies comprehensive flow', async ({
  ownerPage,
  ownerIdentity,
  eventFactory,
}) => {
  console.log('[INFO] Starting operator policies comprehensive flow test...');
  const created = await eventFactory.create({
    name: `Operator Policy Test Event ${Date.now()}`,
  });
  await signIn(ownerPage, {
    targetPath: `/portal/organizer/company/${ownerIdentity.organizerId}/event/${created.id}`,
  });
  await addOperatorWithAllPolicies(ownerPage, PLAYWRIGHT_BOT2_EMAIL);
  await expect(
    ownerPage.getByRole('textbox', { name: 'Email address' })
  ).toHaveValue('');
  console.log(
    '[INFO] Operator policies comprehensive flow test completed successfully!'
  );
});
