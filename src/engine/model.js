// 図鑑データの「型」を、計算に使える形（実数値・技・役割）に変換する
import { MOVES } from '../data/moves.js';
import { HIDDEN_POWER_TYPES, isPhysicalType } from '../data/types.js';
import { SLEEP_MOVES } from '../data/rules.js';

export const STAT_KEYS = ['H', 'A', 'B', 'C', 'D', 'S'];

// 性格 → [上昇, 下降]（インデックスは STAT_KEYS。0=HP は補正なし）
export const NATURES = {
  さみしがり: [1, 2], いじっぱり: [1, 3], やんちゃ: [1, 4], ゆうかん: [1, 5],
  ずぶとい: [2, 1], わんぱく: [2, 3], のうてんき: [2, 4], のんき: [2, 5],
  ひかえめ: [3, 1], おっとり: [3, 2], うっかりや: [3, 4], れいせい: [3, 5],
  おだやか: [4, 1], おとなしい: [4, 2], しんちょう: [4, 3], なまいき: [4, 5],
  おくびょう: [5, 1], せっかち: [5, 2], ようき: [5, 3], むじゃき: [5, 4],
  がんばりや: null, すなお: null, てれや: null, きまぐれ: null, まじめ: null,
};

const LEVEL = 50;

export function calcStat(index, base, ev = 0, nature = null, iv = 31) {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * LEVEL) / 100);
  if (index === 0) return base === 1 ? 1 : core + LEVEL + 10;
  const mod = NATURES[nature];
  let mult = 1;
  if (mod) {
    if (mod[0] === index) mult = 1.1;
    else if (mod[1] === index) mult = 0.9;
  }
  return Math.floor((core + 5) * mult);
}

export function resolveMove(name) {
  if (name.startsWith('めざめるパワー')) {
    const t = HIDDEN_POWER_TYPES[name.slice('めざめるパワー'.length)];
    return { name, type: t ?? 'normal', power: t ? 70 : 0, physical: isPhysicalType(t ?? 'normal') };
  }
  const m = MOVES[name];
  if (!m) return { name, type: 'normal', power: 0, physical: true };
  return { name, type: m.type, power: m.power, physical: isPhysicalType(m.type) };
}

const MOVE_TAGS = {
  sleep: SLEEP_MOVES,
  para: new Set(['でんじは', 'へびにらみ', 'しびれごな']),
  burn: new Set(['おにび']),
  toxic: new Set(['どくどく']),
  confuse: new Set(['いばる', 'あやしいひかり', 'フラフラダンス', 'てんしのキッス']),
  setupPhys: new Set(['つるぎのまい', 'りゅうのまい', 'ビルドアップ', 'はらだいこ']),
  setupSpec: new Set(['めいそう', 'ほたるび']),
  curse: new Set(['のろい']),
  evasion: new Set(['かげぶんしん', 'ちいさくなる']),
  metalSound: new Set(['きんぞくおん', 'いやなおと']),
  phaze: new Set(['ほえる', 'ふきとばし', 'ほろびのうた', 'くろいきり']),
  encore: new Set(['アンコール', 'ちょうはつ']),
  recover: new Set(['じこさいせい', 'タマゴうみ', 'ねむる', 'こうごうせい', 'あさのひざし', 'つきのひかり', 'ミルクのみ', 'ねがいごと']),
  explode: new Set(['じばく', 'だいばくはつ', 'みちづれ', 'おきみやげ']),
  counter: new Set(['カウンター']),
  mirrorCoat: new Set(['ミラーコート']),
  baton: new Set(['バトンタッチ']),
  spikes: new Set(['まきびし']),
  screens: new Set(['リフレクター', 'ひかりのかべ']),
  sub: new Set(['みがわり']),
  ohko: new Set(['じわれ', 'ぜったいれいど', 'つのドリル', 'ハサミギロチン']),
  fixed: new Set(['ちきゅうなげ', 'ナイトヘッド']),
  flail: new Set(['きしかいせい', 'じたばた']),
  endeavor: new Set(['がむしゃら']),
};

// 型に努力値・実数値の記載がない場合の簡易配分
function guessEvs(base, moves, nature) {
  const phys = moves.filter((m) => m.power > 0 && m.physical).reduce((s, m) => s + m.power, 0);
  const spec = moves.filter((m) => m.power > 0 && !m.physical).reduce((s, m) => s + m.power, 0);
  const evs = [0, 0, 0, 0, 0, 0];
  const atk = phys >= spec ? 1 : 3;
  const offensive = phys + spec >= 180;
  if (offensive && base[5] >= 80) {
    evs[atk] = 252; evs[5] = 252; evs[0] = 4;
  } else if (offensive) {
    evs[0] = 252; evs[atk] = 252; evs[base[2] >= base[4] ? 2 : 4] = 4;
  } else {
    evs[0] = 252;
    const mod = NATURES[nature];
    const def = mod && (mod[0] === 2 || mod[0] === 4) ? mod[0] : base[2] <= base[4] ? 2 : 4;
    evs[def] = 252; evs[5] = 4;
  }
  return evs;
}

function guessNature(base, moves) {
  const phys = moves.filter((m) => m.power > 0 && m.physical).reduce((s, m) => s + m.power, 0);
  const spec = moves.filter((m) => m.power > 0 && !m.physical).reduce((s, m) => s + m.power, 0);
  const fast = base[5] >= 80;
  if (phys + spec < 180) return base[2] <= base[4] ? (phys >= spec ? 'わんぱく' : 'ずぶとい') : (phys >= spec ? 'しんちょう' : 'おだやか');
  if (phys >= spec) return fast ? 'ようき' : 'いじっぱり';
  return fast ? 'おくびょう' : 'ひかえめ';
}

const parseNums = (str) => (str ? str.split('-').map((x) => (x.includes('*') || x === '' ? null : Number(x))) : null);

// mon: 図鑑エントリ, setIndex: 型番号
export function buildMember(mon, setIndex = 0) {
  const set = mon.sets[setIndex];
  const moves = set.moves.map(resolveMove);
  const nature = set.nature || guessNature(mon.base, moves);
  const evList = parseNums(set.evs);
  const evs = evList && evList.length === 6 && evList.every((x) => x != null) ? evList : guessEvs(mon.base, moves, nature);
  const given = parseNums(set.stats);
  const stats = STAT_KEYS.map((_, i) => {
    if (given && given.length === 6 && given[i] != null) return given[i];
    return calcStat(i, mon.base[i], evs[i], nature);
  });
  const ability = set.ability || mon.abilities[0];
  const tags = {};
  for (const [tag, names] of Object.entries(MOVE_TAGS)) {
    tags[tag] = set.moves.some((m) => names.has(m));
  }
  // ゴーストの『のろい』は積み技ではない
  if (tags.curse && mon.types.includes('ghost')) tags.curse = false;
  return {
    id: `${mon.name}#${setIndex}`,
    name: mon.name,
    mon,
    setIndex,
    set,
    types: mon.types,
    ability,
    item: set.item,
    nature,
    evs,
    evsEstimated: !(evList && evList.length === 6 && evList.every((x) => x != null)),
    stats,
    moves,
    tags,
  };
}

// 表示用の役割ラベル
export function roleLabels(m) {
  const [H, A, B, C, D, S] = m.stats;
  const labels = [];
  const atk = m.moves.filter((x) => x.power > 0);
  const physPow = Math.max(0, ...atk.filter((x) => x.physical).map((x) => x.power)) * A;
  const specPow = Math.max(0, ...atk.filter((x) => !x.physical).map((x) => x.power)) * C;
  if (physPow >= 13000 || (m.item === 'こだわりハチマキ')) labels.push('物理アタッカー');
  if (specPow >= 13000) labels.push('特殊アタッカー');
  if (H * B >= 30000) labels.push('物理受け');
  if (H * D >= 36000) labels.push('特殊受け');
  if (m.tags.setupPhys || m.tags.setupSpec || m.tags.curse || m.tags.metalSound || m.tags.flail) labels.push('積み・崩し');
  if (m.tags.sleep || m.tags.para || m.tags.burn || m.tags.toxic) labels.push('状態異常撒き');
  if (m.tags.confuse && m.tags.sub) labels.push('いばみが');
  if (m.tags.phaze) labels.push('強制交代/積み対策');
  if (m.tags.encore) labels.push('アンコール/挑発');
  if (m.tags.counter || m.tags.mirrorCoat) labels.push('カウンター');
  if (m.tags.explode) labels.push('自主退場');
  if (m.tags.baton) labels.push('バトン');
  if (m.tags.spikes) labels.push('まきびし');
  if (m.tags.screens) labels.push('壁');
  if (S >= 150) labels.push('高速');
  return labels;
}
