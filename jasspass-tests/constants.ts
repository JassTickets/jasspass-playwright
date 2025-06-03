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

export const COUNTRIES = ['CA', 'US'] as const;
export type Country = (typeof COUNTRIES)[number];

export function getRandomCountry(): Country {
  const i = Math.floor(Math.random() * COUNTRIES.length);
  return COUNTRIES[i];
}
