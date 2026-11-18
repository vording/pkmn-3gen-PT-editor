// 提案パーティを1枚の画像（PNG）に描く
import { TYPE_NAMES, TYPE_COLORS } from '../data/types.js';
import { STAT_KEYS, resolveMove, natureEffect } from '../engine/model.js';

const W = 1200;
const PAD = 32;
const COLS = 3;
const CARD_W = (W - PAD * 2 - 16 * (COLS - 1)) / COLS;
const CARD_H = 296;
const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chip(ctx, text, x, y, bg, fg = '#fff') {
  ctx.font = `bold 13px ${FONT}`;
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, 20, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, x + 6, y + 15);
  return w + 4;
}

// 文字列を幅に収める（はみ出す場合は末尾を…にする）
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

// spriteUrl(name) → 画像URL。読み込めない画像は描かない
export async function drawTeamImage(result, { title, subtitle, spriteUrl, selections }) {
  const rows = Math.ceil(result.members.length / COLS);
  const headerH = 96;
  const footerH = 64;
  const H = headerH + rows * CARD_H + (rows - 1) * 16 + footerH;
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const sprites = await Promise.all(result.members.map((d) => loadImage(spriteUrl(d.member.name))));

  ctx.fillStyle = '#f4f5f7';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d2330';
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillText(title, PAD, 48);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = '#687082';
  ctx.fillText(subtitle, PAD, 76);

  result.members.forEach((d, i) => {
    const m = d.member;
    const x = PAD + (i % COLS) * (CARD_W + 16);
    const y = headerH + Math.floor(i / COLS) * (CARD_H + 16);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.strokeStyle = '#dde1e8';
    ctx.lineWidth = 1;
    ctx.stroke();

    const img = sprites[i];
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x + 8, y + 4, 80, 80);
      ctx.imageSmoothingEnabled = true;
    }
    const tx = x + (img ? 92 : 16);
    ctx.fillStyle = '#1d2330';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(m.name, tx, y + 36);
    let cx = tx;
    for (const t of m.types) cx += chip(ctx, TYPE_NAMES[t], cx, y + 48, TYPE_COLORS[t]);

    const iw = CARD_W - 32;
    let ly = y + 106;
    const line = (label, value) => {
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = '#687082';
      ctx.fillText(label, x + 16, ly);
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = '#1d2330';
      ctx.fillText(fit(ctx, value, iw - 56), x + 64, ly);
      ly += 24;
    };
    line('持ち物', m.item || '自由');
    line('特性', m.ability);
    line('性格', m.nature);
    const ev = m.evs.map((v, k) => (v ? `${STAT_KEYS[k]}${v}` : '')).filter(Boolean).join(' ');
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#687082';
    ctx.fillText(fit(ctx, `努力値 ${ev}${m.evsEstimated ? '（目安）' : ''}`, iw), x + 16, ly);
    ly += 20;
    // 実数値：性格で上がる能力は赤、下がる能力は青
    {
      const eff = natureEffect(m.nature);
      let sx = x + 16;
      const put = (text, color, bold = false) => {
        ctx.font = `${bold ? 'bold ' : ''}13px ${FONT}`;
        ctx.fillStyle = color;
        ctx.fillText(text, sx, ly);
        sx += ctx.measureText(text).width;
      };
      put('実数値 ', '#687082');
      m.stats.forEach((v, k) => {
        if (k) put('-', '#687082');
        if (k === eff.up) put(String(v), '#d1342b', true);
        else if (k === eff.down) put(String(v), '#2f6fd6', true);
        else put(String(v), '#687082');
      });
    }
    ly += 14;

    const mw = (iw - 8) / 2;
    m.set.moves.forEach((mv, k) => {
      const mx = x + 16 + (k % 2) * (mw + 8);
      const my = ly + Math.floor(k / 2) * 36;
      const t = resolveMove(mv).type;
      ctx.fillStyle = '#f1f3f6';
      roundRect(ctx, mx, my, mw, 30, 6);
      ctx.fill();
      ctx.fillStyle = TYPE_COLORS[t];
      ctx.fillRect(mx, my, 5, 30);
      ctx.fillStyle = '#1d2330';
      ctx.font = `15px ${FONT}`;
      ctx.fillText(fit(ctx, mv, mw - 18), mx + 12, my + 20);
    });
  });

  const fy = H - footerH + 30;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = '#1d2330';
  if (selections?.length) ctx.fillText(fit(ctx, `おすすめ選出：${selections.map((s) => s.join('＋')).join(' ／ ')}`, W - PAD * 2), PAD, fy);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = '#9aa2b3';
  ctx.fillText('ポケットモンスターエメラルド　PT提案ツール', PAD, fy + 22);

  return canvas;
}

export async function saveCanvas(canvas, filename) {
  const blob = await new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'); } catch (e) { reject(e); }
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
