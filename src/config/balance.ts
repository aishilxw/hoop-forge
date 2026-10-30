export const RULES_VERSION = '0.3.0';
export const BALANCE = {
  standardPack: 240,
  positionPack: 360,
  starChance: 0.1,
  trainingCoins: 100,
  baseReward: 20,
  winReward: 15,
  regularGames: 82,
  maxSeasons: 1000,
  attributeMin: 25,
  attributeMax: 99,
} as const;
export const trainingCards = (value: number): number => (value < 80 ? 3 : value < 90 ? 4 : 6);
