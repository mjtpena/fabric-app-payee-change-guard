/**
 * The centrepiece: renders, lenses, Today focusing a boat, view as, the list of the same data, the fallbacks.
 */
import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { ALEX, isPhone, JORDAN, openToday, PRIYA, switchTo } from './helpers';

test('the canal draws every change in the chamber of its gate', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/', ALEX);
  await expect(page.getByTestId('canal')).toBeVisible();
  await expect(page.getByTestId('boat')).toHaveCount(14);
  await expect(page.locator('[data-testid="boat"][data-chamber="request"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="boat"][data-chamber="callback"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="boat"][data-chamber="approval"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="boat"][data-chamber="basin"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="boat"][data-chamber="drydock"]')).toHaveCount(3);
  await expect(page.getByTestId('chamber-request')).toHaveText('REQUEST · 4');
  await expect(page.locator('[data-testid="boat"][data-supplier="Lindqvist Industrial Parts GmbH"]')).toHaveAttribute('data-flags', '4');
  await expect(page.getByTestId('gate-2')).toHaveAttribute('data-frozen', 'true');
  await expect(page.getByTestId('freeze-plaque')).toContainText('FROZEN · DOMESTIC');
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test('a lens re-paints the boats and the legend; the keyboard switches lenses', async ({ page }) => {
  await openApp(page, '/', ALEX);
  const lens = page.getByRole('radiogroup', { name: 'Lens' });
  await expect(lens.getByRole('radio', { name: /Gate/ })).toHaveAttribute('aria-checked', 'true');
  await lens.getByRole('radio', { name: /Flags/ }).click();
  await expect(lens.getByRole('radio', { name: /Flags/ })).toHaveAttribute('aria-checked', 'true');
  const hull = page.locator('[data-testid="boat"][data-supplier="Lindqvist Industrial Parts GmbH"] path').first();
  await expect(hull).toHaveAttribute('fill', 'var(--bad-solid)');
  await page.keyboard.press('5');
  await expect(lens.getByRole('radio', { name: /Channel/ })).toHaveAttribute('aria-checked', 'true');
  await expect(hull).toHaveAttribute('fill', 'var(--coral-9)');
});

test('a Today item focuses its boat and switches to its lens', async ({ page }, info) => {
  await openApp(page, '/', ALEX);
  await openToday(page, isPhone(info.project.name));
  await page.getByRole('button', { name: /Lindqvist Industrial Parts GmbH change flies 4 red flags/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lindqvist Industrial Parts GmbH' })).toBeVisible();
  await expect(page.locator('[data-testid="boat"][data-supplier="Lindqvist Industrial Parts GmbH"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Flags/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('focus-action').click();
  await expect(page.getByTestId('key-sheet')).toBeVisible();
});

test('view as clerk or approver changes Today and steps back boats that are not yours', async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openApp(page, '/', PRIYA);
  // A clerk sees call-back work and not the freeze.
  await openToday(page, phone);
  await expect(page.getByRole('button', { name: /still needs a call-back/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /frozen until/ })).toHaveCount(0);
  if (phone) await page.keyboard.press('Escape');
  await page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Approver' }).click();
  await openToday(page, phone);
  await expect(page.getByRole('button', { name: /frozen until/ })).toBeVisible();
  if (phone) await page.keyboard.press('Escape');
  const harbour = page.locator('[data-testid="boat"][data-supplier="Harbourline Shipping"]');
  await expect(harbour).toHaveCSS('opacity', '0.28');
  await switchTo(page, JORDAN, '/');
  await expect(page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Approver' })).toHaveAttribute('aria-checked', 'true');
});

test('the list view shows the same changes', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('canal-row')).toHaveCount(14);
  await expect(page.getByTestId('canal-row').filter({ hasText: 'Kestrel Print & Packaging' })).toContainText('Frozen until');
  await expect(page.getByTestId('canal-row').filter({ hasText: 'Lindqvist Industrial Parts GmbH' })).toContainText('Email');
  await page.getByRole('radio', { name: 'Canal' }).click();
  await expect(page.getByTestId('canal')).toBeVisible();
});

test('without WebGL and with reduced motion the canal still draws, without the water loops', async ({ page }) => {
  const c = watchConsole(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?nowebgl&as=${ALEX}#/`);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('boat')).toHaveCount(14);
  await expect(page.locator('.pcg-wave')).toHaveCount(0);
  await expect(page.locator('.pcg-bob')).toHaveCount(0);
  c.assertClean();
});

test('the keyboard: ? opens the shortcut sheet, arrows step through boats, N opens the Lock keeper', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'Keyboard shortcuts are a desktop feature.');
  await openApp(page, '/', ALEX);
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="boat"][aria-pressed="true"]')).toHaveCount(1);
  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: 'Lock keeper' })).toBeVisible();
});
