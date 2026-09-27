import { expect, test } from '@playwright/test';

test('profile, saved rules, private lobby, four human seats, turn and reconnect', async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await page.locator('.profile-button').click();
  await page.getByLabel('DISPLAY NAME').fill('Avery');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.locator('#profile-name')).toHaveText('Avery');
  await page.getByRole('button', { name: 'Your rulesets', exact: true }).click();
  await page.getByRole('button', { name: 'Create a ruleset', exact: true }).click();
  await page.getByLabel('RULESET NAME').fill('Evening riichi');
  await page.getByLabel('BASED ON').selectOption('riichi');
  await page.getByLabel('RULESET NAME').fill('Evening riichi');
  await page.getByLabel('TURN CLOCK (SECONDS)').fill('120');
  await page.getByLabel('CLAIM WINDOW (SECONDS)').fill('3');
  await page.getByRole('button', { name: 'Add a bonus', exact: true }).click();
  await page.getByRole('textbox', { name: 'Bonus name', exact: true }).fill('A closed hand');
  await page.getByLabel('Bonus condition').selectOption('closed');
  await page.getByRole('button', { name: 'Save ruleset', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening riichi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Create a lobby', exact: true }).click();
  await page.getByLabel('LOBBY NAME').fill('Browser test club');
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click();
  await expect(page.locator('#lobby-label')).toHaveText('Browser test club');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await page.getByLabel('TABLE NAME').fill('Four browser friends');
  await page
    .getByLabel('RULESET', { exact: true })
    .selectOption({ label: 'Evening riichi · custom' });
  await page.getByRole('button', { name: 'Create table', exact: true }).click();
  await expect(page.locator('.waiting-message')).toBeVisible();
  const code = await page.locator('#room-code').innerText();
  const peers = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`/?room=${code}`);
    await expect(p.locator('#room-title')).toHaveText('Four browser friends');
    peers.push({ context, page: p });
  }
  await page.getByRole('button', { name: 'Start the game', exact: true }).click();
  await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
  await expect(peers[0].page.locator('.hand-tiles .tile')).toHaveCount(13);
  await expect(page.locator('.table-entrance')).toHaveCSS('animation-name', 'table-enter');
  await expect(page.locator('#live-table canvas')).toHaveCount(1);
  await page.locator('.hand-tiles .tile.playable').first().click();
  await page.locator('.discard-button').click();
  await expect(page.locator('#log-entries')).toContainText('Avery discarded');
  // A possible claim window must finish before capturing the next player's hand.
  await expect(peers[0].page.locator('.position-0')).toHaveClass(/current-player/, {
    timeout: 15000,
  });
  const hand = await peers[0].page
    .locator('.hand-tiles .tile')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await peers[0].page.reload();
  await expect(peers[0].page.locator('#room-code')).toHaveText(code);
  await expect(peers[0].page.locator('.hand-tiles .tile')).toHaveCount(hand.length);
  expect(
    await peers[0].page
      .locator('.hand-tiles .tile')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
  ).toEqual(hand);
  expect(errors).toEqual([]);
  for (const p of peers) await p.context.close();
});

test('mobile bot table, seat takeover, reduced motion and safe profile text', async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.profile-button').click();
  await page.getByLabel('DISPLAY NAME').fill('<b>River</b>');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.locator('#profile-name')).toHaveText('<b>River</b>');
  await expect(page.locator('#profile-name b')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play with bots', exact: true }).click();
  await page.getByRole('button', { name: 'Take your seat', exact: true }).click();
  await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
  await expect(page.locator('.table-entrance')).toHaveCSS('animation-name', 'none');
  const code = await page.locator('#room-code').innerText();
  const ctx = await browser.newContext();
  const friend = await ctx.newPage();
  await friend.goto(`/?room=${code}`);
  await expect(friend.locator('.hand-tiles .tile')).toHaveCount(13);
  await expect(friend.locator('.position-0 strong')).toContainText('you');
  await page.locator('.hand-tiles .tile.playable').first().click();
  await page.locator('.discard-button').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Table help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little table wisdom.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: 'test-results/mobile-table.png', fullPage: true });
  await ctx.close();
});
