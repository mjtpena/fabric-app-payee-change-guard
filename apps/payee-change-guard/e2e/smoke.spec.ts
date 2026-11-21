import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { SAM } from './helpers';

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', SAM);
  await expect(page.getByRole('heading', { name: 'The canal locks' })).toBeVisible();
  await expect(page.getByTestId('boat')).toHaveCount(14);
  await assertNoHorizontalScroll(page);

  // Create: raise a change in the Lock keeper.
  await page.goto('/#/keeper');
  await page.getByLabel('Supplier').fill('Mossgrove');
  await page.getByRole('option', { name: /Mossgrove Garden Care/ }).click();
  await page.getByLabel('New account number or IBAN').fill('20-19-77 55667788');
  await page.getByLabel('Bank country').selectOption('GB');
  await page.getByRole('radio', { name: 'Letter' }).click();
  await page.getByLabel('Source document').fill('Letter on letterhead, ref MGC/22');
  await page.getByLabel('Reason given').fill('Supplier moved its account to a new branch.');
  await assertNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Put it in the water' }).click();

  // See it: a new boat in the request chamber, and a row in the list.
  await expect(page.getByRole('heading', { name: 'Mossgrove Garden Care' })).toBeVisible();
  await expect(page.locator('[data-testid="boat"][data-supplier="Mossgrove Garden Care"]')).toHaveAttribute('data-chamber', 'request');
  await expect(page.getByTestId('boat')).toHaveCount(15);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('canal-row').filter({ hasText: 'Mossgrove Garden Care' })).toContainText('PCR-0115');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});
