import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TILE_SIZE, seatPoint, wallPosition, wallLayout } from './table-layout';
import type { WallSetup } from '../shared/types';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameView } from '../shared/types';
import { drawTileFace } from './tile-art';
import { kind, tileName } from '../shared/tiles';
import { hideTileTooltip, showTileTooltip } from './tile-tooltip';
import { DEAL, dealSequence } from './deal-sequence';
import { TABLE_THEMES, type TableTheme } from './table-theme';
import { tableFieldOfView } from './table-camera';
type Piece = {
  group: THREE.Group;
  face: THREE.Mesh;
  target: THREE.Vector3;
  rotation: number;
  born: number;
  from: THREE.Vector3;
  lift: number;
  deal?: { index: number; duration: number };
  removeAt?: number;
};
export class MahjongTable {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private felt = new THREE.MeshStandardMaterial({ roughness: 1 });
  private wood = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.08 });
  private trim = new THREE.MeshStandardMaterial({ roughness: 0.52, metalness: 0.42 });
  private ambient = new THREE.HemisphereLight();
  private camera: THREE.PerspectiveCamera;
  private pieces = new Map<string, Piece>();
  private textures = new Map<number, THREE.MeshStandardMaterial>();
  private tileGeometry = new RoundedBoxGeometry(
    TILE_SIZE.width,
    TILE_SIZE.height,
    TILE_SIZE.depth,
    2,
    0.025,
  );
  private faceGeometry = new THREE.PlaneGeometry(0.26, 0.38);
  private ivory = new THREE.MeshStandardMaterial({ color: 0xeee8d6, roughness: 0.36 });
  private back = new THREE.MeshStandardMaterial({ color: 0x397e67, roughness: 0.35 });
  private side = new THREE.MeshStandardMaterial({ color: 0xf3eedf, roughness: 0.5 });
  private frame: number = 0;
  private observer: ResizeObserver;
  private motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  private get reduced() {
    return this.motionPreference.matches;
  }
  private controls: OrbitControls;
  private openingUntil = 0;
  private handPieces = new Set<string>();
  private preview: boolean;
  private disposed = false;
  private impactAt = -10000;
  private impactStrength = 0;
  private raycaster = new THREE.Raycaster();
  constructor(
    private container: HTMLElement,
    preview = true,
    theme: TableTheme = 'jade-night',
  ) {
    this.preview = preview;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x123d33, 0);
    this.renderer.domElement.setAttribute(
      'aria-label',
      preview ? 'Three-dimensional mahjong table preview' : 'Three-dimensional mahjong table',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    container.addEventListener('pointermove', this.inspectTile);
    container.addEventListener('pointerup', this.inspectTile);
    container.addEventListener('pointerleave', hideTileTooltip);
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
    this.camera.position.set(preview ? 8.5 : 0, 15, preview ? 12 : 12);
    this.camera.lookAt(0, 0, preview ? 0 : 0.7);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, preview ? 0 : 0.7);
    this.controls.enabled = false;
    this.controls.enablePan = true;
    this.controls.enableZoom = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 26;
    this.controls.zoomSpeed = 0.65;
    this.controls.minPolarAngle = Math.PI / 7;
    this.controls.maxPolarAngle = Math.PI / 2.7;
    this.controls.addEventListener('change', () => {
      this.controls.target.clamp(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0, 1));
      this.wake();
    });
    this.scene.add(this.ambient);
    const key = new THREE.DirectionalLight(0xffedcd, 2.4);
    key.position.set(-5, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9ede0, 1);
    fill.position.set(8, 6, -4);
    this.scene.add(fill);
    this.buildTable();
    this.setTheme(theme);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.demo();
    this.motionPreference.addEventListener('change', this.wake);
    this.wake();
  }
  setViewControls(rotate: boolean, zoom: boolean) {
    if (this.preview) return;
    const enabled = rotate || zoom;
    this.controls.enabled = enabled;
    this.controls.enableRotate = rotate;
    this.controls.enablePan = rotate;
    this.controls.enableZoom = zoom;
    this.renderer.domElement.style.touchAction = enabled ? 'none' : 'auto';
    if (!enabled) this.resetView();
    this.wake();
  }
  zoomBy(factor: number) {
    if (!this.controls.enabled || !this.controls.enableZoom) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(
        offset.length() * factor,
        this.controls.minDistance,
        this.controls.maxDistance,
      ),
    );
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.wake();
  }
  resetView() {
    this.camera.position.set(0, 15, 12);
    this.controls.target.set(0, 0, 0.7);
    this.controls.update();
    this.wake();
  }
  setTheme(theme: TableTheme) {
    const palette = TABLE_THEMES[theme];
    this.felt.color.setHex(palette.felt);
    this.wood.color.setHex(palette.frame);
    this.trim.color.setHex(palette.trim);
    this.ambient.color.setHex(palette.sky);
    this.ambient.groundColor.setHex(palette.ground);
    this.ambient.intensity = palette.light;
    this.container.dataset.theme = theme;
    this.wake();
  }
  private buildTable() {
    const base = new THREE.Mesh(new RoundedBoxGeometry(12.25, 0.7, 12.25, 4, 0.45), this.wood);
    base.position.y = -0.47;
    base.receiveShadow = true;
    base.castShadow = true;
    this.scene.add(base);
    const trim = new THREE.Mesh(new RoundedBoxGeometry(11.91, 0.12, 11.91, 4, 0.3), this.trim);
    trim.position.y = -0.125;
    this.scene.add(trim);
    const felt = new THREE.Mesh(new RoundedBoxGeometry(11.78, 0.15, 11.78, 4, 0.28), this.felt);
    felt.position.y = -0.11;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 512;
    textureCanvas.height = 512;
    const c = textureCanvas.getContext('2d')!;
    c.strokeStyle = 'rgba(211,190,132,.27)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(256, 256, 209, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(256, 256, 196, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#c9b783';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '56px Georgia';
    c.fillText('四 風', 256, 239);
    c.font = '14px sans-serif';
    c.fillText('F O U R   W I N D S', 256, 294);
    c.font = '19px serif';
    [
      ['東', 256, 26],
      ['南', 486, 256],
      ['西', 256, 486],
      ['北', 26, 256],
    ].forEach(([t, x, y]) => c.fillText(String(t), Number(x), Number(y)));
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 2.5),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    logo.rotation.x = -Math.PI / 2;
    logo.position.y = 0.004;
    this.scene.add(logo);
    // Delicate corner inlays, rather than a flat featureless playing surface.
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xbfa975,
      metalness: 0.3,
      roughness: 0.5,
    });
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.025), lineMat);
        line.position.set(x * 5.15, 0.001, z * 5.39);
        this.scene.add(line);
        const other = line.clone();
        other.rotation.y = Math.PI / 2;
        other.position.set(x * 5.39, 0.001, z * 5.15);
        this.scene.add(other);
      }
  }
  private material(tile: number) {
    const k = tile < 136 ? kind(tile) * 4 : tile;
    if (!this.textures.has(k)) {
      const texture = new THREE.CanvasTexture(drawTileFace(k));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.textures.set(k, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }));
    }
    return this.textures.get(k)!;
  }
  private put(id: string, tile: number | null, x: number, z: number, rotation = 0, y = 0.095) {
    let p = this.pieces.get(id);
    if (!p) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.tileGeometry, [
        this.side,
        this.side,
        this.ivory,
        this.back,
        this.side,
        this.side,
      ]);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const face = new THREE.Mesh(
        this.faceGeometry,
        tile === null ? this.back : this.material(tile),
      );
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.083;
      group.add(face);
      group.position.set(x, y + 1.2, z);
      this.scene.add(group);
      p = {
        group,
        face,
        target: new THREE.Vector3(x, y, z),
        rotation,
        born: performance.now(),
        from: group.position.clone(),
        lift: 0.25,
      };
      this.pieces.set(id, p);
    }
    p.group.scale.setScalar(1);
    p.face.material = tile === null ? this.back : this.material(tile);
    p.face.userData.tile = tile;
    if (p.target.distanceToSquared(new THREE.Vector3(x, y, z)) > 0.001) {
      p.deal = undefined;
      p.from.copy(p.group.position);
      p.born = performance.now();
      p.lift = Math.min(0.9, p.from.distanceTo(new THREE.Vector3(x, y, z)) * 0.17);
      p.target.set(x, y, z);
    }
    p.rotation = rotation;
  }
  private layout(
    players: {
      hand: number[];
      tileCount: number;
      discards: { tile: number; claimed: boolean }[];
      melds: { tiles: number[]; concealed: boolean }[];
      bonuses: number[];
    }[],
    me: number,
    wallCount: number,
    setup?: WallSetup,
  ) {
    const used = new Set<string>();
    const put = (id: string, tile: number | null, x: number, z: number, r = 0, y = 0.095) => {
      used.add(id);
      this.put(id, tile, x, z, r, y);
    };
    const transform = seatPoint;
    this.handPieces.clear();
    players.forEach((p, seat) => {
      const relative = (seat - me + 4) % 4;
      // Show all four hands on the table; only the viewer's own faces are built.
      // The HTML rack remains the input surface for selecting and discarding.
      const length = p.tileCount;
      for (let i = 0; i < length; i++) {
        const t = relative === 0 ? (p.hand[i] ?? null) : null,
          pt = transform((i - (length - 1) / 2) * 0.32, 5.46, relative);
        const id = t !== null ? `t${t}` : `hidden${seat}:${i}`;
        this.handPieces.add(id);
        put(id, t, pt.x, pt.z, pt.r);
      }
      let di = 0;
      for (const d of p.discards) {
        if (d.claimed) continue;
        const rows = Math.max(1, Math.ceil(p.discards.filter((d) => !d.claimed).length / 6));
        const scale = Math.min(1, 2.65 / (rows * 0.46));
        const pt = transform(
          -2.8 + (di % 6) * 0.34,
          0.38 + Math.floor(di / 6) * 0.46 * scale,
          relative,
        );
        put(`t${d.tile}`, d.tile, pt.x, pt.z, pt.r);
        this.pieces.get(`t${d.tile}`)!.group.scale.setScalar(scale);
        di++;
      }
      let mi = 0;
      const meldWidth = p.melds.reduce((n, m) => n + m.tiles.length * 0.32 + 0.12, 0) - 0.12;
      for (const m of p.melds) {
        for (let i = 0; i < m.tiles.length; i++) {
          const t = m.tiles[i],
            pt = transform(-meldWidth / 2 + 0.16 + (mi + i) * 0.32, 4.15, relative);
          put(
            `t${t}`,
            m.concealed && (i === 0 || i === m.tiles.length - 1) ? null : t,
            pt.x,
            pt.z,
            pt.r,
          );
        }
        mi += m.tiles.length + 0.375;
      }
      for (let i = 0; i < p.bonuses.length; i++) {
        const t = p.bonuses[i],
          pt = transform((i - (p.bonuses.length - 1) / 2) * 0.32, 4.8, relative);
        put(`t${t}`, t, pt.x, pt.z, pt.r);
      }
    });
    // Only neutral slot numbers reach the renderer, never wall tile identities.
    const wall = setup ?? {
      total: 144,
      dice: [],
      breakSeat: 0,
      breakStack: 0,
      breakIndex: 0,
      front: 144 - wallCount,
      back: 0,
      dead: 0,
      deal: [],
    };
    for (const pt of wallLayout(wall, me)) put(`wall${pt.slot}`, null, pt.x, pt.z, pt.r, pt.y);
    for (const [id, p] of this.pieces)
      if (!used.has(id) && !p.removeAt) {
        this.scene.remove(p.group);
        this.pieces.delete(id);
      }
  }
  demo() {
    let id = 0;
    const make = (ks: number[]) => ks.map((k) => k * 4 + (id++ % 4));
    const players = Array.from({ length: 4 }, (_, seat) => ({
      hand: seat === 0 ? make([0, 1, 2, 10, 11, 12, 21, 21, 21, 24, 25, 26, 33]) : [],
      tileCount: 13,
      discards: make(
        [
          [28, 3, 16, 31, 6],
          [30, 5, 14, 19],
          [27, 8, 23, 17],
          [9, 20, 29],
        ][seat],
      ).map((tile) => ({ tile, claimed: false })),
      melds: [],
      bonuses: seat === 1 ? [136, 144] : seat === 3 ? [141] : [],
    }));
    this.layout(players, 0, 76);
  }
  update(game: GameView) {
    const remaining = game.wallCount + (game.rules.preset === 'riichi' ? 14 : game.reserve);
    const total =
      136 +
      (game.rules.preset === 'mcr' || (game.rules.preset === 'singapore' && game.rules.sgFlowers)
        ? 8
        : 0) +
      (game.rules.preset === 'singapore' && game.rules.sgAnimals ? 4 : 0);
    const setup = game.setup ?? {
      total,
      dice: [],
      breakSeat: 0,
      breakStack: 0,
      breakIndex: 0,
      front: total - remaining,
      back: 0,
      dead: 0,
      deal: [],
    };
    this.layout(game.players, game.seat, remaining, setup);
    this.wake();
  }
  deal(game: GameView) {
    if (this.reduced || !game.setup) return;
    const now = performance.now(),
      setup = game.setup,
      sequence = dealSequence(game);
    this.openingUntil = now + sequence.duration;
    // Rebuild consumed initial slots; each packet leaves the actual broken wall in order.
    setup.deal.forEach((step, index) => {
      const pt = wallPosition(step.slot, setup.total, game.seat);
      const id = `deal${step.slot}`;
      this.put(id, null, pt.x, pt.z, pt.r, pt.y);
      const p = this.pieces.get(id)!;
      p.group.position.set(pt.x, pt.y, pt.z);
      p.group.rotation.y = pt.r;
      p.from.copy(p.group.position);
      const target = seatPoint(((index % 14) - 6.5) * 0.32, 5.46, (step.seat - game.seat + 4) % 4);
      p.target.set(target.x, 0.095, target.z);
      p.rotation = target.r;
      p.born = now + sequence.tilesAt + Math.floor(index / 4) * DEAL.packet;
      p.deal = { index: -1, duration: DEAL.flight };
      p.lift = 1;
      p.removeAt = p.born + DEAL.flight;
    });
    this.container.dataset.deal = 'active';
    this.wake();
  }
  impact(win: boolean) {
    if (this.reduced) return;
    this.impactAt = performance.now();
    this.impactStrength = win ? 0.32 : 0.16;
    this.wake();
  }
  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = this.preview ? (w / h < 1.2 ? 54 : 43) : tableFieldOfView(w / h);
    this.camera.updateProjectionMatrix();
    this.wake();
  }
  private wake = () => {
    if (!this.disposed && !this.frame) this.frame = requestAnimationFrame(this.animate);
  };
  private animate = () => {
    this.frame = 0;
    if (this.disposed) return;
    const now = performance.now();
    let moving = false;
    for (const [id, p] of this.pieces) {
      if (p.removeAt && (now >= p.removeAt || this.reduced)) {
        this.scene.remove(p.group);
        this.pieces.delete(id);
        continue;
      }
      p.group.visible = !this.handPieces.has(id) || now >= this.openingUntil || this.reduced;
      if (this.reduced) {
        p.group.position.copy(p.target);
        p.group.rotation.y = p.rotation;
        p.deal = undefined;
      } else {
        if (p.deal && now < p.born) {
          if (p.deal.index === -1) {
            moving = true;
            continue;
          }
          const n = p.deal.index,
            angle = n * 2.399 + now * 0.003;
          const radius = 0.5 + (n % 11) * 0.16;
          p.group.position.set(
            Math.cos(angle) * radius,
            0.2 + (n % 5) * 0.24,
            Math.sin(angle) * radius,
          );
          p.group.rotation.y = angle;
          p.from.copy(p.group.position);
          moving = true;
          continue;
        }
        const t = Math.max(0, Math.min(1, (now - p.born) / (p.deal?.duration ?? 430)));
        p.group.position.lerpVectors(p.from, p.target, 1 - Math.pow(1 - t, 3));
        p.group.position.y += Math.sin(t * Math.PI) * p.lift;
        p.group.rotation.y += (p.rotation - p.group.rotation.y) * 0.15;
        if (t < 1 || Math.abs(p.rotation - p.group.rotation.y) > 0.001) moving = true;
        if (t === 1) p.deal = undefined;
      }
    }
    if (![...this.pieces.values()].some((p) => p.deal)) delete this.container.dataset.deal;
    if (now < this.openingUntil && !this.reduced) moving = true;
    this.renderer.render(this.scene, this.camera);
    if (moving) this.wake();
  };
  private inspectTile = (event: PointerEvent) => {
    if (event.buttons) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    // Include backs as occluders. Never inspect a concealed face through another tile.
    const hit = this.raycaster.intersectObjects(
      [...this.pieces.values()].filter((p) => p.group.visible).map((p) => p.group),
      true,
    )[0];
    const tile = hit?.object.userData.tile;
    if (typeof tile === 'number') showTileTooltip(tileName(tile), event.clientX, event.clientY);
    else hideTileTooltip();
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.motionPreference.removeEventListener('change', this.wake);
    this.observer.disconnect();
    this.controls.dispose();
    this.container.removeEventListener('pointermove', this.inspectTile);
    this.container.removeEventListener('pointerup', this.inspectTile);
    this.container.removeEventListener('pointerleave', hideTileTooltip);
    hideTileTooltip();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
