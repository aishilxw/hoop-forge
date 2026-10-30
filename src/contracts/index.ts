export const ATTRIBUTE_KEYS = [
  'insideScoring',
  'outsideScoring',
  'interiorDefense',
  'perimeterDefense',
  'playmaking',
  'ballHandling',
  'speed',
  'physicality',
  'rebounding',
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  insideScoring: '内线得分',
  outsideScoring: '外线得分',
  interiorDefense: '内线防守',
  perimeterDefense: '外线防守',
  playmaking: '组织',
  ballHandling: '运球',
  speed: '速度',
  physicality: '身体',
  rebounding: '篮板',
};
export type Attributes = Record<AttributeKey, number>;
export type DrawPosition = 'guard' | 'wing' | 'big';
export type PlayStyle = 'primaryCreator' | 'offBallScorer' | 'interiorAnchor' | 'teamOrganizer';
export const STYLE_LABELS: Record<PlayStyle, string> = {
  primaryCreator: '持球核心',
  offBallScorer: '无球得分手',
  interiorAnchor: '内线支柱',
  teamOrganizer: '团队组织者',
};
export interface PlayerDefinition {
  playerId: string;
  nameEn: string;
  nameZh: string | null;
  teamLabel: string;
  drawPosition: DrawPosition;
  attributes: Attributes;
  dataVersion: string;
  evidence: Record<
    AttributeKey,
    { kind: 'derived' | 'estimated'; confidence: 'high' | 'medium' | 'low'; sourceRefs: string[] }
  >;
}
export interface Catalog {
  players: PlayerDefinition[];
  starIds: string[];
  dataVersion: string;
  asOfDate: string;
  status: 'fixture' | 'partial' | 'verified';
  notes: string[];
}
export interface CardInstance {
  instanceId: string;
  playerId: string;
  acquiredBy: 'initialDraft' | 'standardPack' | 'positionPack';
  acquisitionSequence: number;
}
export interface OriginalPlayer {
  age?: number;
  condition?: number;
  displayName: string;
  attributes: Attributes;
  playStyle: PlayStyle;
  lineage: Record<
    AttributeKey,
    { initialPlayerId: string; inheritedFromPlayerId: string; trainedPoints: number }
  >;
}
export type Phase =
  'draft' | 'ready' | 'live' | 'result' | 'seasonSummary' | 'offseason' | 'finished';
export interface BoxScore {
  playerId: string;
  name: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePM: number;
  threePA: number;
  ftm?: number;
  fta?: number;
  fouls?: number;
}
export interface TeamTemplate {
  id: string;
  name: string;
  attributes: Attributes;
  style: PlayStyle;
}
export interface TeamDefinition {
  id: string;
  nameZh: string;
  conference: 'east' | 'west';
  division: string;
  playerIds: string[];
}
export interface LeagueGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  day: number;
  seed: number;
  stage: GameStage;
  homeScore?: number;
  awayScore?: number;
}
export type GameStage =
  'regular' | 'playIn' | 'firstRound' | 'conferenceSemifinal' | 'conferenceFinal' | 'final';
export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  seed: number;
}
export interface PlayoffSeries {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWins: number;
  awayWins: number;
  round: GameStage;
  winnerId: string | null;
  conference: 'east' | 'west' | 'final';
  games: string[];
}
export interface LeagueState {
  games: LeagueGame[];
  standings: Standing[];
  series: PlayoffSeries[];
  round: GameStage;
  regularComplete: boolean;
  championId: string | null;
  scheduleSource: 'generated';
  playInSeeds: Record<string, string[]>;
}
export interface TacticalPlan {
  offense: 'balanced' | 'attackPaint' | 'perimeter' | 'pickAndRoll';
  defense: 'balanced' | 'protectPaint' | 'pressurePerimeter';
  pace: 'slow' | 'normal' | 'fast';
  rotation: 'balanced' | 'starters' | 'bench';
  originalMinutes: 26 | 32 | 38;
  focusPlayerId?: string;
}
export interface QuarterSummary {
  quarter: number;
  homeScore: number;
  awayScore: number;
  ownPoints: number;
  opponentPoints: number;
  plan: TacticalPlan;
}
export interface FeaturedMatchState {
  matchId: string;
  completedQuarters: number;
  plans: TacticalPlan[];
  preview: MatchResult | null;
}
export interface MatchInput {
  matchId: string;
  seed: number;
  season: number;
  player: OriginalPlayer;
  opponent: TeamTemplate;
  ownTeamId?: string;
  opponentTeamId?: string;
  ownRoster?: PlayerDefinition[];
  opponentRoster?: PlayerDefinition[];
  isHome?: boolean;
  includeOriginal?: boolean;
  stage?: GameStage;
  quarterPlans?: TacticalPlan[];
  ownRestDays?: number;
  opponentRestDays?: number;
}
export interface MatchEvent {
  secondsRemaining?: number;
  kind?: 'two' | 'three' | 'freeThrow' | 'miss' | 'turnover' | 'rebound' | 'foul' | 'substitution';
  actorId?: string;
  side?: 'own' | 'opponent';
  x?: number;
  y?: number;
  ownLineup?: string[];
  opponentLineup?: string[];
  quarter: number;
  text: string;
  homeScore: number;
  awayScore: number;
}
export interface MatchResult {
  matchId: string;
  input: MatchInput;
  homeScore: number;
  awayScore: number;
  won: boolean;
  homeBox: BoxScore[];
  awayBox: BoxScore[];
  events: MatchEvent[];
  overtimes: number;
  reward: number;
  quarters?: QuarterSummary[];
  featured?: boolean;
}
export interface ScheduleEntry {
  matchId: string;
  opponent: TeamTemplate;
  seed: number;
  stage: GameStage;
  isHome: boolean;
  leagueGameId: string;
}
export interface CareerState {
  activeMatch?: FeaturedMatchState | null;
  schemaVersion: 2;
  rulesVersion: string;
  dataVersion: string;
  careerId: string;
  revision: number;
  careerSeed: number;
  rngState: number;
  phase: Phase;
  initialCards: CardInstance[];
  inventory: CardInstance[];
  player: OriginalPlayer | null;
  coins: number;
  season: number;
  schedule: ScheduleEntry[];
  scheduleIndex: number;
  matches: MatchResult[];
  currentMatchId: string | null;
  regularWins: number;
  seriesWins: number;
  seriesLosses: number;
  championships: number;
  milestones: string[];
  appliedCommandIds: string[];
  growthLog: string[];
  selectedTeamId: string | null;
  league: LeagueState | null;
  seasonArchives: {
    season: number;
    teamId: string;
    wins: number;
    losses: number;
    championId: string | null;
    rank: number;
    summary?: {
      regularGames: number;
      playInGames?: number;
      playInAverages?: Record<string, number>;
      playoffGames: number;
      regularAverages: Record<string, number>;
      playoffAverages: Record<string, number>;
      bestPoints: number;
      outcome: string;
    };
  }[];
}
export type CommandPayload =
  | {
      type: 'CONFIRM_DRAFT';
      name: string;
      assignments: Record<AttributeKey, string>;
      style: PlayStyle;
      teamId?: string;
    }
  | { type: 'BUY_PACK'; position?: DrawPosition }
  | { type: 'INHERIT_ATTRIBUTE'; instanceId: string; attribute: AttributeKey }
  | { type: 'TRAIN_ATTRIBUTE'; instanceIds: string[]; attribute: AttributeKey }
  | { type: 'SET_PLAY_STYLE'; style: PlayStyle }
  | { type: 'PLAY_NEXT_MATCH' }
  | { type: 'START_FEATURED_MATCH' }
  | { type: 'PLAY_FEATURED_QUARTER'; plan: TacticalPlan }
  | { type: 'RETIRE_PLAYER' }
  | { type: 'ACK_MATCH_RESULT' }
  | { type: 'START_NEXT_SEASON' };
export type GameCommand = CommandPayload & { commandId: string; expectedRevision: number };
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; details?: Record<string, string | number> } };
export interface GameAPI {
  state: CareerState | null;
  catalog: Catalog;
  busy: boolean;
  error: string;
  readOnly: boolean;
  newCareer: () => Promise<void>;
  execute: (payload: CommandPayload) => Promise<void>;
  exportSave: () => void;
  importSave: (file: File) => Promise<void>;
  clearError: () => void;
}
