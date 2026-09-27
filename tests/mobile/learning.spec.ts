import { expect } from '@playwright/test';
import { test } from '../fixtures/table';

test('touch lessons switch traditions, move tiles, and check real scores', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await page.getByRole('button', { name: 'How to play', exact: true }).tap();
  for (const preset of ['mcr', 'riichi', 'singapore']) {
    await page.locator(`[data-lesson-preset="${preset}"]`).tap();
    await page.locator('[data-learn="next"]').tap();
    await expect(page.locator('.teaching-hand [data-motion="draw"]')).toBeVisible();
    await page.locator('[data-learn="next"]').tap();
    await expect(page.locator('.lesson-discard [data-motion="discard"]')).toBeVisible();
    await page.locator('.build-pool [data-build]').first().tap();
    await expect(page.locator('.build-group [data-build]')).toHaveCount(1);
    await page.locator('[data-learn="hint"]').tap();
    await page.locator('[data-learn="check"]').tap();
    await expect(page.locator('#build-result')).toContainText('Legal hand');
    for (let i = 0; i < 3; i++) await page.locator('[data-learn="claim-next"]').tap();
    await expect(page.locator('.claim-winner')).toContainText(preset === 'riichi' ? 'You' : 'Mei');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
