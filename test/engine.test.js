import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcStats, stageMultiplier } from '../src/engine/stats.js';
import { calcDamage, damageRange } from '../src/engine/damage.js';
import { typeEffectiveness } from '../src/data/types.js';
import { MOVES } from '../src/data/moves.js';
import { SPECIES } from '../src/data/species.js';
import { Battle, createMon } from '../src/engine/battle.js';
import { chooseAction } from '../src/engine/ai.js';
import { createRng } from '../src/engine/rng.js';

const flat = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };

test('実数値: Lv50・個体値31・努力値0', () => {
  const s = calcStats(flat, 50, {}, {}, 'neutral');
  assert.equal(s.hp, 175);
  assert.equal(s.atk, 120);
});

test('実数値: 努力値252と性格補正', () => {
  const s = calcStats(flat, 50, {}, { atk: 252 }, 'atk-spa');
  assert.equal(s.atk, Math.floor(152 * 1.1)); // 167
  assert.equal(s.spa, Math.floor(120 * 0.9)); // 108
});

test('努力値合計の上限', () => {
  assert.throws(() => calcStats(flat, 50, {}, { hp: 255, atk: 255, def: 4 }));
});

test('ランク補正', () => {
  assert.equal(stageMultiplier(2), 2);
  assert.equal(stageMultiplier(-1), 2 / 3);
  assert.equal(stageMultiplier(6), 4);
});

test('タイプ相性', () => {
  assert.equal(typeEffectiveness('water', ['fire']), 2);
  assert.equal(typeEffectiveness('electric', ['ground', 'rock']), 0);
  assert.equal(typeEffectiveness('ice', ['dragon', 'flying']), 4);
  assert.equal(typeEffectiveness('fire', ['water', 'rock']), 0.25);
  assert.equal(typeEffectiveness(null, ['ghost']), 1);
});

test('ダメージ: タイプ一致・相性・乱数幅', () => {
  const a = createMon({ species: 'hinokojika' });
  const d = createMon({ species: 'morigame' });
  const [min, max] = damageRange({ attacker: a, defender: d, move: MOVES.flameshot });
  assert.ok(min > 0 && min < max);
  assert.ok(min >= Math.floor(max * 0.85) - 1);
  const neutral = calcDamage({ attacker: a, defender: createMon({ species: 'ooyamaguma' }), move: MOVES.flameshot });
  assert.ok(max > neutral, '抜群のほうが大きい');
});

test('ダメージ: やけどで物理半減・急所2倍・天気', () => {
  const a = createMon({ species: 'tekkenzaru', ability: 'blazeheart' });
  const d = createMon({ species: 'ooyamaguma', ability: 'hover' });
  const base = calcDamage({ attacker: a, defender: d, move: MOVES.crushfist });
  a.status = 'brn';
  const burned = calcDamage({ attacker: a, defender: d, move: MOVES.crushfist });
  assert.ok(burned < base * 0.6);
  a.status = null;
  const crit = calcDamage({ attacker: a, defender: d, move: MOVES.crushfist, crit: true });
  assert.ok(crit > base * 1.8);

  const w = createMon({ species: 'mizuchidori' });
  const t = createMon({ species: 'ooyamaguma', ability: 'hover' });
  const dry = calcDamage({ attacker: w, defender: t, move: MOVES.torrent });
  const rain = calcDamage({ attacker: w, defender: t, move: MOVES.torrent, weather: 'rain' });
  assert.ok(rain > dry * 1.4);
});

test('特性: 闘志はやけどの半減を無視して1.5倍', () => {
  const a = createMon({ species: 'tekkenzaru' });
  const d = createMon({ species: 'ooyamaguma', ability: 'hover' });
  const base = calcDamage({ attacker: a, defender: d, move: MOVES.crushfist });
  a.status = 'brn';
  assert.ok(calcDamage({ attacker: a, defender: d, move: MOVES.crushfist }) > base * 1.4);
});

test('全データの整合性', () => {
  for (const sp of Object.values(SPECIES)) {
    assert.ok(sp.learnset.length >= 4, sp.id);
    for (const m of sp.learnset) assert.ok(MOVES[m], `${sp.id}: ${m}`);
  }
});

test('先制技は素早さに関係なく先に動く', () => {
  const battle = new Battle({
    teams: [[{ species: 'ooyamaguma', moves: ['quickflash'] }], [{ species: 'inazumarisu', moves: ['mendlight'] }]],
    seed: 1,
  });
  const events = battle.playTurn([{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
  const texts = events.map((e) => e.text).filter(Boolean);
  const first = texts.findIndex((t) => t.includes('電光一閃'));
  const second = texts.findIndex((t) => t.includes('癒しの光'));
  assert.ok(first >= 0 && first < second);
});

test('天気特性と砂嵐ダメージ', () => {
  const battle = new Battle({
    teams: [[{ species: 'sunamogura', moves: ['guardstance'] }], [{ species: 'ooyamaguma', moves: ['warcry'] }]],
    seed: 2,
  });
  assert.equal(battle.weather.type, 'sand');
  const foe = battle.active(1);
  battle.playTurn([{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
  assert.equal(foe.hp, foe.maxHp - Math.floor(foe.maxHp / 16));
  assert.equal(battle.active(0).hp, battle.active(0).maxHp);
});

test('鋭い眼光で相手の攻撃が下がる', () => {
  const battle = new Battle({ teams: [[{ species: 'hyougarou' }], [{ species: 'tekkenzaru' }]], seed: 3 });
  assert.equal(battle.active(1).stages.atk, -1);
});

test('交代・ひんし後の入れ替え・PP消費', () => {
  const battle = new Battle({
    teams: [
      [{ species: 'ooyamaguma', level: 5, moves: ['warcry'] }, { species: 'morigame' }],
      [{ species: 'tekkenzaru', moves: ['recklesskick'] }],
    ],
    seed: 4,
  });
  let guard = 0;
  while (battle.phase === 'move' && guard++ < 10) {
    battle.playTurn([{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
  }
  assert.equal(battle.phase, 'switch');
  assert.ok(battle.active(1).moves[0].pp < battle.active(1).moves[0].maxPp);
  assert.throws(() => battle.playTurn([{ type: 'move', index: 0 }, { type: 'move', index: 0 }]));
  battle.replace(0, 1);
  assert.equal(battle.active(0).speciesId, 'morigame');
  assert.equal(battle.phase, 'move');
});

test('不正な行動は拒否される', () => {
  const battle = new Battle({ teams: [[{ species: 'ooyamaguma' }], [{ species: 'morigame' }]], seed: 5 });
  assert.throws(() => battle.playTurn([{ type: 'switch', index: 0 }, { type: 'move', index: 0 }]));
  assert.throws(() => battle.playTurn([{ type: 'move', index: 7 }, { type: 'move', index: 0 }]));
});

test('AI同士の対戦が決着する（多数シード）', () => {
  const ids = Object.keys(SPECIES);
  for (let seed = 1; seed <= 60; seed++) {
    const rng = createRng(seed);
    const pickTeam = () => Array.from({ length: 3 }, () => ({ species: rng.pick(ids), evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 } }));
    const battle = new Battle({ teams: [pickTeam(), pickTeam()], seed });
    let turns = 0;
    while (battle.phase !== 'end' && turns < 500) {
      if (battle.phase === 'switch') {
        for (const s of [0, 1]) if (battle.pendingSwitch[s]) battle.replace(s, chooseAction(battle, s, rng.next).index);
      } else {
        battle.playTurn([chooseAction(battle, 0, rng.next), chooseAction(battle, 1, rng.next)]);
        turns++;
      }
    }
    assert.equal(battle.phase, 'end', `seed ${seed} が決着しない`);
  }
});

test('同じシードなら同じ結果', () => {
  const run = () => {
    const b = new Battle({ teams: [[{ species: 'hinokojika' }], [{ species: 'mizuchidori' }]], seed: 42 });
    const log = [];
    while (b.phase === 'move') log.push(...b.playTurn([{ type: 'move', index: 0 }, { type: 'move', index: 0 }]).map((e) => e.text));
    return log.join('\n');
  };
  assert.equal(run(), run());
});
