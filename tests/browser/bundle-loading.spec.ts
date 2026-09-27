import { expect } from '@playwright/test';
import { test } from '../fixtures/table';

const lessons = /\/assets\/learn-[^/]+\.js$/;
const validation = /\/assets\/rules-schema-[^/]+\.js$/;

test('startup defers lessons and rule validation; all fixed and legacy avatars still load', async ({
  page,
  tableServer,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  expect(requests.some((url) => lessons.test(url) || validation.test(url))).toBe(false);
  const session = [...tableServer.service.sessions.values()][0];
  for (const [i, legacy] of ['jade', 'clay', 'gold', 'blue'].entries()) {
    session.profile.avatar = legacy;
    tableServer.service.broadcast();
    await expect(page.locator('#header-avatar img')).toHaveAttribute(
      'src',
      new RegExp(`/assets/adventurer-${i}-[^/]+\\.svg$`),
    );
    await expect
      .poll(() =>
        page
          .locator('#header-avatar img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await page.locator('.profile-button').click();
  const images = page.locator('.dicebear-picker img');
  await expect(images).toHaveCount(24);
  await expect
    .poll(() =>
      images.evaluateAll((images) =>
        images.every((image) => {
          const img = image as HTMLImageElement;
          return (
            img.complete && img.naturalWidth > 0 && new URL(img.src).pathname.startsWith('/assets/')
          );
        }),
      ),
    )
    .toBe(true);
  await page.locator('.dicebear-picker label').last().click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.locator('#header-avatar img')).toHaveAttribute(
    'src',
    /\/assets\/bottts-7-[^/]+\.svg$/,
  );
  await page.reload();
  await expect(page.locator('#header-avatar img')).toHaveAttribute(
    'src',
    /\/assets\/bottts-7-[^/]+\.svg$/,
  );
  expect(requests.some((url) => lessons.test(url) || validation.test(url))).toBe(false);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('.learn-experience')).toBeVisible();
  expect(requests.some((url) => lessons.test(url))).toBe(true);
  expect(requests.some((url) => validation.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Your rulesets', exact: true }).click();
  await page.getByRole('button', { name: 'Create a ruleset', exact: true }).click();
  await page.getByLabel('RULESET NAME').fill('On-demand rules');
  expect(requests.some((url) => validation.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Save ruleset', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'On-demand rules', exact: true })).toBeVisible();
  expect(requests.some((url) => validation.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('a slow lessons download cannot replace a page the player has navigated to', async ({
  page,
  tableServer,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(lessons, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(tableServer.url);
    await expect(page.locator('#connection-text')).toHaveText('Connected');
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    await expect(page.locator('#content [role=status]')).toContainText('Loading lessons');
    tableServer.service.broadcast();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const response = page.waitForResponse(lessons);
    release();
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator('#live-room-list')).toBeVisible();
    await expect(page.locator('.learn-experience')).toHaveCount(0);
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    await expect(page.locator('.learn-experience')).toHaveCount(1);
    await page.locator('[data-learn="next"]').click();
    await expect(page.locator('#turn-progress')).toHaveText('2 / 4');
  } finally {
    release();
  }
});

test('failed lessons downloads show a recovery action and leave navigation usable', async ({
  page,
  tableServer,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(lessons, (route) => route.abort());
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Lessons could not load');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to play', exact: true }).click();
  await expect(page.locator('#live-room-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('slow rule validation cannot save a closed form or close a different dialog', async ({
  page,
  tableServer,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(validation, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(tableServer.url);
    await expect(page.locator('#connection-text')).toHaveText('Connected');
    await page.getByRole('button', { name: 'Your rulesets', exact: true }).click();
    await page.getByRole('button', { name: 'Create a ruleset', exact: true }).click();
    await page.getByLabel('RULESET NAME').fill('Abandoned draft');
    const requested = page.waitForRequest(validation);
    await page.getByRole('button', { name: 'Save ruleset', exact: true }).click();
    await requested;
    await expect(page.getByRole('button', { name: 'Save ruleset', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.locator('.profile-button').click();
    const response = page.waitForResponse(validation);
    release();
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByLabel('DISPLAY NAME')).toBeVisible();
    expect([...tableServer.service.sessions.values()][0].rulesets).toHaveLength(0);
  } finally {
    release();
  }
});

test('a failed rule validation download retains the draft and re-enables its submit button', async ({
  page,
  tableServer,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(validation, (route) => route.abort());
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Your rulesets', exact: true }).click();
  await page.getByRole('button', { name: 'Create a ruleset', exact: true }).click();
  await page.getByLabel('RULESET NAME').fill('Keep this draft');
  await page.getByRole('button', { name: 'Save ruleset', exact: true }).click();
  await expect(page.locator('#toasts')).toContainText('Could not check these rules');
  await expect(page.getByLabel('RULESET NAME')).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Save ruleset', exact: true })).toBeEnabled();
  expect([...tableServer.service.sessions.values()][0].rulesets).toHaveLength(0);
  expect(errors).toEqual([]);
});
