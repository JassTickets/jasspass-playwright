import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse, type Page, type Response } from '@playwright/test';
import { JASS_TEST_URL } from '../constants';
import type { CreatedEvent } from '../fixtures/application';
import {
  applyPromoCode, fillGuestContact, openEvent,
  submitPurchase, submitStripeCheckout, type Buyer,
} from './criticalCheckoutHelpers';

export type BuyerProfile = { Id: string; Email: string; CountryIso: string };
export type AccountResult = {
  Status: 'Created' | 'ExistingAccount'; Email: string;
  LoginData?: BuyerProfile & { Token?: string };
};
export type Promotion = {
  EnrollmentId: string; PromoCodeId: string; Code: string; ShareUrl: string;
  IsAlreadyPromoter: boolean; Status: string; AcceptedTermsVersion: string;
  Commission: { Percentage: number; FixedAmount: number };
};
export type KickbackTransaction = {
  Id: string; Confirmation: string; Status: string; Amount: number; Email: string;
  EventPromoterId?: string; PromoterAttributionType: string;
  PromoterCommissionProcessingStatus: string; PromoterNetCommissionCents: number;
  PromoterGrossCommissionCents: number; PromoterPlatformFeeCents: number;
  PromoterSettlementMode: string; CurrencyIso: string;
};
export type OrderTicket = { Id: string; TransactionId: string; Status: string; Amount: number; UserId?: string; Confirmation: string };

export function uniqueCode(): string { return `KB-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
export function uniqueBuyer(label = 'Buyer'): Buyer {
  return { firstName: 'Kickback', lastName: label,
    email: `kickback-${randomUUID()}@example.com`, phone: '+16467899045' };
}
export async function json<T>(response: APIResponse, operation: string): Promise<T> {
  // Do not include auth response bodies in failures (they may contain credentials).
  expect(response.ok(), `${operation}: HTTP ${response.status()}`).toBeTruthy();
  return response.json() as Promise<T>;
}
export async function ownProfile(api: APIRequestContext): Promise<BuyerProfile> {
  return json(await api.get('/api/protected/profile/me'), 'Read current profile');
}
export function promoterPath(userId: string, suffix = ''): string {
  return `/api/protected/users/${userId}/promoter${suffix}`;
}
export async function assertBrowserIdentity(page: Page, email: string): Promise<BuyerProfile> {
  const profile = await ownProfile(page.request);
  expect(profile.Email.toLowerCase()).toBe(email.toLowerCase());
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('persist:auth');
    if (!raw) return null;
    const state = JSON.parse(raw);
    return { loggedIn: JSON.parse(state.loggedIn), userId: JSON.parse(state.userId) };
  })).toEqual({ loggedIn: true, userId: profile.Id });
  return profile;
}
export async function closeProfilePrompt(page: Page): Promise<void> {
  // Assert the specific next step; never dismiss an arbitrary dialog.
  await expect(page.getByText('Complete your profile', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Earn money by sharing this event', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Complete your profile', { exact: true })).toBeHidden();
}
export async function purchase(
  page: Page, event: CreatedEvent, buyer: Buyer,
  { quantity = 1, free = false, promoCode }: { quantity?: number; free?: boolean; promoCode?: string } = {},
): Promise<{ Confirmation: string }> {
  await openEvent(page, event.id, event.name);
  await page.getByRole('button', { name: /^(Get Tickets|RSVP)$/ }).filter({ visible: true }).first().click();
  const increase = page.getByRole('button', { name: `Increase quantity for ${event.ticketTypes[0].Type}`, exact: true });
  for (let index = 0; index < quantity; index++) await increase.click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await fillGuestContact(page, buyer);
  if (promoCode) await applyPromoCode(page, event.id, promoCode);
  if (!free) return submitStripeCheckout(page);
  return submitPurchase(page, 'RSVP');
}

export async function purchaseWithAccount(
  page: Page, event: CreatedEvent, buyer: Buyer, options?: Parameters<typeof purchase>[3],
): Promise<[AccountResult, { Confirmation: string }]> {
  let accountResponse: Response | undefined;
  const capture = (response: Response) => {
    if (isAccountResponse(response)) accountResponse ??= response;
  };
  // Capture early responses, but give account fulfillment its own timeout AFTER checkout.
  // Starting a 60-second response wait before navigation/payment also times the purchase.
  page.on('response', capture);
  try {
    const order = await purchase(page, event, buyer, options);
    await expect.poll(() => Boolean(accountResponse), {
      message: 'Account bootstrap should respond after the purchase completes',
      timeout: 60_000, intervals: [100, 250, 500],
    }).toBe(true);
    return [await readAccountResponse(accountResponse!), order];
  } finally { page.off('response', capture); }
}

function isAccountResponse(response: Response): boolean {
  return response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/public/auth/post-checkout/account';
}

async function readAccountResponse(response: Response): Promise<AccountResult> {
  expect(response.ok(), `Account bootstrap: HTTP ${response.status()}`).toBeTruthy();
  const result = await response.json() as AccountResult;
  expect(result.LoginData && 'Token' in result.LoginData).not.toBe(true);
  return result;
}

export function waitForAccount(page: Page): Promise<AccountResult> {
  return page.waitForResponse(isAccountResponse, { timeout: 60_000 }).then(readAccountResponse);
}
export async function enrollThroughModal(page: Page, code = uniqueCode()): Promise<Promotion> {
  await expect(page.getByText('Earn money by sharing this event', { exact: true })).toBeVisible();
  const input = page.getByPlaceholder('YOUR-CODE');
  await input.fill(code);
  await expect(page.getByText('This code is available.', { exact: true })).toBeVisible({ timeout: 30_000 });
  const submit = page.getByRole('button', { name: 'Create my code', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox').filter({ visible: true }).check();
  const accepted = page.waitForResponse(r => r.request().method() === 'POST'
    && /\/buyer-promotion$/.test(new URL(r.url()).pathname));
  await submit.click();
  const response = await accepted;
  expect(response.ok(), `Enrollment: HTTP ${response.status()}`).toBeTruthy();
  const result = await response.json() as Promotion;
  expect(result).toMatchObject({ Code: code, Status: 'Active', IsAlreadyPromoter: false });
  expect(result.AcceptedTermsVersion).toBeTruthy();
  await expect(page.getByText('You’re now a promoter!', { exact: true })).toBeVisible();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  return result;
}
export async function revisitConfirmation(page: Page, eventId: string, confirmation: string) {
  await page.goto(`${JASS_TEST_URL}/payment/success/event/${eventId}/${confirmation}`);
}
