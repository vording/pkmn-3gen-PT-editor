// 能力値計算（第三世代の実数値計算式・性格補正・ランク補正）

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const STAT_NAMES = {
  hp: 'HP', atk: '攻撃', def: '防御', spa: '特攻', spd: '特防', spe: '素早さ',
  acc: '命中率', eva: '回避率',
};

const NATURE_STATS = ['atk', 'def', 'spe', 'spa', 'spd'];

// 性格: 上昇能力×下降能力の25通り（同じ組み合わせは無補正）
export const NATURES = {};
for (const plus of NATURE_STATS) {
  for (const minus of NATURE_STATS) {
    const id = plus === minus ? `neutral-${plus}` : `${plus}-${minus}`;
    NATURES[id] = plus === minus
      ? { name: `無補正（${STAT_NAMES[plus]}型）`, plus: null, minus: null }
      : { name: `${STAT_NAMES[plus]}↑ ${STAT_NAMES[minus]}↓`, plus, minus };
  }
}
NATURES.neutral = { name: '無補正', plus: null, minus: null };

export const MAX_IV = 31;
export const MAX_EV = 255;
export const MAX_TOTAL_EV = 510;

export function calcStats(base, level = 50, ivs = {}, evs = {}, natureId = 'neutral') {
  const nature = NATURES[natureId] ?? NATURES.neutral;
  const totalEv = STAT_KEYS.reduce((sum, k) => sum + (evs[k] ?? 0), 0);
  if (totalEv > MAX_TOTAL_EV) throw new Error(`努力値の合計が${MAX_TOTAL_EV}を超えています: ${totalEv}`);

  const stats = {};
  for (const key of STAT_KEYS) {
    const iv = clamp(ivs[key] ?? MAX_IV, 0, MAX_IV);
    const ev = clamp(evs[key] ?? 0, 0, MAX_EV);
    const core = Math.floor(((2 * base[key] + iv + Math.floor(ev / 4)) * level) / 100);
    if (key === 'hp') {
      stats.hp = core + level + 10;
    } else {
      const mod = nature.plus === key ? 1.1 : nature.minus === key ? 0.9 : 1;
      stats[key] = Math.floor((core + 5) * mod);
    }
  }
  return stats;
}

// 攻撃・防御・特攻・特防・素早さのランク補正
export function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// 第三世代の命中・回避ランク補正表
const ACC_TABLE = [33 / 100, 36 / 100, 43 / 100, 50 / 100, 60 / 100, 75 / 100, 1,
  133 / 100, 166 / 100, 2, 233 / 100, 266 / 100, 3];

export function accuracyMultiplier(stage) {
  return ACC_TABLE[clamp(stage, -6, 6) + 6];
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
