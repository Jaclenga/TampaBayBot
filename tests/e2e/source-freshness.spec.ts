import { test, expect } from '@playwright/test';

test('public source list exposes the RMAP conflict and distinguishes content review from link access', async ({ page }) => {
  await page.goto('/sources');
  await page.getByRole('searchbox', { name: 'Search sources' }).fill('RMAP');
  const card = page.locator('.source-card').filter({ hasText: 'Rental and Move-In Assistance Program' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.source-review-caution')).toContainText([
    'No substantive source review is recorded',
    'Official RMAP page limits Phase X to new move-in costs',
  ]);
  await expect(card.getByText('Automated link check', { exact: true }).locator('..')).toContainText('Not checked');
  await expect(card).not.toContainText('Accessible at last check');
});
