import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  type CareerState,
  type OriginalPlayer,
} from '../contracts';
/** Deterministic observations only; these are not generated AI commentary. */
export function buildScoutReport(player: OriginalPlayer): string[] {
  const ranked = [...ATTRIBUTE_KEYS].sort((a, b) => player.attributes[b] - player.attributes[a]);
  const strongest = ranked[0],
    weakest = ranked[ranked.length - 1];
  return [
    `${player.age ?? 19}岁，当前体能${Math.round(player.condition ?? 100)}。成长和年龄衰退采用游戏模型，并非现实球员预测。`,
    `${ATTRIBUTE_LABELS[strongest]}是当前最强能力（${player.attributes[strongest]}）。`,
    `${ATTRIBUTE_LABELS[weakest]}相对偏弱（${player.attributes[weakest]}），可优先寻找对应继承卡。`,
    player.attributes.outsideScoring > player.attributes.ballHandling + 8
      ? '投射强于运球，可以尝试无球得分手，减少持球失误风险。'
      : player.attributes.playmaking > player.attributes.insideScoring + 8
        ? '组织强于内线终结，可以尝试团队组织者，为队友创造机会。'
        : '选择符合属性长处的打法，并结合多场表现判断效果。',
  ];
}
export function buildSeasonSummary(state: CareerState) {
  const games = state.matches.filter((m) => m.input.season === state.season);
  const totals = games.reduce(
    (sum, m) => {
      const b = m.homeBox[0];
      return {
        points: sum.points + b.points,
        rebounds: sum.rebounds + b.rebounds,
        assists: sum.assists + b.assists,
        turnovers: sum.turnovers + b.turnovers,
        fgm: sum.fgm + b.fgm,
        fga: sum.fga + b.fga,
        threePM: sum.threePM + b.threePM,
        ftm: sum.ftm + (b.ftm ?? 0),
        fta: sum.fta + (b.fta ?? 0),
      };
    },
    {
      points: 0,
      rebounds: 0,
      assists: 0,
      turnovers: 0,
      fgm: 0,
      fga: 0,
      threePM: 0,
      ftm: 0,
      fta: 0,
    },
  );
  const n = games.length;
  const average = (value: number) => (n ? Math.round((value / n) * 10) / 10 : 0);
  return {
    games: n,
    wins: games.filter((m) => m.won).length,
    losses: games.filter((m) => !m.won).length,
    points: average(totals.points),
    rebounds: average(totals.rebounds),
    assists: average(totals.assists),
    turnovers: average(totals.turnovers),
    effectiveFieldGoal: totals.fga ? (totals.fgm + 0.5 * totals.threePM) / totals.fga : 0,
    freeThrowPercentage: totals.fta ? totals.ftm / totals.fta : 0,
    champion: state.milestones.includes(`s${state.season}:champion`),
    notes: state.player ? buildScoutReport(state.player) : [],
  };
}
