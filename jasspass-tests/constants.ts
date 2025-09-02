export const JASS_TEST_URL = 'https://testlab-env191.jasspass.com';
// export const JASS_TEST_URL = ' http://localhost:3000';
export const JASS_TEST_CHANGE_ORG_URL =
  JASS_TEST_URL + '/portal/organizer?mode=change';
export const PLAYWRIGHT_BOT_EMAIL = 'playwright-bot@gmail.com';
export const PLAYWRIGHT_BOT_PASSWORD = 'PlaywrightBot@1234';
export const ORGANIZER_NAME_PREFIX = 'PBO - ';
export const CONTACT_NAME = 'Playwright Bot';
export const CONTACT_ADDRESS = 'Playwright Bot St, 1234';
export const CONTACT_PHONE_NUMBER = '(646) 789-9045';
export const PLAYWRIGHT_BOT_STRIPE_CONNECT_ID = 'acct_1R48E5B2utfhUzfT';

export const signIn = 'Sign In';

// Organizer portal constants
export const NEW_ORGANIZER_NAME = 'PBO - New Name';
export const NEW_CONTACT_NAME = 'Playwright Bot New Name';
export const NEW_CONTACT_ADDRESS = 'Playwright Bot St, 1234 New Address';

// Performer constants
export const TEST_PERFORMER_NAME = 'Test Performer';
export const TEST_PERFORMER_ROLE = 'DJ';
export const TEST_PERFORMER_BIO = 'Test performer bio';
export const NEW_PERFORMER_NAME = 'Test Performer New Name';
export const NEW_PERFORMER_ROLE = 'DJ New Role';
export const NEW_PERFORMER_BIO = 'Test performer bio New Bio';

// Promo code constants
export const PROMO_CODE = '10OFF';
export const PROMO_DISCOUNT_PERCENTAGE = '010';
export const NEW_PROMO_CODE = '10OFFNEW';
export const NEW_PROMO_DISCOUNT_PERCENTAGE = '100';
export const NEW_PROMO_FIXED_AMOUNT = '100';

// Team member constants
export const TEAM_MEMBER_EMAIL = 'dnsantosuosso@gmail.com';

// Event portal constants
export const EVENT_NAME_PREFIX = 'PBO - Event';
export const EVENT_NEW_TITLE = 'PBO - Event New Name';
export const EVENT_NEW_DESCRIPTION =
  'Join us for the Toronto Student Association! This event New Description offers exciting opportunities to engage and learn.';
export const EVENT_NEW_ADDRESS = '123 Sample Street New Street';
export const EVENT_NEW_CITY = 'Orlando New City';
export const EVENT_NEW_VENUE = 'Sample Venue New Venue';
export const EVENT_NEW_ADDITIONAL_DETAILS = 'Thanks. See you soon! Soon';
export const EVENT_NEW_TAX_RATE = '11';
export const EVENT_PLAYWRIGHT_PROMO_CODE = 'PLAYWRIGHTPROMOCODE';
export const EVENT_PROMO_DISCOUNT = '010';
export const EVENT_PROMO_LIMIT = '05';
export const ATTENDEE_FIRST_NAME = 'Playwright';
export const ATTENDEE_LAST_NAME = 'Bot';
export const ATTENDEE_EMAIL = 'admin@jasstickets.com';
export const ATTENDEE_PHONE = '+1 (646) 789-9045';
export const MESSAGE_SUBJECT = 'Hello from Playwright';
export const MESSAGE_BODY = 'Hello from Playwright!';

export const COUNTRIES = ['CA'] as const;
export type Country = (typeof COUNTRIES)[number];

export function getRandomCountry(): Country {
  const i = Math.floor(Math.random() * COUNTRIES.length);
  return COUNTRIES[i];
}
