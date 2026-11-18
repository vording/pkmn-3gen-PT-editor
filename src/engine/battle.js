// シングルバトルのエンジン（第三世代準拠のターン処理）
import { MOVES, STRUGGLE } from '../data/moves.js';
import { SPECIES } from '../data/species.js';
import { ABILITIES, WEATHER_ABILITIES } from '../data/abilities.js';
import { calcStats, stageMultiplier, accuracyMultiplier, STAT_NAMES, clamp } from './stats.js';
import { calcDamage, critChance, typeEffectiveness } from './damage.js';
import { createRng } from './rng.js';

export const STATUS_NAMES = {
  brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり',
};

const WEATHER_TEXT = {
  rain: { start: '雨が 降り始めた！', cont: '雨が 降り続いている。', end: '雨が やんだ。' },
  sun: { start: '日差しが 強くなった！', cont: '日差しが 強い。', end: '日差しが 元に戻った。' },
  sand: { start: '砂嵐が 吹き始めた！', cont: '砂嵐が 吹き荒れている。', end: '砂嵐が おさまった。' },
  hail: { start: 'あられが 降り始めた！', cont: 'あられが 降り続いている。', end: 'あられが やんだ。' },
};

const freshStages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

let uidCounter = 0;

/**
 * 個体を生成する
 * @param {{species:string, level?:number, nature?:string, ivs?:object, evs?:object, moves?:string[], ability?:string}} set
 */
export function createMon(set) {
  const species = SPECIES[set.species];
  if (!species) throw new Error(`不明なモンスター: ${set.species}`);
  const level = set.level ?? 50;
  const moveIds = set.moves?.length ? set.moves : species.learnset.slice(0, 4);
  if (moveIds.length > 4) throw new Error('技は4つまでです');
  const stats = calcStats(species.base, level, set.ivs, set.evs, set.nature);
  return {
    uid: ++uidCounter,
    speciesId: species.id,
    name: species.name,
    types: [...species.types],
    ability: set.ability ?? species.ability,
    level,
    nature: set.nature ?? 'neutral',
    stats,
    maxHp: stats.hp,
    hp: stats.hp,
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    stages: freshStages(),
    volatile: {},
    moves: moveIds.map((id) => {
      const move = MOVES[id];
      if (!move) throw new Error(`不明な技: ${id}`);
      return { id, pp: move.pp, maxPp: move.pp };
    }),
  };
}

export class Battle {
  /**
   * @param {{teams: object[][], names?: string[], seed?: number}} options
   *   teams はセット（createMon の引数）か生成済みの個体の配列
   */
  constructor({ teams, names = ['あなた', 'あいて'], seed = Date.now() }) {
    if (teams.length !== 2 || teams.some((t) => t.length < 1 || t.length > 6)) {
      throw new Error('チームは2つ、各1〜6体です');
    }
    this.seed = seed;
    this.rng = createRng(seed);
    this.sides = teams.map((team, i) => ({
      name: names[i],
      team: team.map((m) => (m.uid ? m : createMon(m))),
      active: 0,
    }));
    this.weather = null; // { type, turns } turns が null ならターン制限なし
    this.turn = 0;
    this.winner = null; // 0 | 1 | 'draw'
    this.pendingSwitch = [false, false];
    this.acted = new Set();
    this.events = [];

    for (const s of [0, 1]) this.text(`${this.sides[s].name}は ${this.active(s).name}を 繰り出した！`);
    for (const s of this.bySpeed([0, 1])) this.onEntry(s);
  }

  // ───────── 公開API ─────────

  get phase() {
    if (this.winner !== null) return 'end';
    if (this.pendingSwitch.some(Boolean)) return 'switch';
    return 'move';
  }

  active(side) {
    return this.sides[side].team[this.sides[side].active];
  }

  /** 選択可能な行動の一覧 */
  legalActions(side) {
    if (this.phase === 'end') return [];
    const s = this.sides[side];
    const switches = s.team
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => i !== s.active && m.hp > 0)
      .map(({ i }) => ({ type: 'switch', index: i }));
    if (this.phase === 'switch') return this.pendingSwitch[side] ? switches : [];
    const moves = this.active(side).moves
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.pp > 0)
      .map(({ i }) => ({ type: 'move', index: i }));
    return [...(moves.length ? moves : [{ type: 'move', index: -1 }]), ...switches];
  }

  /** 1ターン進める。actions[0] がサイド0、actions[1] がサイド1の行動 */
  playTurn(actions) {
    if (this.phase !== 'move') throw new Error(`現在は行動を選べません（${this.phase}）`);
    actions.forEach((a, s) => this.assertLegal(s, a));

    this.turn++;
    this.text(`── ターン ${this.turn} ──`);
    this.acted = new Set();

    for (const { side, action } of this.orderActions(actions)) {
      if (this.winner !== null) break;
      if (action.type === 'switch') {
        this.doSwitch(side, action.index);
      } else if (this.active(side).hp > 0) {
        this.useMove(side, action.index);
      }
      this.acted.add(side);
      this.checkWin();
    }

    if (this.winner === null) this.endOfTurn();
    this.checkWin();
    if (this.winner === null) {
      for (const s of [0, 1]) {
        this.pendingSwitch[s] = this.active(s).hp <= 0;
      }
    }
    return this.drainEvents();
  }

  /** ひんしになったモンスターの交代先を選ぶ */
  replace(side, index) {
    if (!this.pendingSwitch[side]) throw new Error('交代は必要ありません');
    this.assertLegal(side, { type: 'switch', index });
    this.sides[side].active = index;
    this.pendingSwitch[side] = false;
    this.text(`${this.sides[side].name}は ${this.active(side).name}を 繰り出した！`);
    this.onEntry(side);
    return this.drainEvents();
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** UI 表示用のスナップショット */
  snapshot() {
    return {
      turn: this.turn,
      weather: this.weather?.type ?? null,
      winner: this.winner,
      sides: this.sides.map((s) => ({
        name: s.name,
        active: s.active,
        team: s.team.map((m) => ({
          uid: m.uid, speciesId: m.speciesId, name: m.name, types: m.types, level: m.level,
          hp: m.hp, maxHp: m.maxHp, status: m.status, stages: { ...m.stages },
        })),
      })),
    };
  }

  // ───────── 内部処理 ─────────

  text(text) {
    this.events.push({ text, view: this.snapshot() });
  }

  update() {
    this.events.push({ text: null, view: this.snapshot() });
  }

  sideOf(mon) {
    return this.sides[0].team.includes(mon) ? 0 : 1;
  }

  label(mon) {
    return this.sideOf(mon) === 1 ? `相手の ${mon.name}` : mon.name;
  }

  assertLegal(side, action) {
    const ok = this.legalActions(side).some((a) => a.type === action?.type && a.index === action?.index);
    if (!ok) throw new Error(`不正な行動です（サイド${side}）: ${JSON.stringify(action)}`);
  }

  effectiveSpeed(mon) {
    let spe = Math.floor(mon.stats.spe * stageMultiplier(mon.stages.spe));
    if (mon.status === 'par') spe = Math.floor(spe / 4);
    return spe;
  }

  /** 素早さ順（同速はランダム） */
  bySpeed(sides) {
    return sides
      .map((s) => ({ s, spe: this.effectiveSpeed(this.active(s)), tie: this.rng.next() }))
      .sort((a, b) => b.spe - a.spe || a.tie - b.tie)
      .map((x) => x.s);
  }

  orderActions(actions) {
    return actions
      .map((action, side) => {
        const mon = this.active(side);
        let priority = 7; // 交代は技より先
        if (action.type === 'move') {
          const move = action.index < 0 ? STRUGGLE : MOVES[mon.moves[action.index].id];
          priority = move.priority ?? 0;
        }
        return { side, action, priority, spe: this.effectiveSpeed(mon), tie: this.rng.next() };
      })
      .sort((a, b) => b.priority - a.priority || b.spe - a.spe || a.tie - b.tie);
  }

  doSwitch(side, index) {
    const out = this.active(side);
    this.text(`${this.sides[side].name}は ${out.name}を 引っ込めた！`);
    out.stages = freshStages();
    out.volatile = {};
    out.toxicCounter = 0;
    this.sides[side].active = index;
    this.text(`${this.sides[side].name}は ${this.active(side).name}を 繰り出した！`);
    this.onEntry(side);
  }

  onEntry(side) {
    const mon = this.active(side);
    const foe = this.active(1 - side);
    const ability = ABILITIES[mon.ability];
    if (mon.ability === 'sharpgaze' && foe.hp > 0) {
      this.text(`${this.label(mon)}の ${ability.name}！`);
      this.applyBoosts(foe, { atk: -1 });
    }
    const weather = WEATHER_ABILITIES[mon.ability];
    if (weather && this.weather?.type !== weather) {
      this.text(`${this.label(mon)}の ${ability.name}！`);
      this.setWeather(weather, null);
    }
  }

  setWeather(type, turns) {
    if (this.weather?.type === type) return false;
    this.weather = { type, turns };
    this.text(WEATHER_TEXT[type].start);
    return true;
  }

  canAct(user) {
    if (user.status === 'slp') {
      user.sleepTurns--;
      if (user.sleepTurns <= 0) {
        user.status = null;
        this.text(`${this.label(user)}は 目を 覚ました！`);
      } else {
        this.text(`${this.label(user)}は ぐうぐう 眠っている。`);
        return false;
      }
    }
    if (user.status === 'frz') {
      if (this.rng.chance(0.2)) {
        user.status = null;
        this.text(`${this.label(user)}の 氷が 溶けた！`);
      } else {
        this.text(`${this.label(user)}は 凍ってしまって 動けない！`);
        return false;
      }
    }
    if (user.volatile.flinch) {
      this.text(`${this.label(user)}は ひるんで 技が 出せない！`);
      return false;
    }
    if (user.status === 'par' && this.rng.chance(0.25)) {
      this.text(`${this.label(user)}は 体が しびれて 動けない！`);
      return false;
    }
    return true;
  }

  useMove(side, index) {
    const user = this.active(side);
    const slot = index >= 0 ? user.moves[index] : null;
    const move = slot ? MOVES[slot.id] : STRUGGLE;

    if (!this.canAct(user)) return;
    if (slot) slot.pp--;
    if (!slot) this.text(`${this.label(user)}は 出せる技が ない！`);
    this.text(`${this.label(user)}の ${move.name}！`);

    if (move.target === 'self') {
      this.applySelfMove(user, move);
      return;
    }

    const target = this.active(1 - side);
    if (target.hp <= 0) {
      this.text('しかし 相手が いなかった！');
      return;
    }

    if (move.accuracy != null) {
      const acc = move.accuracy * accuracyMultiplier(user.stages.acc - target.stages.eva);
      if (this.rng.next() * 100 >= acc) {
        this.text(`しかし ${this.label(target)}には 当たらなかった！`);
        return;
      }
    }

    if (!move.power) this.applyStatusMove(user, target, move);
    else this.applyDamagingMove(user, target, move, 1 - side);
  }

  applySelfMove(user, move) {
    if (move.heal) {
      if (user.hp >= user.maxHp) {
        this.text('しかし 体力が 満タンだ！');
      } else {
        this.heal(user, Math.floor(user.maxHp * move.heal));
        this.text(`${this.label(user)}の 体力が 回復した！`);
      }
    }
    if (move.boosts) this.applyBoosts(user, move.boosts);
    if (move.weather && !this.setWeather(move.weather, 5)) {
      this.text('しかし うまく 決まらなかった！');
    }
  }

  applyStatusMove(user, target, move) {
    if (typeEffectiveness(move.type, target.types) === 0) {
      this.text(`${this.label(target)}には 効果が ないようだ…`);
      return;
    }
    if (move.status) this.inflictStatus(target, move.status.cond);
    if (move.foeBoosts) this.applyBoosts(target, move.foeBoosts);
  }

  applyDamagingMove(user, target, move, targetSide) {
    const eff = typeEffectiveness(move.type, target.types);
    if (eff === 0) {
      this.text(`${this.label(target)}には 効果が ないようだ…`);
      return;
    }
    if (move.type === 'ground' && target.ability === 'hover') {
      this.text(`${this.label(target)}は ${ABILITIES.hover.name}で 攻撃を 受けない！`);
      return;
    }

    const crit = this.rng.next() < critChance(move.critRatio ?? 0);
    const roll = this.rng.int(85, 100);
    const raw = calcDamage({ attacker: user, defender: target, move, weather: this.weather?.type, crit, roll });
    const dealt = Math.min(raw, target.hp);
    target.hp -= dealt;
    this.update();

    if (crit) this.text('急所に 当たった！');
    if (eff > 1) this.text('効果は バツグンだ！');
    else if (eff < 1) this.text('効果は いまひとつの ようだ…');

    if (move.type === 'fire' && target.status === 'frz' && target.hp > 0) {
      target.status = null;
      this.text(`${this.label(target)}の 氷が 溶けた！`);
    }

    if (move.drain && dealt > 0 && user.hp < user.maxHp) {
      this.heal(user, Math.max(1, Math.floor(dealt * move.drain)));
      this.text(`${this.label(target)}から 体力を 吸い取った！`);
    }

    if (move.recoil && dealt > 0) {
      user.hp = Math.max(0, user.hp - Math.max(1, Math.floor(dealt * move.recoil)));
      this.text(`${this.label(user)}は 反動で ダメージを 受けた！`);
    }

    if (target.hp > 0) {
      if (move.status && this.rng.chance((move.status.chance ?? 100) / 100)) {
        this.inflictStatus(target, move.status.cond, { silent: true });
      }
      if (move.foeBoosts && this.rng.chance((move.foeBoostChance ?? 100) / 100)) {
        this.applyBoosts(target, move.foeBoosts);
      }
      if (move.flinch && !this.acted.has(targetSide) && this.rng.chance(move.flinch / 100)) {
        target.volatile.flinch = true;
      }
    }

    if (move.contact && target.ability === 'chargedbody' && user.hp > 0 && !user.status
      && this.rng.chance(0.3)) {
      this.text(`${this.label(target)}の ${ABILITIES.chargedbody.name}！`);
      this.inflictStatus(user, 'par', { silent: true });
    }

    this.checkFaint(target);
    this.checkFaint(user);
  }

  heal(mon, amount) {
    mon.hp = Math.min(mon.maxHp, mon.hp + amount);
    this.update();
  }

  damageResidual(mon, amount, message) {
    mon.hp = Math.max(0, mon.hp - Math.max(1, amount));
    this.text(message);
    this.checkFaint(mon);
  }

  checkFaint(mon) {
    if (mon.hp <= 0 && !mon.volatile.fainted) {
      mon.volatile.fainted = true;
      mon.status = null;
      this.text(`${this.label(mon)}は 倒れた！`);
    }
  }

  applyBoosts(mon, boosts) {
    for (const [stat, amount] of Object.entries(boosts)) {
      const before = mon.stages[stat];
      const after = clamp(before + amount, -6, 6);
      const name = STAT_NAMES[stat];
      if (after === before) {
        this.text(`${this.label(mon)}の ${name}は もう ${amount > 0 ? '上がらない' : '下がらない'}！`);
        continue;
      }
      mon.stages[stat] = after;
      const diff = after - before;
      const strong = Math.abs(diff) >= 2 ? (diff > 0 ? 'ぐーんと ' : 'がくっと ') : '';
      this.text(`${this.label(mon)}の ${name}が ${strong}${diff > 0 ? '上がった' : '下がった'}！`);
    }
  }

  inflictStatus(target, cond, { silent = false } = {}) {
    if (target.hp <= 0) return false;
    if (target.status) {
      if (!silent) {
        this.text(target.status === cond
          ? `${this.label(target)}は すでに ${STATUS_NAMES[cond]}状態だ！`
          : 'しかし うまく 決まらなかった！');
      }
      return false;
    }
    const has = (t) => target.types.includes(t);
    const immune = (cond === 'brn' && has('fire'))
      || (cond === 'frz' && (has('ice') || this.weather?.type === 'sun'))
      || ((cond === 'psn' || cond === 'tox') && (has('poison') || has('steel')));
    if (immune) {
      if (!silent) this.text(`${this.label(target)}には 効果が ないようだ…`);
      return false;
    }
    target.status = cond;
    if (cond === 'slp') target.sleepTurns = this.rng.int(2, 5);
    if (cond === 'tox') target.toxicCounter = 0;
    const l = this.label(target);
    const messages = {
      brn: `${l}は やけどを 負った！`,
      par: `${l}は まひして 技が 出にくくなった！`,
      psn: `${l}は 毒を 浴びた！`,
      tox: `${l}は 猛毒を 浴びた！`,
      slp: `${l}は 眠ってしまった！`,
      frz: `${l}は 凍りついた！`,
    };
    this.text(messages[cond]);
    return true;
  }

  endOfTurn() {
    const order = this.bySpeed([0, 1]);

    if (this.weather) {
      const { type } = this.weather;
      if (this.weather.turns != null && --this.weather.turns <= 0) {
        this.weather = null;
        this.text(WEATHER_TEXT[type].end);
      } else {
        this.text(WEATHER_TEXT[type].cont);
        if (type === 'sand' || type === 'hail') {
          const immuneTypes = type === 'sand' ? ['rock', 'ground', 'steel'] : ['ice'];
          for (const s of order) {
            const mon = this.active(s);
            if (mon.hp <= 0 || mon.types.some((t) => immuneTypes.includes(t))) continue;
            this.damageResidual(mon, Math.floor(mon.maxHp / 16),
              `${this.label(mon)}は ${type === 'sand' ? '砂嵐' : 'あられ'}に 打たれている！`);
          }
        }
      }
    }

    for (const s of order) {
      const mon = this.active(s);
      if (mon.hp <= 0) continue;
      if (mon.status === 'brn') {
        this.damageResidual(mon, Math.floor(mon.maxHp / 8), `${this.label(mon)}は やけどの ダメージを 受けている！`);
      } else if (mon.status === 'psn') {
        this.damageResidual(mon, Math.floor(mon.maxHp / 8), `${this.label(mon)}は 毒の ダメージを 受けている！`);
      } else if (mon.status === 'tox') {
        mon.toxicCounter = Math.min(15, mon.toxicCounter + 1);
        this.damageResidual(mon, Math.floor((mon.maxHp * mon.toxicCounter) / 16),
          `${this.label(mon)}は 猛毒の ダメージを 受けている！`);
      }
      if (mon.hp > 0 && mon.ability === 'acceleration' && mon.stages.spe < 6) {
        this.text(`${this.label(mon)}の ${ABILITIES.acceleration.name}！`);
        this.applyBoosts(mon, { spe: 1 });
      }
    }

    for (const s of [0, 1]) delete this.active(s).volatile.flinch;
  }

  checkWin() {
    if (this.winner !== null) return;
    const lost = this.sides.map((s) => s.team.every((m) => m.hp <= 0));
    if (!lost[0] && !lost[1]) return;
    if (lost[0] && lost[1]) {
      this.winner = 'draw';
      this.text('引き分け！');
    } else {
      this.winner = lost[0] ? 1 : 0;
      this.text(`${this.sides[this.winner].name}の 勝ち！`);
    }
  }
}
