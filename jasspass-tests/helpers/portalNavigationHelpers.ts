import { expect, Locator, Page } from '@playwright/test';

type EventPortalDestination =
  | 'ordersAndAttendees'
  | 'refunds'
  | 'externalPurchases'
  | 'ticketTypes'
  | 'seatingMap'
  | 'eventDetails'
  | 'eventStaff'
  | 'eventSettings'
  | 'promote'
  | 'communications'
  | 'collaborations'
  | 'aiAgent';

type OrganizerSurface =
  | 'dashboard'
  | 'events'
  | 'community'
  | 'finance'
  | 'plans'
  | 'discounts'
  | 'promoters'
  | 'collaborators'
  | 'profile'
  | 'team'
  | 'integrations'
  | 'website';

type OrganizerSection =
  | 'overview'
  | 'members'
  | 'inbox'
  | 'performers'
  | 'plansList'
  | 'credits'
  | 'promocodes'
  | 'vouchers';

const EVENT_DESTINATIONS: Record<
  EventPortalDestination,
  { group: string; leaf: string }
> = {
  ordersAndAttendees: { group: 'Sales', leaf: 'Orders & Attendees' },
  refunds: { group: 'Sales', leaf: 'Refunds' },
  externalPurchases: { group: 'Sales', leaf: 'External Purchases' },
  ticketTypes: { group: 'Tickets', leaf: 'Ticket Types' },
  seatingMap: { group: 'Tickets', leaf: 'Seating Map' },
  eventDetails: { group: 'Event', leaf: 'Details' },
  eventStaff: { group: 'Event', leaf: 'Staff' },
  eventSettings: { group: 'Event', leaf: 'Settings' },
  promote: { group: 'Marketing', leaf: 'Promote' },
  communications: { group: 'Marketing', leaf: 'Communications' },
  collaborations: { group: 'Marketing', leaf: 'Collaborations' },
  aiAgent: { group: 'Marketing', leaf: 'AI Agent' },
};

const ORGANIZER_SURFACES: Record<
  OrganizerSurface,
  { group?: string; leaf: string }
> = {
  dashboard: { leaf: 'Dashboard' },
  events: { leaf: 'Events' },
  community: { leaf: 'Community' },
  finance: { group: 'Money', leaf: 'Finance' },
  plans: { group: 'Money', leaf: 'Plans & Credits' },
  discounts: { group: 'Marketing', leaf: 'Discounts' },
  promoters: { group: 'Marketing', leaf: 'Promoters' },
  collaborators: { group: 'Marketing', leaf: 'Collaborations' },
  profile: { group: 'Organization', leaf: 'Profile' },
  team: { group: 'Organization', leaf: 'Team' },
  integrations: { group: 'Organization', leaf: 'Integrations' },
  website: { group: 'Organization', leaf: 'Website' },
};

const ORGANIZER_SECTIONS: Record<OrganizerSection, string> = {
  overview: 'Overview',
  members: 'Members',
  inbox: 'Inbox',
  performers: 'Performers',
  plansList: 'Plans',
  credits: 'Credits',
  promocodes: 'Promo Codes',
  vouchers: 'Vouchers',
};

function visibleButton(page: Page, name: string): Locator {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .locator('aside:visible')
    .first()
    .getByRole('button', {
      name: new RegExp(`^${escapedName}(?:\\s+New)?$`),
    })
    .first();
}

function visibleTab(page: Page, name: string): Locator {
  return page
    .getByRole('tab', { name, exact: true })
    .filter({ visible: true })
    .first();
}

async function openGroupedLeaf(
  page: Page,
  groupName: string,
  leafName: string
): Promise<Locator> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const leaf = visibleButton(page, leafName);
    if (await leaf.isVisible().catch(() => false)) {
      try {
        // EventPortalSidebar can remount while its permission-backed data
        // settles. Bound the click so a detached leaf is re-resolved here
        // instead of consuming the entire test timeout.
        await leaf.evaluate((button: HTMLButtonElement) => button.click());
        return leaf;
      } catch {
        continue;
      }
    }

    const group = visibleButton(page, groupName);
    await expect(group).toBeVisible({ timeout: 30_000 });
    try {
      await group.evaluate((button: HTMLButtonElement) => button.click());
      await visibleButton(page, leafName)
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => undefined);
    } catch {
      // Re-resolve both controls on the next attempt after a sidebar remount.
    }
  }

  const leaf = visibleButton(page, leafName);
  await expect(leaf).toBeVisible({ timeout: 30_000 });
  await leaf.evaluate((button: HTMLButtonElement) => button.click());
  return leaf;
}

export async function openEventPortalDestination(
  page: Page,
  destination: EventPortalDestination
): Promise<Locator> {
  const { group, leaf } = EVENT_DESTINATIONS[destination];
  return openGroupedLeaf(page, group, leaf);
}

export async function openOrganizerSurface(
  page: Page,
  surface: OrganizerSurface,
  section?: OrganizerSection
): Promise<Locator> {
  const destination = ORGANIZER_SURFACES[surface];
  const leaf = destination.group
    ? await openGroupedLeaf(page, destination.group, destination.leaf)
    : visibleButton(page, destination.leaf);

  if (!destination.group) {
    await expect(leaf).toBeVisible({ timeout: 30_000 });
    await leaf.click();
  }

  await page
    .waitForURL((url) => url.searchParams.get('tab') === surface, {
      timeout: 5_000,
    })
    .catch(async () => {
      const url = new URL(page.url());
      url.searchParams.set('tab', surface);
      await page.goto(url.toString());
    });
  await expect(page).toHaveURL((url) => url.searchParams.get('tab') === surface);

  if (section) {
    const sectionTab = visibleTab(page, ORGANIZER_SECTIONS[section]);
    await expect(sectionTab).toBeVisible({ timeout: 30_000 });
    await sectionTab.click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('section') === section,
      { timeout: 30_000 }
    );
  }

  return leaf;
}
