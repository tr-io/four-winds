import { BONUS_NAMES, kind, rank, suit, tileName } from '../shared/tiles';
const cache = new Map<number, string>();
export function drawTileFace(tile: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 192;
  const c = canvas.getContext('2d')!;
  const bg = c.createLinearGradient(0, 0, 144, 192);
  bg.addColorStop(0, '#fffef5');
  bg.addColorStop(1, '#eee8d9');
  c.fillStyle = bg;
  c.fillRect(0, 0, 144, 192);
  const k = kind(tile),
    r = rank(k),
    s = suit(k);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const red = '#a94739',
    green = '#23634b',
    ink = '#253f49';
  if (tile >= 136) {
    const i = tile - 136;
    c.fillStyle = i < 8 ? green : ink;
    if (i < 8) {
      const colors = [
        '#b95367',
        '#9675a3',
        '#c39942',
        '#4f8864',
        '#b95367',
        '#d2a24b',
        '#b75a38',
        '#648595',
      ];
      c.fillStyle = colors[i];
      for (let n = 0; n < 5; n++) {
        const a = (n * Math.PI * 2) / 5;
        c.beginPath();
        c.ellipse(72 + 25 * Math.cos(a), 80 + 25 * Math.sin(a), 17, 27, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#d3ab62';
      c.beginPath();
      c.arc(72, 80, 12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = green;
      c.font = 'bold 28px sans-serif';
      c.fillText(`${(i % 4) + 1}`, 22, 24);
    } else {
      c.font = '65px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      c.fillText(['🐈', '🐀', '🐓', '🐛'][i - 8], 72, 82);
    }
    c.fillStyle = ink;
    c.font = 'bold 13px sans-serif';
    c.fillText(BONUS_NAMES[i].replace(' flower', '').toUpperCase(), 72, 155, 130);
  } else if (k >= 27) {
    const symbols = ['東', '南', '西', '北', '□', '發', '中'];
    c.fillStyle = k === 33 ? red : k === 32 ? green : ink;
    if (k === 31) {
      c.strokeStyle = '#487389';
      c.lineWidth = 7;
      c.strokeRect(34, 40, 76, 96);
      c.lineWidth = 2;
      c.strokeRect(42, 48, 60, 80);
    } else {
      c.font = '76px "Songti SC","Noto Serif CJK SC",serif';
      c.fillText(symbols[k - 27], 72, 84);
    }
    c.fillStyle = k === 33 ? red : ink;
    c.font = 'bold 13px sans-serif';
    c.fillText(['EAST', 'SOUTH', 'WEST', 'NORTH', 'WHITE', 'GREEN', 'RED'][k - 27], 72, 163);
  } else if (s === 0) {
    c.fillStyle = ink;
    c.font = '64px "Songti SC","Noto Serif CJK SC",serif';
    c.fillText(['一', '二', '三', '四', '五', '六', '七', '八', '九'][r - 1], 72, 59);
    c.fillStyle = red;
    c.font = '70px "Songti SC","Noto Serif CJK SC",serif';
    c.fillText('萬', 72, 128);
  } else if (s === 1) {
    const positions: Record<number, number[][]> = {
      1: [[72, 90]],
      2: [
        [72, 50],
        [72, 130],
      ],
      3: [
        [43, 42],
        [72, 90],
        [101, 138],
      ],
      4: [
        [42, 48],
        [102, 48],
        [42, 132],
        [102, 132],
      ],
      5: [
        [38, 43],
        [106, 43],
        [72, 90],
        [38, 137],
        [106, 137],
      ],
      6: [
        [43, 40],
        [101, 40],
        [43, 90],
        [101, 90],
        [43, 140],
        [101, 140],
      ],
      7: [
        [36, 34],
        [72, 55],
        [108, 76],
        [44, 112],
        [100, 112],
        [44, 151],
        [100, 151],
      ],
      8: [
        [43, 30],
        [101, 30],
        [43, 70],
        [101, 70],
        [43, 110],
        [101, 110],
        [43, 150],
        [101, 150],
      ],
      9: [
        [32, 35],
        [72, 35],
        [112, 35],
        [32, 90],
        [72, 90],
        [112, 90],
        [32, 145],
        [72, 145],
        [112, 145],
      ],
    };
    positions[r].forEach(([x, y], i) => {
      const radius = r === 1 ? 34 : r >= 7 ? 12 : 16;
      c.strokeStyle = [ink, green, red][(r === 1 ? 0 : i) % 3];
      c.lineWidth = r === 1 ? 7 : 4;
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, radius * 0.53, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(x, y, 2.4, 0, Math.PI * 2);
      c.fill();
    });
  } else {
    if (r === 1) {
      c.fillStyle = green;
      c.beginPath();
      c.ellipse(73, 85, 28, 44, -0.4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(94, 49, 18, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = red;
      c.beginPath();
      c.moveTo(109, 44);
      c.lineTo(129, 51);
      c.lineTo(107, 56);
      c.fill();
      c.fillStyle = '#fff7e3';
      c.beginPath();
      c.arc(99, 45, 4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = green;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(66, 117);
      c.lineTo(44, 154);
      c.moveTo(74, 119);
      c.lineTo(74, 157);
      c.stroke();
    } else {
      const cols = r <= 4 ? 2 : 3,
        rows = Math.ceil(r / cols);
      for (let i = 0; i < r; i++) {
        const x = cols === 2 ? 49 + (i % 2) * 48 : 34 + (i % 3) * 39;
        const y = rows === 1 ? 76 : 36 + Math.floor(i / cols) * (rows === 2 ? 88 : 56);
        c.strokeStyle = (r === 5 && i === 2) || (r === 7 && i === 0) ? red : green;
        c.lineWidth = 10;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 35);
        c.stroke();
        c.strokeStyle = '#fffbeb';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 5, y + 11);
        c.lineTo(x + 5, y + 11);
        c.moveTo(x - 5, y + 25);
        c.lineTo(x + 5, y + 25);
        c.stroke();
      }
    }
  }
  if (k < 27) {
    c.fillStyle = '#253f49';
    c.font = 'bold 24px sans-serif';
    c.textAlign = 'left';
    c.fillText(String(r), 8, 15);
  }
  return canvas;
}
export function tileImage(tile: number) {
  const k = tile < 136 ? Math.floor(tile / 4) * 4 : tile;
  if (!cache.has(k)) cache.set(k, drawTileFace(k).toDataURL());
  return cache.get(k)!;
}
export function tileHTML(tile: number, className = '', attrs = '') {
  return `<button class="tile ${className}" data-tile-name="${tileName(tile)}" aria-label="${tileName(tile)}" ${attrs}><img src="${tileImage(tile)}" alt="" draggable="false"/></button>`;
}
export function tileStatic(tile: number, className = '') {
  return `<span class="tile ${className}" data-tile-name="${tileName(tile)}" tabindex="0" role="img" aria-label="${tileName(tile)}"><img src="${tileImage(tile)}" alt="" draggable="false"/></span>`;
}
