import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  type Attributes,
  type CardInstance,
  type CareerState,
  type Catalog,
  type GameCommand,
  type Result,
  type OriginalPlayer,
  type AttributeKey,
} from '../contracts';
import { BALANCE, RULES_VERSION, trainingCards } from '../config/balance';
import { NBA_TEAMS } from '../data/teams';
import { advanceRegular, createLeague, progressPostseason, rosterFor, userEntry } from './league';
import { clamp, hashSeed, Random } from './rng';
import { simulateMatch, simulateThroughQuarter } from './simulation';
import { isValidPlan, prepareMatchInput, settleMatch } from './featured';
export { isFeaturedMatch, FEATURED_REGULAR_INDICES } from './featured';
export { simulateMatch, calculateMatchReward } from './simulation';
export { buildScoutReport, buildSeasonSummary } from './reports';
const failure = <T>(code: string): Result<T> => ({ ok: false, error: { code } });
const success = <T>(value: T): Result<T> => ({ ok: true, value });
/** Object field order can change after schema parsing; compare deterministic values instead. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      );
    }
    return item;
  });
}
function validCatalog(catalog: Catalog): boolean {
  const ids = new Set(catalog.players.map((p) => p.playerId));
  const stars = new Set(catalog.starIds);
  return (
    ids.size === catalog.players.length &&
    stars.size === catalog.starIds.length &&
    catalog.starIds.every((id) => ids.has(id)) &&
    stars.size >= 5 &&
    ids.size - stars.size >= 15 &&
    catalog.players.every((p) =>
      ATTRIBUTE_KEYS.every(
        (k) => Number.isInteger(p.attributes[k]) && p.attributes[k] >= 25 && p.attributes[k] <= 99,
      ),
    )
  );
}
function card(
  playerId: string,
  careerId: string,
  sequence: number,
  acquiredBy: CardInstance['acquiredBy'],
): CardInstance {
  return {
    instanceId: `${careerId}-card-${sequence}`,
    playerId,
    acquisitionSequence: sequence,
    acquiredBy,
  };
}
export function createCareer(seed: number, catalog: Catalog): Result<CareerState> {
  if (!Number.isInteger(seed) || !validCatalog(catalog)) return failure('DATA_INVALID');
  const rng = new Random(seed);
  const starSet = new Set(catalog.starIds);
  const selected = [
    ...rng.shuffle(catalog.players.filter((p) => starSet.has(p.playerId))).slice(0, 5),
    ...rng.shuffle(catalog.players.filter((p) => !starSet.has(p.playerId))).slice(0, 15),
  ];
  const careerId = `career-${seed >>> 0}`;
  const cards = selected.map((p, i) => card(p.playerId, careerId, i, 'initialDraft'));
  return success({
    schemaVersion: 2,
    rulesVersion: RULES_VERSION,
    dataVersion: catalog.dataVersion,
    careerId,
    revision: 0,
    careerSeed: seed >>> 0,
    rngState: rng.state,
    phase: 'draft',
    initialCards: cards,
    inventory: cards,
    player: null,
    coins: 0,
    season: 1,
    schedule: [],
    scheduleIndex: 0,
    matches: [],
    currentMatchId: null,
    regularWins: 0,
    seriesWins: 0,
    seriesLosses: 0,
    championships: 0,
    milestones: [],
    appliedCommandIds: [],
    growthLog: [],
    selectedTeamId: null,
    league: null,
    seasonArchives: [],
    activeMatch: null,
  });
}
function ownCard(state: CareerState, catalog: Catalog, id: string) {
  const instance = state.inventory.find((c) => c.instanceId === id);
  const definition = instance && catalog.players.find((p) => p.playerId === instance.playerId);
  return instance && definition ? { instance, definition } : null;
}
function attributeValid(key: AttributeKey): boolean {
  return ATTRIBUTE_KEYS.includes(key);
}
const styleValid = (value: string) =>
  ['primaryCreator', 'offBallScorer', 'interiorAnchor', 'teamOrganizer'].includes(value);
/** A command is an atomic pure state transition. Persistence is owned by application. */
export function applyCommand(
  state: CareerState,
  command: GameCommand,
  catalog: Catalog,
): Result<CareerState> {
  if (state.appliedCommandIds.includes(command.commandId)) return success(state);
  if (command.expectedRevision !== state.revision) return failure('STALE_REVISION');
  if (state.dataVersion !== catalog.dataVersion || state.rulesVersion !== RULES_VERSION)
    return failure('VERSION_MISMATCH');
  const next = structuredClone(state);
  const editable = next.phase === 'ready' || next.phase === 'offseason';
  switch (command.type) {
    case 'CONFIRM_DRAFT': {
      if (next.phase !== 'draft') return failure('INVALID_PHASE');
      const name = command.name.trim();
      if (!name || name.length > 24 || !styleValid(command.style))
        return failure('INVALID_ASSIGNMENT');
      const ids = ATTRIBUTE_KEYS.map((k) => command.assignments[k]);
      if (new Set(ids).size !== 9) return failure('INVALID_ASSIGNMENT');
      const attributes = {} as Attributes;
      const lineage = {} as OriginalPlayer['lineage'];
      for (const k of ATTRIBUTE_KEYS) {
        const owned = ownCard(next, catalog, command.assignments[k]);
        if (!owned) return failure('CARD_NOT_FOUND');
        attributes[k] = owned.definition.attributes[k];
        lineage[k] = {
          initialPlayerId: owned.instance.playerId,
          inheritedFromPlayerId: owned.instance.playerId,
          trainedPoints: 0,
        };
      }
      const teamId = command.teamId ?? NBA_TEAMS[0].id;
      if (
        !NBA_TEAMS.some((t) => t.id === teamId) ||
        NBA_TEAMS.some((t) => rosterFor(t.id, catalog).length < 8)
      )
        return failure('DATA_INVALID');
      next.selectedTeamId = teamId;
      next.league = createLeague(
        hashSeed(`${next.careerSeed}:schedule:${next.season}`),
        next.season,
      );
      next.player = {
        displayName: name,
        attributes,
        playStyle: command.style,
        lineage,
        age: 19,
        condition: 100,
      };
      next.inventory = next.inventory.filter((c) => !ids.includes(c.instanceId));
      next.schedule = next
        .league!.games.filter(
          (g) => g.homeTeamId === next.selectedTeamId || g.awayTeamId === next.selectedTeamId,
        )
        .map((g) => userEntry(g, next, catalog));
      next.phase = 'ready';
      break;
    }
    case 'BUY_PACK': {
      if (!editable) return failure('INVALID_PHASE');
      if (command.position && !['guard', 'wing', 'big'].includes(command.position))
        return failure('DATA_INVALID');
      const cost = command.position ? BALANCE.positionPack : BALANCE.standardPack;
      if (next.coins < cost) return failure('INSUFFICIENT_COINS');
      const rng = new Random(next.rngState);
      const stars = new Set(catalog.starIds);
      const candidates = catalog.players.filter(
        (p) => !command.position || p.drawPosition === command.position,
      );
      const starPool = candidates.filter((p) => stars.has(p.playerId)),
        normalPool = candidates.filter((p) => !stars.has(p.playerId));
      if (!starPool.length || !normalPool.length) return failure('DATA_INVALID');
      const player = rng.pick(rng.next() < BALANCE.starChance ? starPool : normalPool);
      next.inventory.push(
        card(
          player.playerId,
          next.careerId,
          next.revision + 20,
          command.position ? 'positionPack' : 'standardPack',
        ),
      );
      next.rngState = rng.state;
      next.coins -= cost;
      break;
    }
    case 'INHERIT_ATTRIBUTE': {
      if (!editable || !next.player) return failure('INVALID_PHASE');
      if (!attributeValid(command.attribute)) return failure('INVALID_ASSIGNMENT');
      const owned = ownCard(next, catalog, command.instanceId);
      if (!owned) return failure('CARD_NOT_FOUND');
      const value = owned.definition.attributes[command.attribute];
      const previous = next.player.attributes[command.attribute];
      next.player.attributes[command.attribute] = Math.max(previous, value);
      if (value > previous) {
        next.player.lineage[command.attribute].inheritedFromPlayerId = owned.instance.playerId;
        next.player.lineage[command.attribute].trainedPoints = 0;
      }
      next.inventory = next.inventory.filter((c) => c.instanceId !== command.instanceId);
      next.growthLog.push(
        `${ATTRIBUTE_LABELS[command.attribute]}盲选${owned.definition.nameZh || owned.definition.nameEn}：来源${value}，原${previous}→现${Math.max(previous, value)}；已消耗来源卡`,
      );
      break;
    }
    case 'TRAIN_ATTRIBUTE': {
      if (!editable || !next.player) return failure('INVALID_PHASE');
      if (!attributeValid(command.attribute)) return failure('INVALID_ASSIGNMENT');
      const value = next.player.attributes[command.attribute];
      if (value >= 99) return failure('ATTRIBUTE_MAXED');
      const count = trainingCards(value);
      if (command.instanceIds.length !== count || new Set(command.instanceIds).size !== count)
        return failure('INSUFFICIENT_CARDS');
      if (command.instanceIds.some((id) => !ownCard(next, catalog, id)))
        return failure('CARD_NOT_FOUND');
      if (next.coins < BALANCE.trainingCoins) return failure('INSUFFICIENT_COINS');
      next.coins -= BALANCE.trainingCoins;
      next.inventory = next.inventory.filter((c) => !command.instanceIds.includes(c.instanceId));
      next.player.attributes[command.attribute]++;
      next.player.lineage[command.attribute].trainedPoints++;
      next.growthLog.push(`${ATTRIBUTE_LABELS[command.attribute]}训练提升至${value + 1}`);
      break;
    }
    case 'SET_PLAY_STYLE': {
      if (!editable || !next.player) return failure('INVALID_PHASE');
      if (!styleValid(command.style)) return failure('INVALID_ASSIGNMENT');
      next.player.playStyle = command.style;
      break;
    }
    case 'PLAY_NEXT_MATCH': {
      if (next.phase !== 'ready' || !next.player || !next.league || !next.selectedTeamId)
        return failure('INVALID_PHASE');
      const entry = next.schedule[next.scheduleIndex];
      const game = next.league.games.find((g) => g.id === entry?.leagueGameId);
      if (!game || game.homeScore !== undefined) return failure('INVALID_PHASE');
      try {
        if (entry.stage === 'regular') advanceRegular(next, catalog, game.day);
        const result = simulateMatch(prepareMatchInput(next, catalog));
        settleMatch(next, result, catalog);
      } catch {
        return failure('SIMULATION_FAILED');
      }
      break;
    }
    case 'START_FEATURED_MATCH': {
      if (next.phase !== 'ready' || !next.player || !next.league || !next.selectedTeamId)
        return failure('INVALID_PHASE');
      const entry = next.schedule[next.scheduleIndex];
      const game = next.league.games.find((g) => g.id === entry?.leagueGameId);
      if (!game || game.homeScore !== undefined) return failure('INVALID_PHASE');
      try {
        if (entry.stage === 'regular') advanceRegular(next, catalog, game.day);
        prepareMatchInput(next, catalog);
        next.activeMatch = {
          matchId: entry.matchId,
          completedQuarters: 0,
          plans: [],
          preview: null,
        };
        next.phase = 'live';
      } catch {
        return failure('SIMULATION_FAILED');
      }
      break;
    }
    case 'PLAY_FEATURED_QUARTER': {
      if (next.phase !== 'live' || !next.activeMatch || !next.player || !next.league)
        return failure('INVALID_PHASE');
      if (!isValidPlan(command.plan, next, catalog)) return failure('INVALID_PLAN');
      const active = next.activeMatch;
      if (
        active.completedQuarters >= 4 ||
        active.matchId !== next.schedule[next.scheduleIndex]?.matchId ||
        active.plans.length !== active.completedQuarters
      )
        return failure('INVALID_PHASE');
      try {
        const plans = [...active.plans, structuredClone(command.plan)];
        const input = prepareMatchInput(next, catalog, false);
        input.quarterPlans = plans;
        if (active.preview && active.completedQuarters > 0) {
          const expected = simulateThroughQuarter(input, active.plans, active.completedQuarters);
          const original = active.preview;
          if (
            stableJson([
              expected.homeScore,
              expected.awayScore,
              expected.homeBox,
              expected.awayBox,
              expected.events,
            ]) !==
            stableJson([
              original.homeScore,
              original.awayScore,
              original.homeBox,
              original.awayBox,
              original.events,
            ])
          )
            return failure('SIMULATION_PREFIX_CHANGED');
        }
        const result = simulateThroughQuarter(input, plans, active.completedQuarters + 1);
        const previous = active.preview;
        if (previous) {
          const prefix = result.events.filter((e) => e.quarter <= active.completedQuarters);
          if (
            stableJson(prefix) !== stableJson(previous.events) ||
            stableJson(result.quarters?.slice(0, active.completedQuarters)) !==
              stableJson(previous.quarters)
          )
            return failure('SIMULATION_PREFIX_CHANGED');
        }
        if (active.completedQuarters + 1 === 4) {
          result.featured = true;
          settleMatch(next, result, catalog);
        } else {
          result.reward = 0;
          delete result.input.ownRoster;
          delete result.input.opponentRoster;
          active.completedQuarters++;
          active.plans = plans;
          active.preview = result;
        }
      } catch {
        return failure('SIMULATION_FAILED');
      }
      break;
    }
    case 'RETIRE_PLAYER': {
      if (next.phase !== 'offseason' || !next.player) return failure('INVALID_PHASE');
      next.phase = 'finished';
      next.activeMatch = null;
      next.milestones.push(`retired:s${next.season}`);
      next.growthLog.push(
        `第${next.season}季结束，${next.player.age ?? 19}岁的${next.player.displayName}选择退役，生涯档案永久保留。`,
      );
      break;
    }
    case 'ACK_MATCH_RESULT': {
      if (next.phase === 'seasonSummary') {
        next.phase = 'offseason';
        break;
      }
      if (next.phase !== 'result' || !next.league) return failure('INVALID_PHASE');
      const entry = next.schedule[next.scheduleIndex];
      next.scheduleIndex++;
      if (entry.stage === 'regular' && next.scheduleIndex < 82) next.phase = 'ready';
      else {
        try {
          progressPostseason(next, catalog);
        } catch {
          return failure('SIMULATION_FAILED');
        }
      }
      break;
    }
    case 'START_NEXT_SEASON': {
      if (next.phase !== 'offseason' || next.season >= 1000) return failure('INVALID_PHASE');
      if ((next.player?.age ?? 19) >= 120) return failure('CAREER_LIMIT_REACHED');
      next.player!.age = (next.player!.age ?? 19) + 1;
      next.player!.condition = 100;
      const age = next.player!.age;
      const changes: string[] = [];
      if (age <= 24) {
        const development = new Random(
          hashSeed(`${next.careerSeed}:development:${next.season + 1}`),
        );
        for (const key of development.shuffle([...ATTRIBUTE_KEYS]).slice(0, 2)) {
          const old = next.player!.attributes[key];
          next.player!.attributes[key] = clamp(old + 1, 25, 99);
          if (old !== next.player!.attributes[key]) changes.push(`${ATTRIBUTE_LABELS[key]}+1`);
        }
      } else if (age >= 30) {
        const decline = age >= 37 ? 3 : age >= 34 ? 2 : 1;
        for (const key of ['speed', 'physicality'] as const) {
          const old = next.player!.attributes[key];
          next.player!.attributes[key] = clamp(old - decline, 25, 99);
          if (old !== next.player!.attributes[key])
            changes.push(`${ATTRIBUTE_LABELS[key]}-${old - next.player!.attributes[key]}`);
        }
      }
      next.growthLog.push(
        `休赛期：${age}岁，体能恢复至100${changes.length ? `，${changes.join('、')}（游戏成长模型）` : '，能力保持稳定'}。`,
      );
      next.activeMatch = null;
      next.season++;
      next.regularWins = 0;
      next.seriesWins = 0;
      next.seriesLosses = 0;
      next.scheduleIndex = 0;
      next.currentMatchId = null;
      next.league = createLeague(
        hashSeed(`${next.careerSeed}:schedule:${next.season}`),
        next.season,
      );
      next.schedule = next.league.games
        .filter((g) => g.homeTeamId === next.selectedTeamId || g.awayTeamId === next.selectedTeamId)
        .map((g) => userEntry(g, next, catalog));
      next.phase = 'ready';
      break;
    }
    default:
      return failure('INVALID_ASSIGNMENT');
  }
  next.revision++;
  next.appliedCommandIds.push(command.commandId);
  return success(next);
}
