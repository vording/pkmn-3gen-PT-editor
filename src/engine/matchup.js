// 2体の型同士の対面評価（第三世代のダメージ計算式をベースにした簡易モデル）
import { typeEffectiveness } from '../data/types.js';

// 特性によるタイプ無効・半減
export function abilityMultiplier(ability, moveType, eff) {
  switch (ability) {
    case 'ふゆう': return moveType === 'ground' ? 0 : 1;
    case 'もらいび': return moveType === 'fire' ? 0 : 1;
    case 'ちょすい': return moveType === 'water' ? 0 : 1;
    case 'ちくでん': return moveType === 'electric' ? 0 : 1;
    case 'あついしぼう': return moveType === 'fire' || moveType === 'ice' ? 0.5 : 1;
    case 'ふしぎなまもり': return eff >= 2 ? 1 : 0;
    default: return 1;
  }
}

// 防御側から見たタイプ倍率（特性込み）
export function defensiveMultiplier(member, moveType) {
  const eff = typeEffectiveness(moveType, member.types);
  return eff * abilityMultiplier(member.ability, moveType, eff);
}

const ITEM_BOOST = { まがったスプーン: 'psychic', りゅうのキバ: 'dragon', じしゃく: 'electric', もくたん: 'fire' };

// 乱数を除いたダメージの元（base）と倍率。威力0の技は null
// expectSetup: 積み技・『きんぞくおん』の1回分の補正を見込む（対面評価用）。調整の表示では使わない
function damageCore(att, def, move, expectSetup) {
  if (move.power === 0) return null;
  const physical = move.physical;
  let A = physical ? att.stats[1] : att.stats[3];
  let Dv = physical ? def.stats[2] : def.stats[4];
  if (move.name === 'じばく' || move.name === 'だいばくはつ') Dv /= 2;
  if (physical && att.item === 'こだわりハチマキ') A *= 1.5;
  if (physical && att.item === 'ふといホネ' && (att.name === 'ガラガラ' || att.name === 'カラカラ')) A *= 2;
  if (!physical && att.item === 'でんきだま' && att.name === 'ピカチュウ') A *= 2;
  if (!physical && att.item === 'しんかいのキバ' && att.name === 'パールル') A *= 2;
  if (ITEM_BOOST[att.item] === move.type) A *= 1.1;
  if (expectSetup) {
    if (physical && (att.tags.setupPhys || att.tags.curse)) A *= 1.4;
    if (!physical && (att.tags.setupSpec || att.tags.metalSound)) A *= 1.4;
  }
  let power = move.power;
  if (move.name === 'きしかいせい' || move.name === 'じたばた') power = att.tags.sub ? 150 : 80;
  const eff = typeEffectiveness(move.type, def.types);
  const abil = abilityMultiplier(def.ability, move.type, eff);
  if (eff * abil === 0) return { base: 0, mult: 0 };
  const base = Math.floor(Math.floor((Math.floor((2 * 50) / 5 + 2) * power * Math.floor(A)) / Math.floor(Dv)) / 50) + 2;
  const stab = att.types.includes(move.type) ? 1.5 : 1;
  return { base, mult: stab * eff * abil };
}

// 固定ダメージ・一撃必殺の扱い（null は通常の攻撃技）
function specialDamage(def, move) {
  const hp = def.stats[0];
  switch (move.name) {
    case 'ちきゅうなげ': return { fixed: def.types.includes('ghost') ? 0 : 50 };
    case 'ナイトヘッド': return { fixed: def.types.includes('normal') ? 0 : 50 };
    case 'じわれ': return { ohko: def.types.includes('flying') || def.ability === 'ふゆう' ? 0 : 0.3, hp };
    case 'ぜったいれいど': return { ohko: 0.3, hp };
    case 'つのドリル': case 'ハサミギロチン': return { ohko: def.types.includes('ghost') ? 0 : 0.3, hp };
    default: return null;
  }
}

// 1回の攻撃で与えるダメージ（最大HPに対する割合、期待値）
export function damageFraction(att, def, move) {
  const hp = def.stats[0];
  if (move.power === 0) {
    const sp = specialDamage(def, move);
    if (!sp) return 0;
    return sp.fixed != null ? sp.fixed / hp : sp.ohko;
  }
  const c = damageCore(att, def, move, true);
  return (c.base * c.mult * 0.925) / hp;
}

// 乱数16通り（85〜100%）のダメージ。変化技・一撃必殺は null
export function damageRolls(att, def, move) {
  if (move.power === 0) {
    const sp = specialDamage(def, move);
    return sp && sp.fixed != null ? Array(16).fill(sp.fixed) : null;
  }
  const c = damageCore(att, def, move, false);
  if (!c.mult) return Array(16).fill(0);
  return Array.from({ length: 16 }, (_, i) => Math.max(1, Math.floor((c.base * c.mult * (85 + i)) / 100)));
}

// n 発で倒れる確率（乱数のみ考慮、急所・回復なし）
export function koChance(rolls, hp, hits) {
  let dist = new Map([[0, 1]]);
  for (let h = 0; h < hits; h++) {
    const next = new Map();
    for (const [sum, p] of dist) for (const r of rolls) {
      const k = Math.min(hp, sum + r);
      next.set(k, (next.get(k) ?? 0) + p / rolls.length);
    }
    dist = next;
  }
  return dist.get(hp) ?? 0;
}

const EXPLOSION = new Set(['じばく', 'だいばくはつ']);

function bestAttack(att, def, { explosion = false } = {}) {
  let best = 0;
  let move = null;
  for (const m of att.moves) {
    if (EXPLOSION.has(m.name) !== explosion) continue;
    const f = damageFraction(att, def, m);
    if (f > best) { best = f; move = m; }
  }
  return { frac: best, move };
}

function turnsToKo(frac, defender) {
  let f = frac;
  if (defender.item === 'たべのこし') f -= 1 / 16;
  if (defender.tags.recover && frac < 0.5) f *= 0.6;
  if (f <= 0.005) return 20;
  return Math.min(20, Math.ceil(1 / f - 1e-9));
}

function statusEdge(a, b) {
  let edge = 0;
  const bPhysical = b.moves.some((m) => m.power > 0 && m.physical) && b.stats[1] >= b.stats[3];
  if (a.tags.sleep && !['ふみん', 'やるき'].includes(b.ability)) edge += 0.25;
  if (a.tags.para && !b.types.includes('ground') && b.ability !== 'じゅうなん') edge += 0.15;
  if (a.tags.burn && bPhysical && !b.types.includes('fire')) edge += 0.3;
  if (a.tags.toxic && !b.types.includes('poison') && !b.types.includes('steel')) edge += 0.1;
  // いばる＋みがわり：先手を取れる相手には混乱と身代わりで大きく試行回数を稼げる
  if (a.tags.confuse && a.tags.sub) edge += a.stats[5] > b.stats[5] ? 0.3 : 0.1;
  // 先手のいわなだれ・ずつき等によるひるみ
  if (a.stats[5] > b.stats[5] && a.set.moves.some((m) => m === 'いわなだれ' || m === 'ずつき')) edge += 0.08;
  return edge;
}

// a から見た対面の有利度（-1〜1）。正なら a 有利。
export function matchup(a, b) {
  const atkA = bestAttack(a, b);
  const atkB = bestAttack(b, a);
  let fracA = atkA.frac;
  let fracB = atkB.frac;
  // HP1（ふしぎなまもり）はやけど・どく・混乱の自傷で倒れる
  const fragile = (x, y) => y.stats[0] === 1 && (x.tags.burn || x.tags.toxic || x.tags.confuse);
  if (fragile(a, b)) fracA = Math.max(fracA, 0.5);
  if (fragile(b, a)) fracB = Math.max(fracB, 0.5);
  // カウンター／ミラーコート：受けたダメージの倍返し（耐えられる場合）
  if (atkB.move && fracB < 1) {
    const counterable = atkB.move.physical
      ? a.tags.counter && !b.types.includes('ghost')
      : a.tags.mirrorCoat && !b.types.includes('dark');
    if (counterable) fracA = Math.max(fracA, (2 * fracB * a.stats[0]) / b.stats[0]);
  }
  if (atkA.move && fracA < 1) {
    const counterable = atkA.move.physical
      ? b.tags.counter && !a.types.includes('ghost')
      : b.tags.mirrorCoat && !a.types.includes('dark');
    if (counterable) fracB = Math.max(fracB, (2 * fracA * b.stats[0]) / a.stats[0]);
  }
  let tA = turnsToKo(fracA, b);
  let tB = turnsToKo(fracB, a);
  // 『なまけ』は2ターンに1回しか行動できない
  if (a.ability === 'なまけ') tA = tA * 2 - 1;
  if (b.ability === 'なまけ') tB = tB * 2 - 1;
  const speedA = a.stats[5];
  const speedB = b.stats[5];
  const aFirst = speedA > speedB ? 0.5 : speedA < speedB ? -0.5 : 0;
  let margin = tB - tA + aFirst;
  // 『なまけ』持ちは動けないターンに状態異常・積み・身代わりを通されやすい
  const edgeA = statusEdge(a, b) * (b.ability === 'なまけ' ? 2 : 1);
  const edgeB = statusEdge(b, a) * (a.ability === 'なまけ' ? 2 : 1);
  margin += (edgeA - edgeB) * 2;
  // 相手を倒しても次のターンは動けないため、後続に無償で行動される（1対1の評価に出ない損）
  if (a.ability === 'なまけ') margin -= 1.2;
  if (b.ability === 'なまけ') margin += 1.2;
  // 『だいばくはつ』『じばく』で倒せる／『みちづれ』を持つなら、不利でも1:1交換に持ち込める
  const tradeA = bestAttack(a, b, { explosion: true }).frac >= 1 || (a.tags.explode && a.set.moves.includes('みちづれ') && !b.types.includes('ghost'));
  const tradeB = bestAttack(b, a, { explosion: true }).frac >= 1 || (b.tags.explode && b.set.moves.includes('みちづれ') && !a.types.includes('ghost'));
  if (tradeA && margin < -0.3) margin = -0.3;
  if (tradeB && margin > 0.3) margin = 0.3;
  return Math.tanh(margin / 1.5);
}
