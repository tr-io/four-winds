// One tooltip for HTML tiles and raycast face-up Three.js tiles. No hidden tile IDs enter it.
let tip: HTMLElement | undefined;
let owner: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
function releaseOwner() {
  if (!owner) return;
  const remaining = (owner.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id && id !== 'tile-tooltip')
    .join(' ');
  if (remaining) owner.setAttribute('aria-describedby', remaining);
  else owner.removeAttribute('aria-describedby');
}
export function hideTileTooltip() {
  if (tip) tip.hidden = true;
  releaseOwner();
  owner = null;
  clearTimeout(timer);
}
export function showTileTooltip(
  name: string,
  x: number,
  y: number,
  target: HTMLElement | null = null,
) {
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tile-tooltip';
    tip.className = 'tile-tooltip';
    tip.setAttribute('role', 'tooltip');
  }
  if (owner !== target) releaseOwner();
  owner = target;
  if (owner)
    owner.setAttribute(
      'aria-describedby',
      [
        ...new Set([
          ...(owner.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean),
          tip.id,
        ]),
      ].join(' '),
    );
  const host = document.querySelector('dialog[open]') ?? document.body;
  if (tip.parentElement !== host) host.append(tip);
  tip.textContent = name;
  tip.hidden = false;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const rect = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - rect.width - 8, x - rect.width / 2));
  const top = y >= rect.height + 16 ? y - rect.height - 12 : y + 24;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.min(innerHeight - rect.height - 8, top)}px`;
}
export function installTileTooltips() {
  let touch: { tile: HTMLElement; x: number; y: number; moved: boolean } | undefined;
  const target = (event: Event) =>
    (event.target as Element).closest<HTMLElement>('[data-tile-name]');
  document.addEventListener('pointerover', (event) => {
    const tile = target(event);
    if (tile && event.pointerType === 'mouse' && !event.buttons)
      showTileTooltip(
        tile.dataset.tileName!,
        event.clientX,
        tile.getBoundingClientRect().top,
        tile,
      );
  });
  document.addEventListener('pointerout', (event) => {
    // Touch has no hover: WebKit sends pointerout as soon as the finger lifts.
    if (event.pointerType === 'mouse' && target(event)) hideTileTooltip();
  });
  document.addEventListener('focusin', (event) => {
    const tile = target(event);
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    showTileTooltip(tile.dataset.tileName!, rect.left + rect.width / 2, rect.top, tile);
  });
  document.addEventListener('focusout', hideTileTooltip);
  document.addEventListener('pointerdown', (event) => {
    hideTileTooltip();
    const tile = target(event);
    touch =
      event.pointerType !== 'mouse' && tile
        ? { tile, x: event.clientX, y: event.clientY, moved: false }
        : undefined;
  });
  document.addEventListener('pointermove', (event) => {
    if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) >= 7)
      touch.moved = true;
    if (event.buttons) hideTileTooltip();
  });
  document.addEventListener('pointercancel', () => {
    touch = undefined;
    hideTileTooltip();
  });
  document.addEventListener('pointerup', () => {
    const tap = touch;
    touch = undefined;
    if (!tap || tap.moved) return;
    // Let the tap's selection/focus changes finish before positioning its label.
    requestAnimationFrame(() => {
      if (!tap.tile.isConnected) return;
      showTileTooltip(
        tap.tile.dataset.tileName!,
        tap.x,
        tap.tile.getBoundingClientRect().top,
        tap.tile,
      );
      timer = setTimeout(hideTileTooltip, 2200);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTileTooltip();
  });
  document.addEventListener('scroll', hideTileTooltip, true);
  window.addEventListener('resize', hideTileTooltip);
}
