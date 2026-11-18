// 対戦相手のAI（期待ダメージと相性をもとに行動を選ぶ）
import { MOVES, STRUGGLE } from '../data/moves.js';
import { calcDamage, typeEffectiveness } from './damage.js';

function moveOf(mon, index) {
  return index < 0 ? STRUGGLE : MOVES[mon.moves[index].id];
}

export function estimateDamage(battle, attacker, defender, move) {
  if (!move.power) return 0;
  if (typeEffectiveness(move.type, defender.types) === 0) return 0;
  if (move.type === 'ground' && defender.ability === 'hover') return 0;
  const ctx = { attacker, defender, move, weather: battle.weather?.type ?? null };
  const avg = (calcDamage({ ...ctx, roll: 85 }) + calcDamage({ ...ctx, roll: 100 })) / 2;
  const acc = move.accuracy == null ? 1 : move.accuracy / 100;
  return avg * acc;
}

/** attacker が defender に与えうる最大の期待ダメージ（defender の現HPに対する割合） */
function threat(battle, attacker, defender) {
  if (defender.hp <= 0) return 0;
  const best = Math.max(0, ...attacker.moves.filter((m) => m.pp > 0)
    .map((m) => estimateDamage(battle, attacker, defender, MOVES[m.id])));
  return best / defender.hp;
}

function scoreMove(battle, me, foe, move) {
  if (move.power) {
    const dmg = estimateDamage(battle, me, foe, move);
    if (dmg >= foe.hp) return foe.hp * 2 + (move.priority ?? 0) * 50;
    return dmg;
  }
  if (move.target === 'self') {
    if (move.heal) return me.hp / me.maxHp < 0.5 ? me.maxHp * 0.5 : 0;
    if (move.weather) return battle.weather?.type === move.weather ? 0 : foe.maxHp * 0.15;
    if (move.boosts) {
      const current = Object.keys(move.boosts).reduce((s, k) => s + me.stages[k], 0);
      return me.hp / me.maxHp > 0.6 && current < 2 ? foe.maxHp * 0.3 : 0;
    }
    return 0;
  }
  if (typeEffectiveness(move.type, foe.types) === 0) return 0;
  if (move.status) {
    if (foe.status) return 0;
    const { cond } = move.status;
    const has = (t) => foe.types.includes(t);
    if ((cond === 'psn' || cond === 'tox') && (has('poison') || has('steel'))) return 0;
    return foe.maxHp * (cond === 'slp' ? 0.45 : 0.3) * ((move.accuracy ?? 100) / 100);
  }
  if (move.foeBoosts) return foe.maxHp * 0.08;
  return 0;
}

export function chooseReplacement(battle, side) {
  const foe = battle.active(1 - side);
  const options = battle.legalActions(side).filter((a) => a.type === 'switch');
  let best = options[0];
  let bestScore = -Infinity;
  for (const option of options) {
    const mon = battle.sides[side].team[option.index];
    const score = threat(battle, mon, foe) - threat(battle, foe, mon);
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

export function chooseAction(battle, side, random = Math.random) {
  if (battle.phase === 'switch') return chooseReplacement(battle, side);
  const legal = battle.legalActions(side);
  const me = battle.active(side);
  const foe = battle.active(1 - side);

  let best = null;
  let bestScore = -Infinity;
  for (const action of legal.filter((a) => a.type === 'move')) {
    const score = scoreMove(battle, me, foe, moveOf(me, action.index)) * (0.85 + random() * 0.3);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }

  // 相手の攻撃で倒されそうで、こちらの打点も乏しいなら交代を検討
  const danger = threat(battle, foe, me);
  if (danger >= 1 && bestScore < foe.hp * 0.5 && random() < 0.6) {
    const switches = legal.filter((a) => a.type === 'switch');
    const safe = switches
      .map((a) => ({ a, t: threat(battle, foe, battle.sides[side].team[a.index]) }))
      .filter((x) => x.t < 0.5)
      .sort((x, y) => x.t - y.t);
    if (safe.length) return safe[0].a;
  }
  return best ?? legal[0];
}
