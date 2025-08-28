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

export const COUNTRIES = ['CA'] as const;
export type Country = (typeof COUNTRIES)[number];

export function getRandomCountry(): Country {
  const i = Math.floor(Math.random() * COUNTRIES.length);
  return COUNTRIES[i];
}
