import { tileHTML } from './tile-art';

export function reconcileOrder(order: number[], hand: number[], drawn: number | null) {
  const available = new Set(hand);
  const retained = [...new Set(order)].filter((tile) => available.has(tile));
  const incoming = hand
    .filter((tile) => !retained.includes(tile) && tile !== drawn)
    .sort((a, b) => a - b);
  if (drawn !== null && available.has(drawn) && !retained.includes(drawn)) incoming.push(drawn);
  return [...retained, ...incoming];
}

export function moveTile(order: number[], tile: number, index: number) {
  if (!order.includes(tile)) return order;
  const next = order.filter((t) => t !== tile);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, tile);
  return next;
}

/** A local rack order never changes physical IDs or sends a gameplay action. */
export class HandRack {
  private key = '';
  private order: number[] = [];
  private drag: { id: number; pointer: number; x: number; y: number; moved: boolean } | null = null;
  private ghost: HTMLElement | null = null;
  private suppressUntil = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(
    private element: HTMLElement,
    private announce: (message: string) => void,
  ) {
    element.addEventListener('pointerdown', this.down);
    element.addEventListener('pointermove', this.move);
    element.addEventListener('pointerup', this.up);
    element.addEventListener('pointercancel', this.cancel);
    element.addEventListener('lostpointercapture', this.lostCapture);
    element.addEventListener('keydown', this.keydown);
  }
  sync(
    key: string,
    hand: number[],
    drawn: number | null,
    legal: number[],
    selected: number | null,
  ) {
    if (key !== this.key) {
      this.cancel();
      this.key = key;
      this.order = [];
      try {
        const saved = JSON.parse(sessionStorage.getItem('four-winds-rack') ?? 'null');
        if (saved?.key === key && Array.isArray(saved.order))
          this.order = saved.order.filter(Number.isInteger);
      } catch {
        /* Storage is optional. */
      }
    }
    if (this.drag && !hand.includes(this.drag.id)) this.cancel();
    this.order = reconcileOrder(this.order, hand, drawn);
    const present = new Set(this.order);
    for (const child of [...this.element.children] as HTMLElement[]) {
      if (!present.has(Number(child.dataset.tile))) child.remove();
    }
    for (const tile of this.order) {
      let button = this.element.querySelector<HTMLButtonElement>(`[data-tile="${tile}"]`);
      if (!button) {
        this.element.insertAdjacentHTML(
          'beforeend',
          tileHTML(tile, 'rack-new', `data-tile="${tile}" aria-describedby="rack-instructions"`),
        );
        button = this.element.lastElementChild as HTMLButtonElement;
      }
      button.classList.toggle('drawn', tile === drawn);
      button.classList.toggle('playable', legal.includes(tile));
      button.classList.toggle('selected', tile === selected);
      button.setAttribute('aria-pressed', String(tile === selected));
      button.dataset.canDiscard = String(legal.includes(tile));
    }
    this.arrange();
    this.save();
  }
  suppressClick() {
    return performance.now() < this.suppressUntil;
  }
  sort() {
    this.order.sort((a, b) => a - b);
    this.arrange(true);
    this.save();
    this.announce('Tiles sorted by suit and rank.');
  }
  private save() {
    try {
      sessionStorage.setItem(
        'four-winds-rack',
        JSON.stringify({ key: this.key, order: this.order }),
      );
    } catch {
      /* Storage is optional. */
    }
  }
  private arrange(animate = false) {
    const before = new Map(
      [...this.element.children].map((el) => [el, el.getBoundingClientRect().left]),
    );
    this.order.forEach((tile, index) => {
      const button = this.element.querySelector<HTMLElement>(`[data-tile="${tile}"]`)!;
      if (this.element.children[index] !== button)
        this.element.insertBefore(button, this.element.children[index] ?? null);
    });
    if (animate && !this.reduced.matches)
      for (const [el, left] of before) {
        const delta = left - el.getBoundingClientRect().left;
        if (delta)
          el.animate([{ translate: `${delta}px 0` }, { translate: '0 0' }], {
            duration: 130,
            easing: 'ease-out',
          });
      }
  }
  private down = (e: PointerEvent) => {
    const button = (e.target as Element).closest<HTMLElement>('[data-tile]');
    if (!button || e.button !== 0 || !e.isPrimary) return;
    this.drag = {
      id: Number(button.dataset.tile),
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };
  private move = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
    e.preventDefault();
    const source = this.element.querySelector<HTMLElement>(`[data-tile="${d.id}"]`)!;
    if (!d.moved) {
      d.moved = true;
      this.element.setPointerCapture(e.pointerId);
      this.ghost = source.cloneNode(true) as HTMLElement;
      this.ghost.removeAttribute('data-tile');
      this.ghost.setAttribute('aria-hidden', 'true');
      this.ghost.className = 'tile rack-ghost';
      const rect = source.getBoundingClientRect();
      this.ghost.style.width = `${rect.width}px`;
      this.ghost.style.height = `${rect.height}px`;
      document.body.append(this.ghost);
      source.classList.add('drag-placeholder');
      this.element.classList.add('sorting');
    }
    this.ghost!.style.left = `${e.clientX}px`;
    this.ghost!.style.top = `${e.clientY}px`;
    const others = [...this.element.querySelectorAll<HTMLElement>('[data-tile]')].filter(
      (el) => el !== source,
    );
    const index = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.bottom || (e.clientY >= r.top && e.clientX > r.left + r.width / 2);
    }).length;
    const next = moveTile(this.order, d.id, index);
    if (next.join() !== this.order.join()) {
      this.order = next;
      this.arrange(true);
    }
  };
  private up = (e: PointerEvent) => {
    if (!this.drag || this.drag.pointer !== e.pointerId) return;
    if (this.drag.moved) {
      this.suppressUntil = performance.now() + 350;
      this.save();
      this.announce(`Tile moved to position ${this.order.indexOf(this.drag.id) + 1}.`);
    }
    this.cancel();
  };
  private cancel = () => {
    const pointer = this.drag?.pointer;
    if (this.drag?.moved) this.suppressUntil = performance.now() + 350;
    this.drag = null;
    if (pointer !== undefined && this.element.hasPointerCapture(pointer))
      this.element.releasePointerCapture(pointer);
    this.ghost?.remove();
    this.ghost = null;
    this.element.classList.remove('sorting');
    this.element.querySelector('.drag-placeholder')?.classList.remove('drag-placeholder');
  };
  private lostCapture = (event: PointerEvent) => {
    // Touch starts with implicit capture on the tile. Moving capture to the rack
    // emits a bubbling loss event from that tile; the drag is still active.
    if (event.target === this.element) this.cancel();
  };
  private keydown = (e: KeyboardEvent) => {
    if (!e.altKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const button = (e.target as Element).closest<HTMLElement>('[data-tile]');
    if (!button) return;
    e.preventDefault();
    const tile = Number(button.dataset.tile);
    this.order = moveTile(
      this.order,
      tile,
      this.order.indexOf(tile) + (e.key === 'ArrowLeft' ? -1 : 1),
    );
    this.arrange(true);
    button.focus();
    this.save();
    this.announce(`Tile moved to position ${this.order.indexOf(tile) + 1}.`);
  };
  dispose() {
    this.cancel();
    this.element.removeEventListener('pointerdown', this.down);
    this.element.removeEventListener('pointermove', this.move);
    this.element.removeEventListener('pointerup', this.up);
    this.element.removeEventListener('pointercancel', this.cancel);
    this.element.removeEventListener('lostpointercapture', this.lostCapture);
    this.element.removeEventListener('keydown', this.keydown);
  }
}
