import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { JASS_TEST_URL } from '../constants';
import { signIn } from './auth';
import { getApiArray } from './criticalCheckoutHelpers';

export type RepresentativeRecord = {
  Id: string;
  Email: string;
  FirstName: string;
  LastName: string;
  Policies: string[];
};

export type EventOperatorDetail = {
  Id: string;
  EventId: string;
  UserId?: string;
  Policies: string[];
  ManualPolicies?: string[];
};

export type EventOperatorRecord = {
  UserId: string;
  Email: string;
  OperatorDetails: EventOperatorDetail[];
};

export type AuthenticatedUser = {
  context: BrowserContext;
  page: Page;
  userId: string;
};

export async function expectApiOk(
  responsePromise: Promise<APIResponse>,
  operation: string
): Promise<void> {
  const response = await responsePromise;
  const body = await response.text();
  expect(
    response.ok(),
    `${operation} failed with ${response.status()} ${response.statusText()}: ${body}`
  ).toBeTruthy();
}

export async function signInAsUser(
  browser: Browser,
  credentials: { email: string; password: string },
  targetPath = '/portal/organizer'
): Promise<AuthenticatedUser> {
  const context = await browser.newContext({ baseURL: JASS_TEST_URL });
  const page = await context.newPage();

  try {
    await signIn(page, { ...credentials, targetPath });
    await expect(page).not.toHaveURL(/\/signin(?:\?|$)/);

    const profileResponse = await page.request.get('/api/protected/profile/me');
    const body = await profileResponse.text();
    expect(
      profileResponse.ok(),
      `Fetch secondary-user profile failed with ${profileResponse.status()}: ${body}`
    ).toBeTruthy();
    const profile = JSON.parse(body) as Record<string, unknown>;
    const userId = String(profile.Id ?? '');
    expect(userId, 'Secondary-user profile must contain an Id.').not.toBe('');

    return { context, page, userId };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function getRepresentatives(
  ownerApi: APIRequestContext,
  organizerId: string
): Promise<RepresentativeRecord[]> {
  return getApiArray<RepresentativeRecord>(
    ownerApi.get(`/api/protected/organizers/${organizerId}/representatives`),
    'Representatives'
  );
}

export async function grantRepresentativePolicies(
  ownerApi: APIRequestContext,
  organizerId: string,
  email: string,
  policies: string[]
): Promise<void> {
  await expectApiOk(
    ownerApi.post(`/api/protected/organizers/${organizerId}/representatives`, {
      data: { email, policies },
    }),
    `Grant representative policies to ${email}`
  );
}

export async function removeRepresentative(
  ownerApi: APIRequestContext,
  organizerId: string,
  representativeId: string
): Promise<void> {
  const response = await ownerApi.delete(
    `/api/protected/organizers/${organizerId}/representatives/${representativeId}`
  );
  if (response.status() === 404) return;
  const body = await response.text();
  expect(
    response.ok(),
    `Remove representative ${representativeId} failed with ${response.status()}: ${body}`
  ).toBeTruthy();
}

export async function removeRepresentativesByEmail(
  ownerApi: APIRequestContext,
  organizerId: string,
  email: string
): Promise<void> {
  const representatives = await getRepresentatives(ownerApi, organizerId);
  const matches = representatives.filter(
    (representative) =>
      representative.Email.toLowerCase() === email.toLowerCase()
  );
  for (const representative of matches) {
    await removeRepresentative(ownerApi, organizerId, representative.Id);
  }
}

export async function getEventOperators(
  ownerApi: APIRequestContext,
  eventId: string
): Promise<EventOperatorRecord[]> {
  return getApiArray<EventOperatorRecord>(
    ownerApi.get(`/api/protected/events/${eventId}/operators`),
    'Operators'
  );
}

export async function grantEventOperatorPolicies(
  ownerApi: APIRequestContext,
  eventId: string,
  email: string,
  policies: string[]
): Promise<void> {
  await expectApiOk(
    ownerApi.post(`/api/protected/events/${eventId}/operators`, {
      data: { OperatorEmail: email, Policies: policies },
    }),
    `Grant event-operator policies to ${email}`
  );
}

export async function removeEventOperator(
  ownerApi: APIRequestContext,
  eventId: string,
  operatorUserId: string
): Promise<void> {
  const response = await ownerApi.delete(
    `/api/protected/operator/events/${eventId}/operator/${operatorUserId}`
  );
  if (response.status() === 404) return;
  const body = await response.text();
  expect(
    response.ok(),
    `Remove event operator ${operatorUserId} failed with ${response.status()}: ${body}`
  ).toBeTruthy();
}

export function expectExactPolicies(actual: string[], expected: string[]) {
  expect([...actual].sort()).toEqual([...expected].sort());
}

export function eventPortalPath(organizerId: string, eventId: string): string {
  return `/portal/organizer/company/${organizerId}/event/${eventId}`;
}

export function absoluteAppUrl(path: string): string {
  return `${JASS_TEST_URL}${path}`;
}
