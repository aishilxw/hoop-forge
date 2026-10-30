import type { Attributes, PlayStyle, TacticalPlan } from '../contracts';
export const DEFAULT_PLAN: TacticalPlan = {
  offense: 'balanced',
  defense: 'balanced',
  pace: 'normal',
  rotation: 'balanced',
  originalMinutes: 32,
};
export const STYLE_CONFIG: Record<PlayStyle, { usage: number; three: number; assist: number }> = {
  primaryCreator: { usage: 1.25, three: 0.4, assist: 1.0 },
  offBallScorer: { usage: 1.05, three: 0.68, assist: 0.75 },
  interiorAnchor: { usage: 1.1, three: 0.07, assist: 0.65 },
  teamOrganizer: { usage: 0.85, three: 0.32, assist: 1.3 },
};
/** Game-model coefficients, not a fitted NBA prediction model. Free-throw skill is estimated. */
export const SIM_CONFIG = {
  quarterPossessions: { base: 24, range: 3, slow: -3, fast: 3 },
  maxOvertimes: 20,
  maxSecondChances: 2,
  turnover: { base: 0.13, defense: 0.0015, organization: 0.0005, min: 0.04, max: 0.24 },
  inside: { base: 0.54, skill: 0.003, physical: 0.001, min: 0.28, max: 0.78 },
  outside: { base: 0.35, skill: 0.0025, min: 0.18, max: 0.55 },
  pass: { base: 0.58, skill: 0.004, min: 0.15, max: 0.75 },
  rebound: { base: 0.23, skill: 0.002, physical: 0.0005, min: 0.1, max: 0.4 },
  block: { base: 0.04, skill: 0.001, min: 0.01, max: 0.12 },
  stealShare: 0.6,
  foul: {
    shootingInside: 0.145,
    shootingThree: 0.07,
    nonShooting: 0.04,
    offensive: 0.006,
    pressureExtra: 0.016,
    andOneFactor: 0.45,
    limit: 6,
    bonusAt: 5,
  },
  freeThrow: { base: 0.67, outsideSkill: 0.003, organizationSkill: 0.001, min: 0.55, max: 0.93 },
  fatigue: {
    drain: 1.1,
    recovery: 1.65,
    fastMultiplier: 1.25,
    benchMultiplier: 0.9,
    skillThreshold: 78,
    penalty: 0.0018,
    maxPenalty: 0.13,
  },
  homeAdvantage: 0.009,
  actorThree: { guard: 0.4, wing: 0.36, big: 0.22, skillDifference: 0.004, min: 0.03, max: 0.65 },
  offense: {
    balanced: { three: 0, accuracy: 0, turnover: 0, passing: 0 },
    attackPaint: { three: -0.23, accuracy: 0.012, turnover: 0.013, passing: -0.03 },
    perimeter: { three: 0.23, accuracy: -0.005, turnover: -0.008, passing: 0.03 },
    pickAndRoll: { three: -0.04, accuracy: 0.012, turnover: 0.015, passing: 0.13 },
  },
  defense: {
    balanced: { inside: 0, outside: 0 },
    protectPaint: { inside: 5, outside: -4 },
    pressurePerimeter: { inside: -3, outside: 5 },
  },
};
export const baseAttributes = (value: number): Attributes => ({
  insideScoring: value,
  outsideScoring: value,
  interiorDefense: value,
  perimeterDefense: value,
  playmaking: value,
  ballHandling: value,
  speed: value,
  physicality: value,
  rebounding: value,
});
