import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  JASS_TEST_URL,
  ORGANIZER_NAME_PREFIX,
  PLAYWRIGHT_BOT_STRIPE_CONNECT_ID,
} from '../constants';
import { signIn } from '../helpers/auth';
import { createAndPublishSeatingMap } from '../helpers/seatingHelpers';
import type {
  SeatingMapDefinition,
  SeatingMapResponse,
} from '../helpers/seatingTypes';

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const TEST_ORGANIZER_NAME = `${ORGANIZER_NAME_PREFIX}Integration Tests CA`;
const TEST_ORGANIZER_COUNTRY_ISO = 'CA';

export type OrganizerIdentity = {
  userId: string;
  organizerId: string;
  organizerName: string;
  countryIso: string;
  hasActiveStripe: boolean;
};

export type EventTicketInput = {
  type: string;
  price: number;
  totalTickets?: number;
  description?: string;
  colorCode?: string;
  showRemaining?: boolean;
  showInEventPage?: boolean;
  isSelling?: boolean;
  accessCode?: string | null;
  maxTicketsPerPurchase?: number;
  minTicketsPerPurchase?: number;
};

export type PromoCodeInput = {
  code: string;
  discountPercentage: number;
  isActive?: boolean;
  usageLimit?: number;
};

export type CustomCheckoutItemInput = {
  Kind:
    | 'Text'
    | 'Number'
    | 'Checkbox'
    | 'Date'
    | 'Email'
    | 'Dropdown'
    | 'MultipleSelection';
  Type:
    | 'Text'
    | 'Number'
    | 'Checkbox'
    | 'Date'
    | 'Email'
    | 'Dropdown'
    | 'MultipleSelection';
  Label: string;
  IsRequired: boolean;
  Order: number;
  Placeholder?: string;
  DefaultValue?: unknown;
  Options?: string[];
  Condition?: {
    FieldId: string;
    Operator:
      | 'is_checked'
      | 'is_unchecked'
      | 'equals'
      | 'includes'
      | 'is_not_empty'
      | 'greater_than'
      | 'less_than';
    Value?: string;
  };
};

export type CreateEventOptions = {
  name?: string;
  organizer?: {
    organizerId: string;
    countryIso: string;
    hasActiveStripe: boolean;
  };
  eventCountryIso?: string;
  currencyIso?: 'USD' | 'CAD' | 'EUR' | string;
  tickets?: EventTicketInput[];
  promoCodes?: PromoCodeInput[];
  hasSeatSelection?: boolean;
  seatingMap?: (created: CreatedEvent) => SeatingMapDefinition;
  purchaseLimit?: number | null;
  taxRatePercentage?: number;
  isFreeEvent?: boolean;
  isVisible?: boolean;
  isPrivate?: boolean;
  absorbServiceFees?: boolean;
  absorbTransactionFees?: boolean;
  strictTicketIdentification?: boolean;
  customCheckoutItems?: CustomCheckoutItemInput[];
  postCheckoutMessage?: string;
  cleanup?: boolean;
};

export type CreatedTicketType = {
  Id: string;
  Type: string;
  Price: number;
  TotalTickets: number;
  ShowInEventPage: boolean;
  HasAccessCode?: boolean;
  MaxTicketsPerPurchase: number;
  MinTicketsPerPurchase: number;
  [key: string]: unknown;
};

export type CreatedEvent = {
  id: string;
  name: string;
  organizerId: string;
  event: Record<string, unknown>;
  ticketTypes: CreatedTicketType[];
  seatingMap?: SeatingMapResponse;
};

type OrganizerPromoCodeRecord = {
  PromoCode: {
    Id: string;
    Code: string;
    DiscountPercentage: number;
  };
};

type PromoCodeAttachmentRecord = {
  PromoCodeId: string;
  EventId: string;
  TicketTypeId: string;
  UsageLimit: number;
  IsActive: boolean;
};

export type EventFactory = {
  create(options?: CreateEventOptions): Promise<CreatedEvent>;
};

type ApplicationFixtures = {
  ownerApi: APIRequestContext;
  ownerPage: Page;
  eventFactory: EventFactory;
};

type ApplicationWorkerFixtures = {
  ownerStorageState: AuthStorageState;
  ownerIdentity: OrganizerIdentity;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asArray<T>(data: unknown, property: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const nested = record[property] ?? record.Items;
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

function hasExpectedActiveStripe(organizer: Record<string, unknown>): boolean {
  return asArray<Record<string, unknown>>(
    organizer.PaymentMethods,
    'PaymentMethods'
  ).some(
    (paymentMethod) =>
      paymentMethod.Id === PLAYWRIGHT_BOT_STRIPE_CONNECT_ID &&
      paymentMethod.Name === 'Stripe' &&
      paymentMethod.OnboardingStatus === 'Active'
  );
}

async function requireOk(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
  operation: string
): Promise<void> {
  if (response.ok()) return;
  const responseBody = await response.text().catch(() => '<unreadable>');
  throw new Error(
    `${operation} failed with ${response.status()} ${response.statusText()}: ${responseBody}`
  );
}

function buildEventPayload(
  identity: OrganizerIdentity,
  options: CreateEventOptions,
  eventName: string
): Record<string, unknown> {
  const startsAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(23, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  const isFreeEvent = options.isFreeEvent ?? false;
  const organizer = options.organizer ?? identity;
  const tickets = options.tickets ?? [
    {
      type: 'General Admission',
      price: isFreeEvent ? 0 : 25,
    },
  ];

  return {
    name: eventName,
    description: `Integration coverage for ${eventName}.`,
    isAdminHosted: false,
    isPrivate: options.isPrivate ?? false,
    isApproved: true,
    isVisible: options.isVisible ?? true,
    hasSeatSelection:
      options.seatingMap !== undefined || (options.hasSeatSelection ?? false),
    purchaseLimit: options.purchaseLimit ?? null,
    taxRatePercentage: options.taxRatePercentage ?? 0,
    address: '123 Playwright Avenue',
    venueName: 'Playwright Test Venue',
    currencyIso: isFreeEvent ? null : options.currencyIso ?? 'USD',
    countryIso: options.eventCountryIso ?? organizer.countryIso ?? 'CA',
    city: 'Toronto',
    zipCode: 'M5A0M7',
    organizerId: organizer.organizerId,
    timezone: 'America/New_York',
    showCountdown: false,
    spotifyTrackUrl: null,
    showOrganizer: true,
    showOrganizerInstagram: false,
    ticketTypes: tickets.map((ticket) => ({
      type: ticket.type,
      price: ticket.price,
      totalTickets: ticket.totalTickets ?? 20,
      hasSeatSelection: false,
      isSelling: ticket.isSelling ?? true,
      description: ticket.description ?? '',
      colorCode: ticket.colorCode ?? '#1e1e1e',
      showRemaining: ticket.showRemaining ?? true,
      showInEventPage: ticket.showInEventPage ?? true,
      accessCode: ticket.accessCode ?? null,
      maxTicketsPerPurchase: ticket.maxTicketsPerPurchase ?? 20,
      minTicketsPerPurchase: ticket.minTicketsPerPurchase ?? 1,
      promoCodes: [],
    })),
    promoCodes: (options.promoCodes ?? []).map((promoCode) => ({
      code: promoCode.code,
      discountPercentage: promoCode.discountPercentage,
      isActive: promoCode.isActive ?? true,
      usageLimit: promoCode.usageLimit ?? 100,
    })),
    performerIds: [],
    eventPageLayoutType: 1,
    isFreeEvent,
    imagePath: '/gallery/photo1.jpg',
    postCheckoutMessage:
      options.postCheckoutMessage ?? 'Playwright critical path completed.',
    eventCategory: 'Other',
    absorbServiceFees: options.absorbServiceFees ?? false,
    absorbTransactionFees: options.absorbTransactionFees ?? false,
    whoIsGoingVisibility: 'None',
    ...(options.customCheckoutItems?.length
      ? { customCheckout: { Items: options.customCheckoutItems } }
      : {}),
    emailLanguage: 'English',
    organizerFeeLabel: 'Processing Fees',
    strictTicketIdentification: options.strictTicketIdentification ?? false,
    ...(!isFreeEvent ? { eventPaymentMethods: ['Stripe'] } : {}),
    startDateTimeUtc: startsAt.toISOString(),
    endDateTimeUtc: endsAt.toISOString(),
  };
}

async function readOrganizerPromoCodes(
  ownerApi: APIRequestContext,
  organizerId: string
): Promise<OrganizerPromoCodeRecord[]> {
  const response = await ownerApi.get(
    `/api/protected/organizers/${organizerId}/promocodes`
  );
  await requireOk(response, `Read promo codes for organizer ${organizerId}`);
  return asArray<OrganizerPromoCodeRecord>(
    await response.json(),
    'OrganizerPromoCodes'
  );
}

async function ensurePromoCodeAttachments(
  ownerApi: APIRequestContext,
  organizerId: string,
  eventId: string,
  ticketTypes: CreatedTicketType[],
  promoCodes: PromoCodeInput[]
): Promise<void> {
  for (const promoCode of promoCodes) {
    let organizerPromoCode = (
      await readOrganizerPromoCodes(ownerApi, organizerId)
    ).find(
      (candidate) =>
        candidate.PromoCode.Code.toLowerCase() === promoCode.code.toLowerCase()
    );

    if (!organizerPromoCode) {
      const createResponse = await ownerApi.post(
        `/api/protected/organizers/${organizerId}/promocodes`,
        {
          data: {
            Code: promoCode.code,
            DiscountPercentage: promoCode.discountPercentage,
            DiscountFixedAmount: 0,
            OrganizerId: organizerId,
          },
        }
      );
      if (createResponse.status() !== 409) {
        await requireOk(
          createResponse,
          `Create organizer promo code ${promoCode.code}`
        );
      }

      await expect
        .poll(
          async () => {
            organizerPromoCode = (
              await readOrganizerPromoCodes(ownerApi, organizerId)
            ).find(
              (candidate) =>
                candidate.PromoCode.Code.toLowerCase() ===
                promoCode.code.toLowerCase()
            );
            return organizerPromoCode?.PromoCode.Id;
          },
          { timeout: 30_000, intervals: [500, 1_000, 2_000] }
        )
        .not.toBeUndefined();
    }

    for (const ticketType of ticketTypes) {
      const attachResponse = await ownerApi.post(
        `/api/protected/organizers/${organizerId}/promocodes/ticket-types/${ticketType.Id}/attach`,
        {
          data: {
            PromoCodeId: organizerPromoCode!.PromoCode.Id,
            EventId: eventId,
            TicketTypeId: ticketType.Id,
            UsageLimit: promoCode.usageLimit ?? 100,
            IsActive: promoCode.isActive ?? true,
          },
        }
      );
      if (attachResponse.status() !== 409) {
        await requireOk(
          attachResponse,
          `Attach promo code ${promoCode.code} to ticket type ${ticketType.Id}`
        );
      }
    }
  }

  const attachmentsResponse = await ownerApi.get(
    `/api/protected/organizers/${organizerId}/promocodes/attachments?event=${eventId}`
  );
  await requireOk(
    attachmentsResponse,
    `Read promo-code attachments for event ${eventId}`
  );
  const attachments = asArray<PromoCodeAttachmentRecord>(
    await attachmentsResponse.json(),
    'Attachments'
  );
  const expectedAttachmentCount = promoCodes.length * ticketTypes.length;
  expect(
    attachments.filter((attachment) => attachment.EventId === eventId)
  ).toHaveLength(expectedAttachmentCount);
}

export const test = base.extend<ApplicationFixtures, ApplicationWorkerFixtures>(
  {
    ownerStorageState: [
      async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await signIn(page);
        await expect(page).not.toHaveURL(/\/signin(?:\?|$)/);
        const storageState = await context.storageState();
        await context.close();
        await use(storageState);
      },
      { scope: 'worker' },
    ],

    ownerIdentity: [
      async ({ playwright, ownerStorageState }, use) => {
        const api = await playwright.request.newContext({
          baseURL: JASS_TEST_URL,
          storageState: ownerStorageState,
        });

        const profileResponse = await api.get('/api/protected/profile/me');
        await requireOk(profileResponse, 'Fetch signed-in profile');
        const profile = (await profileResponse.json()) as Record<
          string,
          unknown
        >;
        const userId = String(profile.Id ?? '');
        if (!userId) {
          throw new Error(
            'The signed-in profile response did not contain an Id.'
          );
        }

        const organizersResponse = await api.get(
          `/api/protected/users/${userId}/organizers`
        );
        await requireOk(organizersResponse, 'Fetch owner organizers');
        const organizers = asArray<Record<string, unknown>>(
          await organizersResponse.json(),
          'Organizers'
        );

        let organizer = organizers.find(
          (candidate) =>
            candidate.Name === TEST_ORGANIZER_NAME &&
            candidate.CountryIso === TEST_ORGANIZER_COUNTRY_ISO
        );

        if (!organizer?.Id) {
          const createResponse = await api.post('/api/protected/organizers', {
            multipart: {
              organizerUserId: userId,
              request: JSON.stringify({
                Name: TEST_ORGANIZER_NAME,
                PhoneNumber: '+16467899045',
                Email: String(profile.Email ?? 'playwright-bot@gmail.com'),
                ContactName: String(profile.Name ?? 'Playwright Bot'),
                CountryIso: TEST_ORGANIZER_COUNTRY_ISO,
                Address: '123 Playwright Avenue',
                City: 'Toronto',
                ZipCode: 'M5A0M7',
              }),
            },
          });
          await requireOk(
            createResponse,
            'Create organizer for integration tests'
          );
          const createdOrganizer = (await createResponse.json()) as {
            OrganizerId?: string;
          };
          if (!createdOrganizer.OrganizerId) {
            throw new Error(
              'The organizer creation response did not contain an OrganizerId.'
            );
          }

          const refreshResponse = await api.post('/api/protected/auth/refresh');
          await requireOk(
            refreshResponse,
            'Refresh organizer policies after fixture provisioning'
          );
          const refreshedStorageState = await api.storageState();
          ownerStorageState.cookies = refreshedStorageState.cookies;
          ownerStorageState.origins = refreshedStorageState.origins;
          organizer = {
            Id: createdOrganizer.OrganizerId,
            Name: TEST_ORGANIZER_NAME,
            CountryIso: TEST_ORGANIZER_COUNTRY_ISO,
            PaymentMethods: [],
          };
        }

        if (!hasExpectedActiveStripe(organizer)) {
          const stripeResponse = await api.post(
            `/api/protected/organizers/${String(organizer.Id)}/stripe-connect`,
            {
              data: {
                StripeConnectAccountId: PLAYWRIGHT_BOT_STRIPE_CONNECT_ID,
              },
            }
          );
          await requireOk(
            stripeResponse,
            'Attach Stripe to the integration test organizer'
          );

          const organizerResponse = await api.get(
            `/api/protected/organizers/${String(organizer.Id)}`
          );
          await requireOk(
            organizerResponse,
            'Read the integration test organizer'
          );
          organizer = (await organizerResponse.json()) as Record<
            string,
            unknown
          >;
        }

        expect(organizer.Name).toBe(TEST_ORGANIZER_NAME);
        expect(organizer.CountryIso).toBe(TEST_ORGANIZER_COUNTRY_ISO);
        expect(hasExpectedActiveStripe(organizer)).toBe(true);

        await use({
          userId,
          organizerId: String(organizer.Id),
          organizerName: String(organizer.Name ?? ''),
          countryIso: TEST_ORGANIZER_COUNTRY_ISO,
          hasActiveStripe: true,
        });
        await api.dispose();
      },
      { scope: 'worker' },
    ],

    ownerApi: async (
      { playwright, ownerStorageState, ownerIdentity: _ownerIdentity },
      use
    ) => {
      const api = await playwright.request.newContext({
        baseURL: JASS_TEST_URL,
        storageState: ownerStorageState,
      });
      await use(api);
      await api.dispose();
    },

    ownerPage: async (
      { browser, ownerStorageState, ownerIdentity: _ownerIdentity },
      use
    ) => {
      const context = await browser.newContext({
        storageState: ownerStorageState,
      });
      const page = await context.newPage();
      await use(page);
      await context.close();
    },

    eventFactory: async ({ ownerApi, ownerIdentity }, use) => {
      const eventsForCleanup: Array<{
        eventId: string;
        organizerId: string;
      }> = [];
      const eventImageResponse = await ownerApi.get('/gallery/photo1.jpg');
      await requireOk(eventImageResponse, 'Load event fixture image');
      const eventImageBuffer = await eventImageResponse.body();

      await use({
        create: async (options = {}) => {
          const organizer = options.organizer ?? ownerIdentity;
          if (!(options.isFreeEvent ?? false) && !organizer.hasActiveStripe) {
            throw new Error(
              'No organizer with Stripe enabled is available for paid critical checkout tests.'
            );
          }
          const eventName = options.name ?? `PW Critical - ${uniqueSuffix()}`;
          const payload = buildEventPayload(ownerIdentity, options, eventName);
          const createResponse = await ownerApi.post('/api/protected/events', {
            multipart: {
              eventImageFile: {
                name: 'photo1.jpg',
                mimeType: 'image/jpeg',
                buffer: eventImageBuffer,
              },
              request: JSON.stringify(payload),
            },
          });
          await requireOk(createResponse, `Create event "${eventName}"`);

          const createData = (await createResponse.json()) as Record<
            string,
            unknown
          >;
          const responseEvent =
            createData.Event && typeof createData.Event === 'object'
              ? (createData.Event as Record<string, unknown>)
              : createData;
          const eventId = String(responseEvent.Id ?? '');
          if (!eventId) {
            throw new Error(
              `Create-event response did not contain an event Id: ${JSON.stringify(
                createData
              )}`
            );
          }
          if (options.cleanup ?? true) {
            eventsForCleanup.push({
              eventId,
              organizerId: organizer.organizerId,
            });
          }

          const [eventResponse, ticketTypesResponse] = await Promise.all([
            ownerApi.get(`/api/public/events/${eventId}`),
            ownerApi.get(`/api/public/events/${eventId}/ticket-types`),
          ]);
          await requireOk(
            eventResponse,
            `Read event ${eventId} after creation`
          );
          await requireOk(
            ticketTypesResponse,
            `Read ticket types for event ${eventId} after creation`
          );

          const eventJson = (await eventResponse.json()) as Record<
            string,
            unknown
          >;
          const publicEvent =
            eventJson.Event && typeof eventJson.Event === 'object'
              ? (eventJson.Event as Record<string, unknown>)
              : eventJson;
          const ticketTypes = asArray<CreatedTicketType>(
            await ticketTypesResponse.json(),
            'TicketTypes'
          );

          expect(publicEvent.Id).toBe(eventId);
          expect(publicEvent.Name).toBe(eventName);
          expect(ticketTypes).toHaveLength(options.tickets?.length ?? 1);

          if (options.promoCodes?.length) {
            await ensurePromoCodeAttachments(
              ownerApi,
              organizer.organizerId,
              eventId,
              ticketTypes,
              options.promoCodes
            );
          }

          const created: CreatedEvent = {
            id: eventId,
            name: eventName,
            organizerId: organizer.organizerId,
            event: publicEvent,
            ticketTypes,
          };

          if (options.seatingMap) {
            const definition = options.seatingMap(created);
            created.seatingMap = await createAndPublishSeatingMap(
              ownerApi,
              created,
              definition.Sections,
              definition.SelectionRules ?? null,
              definition.Props ?? []
            );
          }

          return created;
        },
      });

      for (const { eventId, organizerId } of eventsForCleanup.reverse()) {
        const ticketsResponse = await ownerApi.get(
          `/api/protected/events/${eventId}/tickets`
        );
        if (ticketsResponse.ok()) {
          const tickets = asArray<{
            Id: string;
            Status: string;
          }>(await ticketsResponse.json(), 'Tickets');
          for (const ticket of tickets.filter(
            (candidate) => candidate.Status === 'Active'
          )) {
            const cancelResponse = await ownerApi.post(
              '/api/protected/tickets/status',
              {
                data: {
                  ticketId: ticket.Id,
                  eventId,
                  organizerId,
                  releaseSeatAndCapacity: true,
                },
              }
            );
            if (!cancelResponse.ok()) {
              const body = await cancelResponse
                .text()
                .catch(() => '<unreadable>');
              console.warn(
                `[cleanup] Ticket ${
                  ticket.Id
                } on event ${eventId} could not be cancelled (${cancelResponse.status()}): ${body}`
              );
            } else {
              const cancelledTicket = (await cancelResponse.json()) as {
                Status?: string;
                CapacityReleased?: boolean;
              };
              if (
                cancelledTicket.Status !== 'Inactive' ||
                cancelledTicket.CapacityReleased !== true
              ) {
                console.warn(
                  `[cleanup] Ticket ${
                    ticket.Id
                  } returned an unexpected cancellation state: ${JSON.stringify(
                    cancelledTicket
                  )}`
                );
              }
            }
          }
        }

        const deleteResponse = await ownerApi.delete(
          `/api/protected/events/${eventId}/delete`
        );
        if (!deleteResponse.ok() && deleteResponse.status() !== 404) {
          const body = await deleteResponse.text().catch(() => '<unreadable>');
          const eventResponse = await ownerApi.get(
            `/api/public/events/${eventId}`
          );
          let inventory = `<event read failed with ${eventResponse.status()}>`;
          if (eventResponse.ok()) {
            const eventBody = (await eventResponse.json()) as {
              Event?: { TicketsSold?: Record<string, number> };
              TicketsSold?: Record<string, number>;
            };
            inventory = JSON.stringify(
              (eventBody.Event ?? eventBody).TicketsSold ?? {}
            );
          }
          console.warn(
            `[cleanup] Event ${eventId} could not be deleted (${deleteResponse.status()}): ${body}. Current event: ${inventory}`
          );
        }
      }
    },
  }
);

export { expect } from '@playwright/test';
