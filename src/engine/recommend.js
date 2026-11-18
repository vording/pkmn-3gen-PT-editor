// パーティ提案エンジン
// 1) 環境上位のポケモン（重要度の高い型）を「仮想敵」として、各候補の対面有利度を事前計算
// 2) 仮想敵への回答の有無・タイプ相性の偏り・役割（積み対策など）・構築例や大会での同時採用実績で評価
// 3) ビームサーチで6体を組み、道具の重複を禁止したまま型を選ぶ
import { POKEDEX } from '../data/pokedex.js';
import { SAMPLE_TEAMS, TOURNAMENT_PARTIES } from '../data/teams.js';
import { TYPES, TYPE_NAMES as TYPE_JP } from '../data/types.js';
import { BANNED, BANNED_ITEMS } from '../data/rules.js';
import { buildMember, roleLabels } from './model.js';
import { matchup, defensiveMultiplier } from './matchup.js';

// 環境ランク：2025/05〜2026/08 の大会成績にもとづくランク（stoic氏）があればそれを、なければ考察本の重要度を使う
export const TIER_ORDER = ['S+', 'S', 'A', 'B', 'C', 'D', 'P3', 'P2', 'P1'];
export const TIER_LABEL = {
  'S+': 'S+', S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', P3: '☆☆☆', P2: '☆☆', P1: '☆',
};
const TIER_VALUE = { 'S+': 1.0, S: 0.85, A: 0.7, B: 0.55, C: 0.4, D: 0.3, P3: 0.35, P2: 0.2, P1: 0.05 };

export function metaTier(mon) {
  if (mon.rank2026) return mon.rank2026.rank;
  return { S: 'P3', A: 'P3', B: 'P2', C: 'P1' }[mon.tier];
}

// 仮想敵としての重み：2026年の大会での使用率（KPアーカイブ）とランク集計期間の使用率の大きい方
function threatWeight(mon) {
  const usage = Math.max(mon.usage2026 ?? 0, (mon.rank2026?.usage ?? 0) / 100);
  if (usage >= 0.015) return 6 * Math.sqrt(usage);
  return { S: 0.4, A: 0.3, B: 0.1 }[mon.tier] ?? 0;
}

export const DEX = new Map(POKEDEX.map((m) => [m.name, m]));
for (const m of POKEDEX) m.meta = metaTier(m);

export function isUsable(mon) {
  return !mon.banned && !BANNED.has(mon.name) && mon.base && mon.sets.length > 0;
}

export function usableSets(mon) {
  return mon.sets
    .map((s, i) => [s, i])
    .filter(([s]) => !BANNED_ITEMS.has(s.item))
    .map(([, i]) => i);
}

// 構築例・大会パーティでの同時採用回数（大会の上位入賞は1.5倍で数える）
const PAIR_COUNT = new Map();
function addPairs(names, w) {
  for (const a of names) for (const b of names) {
    if (a < b) PAIR_COUNT.set(`${a}|${b}`, (PAIR_COUNT.get(`${a}|${b}`) ?? 0) + w);
  }
}
for (const team of SAMPLE_TEAMS) addPairs(team.members.map((m) => m.name), 1);
for (const p of TOURNAMENT_PARTIES) {
  const topCut = p.participants ? Math.max(1, Math.round(p.participants / 4)) : 4;
  addPairs(p.mons, p.place && p.place <= topCut ? 1.5 : 1);
}
export function pairCount(a, b) {
  return PAIR_COUNT.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;
}
const pairScore = (a, b) => Math.min(2, Math.sqrt(pairCount(a, b)) / 2);

let cache = null;
function context() {
  if (cache) return cache;
  const usable = POKEDEX.filter(isUsable);
  // 仮想敵：使用率の高いポケモンほど多くの型（最大3つ）を、使用率で重み付けして入れる
  const threats = [];
  for (const mon of usable) {
    const w = threatWeight(mon);
    if (!w) continue;
    const n = w >= 5 ? 3 : w >= 1.5 ? 2 : 1;
    const idx = usableSets(mon).slice(0, n);
    for (const i of idx) threats.push({ member: buildMember(mon, i), weight: w / idx.length, name: mon.name, tier: mon.meta });
  }
  cache = { usable, threats, members: new Map(), rows: new Map() };
  return cache;
}

export function getThreats() {
  return context().threats;
}

export function memberOf(name, setIndex) {
  const ctx = context();
  const key = `${name}#${setIndex}`;
  if (!ctx.members.has(key)) ctx.members.set(key, buildMember(DEX.get(name), setIndex));
  return ctx.members.get(key);
}

// 候補 × 仮想敵 の有利度
function rowOf(member) {
  const ctx = context();
  if (!ctx.rows.has(member.id)) {
    ctx.rows.set(member.id, Float32Array.from(ctx.threats, (t) => (t.name === member.name ? 0 : matchup(member, t.member))));
  }
  return ctx.rows.get(member.id);
}

function typeProfile(members) {
  const out = {};
  for (const t of TYPES) {
    let weak = 0;
    let resist = 0;
    for (const m of members) {
      const x = defensiveMultiplier(m, t);
      if (x >= 2) weak++;
      else if (x <= 0.5) resist++;
    }
    out[t] = { weak, resist };
  }
  return out;
}

const WEIGHTS = {
  coverage: 3.0,
  type: 1.0,
  roles: 1.0,
  tier: 0.8,
  synergy: 0.25,
};

// チームの評価値（部分チームでも計算可能）と内訳
export function scoreTeam(members, opts = {}) {
  const { threats } = context();
  const rows = members.map(rowOf);
  let coverage = 0;
  let totalW = 0;
  for (let t = 0; t < threats.length; t++) {
    const w = threats[t].weight;
    let best = -1;
    let second = -1;
    let losing = 0;
    for (const r of rows) {
      const v = r[t];
      if (v > best) { second = best; best = v; } else if (v > second) second = v;
      if (v < -0.4) losing++;
    }
    if (rows.length < 2) second = best;
    let s = 0.75 * best + 0.25 * second;
    if (best < 0) s += 0.6 * best; // 回答がいない仮想敵は重く見る
    if (losing >= 4) s -= 0.3;
    coverage += w * s;
    totalW += w;
  }
  coverage = (coverage / totalW) * 10;

  const prof = typeProfile(members);
  let type = 0;
  for (const t of TYPES) {
    const { weak, resist } = prof[t];
    if (weak >= 3) type -= (weak - 2) * 1.2;
    if (weak - resist >= 2) type -= 0.6;
  }

  let roles = 0;
  const has = (pred) => members.some(pred);
  if (members.length >= 4) {
    // 考察本：6体のうち誰か1体には『ほえる』などの積み・バトン対策を持たせたい
    if (!has((m) => m.tags.phaze || m.tags.encore || (m.tags.counter && m.tags.mirrorCoat))) roles -= 1.5;
    if (!has((m) => m.stats[0] * m.stats[4] >= 36000)) roles -= 1.0; // 特殊の数値受け
    if (!has((m) => m.stats[5] >= 140)) roles -= 0.5;
  }
  const sleepers = members.filter((m) => m.tags.sleep).length;
  if (sleepers >= 2) roles -= 0.6 * (sleepers - 1); // 眠り技はルール上1体しか通らない
  const explode = members.filter((m) => m.tags.explode).length;
  if (explode >= 4) roles -= 0.5;
  const choice = members.filter((m) => m.item === 'こだわりハチマキ').length;
  if (choice >= 2) roles -= 1.0; // 道具重複不可だが念のため

  let tier = 0;
  for (const m of members) tier += TIER_VALUE[m.mon.meta] ?? 0;
  // 型の並びは「最近の記事の型 → 考察本の型」なので、上にある型ほど少し優先する
  let setPref = 0;
  for (const m of members) setPref += Math.max(0, 0.8 - 0.2 * m.setIndex);

  let synergy = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) synergy += pairScore(members[i].name, members[j].name);
  }

  let diversity = 0;
  if (opts.avoid) for (const m of members) if (opts.avoid.has(m.name)) diversity -= 1.5;

  const parts = {
    coverage: coverage * WEIGHTS.coverage,
    type: type * WEIGHTS.type,
    roles: roles * WEIGHTS.roles,
    tier: tier * WEIGHTS.tier,
    synergy: synergy * WEIGHTS.synergy,
    setPref,
    diversity,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts };
}

function candidatePool(opts) {
  const { usable } = context();
  const pool = [];
  for (const mon of usable) {
    if (opts.exclude?.has(mon.name)) continue;
    if (mon.meta === 'P1' && !opts.includeMinor) continue;
    if (!opts.allowLati && (mon.name === 'ラティオス' || mon.name === 'ラティアス')) continue;
    for (const i of usableSets(mon).slice(0, 4)) pool.push(memberOf(mon.name, i));
  }
  return pool;
}

// locked: [{ name, setIndex | null }]（setIndex=null は型も自動選択）
export function recommend({
  locked = [],
  count = 3,
  beamWidth = 40,
  includeMinor = false,
  allowLati = true,
  exclude = new Set(),
} = {}) {
  const opts = { includeMinor, allowLati, exclude };
  const pool = candidatePool(opts);
  const proposals = [];
  const avoid = new Set();
  for (let p = 0; p < count; p++) {
    const team = search(locked, pool, beamWidth, { avoid: p > 0 ? avoid : null });
    if (!team) break;
    const key = team.map((m) => m.id).sort().join(',');
    if (proposals.some((x) => x.key === key)) break;
    proposals.push({ key, members: team });
    for (const m of team) if (!locked.some((l) => l.name === m.name)) avoid.add(m.name);
  }
  return proposals.map((p) => describeTeam(p.members, locked));
}

function search(locked, pool, beamWidth, opts) {
  // 固定ポケモンの型の組み合わせを初期状態にする
  let beams = [[]];
  for (const l of locked) {
    const mon = DEX.get(l.name);
    const idx = l.setIndex == null ? usableSets(mon).slice(0, 6) : [l.setIndex];
    const next = [];
    for (const b of beams) {
      for (const i of idx) {
        const m = memberOf(l.name, i);
        if (m.item && b.some((x) => x.item === m.item)) continue;
        next.push([...b, m]);
      }
    }
    beams = next.length ? next : beams.map((b) => [...b, memberOf(l.name, idx[0])]);
  }
  beams = beams.map((b) => ({ team: b, score: scoreTeam(b, opts).total }));
  beams.sort((a, b) => b.score - a.score);
  beams = beams.slice(0, beamWidth);
  while (beams[0].team.length < 6) {
    const next = new Map();
    for (const { team } of beams) {
      const names = new Set(team.map((m) => m.name));
      const items = new Set(team.map((m) => m.item).filter(Boolean));
      for (const c of pool) {
        if (names.has(c.name) || (c.item && items.has(c.item))) continue;
        const t = [...team, c];
        const key = t.map((m) => m.id).sort().join(',');
        if (next.has(key)) continue;
        next.set(key, { team: t, score: scoreTeam(t, opts).total });
      }
    }
    if (next.size === 0) return null;
    // 同じ顔ぶれ（型違い）ばかりにならないよう、種族の組で重複を間引く
    const sorted = [...next.values()].sort((a, b) => b.score - a.score);
    const seen = new Map();
    beams = [];
    for (const s of sorted) {
      const k = s.team.map((m) => m.name).sort().join(',');
      const c = seen.get(k) ?? 0;
      if (c >= 2) continue;
      seen.set(k, c + 1);
      beams.push(s);
      if (beams.length >= beamWidth) break;
    }
  }
  return beams[0].team;
}

// 3体選出の候補（固定ポケモンを含む組で仮想敵への対応力が最も高いもの）
export function bestSelections(members, mustInclude = [], top = 3) {
  const out = [];
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) for (let k = j + 1; k < members.length; k++) {
    const trio = [members[i], members[j], members[k]];
    if (mustInclude.length && !mustInclude.some((n) => trio.some((m) => m.name === n))) continue;
    const s = scoreTeam(trio);
    out.push({ trio, score: s.parts.coverage + s.parts.type * 0.5 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, top);
}

function describeTeam(members, locked) {
  const { threats } = context();
  const rows = members.map(rowOf);
  const lockedNames = new Set(locked.map((l) => l.name));
  // 仮想敵（種族単位）ごとの最良回答
  const byName = new Map();
  threats.forEach((t, ti) => {
    const e = byName.get(t.name) ?? { name: t.name, tier: t.tier, weight: 0, scores: members.map(() => 0) };
    e.weight += t.weight;
    rows.forEach((r, mi) => { e.scores[mi] += r[ti] * t.weight; });
    byName.set(t.name, e);
  });
  const threatTable = [...byName.values()].map((e) => {
    const scores = e.scores.map((s) => s / e.weight);
    let bi = 0;
    scores.forEach((s, i) => { if (s > scores[bi]) bi = i; });
    return { name: e.name, tier: e.tier, weight: e.weight, scores, best: bi, bestScore: scores[bi] };
  }).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'ja'));

  const lockedMembers = members.filter((m) => lockedNames.has(m.name));
  const lockedWeak = new Set();
  for (const lm of lockedMembers) for (const t of TYPES) if (defensiveMultiplier(lm, t) >= 2) lockedWeak.add(t);

  const details = members.map((m, mi) => {
    const reasons = [];
    if (lockedNames.has(m.name)) reasons.push('選択したポケモン');
    const answers = threatTable.filter((t) => t.best === mi && t.bestScore > 0.15 && t.name !== m.name)
      .sort((a, b) => b.weight * b.bestScore - a.weight * a.bestScore).slice(0, 4).map((t) => t.name);
    if (answers.length) reasons.push(`${answers.join('・')}に対してチーム内で最も有利`);
    if (!lockedNames.has(m.name) && lockedMembers.length) {
      const covers = [...lockedWeak].filter((t) => defensiveMultiplier(m, t) <= 0.5);
      if (covers.length) reasons.push(`${lockedMembers.map((x) => x.name).join('・')}の弱点（${covers.map((t) => TYPE_JP[t]).join('・')}）を半減以下で受けられる`);
      const pc = lockedMembers.reduce((s, x) => s + pairCount(x.name, m.name), 0);
      if (pc >= 1) reasons.push(`構築例・大会パーティで${lockedMembers.map((x) => x.name).join('・')}と${Math.round(pc)}回同時採用`);
    }
    return { member: m, roles: roleLabels(m), reasons };
  });

  const score = scoreTeam(members);
  const prof = typeProfile(members);
  const warnings = [];
  for (const t of TYPES) if (prof[t].weak >= 3) warnings.push(`${TYPE_JP[t]}タイプの技を弱点とするポケモンが${prof[t].weak}体`);
  for (const t of threatTable) if (t.bestScore < -0.1 && t.weight >= 1) warnings.push(`${t.name}に有利なポケモンがいない（環境ランク${TIER_LABEL[t.tier]}）`);
  if (!members.some((m) => m.tags.phaze || m.tags.encore)) warnings.push('『ほえる』『ふきとばし』『アンコール』などの積み・バトン対策がない');
  if (members.filter((m) => m.tags.sleep).length >= 2) warnings.push('眠り技持ちが複数（ルール上、同時に2体以上は眠らせられない）');
  if (members.some((m) => m.ability === 'かげふみ')) warnings.push('相手も『かげふみ』を手持ちに入れている場合、ソーナンスは選出できない');

  const must = locked.map((l) => l.name);
  return {
    members: details,
    score,
    typeProfile: prof,
    threats: threatTable,
    warnings,
    selections: bestSelections(members, must).map((s) => s.trio.map((m) => m.name)),
  };
}

export { TYPE_JP };

// 指定した枠の入れ替え候補（種族ごとに一番合う型を1つ）。delta は今の構成からの評価値の増減
export function alternatives(members, index, { includeMinor = false, allowLati = true, count = 6 } = {}) {
  const { threats } = context();
  const others = members.filter((_, i) => i !== index);
  const names = new Set(others.map((m) => m.name));
  const items = new Set(others.map((m) => m.item).filter(Boolean));
  const current = scoreTeam(members).total;
  const best = new Map();
  for (const c of candidatePool({ includeMinor, allowLati })) {
    if (names.has(c.name) || c.name === members[index].name || (c.item && items.has(c.item))) continue;
    const team = [...others.slice(0, index), c, ...others.slice(index)];
    const total = scoreTeam(team).total;
    const prev = best.get(c.name);
    if (!prev || total > prev.total) best.set(c.name, { member: c, total });
  }
  return [...best.values()].sort((a, b) => b.total - a.total).slice(0, count).map(({ member, total }) => {
    // 得意な相手：使用率×有利度が大きい仮想敵（種族の重複なし）
    const row = rowOf(member);
    const agg = new Map();
    threats.forEach((t, ti) => {
      const e = agg.get(t.name) ?? { name: t.name, w: 0, sum: 0 };
      e.w += t.weight;
      e.sum += row[ti] * t.weight;
      agg.set(t.name, e);
    });
    const good = [...agg.values()].filter((e) => e.w >= 1.5 && e.sum / e.w > 0.3 && e.name !== member.name)
      .sort((a, b) => b.sum - a.sum).slice(0, 3).map((e) => e.name);
    return { member, delta: total - current, roles: roleLabels(member), good };
  });
}

// 型を指定した6体で提案結果を作り直す（入れ替え後の表示用）
export function evaluateTeam(members, locked = []) {
  return describeTeam(members, locked);
}
