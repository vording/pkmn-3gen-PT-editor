// 技データ（オリジナル名称）
// power: 0 は変化技 / accuracy: null は必中 / target: 'self' は自分対象
// status: { cond, chance } 状態異常（chance 省略時は100%）
// boosts: 自分の能力変化 / foeBoosts: 相手の能力変化（foeBoostChance%）
// critRatio: 急所ランク / recoil: 与ダメージに対する反動割合 / drain: 吸収割合
// heal: 最大HPに対する回復割合 / weather: 天気変化 / flinch: ひるみ確率%

export const MOVES = {
  rush: { name: '猛突進', type: 'normal', power: 80, accuracy: 100, pp: 15, contact: true },
  quickflash: { name: '電光一閃', type: 'normal', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true },
  warcry: { name: '鬨の声', type: 'normal', power: 0, accuracy: null, pp: 20, target: 'self', boosts: { atk: 2 } },
  mendlight: { name: '癒しの光', type: 'normal', power: 0, accuracy: null, pp: 10, target: 'self', heal: 0.5 },
  glare: { name: '威圧の咆哮', type: 'normal', power: 0, accuracy: 100, pp: 30, foeBoosts: { atk: -1 } },

  flameshot: { name: '火炎弾', type: 'fire', power: 90, accuracy: 100, pp: 15, status: { cond: 'brn', chance: 10 } },
  scorchwave: { name: '灼熱波', type: 'fire', power: 120, accuracy: 85, pp: 5, status: { cond: 'brn', chance: 30 } },
  sunrite: { name: '陽光招来', type: 'fire', power: 0, accuracy: null, pp: 5, target: 'self', weather: 'sun' },

  torrent: { name: '水流撃', type: 'water', power: 90, accuracy: 100, pp: 15 },
  vortexcannon: { name: '渦潮砲', type: 'water', power: 120, accuracy: 80, pp: 5 },
  rainprayer: { name: '降雨の祈り', type: 'water', power: 0, accuracy: null, pp: 5, target: 'self', weather: 'rain' },

  leafdance: { name: '葉刃乱舞', type: 'grass', power: 90, accuracy: 100, pp: 15, critRatio: 1 },
  vinedrain: { name: '吸精の蔓', type: 'grass', power: 75, accuracy: 100, pp: 10, drain: 0.5 },
  sleepspores: { name: '眠り胞子', type: 'grass', power: 0, accuracy: 75, pp: 15, status: { cond: 'slp' } },

  voltstrike: { name: '雷撃', type: 'electric', power: 90, accuracy: 100, pp: 15, status: { cond: 'par', chance: 10 } },
  staticnet: { name: '放電網', type: 'electric', power: 0, accuracy: 100, pp: 20, status: { cond: 'par' } },

  frostlance: { name: '氷結槍', type: 'ice', power: 90, accuracy: 100, pp: 10, status: { cond: 'frz', chance: 10 } },
  hailcall: { name: '氷雨招来', type: 'ice', power: 0, accuracy: null, pp: 5, target: 'self', weather: 'hail' },

  crushfist: { name: '破砕拳', type: 'fighting', power: 75, accuracy: 100, pp: 15, contact: true },
  recklesskick: { name: '捨て身蹴り', type: 'fighting', power: 110, accuracy: 90, pp: 10, contact: true, recoil: 1 / 3 },

  venomfang: { name: '毒牙', type: 'poison', power: 80, accuracy: 100, pp: 15, contact: true, status: { cond: 'psn', chance: 30 } },
  toxicmist: { name: '猛毒霧', type: 'poison', power: 0, accuracy: 85, pp: 10, status: { cond: 'tox' } },

  quake: { name: '大地震動', type: 'ground', power: 100, accuracy: 100, pp: 10 },

  galewing: { name: '疾風翼', type: 'flying', power: 60, accuracy: null, pp: 20, contact: true },
  skydive: { name: '急降下', type: 'flying', power: 90, accuracy: 95, pp: 15, contact: true },

  mindwave: { name: '念動波', type: 'psychic', power: 90, accuracy: 100, pp: 10, foeBoosts: { spd: -1 }, foeBoostChance: 10 },
  focusmind: { name: '精神統一', type: 'psychic', power: 0, accuracy: null, pp: 20, target: 'self', boosts: { spa: 1, spd: 1 } },

  shellblade: { name: '甲殻刃', type: 'bug', power: 80, accuracy: 100, pp: 15, contact: true },

  rockfall: { name: '岩石落とし', type: 'rock', power: 75, accuracy: 90, pp: 10, flinch: 30 },
  sandcall: { name: '砂塵招来', type: 'rock', power: 0, accuracy: null, pp: 5, target: 'self', weather: 'sand' },

  umbralclaw: { name: '冥府の爪', type: 'ghost', power: 70, accuracy: 100, pp: 15, contact: true, critRatio: 1 },

  wyrmbreath: { name: '竜の吐息', type: 'dragon', power: 60, accuracy: 100, pp: 20, status: { cond: 'par', chance: 30 } },
  wyrmdance: { name: '竜鱗の舞', type: 'dragon', power: 0, accuracy: null, pp: 20, target: 'self', boosts: { atk: 1, spe: 1 } },

  ambush: { name: '闇討ち', type: 'dark', power: 80, accuracy: 100, pp: 15, contact: true, flinch: 20 },

  ironram: { name: '鋼鉄頭突き', type: 'steel', power: 100, accuracy: 90, pp: 15, contact: true },
  guardstance: { name: '守りの構え', type: 'steel', power: 0, accuracy: null, pp: 20, target: 'self', boosts: { def: 2 } },
};

// PPが尽きたときの技（タイプなし・必中・反動1/4）
export const STRUGGLE = {
  id: 'struggle', name: '捨て鉢の一撃', type: null, power: 50, accuracy: null, pp: 1, contact: true, recoil: 1 / 4,
};

for (const [id, move] of Object.entries(MOVES)) move.id = id;
