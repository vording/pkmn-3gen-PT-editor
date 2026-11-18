import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POKEDEX } from '../src/data/pokedex.js';
import { SAMPLE_TEAMS } from '../src/data/teams.js';
import { calcStat, buildMember, resolveMove } from '../src/engine/model.js';
import { matchup, damageFraction } from '../src/engine/matchup.js';
import { recommend, isUsable, DEX, memberOf } from '../src/engine/recommend.js';
import { BANNED } from '../src/data/rules.js';

test('データ：使用可能なポケモンは型を持ち、禁止ポケモンは除外される', () => {
  const usable = POKEDEX.filter(isUsable);
  assert.ok(usable.length > 190);
  for (const m of usable) {
    assert.equal(m.base.length, 6, m.name);
    assert.ok(m.types.length >= 1, m.name);
    for (const s of m.sets) assert.ok(s.moves.length >= 1 && s.moves.length <= 4, `${m.name} ${s.label}`);
  }
  assert.ok(!usable.some((m) => BANNED.has(m.name)));
  assert.equal(SAMPLE_TEAMS.length, 16);
});

test('実数値：考察本の記載と一致する（Lv50・個体値31）', () => {
  // 『こだわりハチマキ』メタグロス いじっぱり 156-196-12-0-4-140 → 175-198-152-*-111-108
  const meta = DEX.get('メタグロス');
  const evs = [156, 196, 12, 0, 4, 140];
  assert.deepEqual([0, 1, 2, 4, 5].map((i) => calcStat(i, meta.base[i], evs[i], 'いじっぱり')), [175, 198, 152, 111, 108]);
});

test('技：めざめるパワーはタイプ・物理特殊が決まる', () => {
  assert.deepEqual(resolveMove('めざめるパワー飛'), { name: 'めざめるパワー飛', type: 'flying', power: 70, physical: true });
  assert.equal(resolveMove('めざめるパワー草').physical, false);
});

test('ダメージ：特性による無効・タイプ相性が反映される', () => {
  const gengar = memberOf('ゲンガー', 0);
  const meta = memberOf('メタグロス', 0);
  const jishin = resolveMove('じしん');
  assert.equal(damageFraction(meta, gengar, jishin), 0); // ふゆう
  const thunder = memberOf('サンダー', 0);
  assert.equal(damageFraction(thunder, memberOf('ラグラージ', 0), resolveMove('１０まんボルト')), 0);
});

test('対面評価：典型的な有利不利を再現する', () => {
  const zapdos = memberOf('サンダー', 0);
  const skarm = memberOf('エアームド', 0);
  assert.ok(matchup(zapdos, skarm) > 0.5);
  assert.ok(matchup(skarm, zapdos) < -0.5);
  const snorlax = memberOf('カビゴン', 0);
  const gengar = memberOf('ゲンガー', 0);
  assert.ok(matchup(snorlax, gengar) > 0.5);
});

test('提案：固定ポケモンを含む6体・種族と道具の重複なし', () => {
  const res = recommend({ locked: [{ name: 'ヘラクロス', setIndex: null }], count: 2, beamWidth: 12 });
  assert.ok(res.length >= 1);
  for (const r of res) {
    const names = r.members.map((d) => d.member.name);
    assert.equal(names.length, 6);
    assert.ok(names.includes('ヘラクロス'));
    assert.equal(new Set(names).size, 6);
    const items = r.members.map((d) => d.member.item).filter(Boolean);
    assert.equal(new Set(items).size, items.length);
    assert.ok(r.selections[0].includes('ヘラクロス'));
  }
});

test('提案：型を指定して固定できる・ラティ禁止ルール', () => {
  const mon = DEX.get('ミロカロス');
  const res = recommend({ locked: [{ name: 'ミロカロス', setIndex: 1 }], count: 1, beamWidth: 10, allowLati: false });
  const m = res[0].members.find((d) => d.member.name === 'ミロカロス').member;
  assert.equal(m.set, mon.sets[1]);
  assert.ok(!res[0].members.some((d) => ['ラティオス', 'ラティアス'].includes(d.member.name)));
});

test('型の作成：記載がなければ努力値を推定する', () => {
  const m = buildMember(DEX.get('アーボック'), 0);
  assert.equal(m.evsEstimated, true);
  assert.equal(m.evs.reduce((a, b) => a + b, 0), 508);
});
