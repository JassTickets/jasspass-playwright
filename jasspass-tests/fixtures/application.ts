import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { JASS_TEST_URL, ORGANIZER_NAME_PREFIX } from '../constants';
import { signIn } from '../helpers/auth';

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export type OrganizerIdentity = {
  userId: string;
  organizerId: string;
  organizerName: string;
  countryIso: string;
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
  tickets?: EventTicketInput[];
  promoCodes?: PromoCodeInput[];
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
    const nested = (data as Record<string, unknown>)[property];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
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
  const tickets = options.tickets ?? [
    {
      type: 'General Admission',
      price: isFreeEvent ? 0 : 25,
    },
  ];

  return {
    name: eventName,
    description: `Integration coverage for ${eventName}.`,
    shortDescription: `Critical-path integration test for ${eventName}.`,
    isAdminHosted: false,
    isPrivate: options.isPrivate ?? false,
    isApproved: true,
    isVisible: options.isVisible ?? true,
    hasSeatSelection: false,
    taxRatePercentage: options.taxRatePercentage ?? 0,
    address: '123 Playwright Avenue',
    venueName: 'Playwright Test Venue',
    currencyIso: isFreeEvent ? null : 'USD',
    countryIso: identity.countryIso || 'CA',
    city: 'Toronto',
    zipCode: 'M5A0M7',
    organizerId: identity.organizerId,
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
    let organizerPromoCode = (await readOrganizerPromoCodes(
      ownerApi,
      organizerId
    )).find(
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
            organizerPromoCode = (await readOrganizerPromoCodes(
              ownerApi,
              organizerId
            )).find(
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

        const stripeOrganizers = organizers.filter((organizer) => {
          const paymentMethods = asArray<Record<string, unknown>>(
            organizer.PaymentMethods,
            'PaymentMethods'
          );
          return paymentMethods.some(
            (paymentMethod) =>
              paymentMethod.Name === 'Stripe' &&
              paymentMethod.OnboardingStatus === 'Active'
          );
        });
        const preferredOrganizers = stripeOrganizers.filter((candidate) =>
          String(candidate.Name ?? '').startsWith(ORGANIZER_NAME_PREFIX)
        );
        const organizer = [
          ...(preferredOrganizers.length
            ? preferredOrganizers
            : stripeOrganizers),
        ].sort(
          (left, right) =>
            Date.parse(String(right.CreatedAtUtc ?? '')) -
            Date.parse(String(left.CreatedAtUtc ?? ''))
        )[0];

        if (!organizer?.Id) {
          throw new Error(
            'No organizer with Stripe enabled is available for critical checkout tests.'
          );
        }

        await use({
          userId,
          organizerId: String(organizer.Id),
          organizerName: String(organizer.Name ?? ''),
          countryIso: String(organizer.CountryIso ?? 'CA'),
        });
        await api.dispose();
      },
      { scope: 'worker' },
    ],

    ownerApi: async ({ playwright, ownerStorageState }, use) => {
      const api = await playwright.request.newContext({
        baseURL: JASS_TEST_URL,
        storageState: ownerStorageState,
      });
      await use(api);
      await api.dispose();
    },

    ownerPage: async ({ browser, ownerStorageState }, use) => {
      const context = await browser.newContext({
        storageState: ownerStorageState,
      });
      const page = await context.newPage();
      await use(page);
      await context.close();
    },

    eventFactory: async ({ ownerApi, ownerIdentity }, use) => {
      const eventsForCleanup: string[] = [];
      const eventImageResponse = await ownerApi.get('/gallery/photo1.jpg');
      await requireOk(eventImageResponse, 'Load event fixture image');
      const eventImageBuffer = await eventImageResponse.body();

      await use({
        create: async (options = {}) => {
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
          if (options.cleanup ?? true) eventsForCleanup.push(eventId);

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
            ownerIdentity.organizerId,
            eventId,
            ticketTypes,
            options.promoCodes
          );
        }

        return {
            id: eventId,
            name: eventName,
            organizerId: ownerIdentity.organizerId,
            event: publicEvent,
            ticketTypes,
          };
        },
      });

      for (const eventId of eventsForCleanup.reverse()) {
        const deleteResponse = await ownerApi.delete(
          `/api/protected/events/${eventId}/delete`
        );
        if (!deleteResponse.ok() && deleteResponse.status() !== 404) {
          const body = await deleteResponse.text().catch(() => '<unreadable>');
          console.warn(
            `[cleanup] Event ${eventId} could not be deleted (${deleteResponse.status()}): ${body}`
          );
        }
      }
    },
  }
);

export { expect } from '@playwright/test';
