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

// 1回の攻撃で与えるダメージ（最大HPに対する割合、期待値）
export function damageFraction(att, def, move) {
  const [, , B, , D] = def.stats;
  const hp = def.stats[0];
  if (move.power === 0) {
    if (move.name === 'ちきゅうなげ') return def.types.includes('ghost') ? 0 : 50 / hp;
    if (move.name === 'ナイトヘッド') return def.types.includes('normal') ? 0 : 50 / hp;
    if (move.name === 'じわれ') return def.types.includes('flying') || def.ability === 'ふゆう' ? 0 : 0.3;
    if (move.name === 'ぜったいれいど') return 0.3;
    if (move.name === 'つのドリル' || move.name === 'ハサミギロチン') return def.types.includes('ghost') ? 0 : 0.3;
    return 0;
  }
  const physical = move.physical;
  let A = physical ? att.stats[1] : att.stats[3];
  let Dv = physical ? B : D;
  if (move.name === 'じばく' || move.name === 'だいばくはつ') Dv /= 2;
  if (physical && att.item === 'こだわりハチマキ') A *= 1.5;
  if (physical && att.item === 'ふといホネ' && (att.name === 'ガラガラ' || att.name === 'カラカラ')) A *= 2;
  if (!physical && att.item === 'でんきだま' && att.name === 'ピカチュウ') A *= 2;
  if (move.type === 'psychic' && att.item === 'まがったスプーン') A *= 1.1;
  if (move.type === 'dragon' && att.item === 'りゅうのキバ') A *= 1.1;
  if (move.type === 'electric' && att.item === 'じしゃく') A *= 1.1;
  if (move.type === 'fire' && att.item === 'もくたん') A *= 1.1;
  if (!physical && att.item === 'しんかいのキバ' && att.name === 'パールル') A *= 2;
  // 積み技・『きんぞくおん』は1回分の補正を見込む
  if (physical && (att.tags.setupPhys || att.tags.curse)) A *= 1.4;
  if (!physical && (att.tags.setupSpec || att.tags.metalSound)) A *= 1.4;
  let power = move.power;
  if (move.name === 'きしかいせい' || move.name === 'じたばた') power = att.tags.sub ? 150 : 80;
  const eff = typeEffectiveness(move.type, def.types);
  const abil = abilityMultiplier(def.ability, move.type, eff);
  if (eff * abil === 0) return 0;
  const base = Math.floor(Math.floor((Math.floor((2 * 50) / 5 + 2) * power * A) / Dv) / 50) + 2;
  const stab = att.types.includes(move.type) ? 1.5 : 1;
  return (base * stab * eff * abil * 0.925) / hp;
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
  margin += (statusEdge(a, b) - statusEdge(b, a)) * 2;
  // 『だいばくはつ』『じばく』で倒せる／『みちづれ』を持つなら、不利でも1:1交換に持ち込める
  const tradeA = bestAttack(a, b, { explosion: true }).frac >= 1 || (a.tags.explode && a.set.moves.includes('みちづれ') && !b.types.includes('ghost'));
  const tradeB = bestAttack(b, a, { explosion: true }).frac >= 1 || (b.tags.explode && b.set.moves.includes('みちづれ') && !a.types.includes('ghost'));
  if (tradeA && margin < -0.3) margin = -0.3;
  if (tradeB && margin > 0.3) margin = 0.3;
  return Math.tanh(margin / 1.5);
}
