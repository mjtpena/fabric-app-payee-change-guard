import { expect, type Page } from '@playwright/test';

export const ALEX = 'demo-admin-alex';
export const SAM = 'demo-clerk-sam';
export const PRIYA = 'demo-clerk-priya';
export const JORDAN = 'demo-controller-jordan';

/** Switch persona keeping the stored demo data (as the recorder does). */
export async function switchTo(page: Page, persona: string, path: string) {
  await page.goto(`/?as=${encodeURIComponent(persona)}#${path}`);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}

export const isPhone = (projectName: string) => projectName === 'phone';

/** On phones Today lives in a bottom sheet behind a button. */
export async function openToday(page: Page, phone: boolean) {
  if (phone) await page.getByRole('button', { name: /^Today/ }).click();
}

/** The same "Sat, 21 Nov 2026, 10:00" format the app uses, computed in the browser's own time zone. */
export async function formatExactInPage(page: Page, iso: string): Promise<string> {
  return page.evaluate(
    (t) =>
      new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t)),
    iso,
  );
}

/** The seeded domestic run that freezes the gates: tomorrow at 10:00 UTC (see src/seed.ts). */
export async function tomorrowRunIso(page: Page): Promise<string> {
  return page.evaluate(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 10)).toISOString();
  });
}
