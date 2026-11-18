// タイプ定義と相性表（第三世代：フェアリーなし、ゴースト・あくは鋼に半減、物理/特殊はタイプで決まる）

export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel',
];

export const TYPE_NAMES = {
  normal: 'ノーマル', fire: 'ほのお', water: 'みず', electric: 'でんき', grass: 'くさ', ice: 'こおり',
  fighting: 'かくとう', poison: 'どく', ground: 'じめん', flying: 'ひこう', psychic: 'エスパー',
  bug: 'むし', rock: 'いわ', ghost: 'ゴースト', dragon: 'ドラゴン', dark: 'あく', steel: 'はがね',
};

// 『めざめるパワー○』の表記 → タイプ
export const HIDDEN_POWER_TYPES = {
  飛: 'flying', 格: 'fighting', 草: 'grass', 氷: 'ice', 炎: 'fire', 水: 'water', 霊: 'ghost',
  虫: 'bug', 岩: 'rock', 悪: 'dark', 竜: 'dragon', 超: 'psychic', 電: 'electric', 地: 'ground',
  毒: 'poison', 鋼: 'steel',
};

export const TYPE_COLORS = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#d9b800', grass: '#5fae3c',
  ice: '#6fc8c4', fighting: '#c22e28', poison: '#a33ea1', ground: '#c9a649', flying: '#9a86e8',
  psychic: '#f95587', bug: '#94a81a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc',
  dark: '#705746', steel: '#9a9ab8',
};

// 第三世代では技の物理/特殊はタイプで決まる
export const PHYSICAL_TYPES = new Set([
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
]);

export function isPhysicalType(type) {
  // タイプなし（悪あがき相当）は物理扱い
  return type == null || PHYSICAL_TYPES.has(type);
}

// 攻撃タイプ -> { 防御タイプ: 倍率 }（記載なしは等倍）
export const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5,
    rock: 2, dragon: 0.5, steel: 0.5,
  },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2,
    ghost: 0, dark: 2, steel: 2,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5,
    dark: 2, steel: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
  dragon: { dragon: 2, steel: 0.5 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5 },
};

export function typeEffectiveness(moveType, defenderTypes) {
  if (moveType == null) return 1;
  const row = TYPE_CHART[moveType] ?? {};
  return defenderTypes.reduce((mult, t) => mult * (row[t] ?? 1), 1);
}
