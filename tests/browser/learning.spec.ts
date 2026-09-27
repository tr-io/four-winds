import { expect } from '@playwright/test';
import { test } from '../fixtures/table';
for (const width of [1440, 390])
  test(`visual lessons work across all traditions at ${width}px`, async ({ page, tableServer }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(tableServer.url);
    await expect(page.locator('#connection-text')).toHaveText('Connected');
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    for (const preset of ['mcr', 'riichi', 'singapore']) {
      await page.locator(`[data-lesson-preset="${preset}"]`).click();
      await expect(page.locator('.lesson-context')).toContainText(
        preset === 'mcr' ? '144 tiles' : preset === 'riichi' ? '136 tiles' : '148 tiles',
      );
      await expect(page.locator('.bonus-family [data-learn-tile]')).toHaveCount(
        preset === 'mcr' ? 8 : preset === 'riichi' ? 0 : 12,
      );
      await page.locator('.tile-family [data-learn-tile]').first().focus();
      await expect(page.locator('#tile-explanation')).toContainText('1 bamboo');
      await page.locator('[data-learn="next"]').click();
      await expect(page.locator('.teaching-hand [data-motion="draw"]')).toBeVisible();
      await page.locator('[data-learn="next"]').click();
      await expect(page.locator('.lesson-discard [data-motion="discard"]')).toBeVisible();
      await page.locator('[data-learn="back"]').click();
      await expect(page.locator('.teaching-hand [data-motion="discard"]')).toBeVisible();
      await page.locator('[data-learn="replay"]').click();
      await expect(page.locator('#turn-progress')).toHaveText('1 / 4');
      await page.locator('[data-learn="check"]').click();
      await expect(page.locator('#build-result')).toContainText('Try again');
      const available = page.locator('.build-pool [data-build]').first();
      const id = await available.getAttribute('data-build');
      await available.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.locator('.build-group').first().locator(`[data-build="${id}"]`),
      ).toBeVisible();
      await page.locator('[data-learn="hint"]').click();
      await page.locator('[data-learn="check"]').click();
      await expect(page.locator('#build-result')).toContainText('Legal hand');
      await expect(page.locator('#build-result')).toContainText(
        preset === 'mcr' ? 'fan' : preset === 'riichi' ? 'han' : 'tai',
      );
      await page.locator('[data-learn="claim-next"]').click();
      await page.locator('[data-learn="claim-next"]').click();
      await expect(page.locator('.claim-winner')).toContainText('Jun');
      await page.locator('[data-learn="claim-next"]').click();
      await expect(page.locator('.claim-winner')).toContainText(
        preset === 'riichi' ? 'You' : 'Mei',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(errors).toEqual([]);
  });
