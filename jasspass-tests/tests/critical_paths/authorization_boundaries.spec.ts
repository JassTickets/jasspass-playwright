import { test, expect } from '../../fixtures/application';
import {
  absoluteAppUrl,
  eventPortalPath,
  expectExactPolicies,
  getEventOperators,
  getRepresentatives,
  grantEventOperatorPolicies,
  grantRepresentativePolicies,
  removeEventOperator,
  removeRepresentativesByEmail,
  signInAsUser,
  type AuthenticatedUser,
  type EventOperatorRecord,
  type RepresentativeRecord,
} from '../../helpers/authorizationHelpers';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import {
  PLAYWRIGHT_BOT2_EMAIL,
  PLAYWRIGHT_BOT2_PASSWORD,
} from '../../constants';

const secondaryCredentials = {
  email: PLAYWRIGHT_BOT2_EMAIL,
  password: PLAYWRIGHT_BOT2_PASSWORD,
};

type OrganizerSummary = { Id: string; Name: string };
type OperatorEventSummary = { Id: string; OrganizerId: string; Name: string };

function findByEmail<T extends { Email: string }>(
  records: T[],
  email: string
): T | undefined {
  return records.find(
    (record) => record.Email.toLowerCase() === email.toLowerCase()
  );
}

test.describe('authorization boundaries', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeEach(({ browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'Shared-account grant/revoke lifecycles run once to avoid cross-project policy races.'
    );
  });

  test('a read-only representative can view events but cannot administer the organizer, and revocation removes access', async ({
    browser,
    ownerApi,
    ownerIdentity,
    eventFactory,
  }) => {
    const policies = ['CanReadEvent'];
    const created = await eventFactory.create({ isFreeEvent: true });
    const eventPath = eventPortalPath(created.organizerId, created.id);
    let representativeSession: AuthenticatedUser | undefined;
    let revokedSession: AuthenticatedUser | undefined;

    await removeRepresentativesByEmail(
      ownerApi,
      ownerIdentity.organizerId,
      PLAYWRIGHT_BOT2_EMAIL
    );
    await expect
      .poll(
        async () =>
          findByEmail(
            await getRepresentatives(ownerApi, ownerIdentity.organizerId),
            PLAYWRIGHT_BOT2_EMAIL
          ),
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBeUndefined();

    try {
      await grantRepresentativePolicies(
        ownerApi,
        ownerIdentity.organizerId,
        PLAYWRIGHT_BOT2_EMAIL,
        policies
      );

      let representative: RepresentativeRecord | undefined;
      await expect
        .poll(
          async () => {
            representative = findByEmail(
              await getRepresentatives(ownerApi, ownerIdentity.organizerId),
              PLAYWRIGHT_BOT2_EMAIL
            );
            return representative?.Id;
          },
          { timeout: 30_000, intervals: [500, 1_000, 2_000] }
        )
        .not.toBeUndefined();
      expectExactPolicies(representative!.Policies, policies);

      representativeSession = await signInAsUser(
        browser,
        secondaryCredentials,
        `/portal/organizer/company/${ownerIdentity.organizerId}?tab=events`
      );
      const representativePage = representativeSession.page;

      const organizers = await getApiArray<OrganizerSummary>(
        representativePage.request.get(
          `/api/protected/users/${representativeSession.userId}/organizers`
        ),
        'Organizers'
      );
      expect(organizers.map((organizer) => organizer.Id)).toContain(
        ownerIdentity.organizerId
      );

      const forbiddenTeamRead = await representativePage.request.get(
        `/api/protected/organizers/${ownerIdentity.organizerId}/representatives`
      );
      expect(
        forbiddenTeamRead.status(),
        'CanReadEvent must not imply permission to read organizer representatives.'
      ).toBe(403);

      await expect(representativePage).toHaveURL(
        new RegExp(`/portal/organizer/company/${ownerIdentity.organizerId}`)
      );
      await expect(
        representativePage.getByRole('heading', {
          name: created.name,
          exact: true,
        }),
        `The read-only representative should see events for the assigned organizer.`
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        representativePage.getByRole('button', {
          name: 'New Event',
          exact: true,
        })
      ).toHaveCount(0);

      await representativeSession.context.close();
      representativeSession = undefined;
      await removeRepresentativesByEmail(
        ownerApi,
        ownerIdentity.organizerId,
        PLAYWRIGHT_BOT2_EMAIL
      );

      await expect
        .poll(
          async () =>
            findByEmail(
              await getRepresentatives(ownerApi, ownerIdentity.organizerId),
              PLAYWRIGHT_BOT2_EMAIL
            ),
          { timeout: 30_000, intervals: [500, 1_000, 2_000] }
        )
        .toBeUndefined();

      revokedSession = await signInAsUser(
        browser,
        secondaryCredentials,
        eventPath
      );
      expect(new URL(revokedSession.page.url()).pathname).not.toBe(eventPath);

      const organizersAfterRevoke = await getApiArray<OrganizerSummary>(
        revokedSession.page.request.get(
          `/api/protected/users/${revokedSession.userId}/organizers`
        ),
        'Organizers'
      );
      expect(
        organizersAfterRevoke.map((organizer) => organizer.Id)
      ).not.toContain(ownerIdentity.organizerId);
    } finally {
      await representativeSession?.context.close();
      await revokedSession?.context.close();
      await removeRepresentativesByEmail(
        ownerApi,
        ownerIdentity.organizerId,
        PLAYWRIGHT_BOT2_EMAIL
      );
    }
  });

  test('a ticket-scanning operator is least-privileged, isolated to one event, and loses access after revocation', async ({
    browser,
    ownerApi,
    ownerIdentity,
    eventFactory,
  }) => {
    const policies = ['CanReadEvent', 'CanReadTicket', 'CanScanTicket'];
    const [allowedEvent, isolatedEvent] = await Promise.all([
      eventFactory.create({ isFreeEvent: true }),
      eventFactory.create({ isFreeEvent: true }),
    ]);
    const allowedEventPath = eventPortalPath(
      allowedEvent.organizerId,
      allowedEvent.id
    );
    let operatorSession: AuthenticatedUser | undefined;
    let revokedSession: AuthenticatedUser | undefined;
    let operatorUserId = '';
    let operatorAssignmentId = '';

    await removeRepresentativesByEmail(
      ownerApi,
      ownerIdentity.organizerId,
      PLAYWRIGHT_BOT2_EMAIL
    );
    await expect
      .poll(
        async () =>
          findByEmail(
            await getRepresentatives(ownerApi, ownerIdentity.organizerId),
            PLAYWRIGHT_BOT2_EMAIL
          ),
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBeUndefined();

    try {
      await grantEventOperatorPolicies(
        ownerApi,
        allowedEvent.id,
        PLAYWRIGHT_BOT2_EMAIL,
        policies
      );

      let operator: EventOperatorRecord | undefined;
      await expect
        .poll(
          async () => {
            operator = findByEmail(
              await getEventOperators(ownerApi, allowedEvent.id),
              PLAYWRIGHT_BOT2_EMAIL
            );
            return operator?.UserId;
          },
          { timeout: 30_000, intervals: [500, 1_000, 2_000] }
        )
        .not.toBeUndefined();

      operatorUserId = operator!.UserId;
      const eventGrant = operator!.OperatorDetails.find(
        (detail) => detail.EventId === allowedEvent.id
      );
      expect(
        eventGrant,
        'The operator response must include the assigned event.'
      ).toBeDefined();
      operatorAssignmentId = eventGrant!.Id;
      expectExactPolicies(
        eventGrant!.ManualPolicies ?? eventGrant!.Policies,
        policies
      );

      operatorSession = await signInAsUser(
        browser,
        secondaryCredentials,
        allowedEventPath
      );
      expect(operatorSession.userId).toBe(operatorUserId);
      const operatorPage = operatorSession.page;
      await expect(operatorPage).toHaveURL(absoluteAppUrl(allowedEventPath));

      const representativeOrganizers = await getApiArray<OrganizerSummary>(
        operatorPage.request.get(
          `/api/protected/users/${operatorSession.userId}/organizers`
        ),
        'Organizers'
      );
      expect(
        representativeOrganizers.map((organizer) => organizer.Id)
      ).not.toContain(ownerIdentity.organizerId);

      const assignedEvents = await getApiArray<OperatorEventSummary>(
        operatorPage.request.get('/api/protected/operator/events'),
        'Events'
      );
      expect(assignedEvents.map((event) => event.Id)).toContain(
        allowedEvent.id
      );
      expect(assignedEvents.map((event) => event.Id)).not.toContain(
        isolatedEvent.id
      );

      const [allowedTickets, isolatedTickets, forbiddenTransactions] =
        await Promise.all([
          operatorPage.request.get(
            `/api/protected/events/${allowedEvent.id}/tickets`
          ),
          operatorPage.request.get(
            `/api/protected/events/${isolatedEvent.id}/tickets`
          ),
          operatorPage.request.get(
            `/api/protected/events/${allowedEvent.id}/transactions`
          ),
        ]);
      expect(
        {
          allowedEventTickets: allowedTickets.status(),
          isolatedEventTickets: isolatedTickets.status(),
          allowedEventTransactions: forbiddenTransactions.status(),
        },
        [
          'The operator must read tickets only for the assigned event,',
          'and CanReadTicket must not imply CanReadTransaction.',
        ].join(' ')
      ).toEqual({
        allowedEventTickets: 200,
        isolatedEventTickets: 403,
        allowedEventTransactions: 403,
      });

      await expect(
        operatorPage.getByText(allowedEvent.name, { exact: true }).first()
      ).toBeVisible({ timeout: 30_000 });
      await operatorPage
        .getByRole('button', { name: 'Orders & Attendees' })
        .first()
        .click();
      await expect(
        operatorPage.getByRole('button', { name: 'Attendees', exact: true })
      ).toBeVisible();
      await expect(operatorPage.getByText('Access Restricted')).toHaveCount(0);

      await operatorPage
        .getByRole('button', { name: 'Ticket Types', exact: true })
        .click();
      await expect(
        operatorPage.getByRole('heading', { name: 'Access Restricted' })
      ).toBeVisible();

      await operatorPage
        .getByRole('button', { name: 'Edit Event', exact: true })
        .click();
      await expect(
        operatorPage.getByRole('heading', { name: 'Access Restricted' })
      ).toBeVisible();

      await operatorSession.context.close();
      operatorSession = undefined;
      await removeEventOperator(
        ownerApi,
        allowedEvent.id,
        operatorAssignmentId
      );
      operatorAssignmentId = '';

      await expect
        .poll(
          async () =>
            findByEmail(
              await getEventOperators(ownerApi, allowedEvent.id),
              PLAYWRIGHT_BOT2_EMAIL
            ),
          { timeout: 30_000, intervals: [500, 1_000, 2_000] }
        )
        .toBeUndefined();

      revokedSession = await signInAsUser(
        browser,
        secondaryCredentials,
        allowedEventPath
      );
      expect(new URL(revokedSession.page.url()).pathname).not.toBe(
        allowedEventPath
      );
      const eventsAfterRevoke = await getApiArray<OperatorEventSummary>(
        revokedSession.page.request.get('/api/protected/operator/events'),
        'Events'
      );
      expect(eventsAfterRevoke.map((event) => event.Id)).not.toContain(
        allowedEvent.id
      );
    } finally {
      await operatorSession?.context.close();
      await revokedSession?.context.close();
      if (operatorAssignmentId) {
        await removeEventOperator(
          ownerApi,
          allowedEvent.id,
          operatorAssignmentId
        );
      } else {
        const operator = findByEmail(
          await getEventOperators(ownerApi, allowedEvent.id),
          PLAYWRIGHT_BOT2_EMAIL
        );
        if (operator) {
          const eventGrant = operator.OperatorDetails.find(
            (detail) => detail.EventId === allowedEvent.id
          );
          if (eventGrant) {
            await removeEventOperator(ownerApi, allowedEvent.id, eventGrant.Id);
          }
        }
      }
      await removeRepresentativesByEmail(
        ownerApi,
        ownerIdentity.organizerId,
        PLAYWRIGHT_BOT2_EMAIL
      );
    }
  });
});
