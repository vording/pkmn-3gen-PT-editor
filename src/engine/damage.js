// ダメージ計算（第三世代の計算式）
import { isPhysicalType, typeEffectiveness } from '../data/types.js';
import { PINCH_ABILITIES } from '../data/abilities.js';
import { stageMultiplier } from './stats.js';

export { typeEffectiveness };

// 急所ランク -> 確率（第三世代: 1/16, 1/8, 1/4, 1/3, 1/2）
const CRIT_RATES = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2];
export function critChance(stage = 0) {
  return CRIT_RATES[Math.min(Math.max(stage, 0), CRIT_RATES.length - 1)];
}

/**
 * @param {object} ctx
 * @param {object} ctx.attacker  場のモンスター（stats, stages, level, types, ability, status, hp, maxHp）
 * @param {object} ctx.defender
 * @param {object} ctx.move
 * @param {string|null} [ctx.weather]  'rain' | 'sun' | 'sand' | 'hail'
 * @param {boolean} [ctx.crit]
 * @param {number} [ctx.roll]  乱数 85〜100
 */
export function calcDamage({ attacker, defender, move, weather = null, crit = false, roll = 100 }) {
  if (!move.power) return 0;
  const effectiveness = typeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return 0;

  const physical = isPhysicalType(move.type);
  const atkKey = physical ? 'atk' : 'spa';
  const defKey = physical ? 'def' : 'spd';

  let atkStage = attacker.stages[atkKey];
  let defStage = defender.stages[defKey];
  if (crit) {
    // 急所: 攻撃側の下降ランクと防御側の上昇ランクを無視
    atkStage = Math.max(0, atkStage);
    defStage = Math.min(0, defStage);
  }

  let attack = Math.floor(attacker.stats[atkKey] * stageMultiplier(atkStage));
  const defense = Math.max(1, Math.floor(defender.stats[defKey] * stageMultiplier(defStage)));

  if (physical && attacker.ability === 'grit' && attacker.status) attack = Math.floor(attack * 1.5);
  if (defender.ability === 'thickhide' && (move.type === 'fire' || move.type === 'ice')) {
    attack = Math.floor(attack / 2);
  }

  let power = move.power;
  const pinchType = PINCH_ABILITIES[attacker.ability];
  if (pinchType && pinchType === move.type && attacker.hp <= Math.floor(attacker.maxHp / 3)) {
    power = Math.floor(power * 1.5);
  }

  let damage = Math.floor(
    Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * attack) / defense) / 50,
  );

  if (physical && attacker.status === 'brn' && attacker.ability !== 'grit') {
    damage = Math.floor(damage / 2);
  }

  if (weather === 'rain') {
    if (move.type === 'water') damage = Math.floor(damage * 1.5);
    else if (move.type === 'fire') damage = Math.floor(damage / 2);
  } else if (weather === 'sun') {
    if (move.type === 'fire') damage = Math.floor(damage * 1.5);
    else if (move.type === 'water') damage = Math.floor(damage / 2);
  }

  damage += 2;
  if (crit) damage *= 2;
  if (move.type != null && attacker.types.includes(move.type)) damage = Math.floor(damage * 1.5);
  damage = Math.floor(damage * effectiveness);
  damage = Math.floor((damage * roll) / 100);
  return Math.max(1, damage);
}

export function damageRange(ctx) {
  return [calcDamage({ ...ctx, roll: 85 }), calcDamage({ ...ctx, roll: 100 })];
}
