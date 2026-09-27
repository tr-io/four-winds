import { expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { applyAction, gameView } from '../../server/engine';
import { test, setup, order, inViewport } from '../fixtures/table';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`drag, keyboard sort, reconnect, and viewport containment at ${viewport.width}px`, async ({
    page,
    tableServer,
  }) => {
    await page.setViewportSize(viewport);
    const game = await setup(page, tableServer);
    const originalHand = [...game.players[0].hand];
    const original = await order(page);
    const first = page.locator('.hand-tiles .tile').first();
    const last = page.locator('.hand-tiles .tile').last();
    await expect(first).toBeVisible();
    const a = (await first.boundingBox())!,
      b = (await last.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual([...original.slice(1), original[0]]);
    expect(game.players[0].hand).toEqual(originalHand);
    expect(game.players[0].discards).toHaveLength(0);
    // An unrelated server update must not discard local order or interrupt input.
    tableServer.service.broadcast();
    await expect.poll(() => order(page)).toEqual([...original.slice(1), original[0]]);
    await page.reload();
    await expect.poll(() => order(page)).toEqual([...original.slice(1), original[0]]);
    await page.locator('.hand-tiles .tile').last().focus();
    await page.keyboard.press('Alt+ArrowLeft');
    const moved = await order(page);
    expect(moved.at(-2)).toBe(original[0]);
    await page.getByRole('button', { name: 'Sort tiles by suit and rank' }).click();
    await expect.poll(() => order(page)).toEqual([...original].sort((a, b) => a - b));
    await inViewport(page, '#action-dock');
    await inViewport(page, '.hand-tiles');
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    await page.locator('.hand-tiles .tile.playable').first().click();
    await expect(page.locator('.discard-button')).toBeEnabled();
    await page.locator('.discard-button').click();
    await expect.poll(() => game.players[0].discards.length).toBe(1);
  });
}

test('MCR qualification explains the pictured hand; center ledger groups all discards', async ({
  page,
  tableServer,
}) => {
  await setup(page, tableServer, 'complete');
  await expect(page.locator('.score-hint')).toContainText('5/8 fan');
  await expect(page.locator('[data-action="win"]')).toHaveCount(0);
  await page.locator('.score-hint').click();
  await expect(
    page.getByRole('heading', { name: 'Complete shape. More fan needed.' }),
  ).toBeVisible();
  await expect(page.locator('.score-patterns')).toContainText('Prevalent Wind');
  await expect(page.locator('.score-patterns')).toContainText(
    'Flowers & seasons · added after qualification',
  );
  await page.getByRole('button', { name: 'Back to the hand', exact: true }).click();
  await page.getByRole('button', { name: 'Show discarded tiles' }).hover();
  await expect(page.getByRole('region', { name: 'Discarded tiles' })).toBeVisible();
  await expect(page.locator('.discard-group[data-kind="3"] > strong')).toHaveText('4 / 4');
  await expect(page.locator('.discard-group[data-kind="30"] > strong')).toHaveText('2 / 4');
  await expect(page.locator('.discard-group[data-kind="27"] em')).toHaveText('1 called');
  await page.mouse.move(5, 5);
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await page.getByRole('button', { name: 'Show discarded tiles' }).focus();
  await expect(page.locator('#discard-ledger')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show discarded tiles' }).click();
  await expect(page.locator('#discard-ledger')).toBeVisible();
  await inViewport(page, '#discard-ledger');
});

for (const call of ['pung', 'win']) {
  test(`all legal claims stay visible on mobile; ${call} resolves with an event animation`, async ({
    page,
    tableServer,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const game = await setup(page, tableServer, 'claim');
    applyAction(game, 3, game.decision, 'discard:3');
    tableServer.service.broadcast();
    const actions = gameView(game, 0).actions;
    expect(actions.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['win', 'pung', 'kong', 'chow', 'pass']),
    );
    for (const action of actions) {
      await expect(page.locator(`[data-action="${action.id}"]`)).toBeVisible();
      await inViewport(page, `[data-action="${action.id}"]`);
    }
    // The browser sends a real command; the authoritative engine settles it.
    await page.locator(`[data-action="${call}"]`).click();
    await expect(page.locator(`[data-effect="${call}"]`)).toBeVisible();
    await page.screenshot({ path: `test-results/${call}-cut-in.png` });
    if (call === 'win') {
      expect(game.result?.winner).toBe(0);
      await expect(page.locator('.call-title')).toHaveText('MAHJONG');
      await expect(page.locator('#modal')).not.toBeVisible();
      await expect(page.getByRole('heading', { name: 'Akira wins!' })).toBeVisible({
        timeout: 5000,
      });
    } else {
      expect(game.players[0].melds[0].kind).toBe('pung');
      await expect(page.locator('.call-title')).toHaveText('PUNG');
      await expect(page.locator('.discard-button')).toBeVisible();
      tableServer.service.broadcast();
      // The same server event cannot restart the animation on an unrelated update.
      await expect(page.locator(`[data-effect="${call}"]`)).toHaveCount(0, { timeout: 3000 });
    }
    expect(errors).toEqual([]);
  });
}

test('reduced motion keeps a winning action and its result immediately usable', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = await setup(page, tableServer, 'claim');
  applyAction(game, 3, game.decision, 'discard:3');
  tableServer.service.broadcast();
  await page.locator('[data-action="win"]').click();
  await expect(page.getByRole('heading', { name: 'Akira wins!' })).toBeVisible();
  await expect(page.locator('.call-cut')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.impact-frame')).toBeHidden();
  await expect(page.locator('.fire-aura')).toBeHidden();
});

test('a received pung remains pending until another player resolves a higher-priority win', async ({
  page,
  tableServer,
}) => {
  const game = await setup(page, tableServer, 'priority');
  applyAction(game, 3, game.decision, 'discard:3');
  tableServer.service.broadcast();
  expect(gameView(game, 1).actions.some((a) => a.kind === 'win')).toBe(true);
  await page.locator('[data-action="pung"]').click();
  await expect(page.locator('.action-context')).toContainText('CALL LOCKED IN');
  expect(game.phase).toBe('claim');
  expect(game.players[0].melds).toHaveLength(0);
  await expect(page.locator('.call-effect')).toHaveCount(0);
  applyAction(game, 1, game.decision, 'win');
  tableServer.service.broadcast();
  await expect(page.locator('.call-player')).toHaveText('Mei');
  expect(game.result?.winner).toBe(1);
  expect(game.players[0].melds).toHaveLength(0);
});

test('touch drag across rack rows does not select or discard a tile', async ({
  page,
  tableServer,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const game = await setup(page, tableServer);
  const initial = await order(page);
  await page
    .locator('.hand-tiles .tile')
    .first()
    .evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
  const a = (await page.locator('.hand-tiles .tile').first().boundingBox())!;
  const b = (await page.locator('.hand-tiles .tile').last().boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
  });
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: a.x + a.width / 2 + ((b.x + b.width - 2 - a.x - a.width / 2) * i) / 12,
          y: a.y + a.height / 2 + ((b.y + b.height / 2 - a.y - a.height / 2) * i) / 12,
        },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => order(page)).toEqual([...initial.slice(1), initial[0]]);
  await expect(page.locator('.hand-tiles .selected')).toHaveCount(0);
  expect(game.players[0].discards).toHaveLength(0);
  await inViewport(page, '.hand-tiles');
  await cdp.detach();
});

test('English tile tooltips work in the rack, melds, bonuses, ledger, and hand inspector', async ({
  page,
  tableServer,
}) => {
  await setup(page, tableServer, 'complete');
  for (const selector of [
    '.hand-tiles .tile',
    '#exposed-hand .meld-pung .tile',
    '#exposed-hand .meld-chow .tile',
    '#exposed-hand .meld-bonus .tile',
  ]) {
    const tile = page.locator(selector).first();
    await tile.hover();
    await expect(page.getByRole('tooltip')).toHaveText(
      (await tile.getAttribute('data-tile-name'))!,
    );
    await inViewport(page, '#tile-tooltip');
    await tile.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.getByRole('button', { name: 'Show discarded tiles' }).click();
  const river = page.locator('.discard-group .tile').first();
  await river.hover();
  await expect(page.getByRole('tooltip')).toHaveText((await river.getAttribute('data-tile-name'))!);
  await page.getByRole('button', { name: 'Close discarded tiles' }).click();
  await page.getByRole('button', { name: 'Inspect your hand' }).click();
  await expect(page.locator('.set-slots .filled')).toHaveCount(2);
  await expect(page.locator('.detail-melds .meld-pung .tile')).toHaveCount(3);
  const meld = page.locator('.detail-melds .meld-chow .tile').first();
  await meld.hover();
  await expect(page.locator('dialog #tile-tooltip')).toHaveText('5 characters');
  await page.screenshot({ path: 'test-results/hand-inspector.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await inViewport(page, '#exposed-hand');
  await inViewport(page, '#action-dock');
  await page.screenshot({ path: 'test-results/mobile-melds.png' });
});

test('last discard and last turn persist through claims and reconnect', async ({
  page,
  tableServer,
}) => {
  const game = await setup(page, tableServer, 'claim');
  applyAction(game, 3, game.decision, 'discard:3');
  tableServer.service.broadcast();
  await expect(page.locator('.last-discard')).toContainText('Sora');
  await expect(page.locator('.last-discard .tile')).toHaveAttribute(
    'data-tile-name',
    '1 characters',
  );
  await expect(page.locator('.last-turn')).toContainText('discarded');
  await page.locator('[data-action="pung"]').click();
  await expect(page.locator('.last-turn')).toContainText('Akira');
  await expect(page.locator('.last-turn')).toContainText('pung');
  await expect(page.locator('.last-discard')).toContainText('Sora');
  await page.reload();
  await expect(page.locator('.last-turn')).toContainText('pung');
  await expect(page.locator('.last-discard .tile')).toHaveAttribute(
    'data-tile-name',
    '1 characters',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await inViewport(page, '.last-discard');
  await inViewport(page, '.last-turn');
});

test('3D face inspection names visible tiles and never reveals a concealed tile', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = await setup(page, tableServer, 'complete');
  const rect = (await page.locator('#live-table canvas').boundingBox())!;
  const aspect = rect.width / rect.height;
  const camera = new PerspectiveCamera(aspect < 1.1 ? 56 : 40, aspect, 0.1, 100);
  camera.position.set(0, 15, 12);
  camera.lookAt(0, 0, 0.7);
  camera.updateMatrixWorld();
  const point = (x: number, z: number) => {
    const v = new Vector3(x, 0.178, z).project(camera);
    return { x: rect.x + ((v.x + 1) / 2) * rect.width, y: rect.y + ((1 - v.y) / 2) * rect.height };
  };
  // A face-up bonus away from the center's discard-ledger hit target.
  const visible = point(-0.48, 4.8);
  expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, visible)).toBe(
    'CANVAS',
  );
  await page.mouse.move(visible.x, visible.y);
  await expect(page.getByRole('tooltip')).toHaveText('Chrysanthemum');
  await page.mouse.click(visible.x, visible.y);
  await expect(page.getByRole('tooltip')).toHaveText('Chrysanthemum');
  // Right-hand seat, away from the HTML seat badges. The server has private tiles here.
  expect(game.players[1].hand.length).toBe(13);
  const hidden = point(5.46, 1.92);
  expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, hidden)).toBe(
    'CANVAS',
  );
  await page.mouse.move(hidden.x, hidden.y);
  await expect(page.getByRole('tooltip')).toBeHidden();
});

test('sound preference and volume persist; real calls schedule layered audio only while enabled', async ({
  page,
  tableServer,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { scheduledVoices: number };
    w.scheduledVoices = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      w.scheduledVoices++;
      return original.apply(this, args);
    };
  });
  const game = await setup(page, tableServer, 'claim');
  const voices = () =>
    page.evaluate(() => (window as unknown as { scheduledVoices: number }).scheduledVoices);
  expect(await voices()).toBe(0);
  await page.getByRole('button', { name: 'Toggle game sounds' }).click();
  await expect.poll(voices).toBeGreaterThan(0);
  applyAction(game, 3, game.decision, 'discard:3');
  tableServer.service.broadcast();
  await expect(page.locator('[data-action="pung"]')).toBeVisible();
  const before = await voices();
  await page.locator('[data-action="pung"]').click();
  await expect.poll(voices).toBeGreaterThanOrEqual(before + 4);
  await expect(page.locator('.fire-aura i')).toHaveCount(10);
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Sound volume' }).fill('30');
  await page.reload();
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Sound volume' })).toHaveValue('30');
  await page.locator('dialog [data-do="sound"]').click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const mutedVoices = await voices();
  await page.locator('.hand-tiles .tile.playable').first().click();
  await page.locator('.discard-button').click();
  await expect(page.locator('.last-discard')).toContainText('Akira');
  expect(await voices()).toBe(mutedVoices);
});
