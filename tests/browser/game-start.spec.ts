import { expect } from '@playwright/test';
import { test, setup, inViewport } from '../fixtures/table';

for (const reduced of [false, true]) {
  test(`game start shuffles and deals once with synchronized clacks; reduced motion ${reduced}`, async ({
    page,
    tableServer,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      const w = window as unknown as { audioSchedule: number[] };
      w.audioSchedule = [];
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when = 0) {
        w.audioSchedule.push(when - this.context.currentTime);
        return start.call(this, when);
      };
    });
    await setup(page, tableServer, 'waiting');
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle game sounds' }).click();
    const schedule = () =>
      page.evaluate(() => (window as unknown as { audioSchedule: number[] }).audioSchedule);
    const before = (await schedule()).length;
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(page.locator('[data-effect="deal"]')).toBeVisible();
    await expect(page.locator('.deal-caption')).toContainText('HAND 1');
    await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
    await expect.poll(async () => (await schedule()).length).toBeGreaterThan(before + 65);
    const times = (await schedule()).slice(before);
    expect(Math.max(...times)).toBeGreaterThan(2);
    expect(Math.min(...times)).toBeLessThan(0.1);
    if (reduced) {
      await expect(page.locator('.deal-halo')).toBeHidden();
      await expect(page.locator('.deal-effect')).toHaveCSS('animation-name', 'none');
      await expect(page.locator('#live-table')).not.toHaveAttribute('data-deal', 'active');
    } else {
      await expect(page.locator('#live-table')).toHaveAttribute('data-deal', 'active');
    }
    await inViewport(page, '.hand-tiles');
    await inViewport(page, '#action-dock');
    if (!reduced) await page.screenshot({ path: 'test-results/shuffle-deal.png' });
    const count = (await schedule()).length;
    tableServer.service.broadcast();
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator('#live-table')).not.toHaveAttribute('data-deal', 'active');
    expect((await schedule()).length).toBe(count);
    await page.reload();
    await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0);
    expect((await schedule()).length).toBe(0);
  });
}
