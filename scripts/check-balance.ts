import { writeFileSync } from 'node:fs';
import {
  ATTRIBUTE_KEYS,
  type CareerState,
  type CommandPayload,
  type GameCommand,
} from '../src/contracts';
import { catalog } from '../src/data/catalog';
import { applyCommand, createCareer } from '../src/domain';
let wins = 0,
  games = 0,
  titles = 0,
  points = 0,
  maxBytes = 0;
const seasons: number[] = [];
for (let seed = 1; seed <= 12; seed++) {
  const created = createCareer(seed, catalog);
  if (!created.ok) throw Error(created.error.code);
  let state = created.value;
  const used = new Set<string>();
  const assignments = {} as Record<(typeof ATTRIBUTE_KEYS)[number], string>;
  for (const key of ATTRIBUTE_KEYS) {
    const ranked = state.initialCards
      .filter((c) => !used.has(c.instanceId))
      .sort(
        (a, b) =>
          catalog.players.find((p) => p.playerId === b.playerId)!.attributes[key] -
          catalog.players.find((p) => p.playerId === a.playerId)!.attributes[key],
      );
    assignments[key] = ranked[0].instanceId;
    used.add(ranked[0].instanceId);
  }
  function act(payload: CommandPayload) {
    const result = applyCommand(
      state,
      {
        ...payload,
        commandId: `batch-${state.revision}`,
        expectedRevision: state.revision,
      } as GameCommand,
      catalog,
    );
    if (!result.ok) throw Error(result.error.code);
    state = result.value;
  }
  act({ type: 'CONFIRM_DRAFT', name: '批量测试', assignments, style: 'primaryCreator' });
  let guard = 0;
  while (state.phase !== 'seasonSummary' && guard++ < 300) {
    if (state.phase === 'ready') act({ type: 'PLAY_NEXT_MATCH' });
    else if (state.phase === 'offseason') act({ type: 'START_NEXT_SEASON' });
    else act({ type: 'ACK_MATCH_RESULT' });
  }
  if (state.phase !== 'seasonSummary') throw Error('Lifecycle did not finish');
  titles += state.championships;
  for (const m of state.matches) {
    games++;
    wins += Number(m.won);
    points += m.homeBox[0].points;
  }
  seasons.push(
    state.matches.filter((m) => m.input.season === 1).reduce((n, m) => n + Number(m.won), 0),
  );
  maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(state)));
}
const report = {
  careers: 12,
  games,
  wins,
  winRate: wins / games,
  championships: titles,
  meanPlayerPoints: points / games,
  maxSaveBytes: maxBytes,
  method:
    '固定种子1–12，九维顺序贪心选不同卡，持球核心，不抽卡不训练；验证基线，不代表真实玩家留存或完整平衡。',
  dataStatus: catalog.status,
  dataVersion: catalog.dataVersion,
};
writeFileSync('docs/qa/balance-report-v02.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
