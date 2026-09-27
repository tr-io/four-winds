import { PRESETS } from '../../shared/rules';
import { startGame } from '../../server/engine';
import { dealSequence } from '../../client/deal-sequence';
import { expect } from '@playwright/test';
import { test, setup, inViewport } from '../fixtures/table';
import { tableProjection } from '../fixtures/table-view';
import { tileName } from '../../shared/tiles';

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
    const sequence = dealSequence(tableServer.service.rooms.get('TEST01')!.game!);
    expect(Math.max(...times)).toBeGreaterThan((sequence.duration - 500) / 1000);
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
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0, {
      timeout: sequence.duration + 500,
    });
    await expect(page.locator('#live-table')).not.toHaveAttribute('data-deal', 'active');
    expect((await schedule()).length).toBe(count);
    const hand = tableServer.service.rooms.get('TEST01')!.game!.players[0].hand;
    const inspectOwnHand = async () => {
      const point = await tableProjection(page);
      for (const [i, tile] of hand.entries()) {
        const own = point((i - (hand.length - 1) / 2) * 0.32, 5.46);
        await expect
          .poll(async () => {
            await page.mouse.move(own.x, own.y);
            const tooltip = page.getByRole('tooltip');
            return (await tooltip.isVisible()) ? tooltip.textContent() : null;
          })
          .toBe(tileName(tile));
      }
    };
    await inspectOwnHand();
    await page.reload();
    await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0);
    expect((await schedule()).length).toBe(0);
    await inspectOwnHand();
  });
}

for (const preset of ['mcr', 'riichi', 'singapore', 'legacy'] as const) {
  test(`opening title, dice, and deal run in order for ${preset}`, async ({
    page,
    tableServer,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Sampling CSS animations does not pause the effect's JavaScript cleanup timer.
    // Hold that timer while screenshots and assertions inspect each opening stage.
    await page.clock.install();
    await setup(page, tableServer, 'waiting');
    // Pause before the deal exists, leaving time for the command to reach a busy renderer.
    await page.clock.pauseAt(Date.now() + 5000);
    const room = tableServer.service.rooms.get('TEST01')!;
    room.rules = { ...PRESETS[preset === 'legacy' ? 'mcr' : preset], turnSeconds: 120 };
    room.game = startGame(room.rules, room.players, 2026);
    if (preset === 'legacy') delete room.game.setup;
    tableServer.service.broadcast();
    // Socket.IO dispatches received messages on a timer; let that delivery finish
    // without letting the cleanup timer run during real-world screenshot delays.
    await expect
      .poll(async () => {
        await page.clock.runFor(50);
        return page.locator('[data-effect="deal"]').count();
      })
      .toBe(1);
    await expect(page.locator('[data-effect="deal"]')).toBeVisible();
    const sample = (time: number) =>
      page.locator('[data-effect="deal"]').evaluate((effect, time) => {
        for (const animation of effect.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = time;
        }
        const shown = (selector: string) => {
          let el = effect.querySelector(selector);
          if (!el) return false;
          for (; el; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity) === 0
            )
              return false;
          }
          return true;
        };
        return {
          title: shown('.deal-caption'),
          dice: shown('.setup-dice'),
          first: shown('.throw-0'),
          second: shown('.throw-1'),
          deal: shown('.deal-finish-caption'),
        };
      }, time);
    expect(await sample(700)).toEqual({
      title: true,
      dice: false,
      first: false,
      second: false,
      deal: false,
    });
    if (preset === 'mcr') await page.screenshot({ path: 'test-results/opening-intro.png' });
    if (preset !== 'legacy') {
      expect(await sample(1600)).toEqual({
        title: false,
        dice: true,
        first: true,
        second: false,
        deal: false,
      });
      if (preset === 'mcr')
        expect(await sample(2400)).toEqual({
          title: false,
          dice: true,
          first: true,
          second: true,
          deal: false,
        });
      if (preset === 'mcr') await page.screenshot({ path: 'test-results/opening-dice.png' });
    } else await expect(page.locator('.setup-dice')).toHaveCount(0);
    expect(await sample(dealSequence(room.game).tilesAt + 100)).toEqual({
      title: false,
      dice: false,
      first: false,
      second: false,
      deal: true,
    });
    await page.clock.fastForward(dealSequence(room.game).duration);
    await expect(page.locator('[data-effect="deal"]')).toHaveCount(0);
  });
}
