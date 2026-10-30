import { writeFileSync } from 'node:fs';
import { ATTRIBUTE_KEYS, type MatchInput, type OriginalPlayer } from '../src/contracts';
import { catalog } from '../src/data/catalog';
import { DEFAULT_PLAN } from '../src/config/simulation';
import { simulateMatch } from '../src/domain/simulation';
const own = catalog.players.filter((p) => p.teamLabel === 'BOS'),
  opponent = catalog.players.filter((p) => p.teamLabel === 'LAL');
const attributes = Object.fromEntries(
  ATTRIBUTE_KEYS.map((k) => [k, 80]),
) as OriginalPlayer['attributes'];
const player: OriginalPlayer = {
  displayName: '模型基线球员',
  attributes,
  playStyle: 'primaryCreator',
  condition: 100,
  lineage: Object.fromEntries(
    ATTRIBUTE_KEYS.map((k) => [
      k,
      {
        initialPlayerId: own[0].playerId,
        inheritedFromPlayerId: own[0].playerId,
        trainedPoints: 0,
      },
    ]),
  ) as OriginalPlayer['lineage'],
};
const totals = {
  points: 0,
  rebounds: 0,
  assists: 0,
  turnovers: 0,
  fta: 0,
  ftm: 0,
  fga: 0,
  fgm: 0,
  threePA: 0,
  threePM: 0,
  fouls: 0,
};
let homeWins = 0,
  awayWins = 0,
  fresh = 0,
  tired = 0,
  perimeter = 0,
  paint = 0,
  invalidMinutes = 0;
for (let seed = 1; seed <= 120; seed++) {
  const input: MatchInput = {
    matchId: `metrics-${seed}`,
    seed,
    season: 1,
    stage: 'regular',
    player,
    opponent: { id: 'LAL', name: '洛杉矶湖人', attributes, style: 'primaryCreator' },
    ownRoster: own,
    opponentRoster: opponent,
    ownTeamId: 'BOS',
    opponentTeamId: 'LAL',
    isHome: true,
  };
  const result = simulateMatch(input);
  for (const boxes of [result.homeBox, result.awayBox])
    for (const b of boxes) {
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += b[key] ?? 0;
      if (b.minutes < 0) invalidMinutes++;
    }
  homeWins += Number(result.won);
  awayWins += Number(simulateMatch({ ...input, isHome: false }).won);
  fresh += result.homeBox[0].points;
  tired += simulateMatch({ ...input, player: { ...player, condition: 35 } }).homeBox[0].points;
  for (const [offense, total] of [
    ['perimeter', 'perimeter'],
    ['attackPaint', 'paint'],
  ] as const) {
    const r = simulateMatch({
      ...input,
      quarterPlans: Array.from({ length: 4 }, () => ({ ...DEFAULT_PLAN, offense })),
    });
    const threes = r.homeBox.reduce((n, b) => n + b.threePA, 0);
    if (total === 'perimeter') perimeter += threes;
    else paint += threes;
  }
}
const rounded = (n: number) => Math.round(n * 100) / 100;
const report = {
  method: '120固定种子；BOS对LAL＋九维80原创球员。此为模型基线与趋势验证，不是现实NBA数据拟合。',
  perTeamPerGame: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, rounded(v / 240)])),
  fgPercent: rounded((totals.fgm / totals.fga) * 100),
  threePercent: rounded((totals.threePM / totals.threePA) * 100),
  homeOwnWinRate: homeWins / 120,
  awayOwnWinRate: awayWins / 120,
  originalMeanPoints: fresh / 120,
  tiredOriginalMeanPoints: tired / 120,
  perimeterThreePA: perimeter / 120,
  paintThreePA: paint / 120,
  negativeMinuteBoxes: invalidMinutes,
};
writeFileSync('docs/qa/simulation-v03-metrics.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
