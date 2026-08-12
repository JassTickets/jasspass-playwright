import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { PLAYWRIGHT_BOT_EMAIL } from '../constants';

export const MATRIX_COUNTRIES = [
  'US',
  'CA',
  'MX',
  'CO',
  'PE',
  'PA',
  'ES',
  'PT',
  'DE',
] as const;

export const MATRIX_CURRENCIES = ['USD', 'CAD', 'EUR'] as const;

export type MatrixCountry = (typeof MATRIX_COUNTRIES)[number];
export type MatrixCurrency = (typeof MATRIX_CURRENCIES)[number];

type Address = {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
};

export type MatrixOrganizer = {
  organizerId: string;
  countryIso: MatrixCountry;
  stripeCountryIso: MatrixCountry;
  hasActiveStripe: true;
};

export type MatrixTransaction = {
  Id: string;
  Confirmation: string;
  Status: string;
  CurrencyIso: string;
  EventCountryIso: string;
  EventPromoterAttachmentId?: string | null;
};

export type MatrixTicket = {
  Id: string;
  Confirmation: string;
  Status: string;
};

const ADDRESSES: Record<MatrixCountry, Address> = {
  US: {
    line1: '123 Playwright Avenue',
    city: 'Miami',
    state: 'FL',
    postalCode: '33101',
  },
  CA: {
    line1: '123 Playwright Avenue',
    city: 'Toronto',
    state: 'ON',
    postalCode: 'M5V 2T6',
  },
  MX: {
    line1: '123 Avenida Playwright',
    city: 'Ciudad de Mexico',
    state: 'CDMX',
    postalCode: '06000',
  },
  CO: {
    line1: '123 Avenida Playwright',
    city: 'Bogota',
    state: 'DC',
    postalCode: '110111',
  },
  PE: {
    line1: '123 Avenida Playwright',
    city: 'Lima',
    state: 'Lima',
    postalCode: '15001',
  },
  PA: {
    line1: '123 Avenida Playwright',
    city: 'Panama City',
    state: 'Panama',
    postalCode: '',
  },
  ES: {
    line1: '123 Calle Playwright',
    city: 'Madrid',
    state: 'Madrid',
    postalCode: '28001',
  },
  PT: {
    line1: '123 Rua Playwright',
    city: 'Lisbon',
    state: 'Lisbon',
    postalCode: '1000-001',
  },
  DE: {
    line1: '123 Playwright Strasse',
    city: 'Berlin',
    state: 'Berlin',
    postalCode: '10115',
  },
};

const DEFAULT_STRIPE_ACCOUNTS: Record<MatrixCountry, string> = {
  US: 'acct_1TpVGZPmHaXFeGNV',
  CA: 'acct_1TboxtB57Bb2pnaQ',
  MX: 'acct_1TgXrMBmcsuaNjvt',
  PA: 'acct_1Tt3oFBaJQGDMrw2',
  CO: 'acct_1U2zFMB3spcQ6lin',
  PE: 'acct_1U2zHYBL4r1uujkb',
  ES: 'acct_1U2yXSBWyKGbB5EY',
  PT: 'acct_1U2ybVB7CMz8lgn6',
  DE: 'acct_1U2yi1B8AyaYWZaa',
};

function parseAccountMap(): Partial<Record<MatrixCountry, string>> {
  const raw = process.env.JASS_MATRIX_STRIPE_ACCOUNTS;
  if (!raw) return DEFAULT_STRIPE_ACCOUNTS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `JASS_MATRIX_STRIPE_ACCOUNTS must be JSON such as ` +
        `'${JSON.stringify({ US: 'acct_us', CA: 'acct_ca' })}': ${error}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JASS_MATRIX_STRIPE_ACCOUNTS must be a JSON object.');
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter(([country]) =>
        MATRIX_COUNTRIES.includes(country.toUpperCase() as MatrixCountry)
      )
      .map(([country, accountId]) => [
        country.toUpperCase(),
        String(accountId).trim(),
      ])
  );
}

export function stripeAccountIdFor(country: MatrixCountry): string {
  const accountId =
    process.env[`JASS_MATRIX_STRIPE_ACCOUNT_${country}`]?.trim() ||
    parseAccountMap()[country];
  if (!accountId) {
    throw new Error(
      `Missing a fully onboarded ${country} Stripe Connect test account. Set ` +
        `JASS_MATRIX_STRIPE_ACCOUNT_${country}=acct_... or include ${country} in ` +
        'JASS_MATRIX_STRIPE_ACCOUNTS. The matrix intentionally fails instead of ' +
        'substituting an account from another country.'
    );
  }
  if (!accountId.startsWith('acct_')) {
    throw new Error(`Configured ${country} Stripe account is not an acct_ id.`);
  }
  return accountId;
}

async function responseBody(response: APIResponse): Promise<string> {
  return response.text().catch(() => '<response body unavailable>');
}

export async function expectApiSuccess(
  response: APIResponse,
  operation: string,
  allowedStatuses: number[] = []
): Promise<void> {
  if (response.ok() || allowedStatuses.includes(response.status())) return;
  throw new Error(
    `${operation} failed with ${response.status()}: ${await responseBody(response)}`
  );
}

export async function readOrganizer(
  api: APIRequestContext,
  organizerId: string
): Promise<Record<string, unknown>> {
  const response = await api.get(`/api/protected/organizers/${organizerId}`);
  await expectApiSuccess(response, `Read organizer ${organizerId}`);
  return (await response.json()) as Record<string, unknown>;
}

export async function createMatrixOrganizer(
  api: APIRequestContext,
  userId: string,
  stripeCountryIso: MatrixCountry,
  accountId: string
): Promise<MatrixOrganizer> {
  const address = ADDRESSES[stripeCountryIso];
  const name = `PW Matrix ${stripeCountryIso} ${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const createResponse = await api.post('/api/protected/organizers', {
    multipart: {
      organizerUserId: userId,
      request: JSON.stringify({
        Name: name,
        PhoneNumber: '+16467899045',
        Email: PLAYWRIGHT_BOT_EMAIL,
        ContactName: 'Playwright Currency Matrix',
        CountryIso: stripeCountryIso,
        Address: address.line1,
        City: address.city,
        StateProvince: address.state,
        ZipCode: address.postalCode,
      }),
    },
  });
  await expectApiSuccess(createResponse, `Create ${stripeCountryIso} organizer`);
  const createBody = (await createResponse.json()) as { OrganizerId?: string };
  if (!createBody.OrganizerId) {
    throw new Error('Organizer creation response did not contain OrganizerId.');
  }

  const refreshResponse = await api.post('/api/protected/auth/refresh');
  await expectApiSuccess(refreshResponse, 'Refresh organizer authorization');

  const stripeResponse = await api.post(
    `/api/protected/organizers/${createBody.OrganizerId}/stripe-connect`,
    {
      data: {
        StripeConnectAccountId: accountId,
        StripeAccountCountryIso: stripeCountryIso,
      },
    }
  );
  await expectApiSuccess(
    stripeResponse,
    `Attach ${stripeCountryIso} Stripe account to organizer`
  );

  const organizer = await readOrganizer(api, createBody.OrganizerId);
  expect(organizer.StripeAccountCountryIso).toBe(stripeCountryIso);
  const stripeMethods = Array.isArray(organizer.PaymentMethods)
    ? (organizer.PaymentMethods as Array<Record<string, unknown>>).filter(
        (method) => method.Name === 'Stripe'
      )
    : [];
  expect(stripeMethods).toEqual([
    expect.objectContaining({
      Id: accountId,
      Name: 'Stripe',
      OnboardingStatus: 'Active',
    }),
  ]);

  return {
    organizerId: createBody.OrganizerId,
    countryIso: stripeCountryIso,
    stripeCountryIso,
    hasActiveStripe: true,
  };
}

export async function updateOrganizerCountry(
  api: APIRequestContext,
  organizer: MatrixOrganizer,
  countryIso: MatrixCountry
): Promise<void> {
  const current = await readOrganizer(api, organizer.organizerId);
  const address = ADDRESSES[countryIso];
  const updateResponse = await api.put(
    `/api/admin/organizers/${organizer.organizerId}`,
    {
      multipart: {
        request: JSON.stringify({
          Name: current.Name,
          ContactName: current.ContactName,
          CountryIso: countryIso,
          Address: address.line1,
          City: address.city,
          StateProvince: address.state,
          ZipCode: address.postalCode,
          PhoneNumber: current.PhoneNumber,
          Email: current.Email,
          CompanyDetails: current.CompanyDetails ?? null,
          Handle: current.Handle ?? null,
          InstagramHandle: current.InstagramHandle ?? null,
          ShowOrganizerInstagram: current.ShowOrganizerInstagram ?? false,
        }),
      },
    }
  );
  await expectApiSuccess(
    updateResponse,
    `Change organizer ${organizer.organizerId} country to ${countryIso}`,
    [304]
  );

  const updated = await readOrganizer(api, organizer.organizerId);
  expect(updated.CountryIso).toBe(countryIso);
  const effectiveStripeCountry = String(
    updated.StripeAccountCountryIso ?? updated.CountryIso
  ).toUpperCase();
  expect(
    effectiveStripeCountry,
    'Changing the business country must not move its connected Stripe account.'
  ).toBe(organizer.stripeCountryIso);
  organizer.countryIso = countryIso;
}

export async function updateEventCountryAndCurrency(
  api: APIRequestContext,
  eventId: string,
  changes: {
    countryIso?: MatrixCountry;
    currencyIso?: MatrixCurrency;
  }
): Promise<APIResponse> {
  return api.put(`/api/protected/events/${eventId}`, {
    multipart: {
      eventId,
      request: JSON.stringify({
        ...(changes.countryIso ? { CountryIso: changes.countryIso } : {}),
        ...(changes.currencyIso ? { CurrencyIso: changes.currencyIso } : {}),
      }),
    },
  });
}

export async function readPublicEvent(
  api: APIRequestContext,
  eventId: string
): Promise<Record<string, unknown>> {
  const response = await api.get(`/api/public/events/${eventId}`);
  await expectApiSuccess(response, `Read public event ${eventId}`);
  const body = (await response.json()) as Record<string, unknown>;
  return body.Event && typeof body.Event === 'object'
    ? (body.Event as Record<string, unknown>)
    : body;
}

export async function ensurePromoterUser(
  api: APIRequestContext,
  countryIso: MatrixCountry
): Promise<string> {
  const email = `playwright+matrix-promoter-${countryIso.toLowerCase()}@gmail.com`;
  const response = await api.post('/api/public/auth/signup', {
    data: {
      firstName: 'Matrix',
      lastName: `${countryIso} Promoter`,
      email,
      phoneNumber: '+16467899045',
      password: 'PlaywrightMatrix@1234',
      countryIso,
      role: 'Attendee',
      state: 'Active',
    },
  });

  if (response.status() !== 409) {
    await expectApiSuccess(response, `Create ${countryIso} promoter user`);
    const body = (await response.json()) as {
      user?: { CountryIso?: string; Email?: string };
    };
    expect(body.user).toMatchObject({ CountryIso: countryIso, Email: email });
  }
  return email;
}

function asArray<T>(value: unknown, property: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[property];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

export async function attachPromoter(
  api: APIRequestContext,
  organizerId: string,
  eventId: string,
  promoterEmail: string
): Promise<string> {
  const attachmentsResponse = await api.get(
    `/api/protected/organizers/${organizerId}/promocodes/attachments?event=${eventId}`
  );
  await expectApiSuccess(attachmentsResponse, 'Read promo-code attachments');
  const promoAttachments = asArray<Record<string, unknown>>(
    await attachmentsResponse.json(),
    'Attachments'
  );
  const promoCodeAttachmentId = String(promoAttachments[0]?.Id ?? '');
  if (!promoCodeAttachmentId) {
    throw new Error(
      `Event ${eventId} has no promo-code attachment for its promoter.`
    );
  }

  const addResponse = await api.post(
    `/api/protected/organizers/${organizerId}/events/${eventId}/promoters`,
    {
      data: {
        Email: promoterEmail,
        EventId: eventId,
        PromoCodeAttachmentId: promoCodeAttachmentId,
        Commission: { Percentage: 5, FixedAmount: 0 },
      },
    }
  );
  await expectApiSuccess(addResponse, `Attach promoter ${promoterEmail}`);

  const promotersResponse = await api.get(
    `/api/protected/organizers/${organizerId}/events/${eventId}/promoters`
  );
  await expectApiSuccess(promotersResponse, 'Read attached promoters');
  const promoters = asArray<Record<string, unknown>>(
    await promotersResponse.json(),
    'Promoters'
  );
  const promoter = promoters.find(
    (candidate) =>
      String(candidate.Email).toLowerCase() === promoterEmail.toLowerCase()
  );
  expect(promoter, `Promoter ${promoterEmail} must be persisted.`).toBeTruthy();
  const details = promoter?.PromoterDetails as
    | Record<string, unknown>
    | undefined;
  expect(details?.IsActive).toBe(true);
  return String(details?.EventPromoterAttachmentId ?? '');
}

export async function refundTransaction(
  api: APIRequestContext,
  eventId: string,
  transaction: MatrixTransaction,
  tickets: MatrixTicket[]
): Promise<void> {
  const ticketIds = tickets
    .filter((ticket) => ticket.Confirmation === transaction.Confirmation)
    .map((ticket) => ticket.Id);
  expect(ticketIds).not.toHaveLength(0);

  const response = await api.post('/api/protected/refunds', {
    data: {
      eventId,
      transactionId: transaction.Id,
      ticketIds,
      details: `Playwright ${transaction.CurrencyIso} matrix refund`,
      refundType: 'Online',
      includesTax: true,
      includesServiceFee: true,
      includesOrganizerFee: true,
      includesTransactionFee: true,
    },
  });
  await expectApiSuccess(response, `Refund ${transaction.Confirmation}`);
}

export async function deleteEventBestEffort(
  api: APIRequestContext,
  eventId: string
): Promise<void> {
  const response = await api.delete(`/api/protected/events/${eventId}/delete`);
  if (!response.ok() && response.status() !== 404) {
    console.warn(
      `[cleanup] Event ${eventId} was not deleted (${response.status()}): ${await responseBody(
        response
      )}`
    );
  }
}

export async function deleteOrganizerBestEffort(
  api: APIRequestContext,
  organizerId: string
): Promise<void> {
  const response = await api.delete(`/api/protected/organizers/${organizerId}`);
  if (!response.ok() && response.status() !== 404) {
    console.warn(
      `[cleanup] Organizer ${organizerId} was not deleted (${response.status()}): ${await responseBody(
        response
      )}`
    );
  }
}

export function nextCountry(country: MatrixCountry): MatrixCountry {
  return MATRIX_COUNTRIES[
    (MATRIX_COUNTRIES.indexOf(country) + 1) % MATRIX_COUNTRIES.length
  ];
}

export function nextCurrency(currency: MatrixCurrency): MatrixCurrency {
  return MATRIX_CURRENCIES[
    (MATRIX_CURRENCIES.indexOf(currency) + 1) % MATRIX_CURRENCIES.length
  ];
}
