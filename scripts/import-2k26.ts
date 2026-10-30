import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

type AttrKey =
  | 'insideScoring'
  | 'outsideScoring'
  | 'interiorDefense'
  | 'perimeterDefense'
  | 'playmaking'
  | 'ballHandling'
  | 'speed'
  | 'physicality'
  | 'rebounding';

type CatalogPlayer = {
  playerId: string;
  nameEn: string;
  nameZh: string | null;
  teamLabel: string;
  drawPosition: 'guard' | 'wing' | 'big';
  attributes: Record<AttrKey, number>;
  dataVersion: string;
  evidence: Record<
    AttrKey,
    {
      kind: 'derived' | 'estimated';
      confidence: 'high' | 'medium' | 'low';
      sourceRefs: string[];
    }
  >;
};

type SourcePlayer = {
  name: string;
  slug: string;
  team: string;
  teamType: string;
  positions: string[];
  overall: number;
  attributes?: Record<string, number>;
  cats?: Record<string, number>;
};

const RAW_PATH = 'data/2k26/raw/blacktop-blitz-players-2k26.json';
const CATALOG_PATH = 'src/data/players.json';
const AUDIT_PATH = 'data/2k26/processed/mapping-audit.json';
const SOURCE_URL =
  'https://github.com/wkoverfield/blacktop-blitz/blob/90a25a24c54198799c2816730ee181731e3b4a55/public/players-2k26.json';
const SOURCE_DATE = '2026-08-08';
const DATA_VERSION = 'nba-2026-27-realgm-2026-10-29-2k26-v2';
const KEYS: AttrKey[] = [
  'insideScoring',
  'outsideScoring',
  'interiorDefense',
  'perimeterDefense',
  'playmaking',
  'ballHandling',
  'speed',
  'physicality',
  'rebounding',
];

const NAME_ALIASES: Record<string, string> = {
  moewagner: 'moritzwagner',
  nicolasclaxton: 'nicclaxton',
  ejharkless: 'elijahharkless',
  ronholland: 'ronaldholland',
  jameshuff: 'jayhuff',
  cameronchristie: 'camchristie',
  herbjones: 'herbertjones',
  gregoryjackson: 'ggjackson',
  davidjonesgarcia: 'davidjones',
};
function normalizeName(name: string): string {
  const key = name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(jr|sr|iii|ii|iv)$/, '');
  return NAME_ALIASES[key] ?? key;
}

function aliasName(name: string): string {
  return normalizeName(name).replace(/(jr|sr|ii|iii|iv|v)$/, '');
}

function asFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`2K26 source is missing numeric ${label}`);
  }
  return value;
}

function mappedAttributes(source: SourcePlayer): Record<AttrKey, number> {
  const a = source.attributes;
  const c = source.cats;
  if (!a || !c) throw new Error(`Missing attribute object for ${source.name}`);
  return {
    insideScoring: asFinite(c.ins, `${source.name}.cats.ins`),
    outsideScoring: asFinite(c.out, `${source.name}.cats.out`),
    interiorDefense: asFinite(a.interiorDefense, `${source.name}.interiorDefense`),
    perimeterDefense: asFinite(a.perimeterDefense, `${source.name}.perimeterDefense`),
    playmaking: asFinite(c.ply, `${source.name}.cats.ply`),
    ballHandling: asFinite(a.ballHandle, `${source.name}.ballHandle`),
    speed: asFinite(a.speed, `${source.name}.speed`),
    physicality: asFinite(a.strength, `${source.name}.strength`),
    // Round the arithmetic mean to an integer with JavaScript's half-up behavior.
    rebounding: Math.round(
      (asFinite(a.offensiveRebound, `${source.name}.offensiveRebound`) +
        asFinite(a.defensiveRebound, `${source.name}.defensiveRebound`)) /
        2,
    ),
  };
}

function sourceRef(source: SourcePlayer): string {
  return `${SOURCE_URL}#${source.slug}`;
}

async function run(): Promise<void> {
  const rawText = await readFile(RAW_PATH, 'utf8');
  const raw: SourcePlayer[] = JSON.parse(rawText);
  const current = raw.filter((player) => player.teamType === 'curr');
  if (current.length === 0)
    throw new Error('No teamType=curr rows found in the archived 2K26 file');

  const sourceByExactName = new Map<string, SourcePlayer>();
  const sourceByAlias = new Map<string, SourcePlayer[]>();
  const sourceWithoutAttributes = new Set<string>();
  for (const player of current) {
    if (!player.attributes || !player.cats) {
      sourceWithoutAttributes.add(normalizeName(player.name));
      continue;
    }
    const key = normalizeName(player.name);
    if (sourceByExactName.has(key))
      throw new Error(`Duplicate normalized source name: ${player.name}`);
    sourceByExactName.set(key, player);
    const alias = aliasName(player.name);
    sourceByAlias.set(alias, [...(sourceByAlias.get(alias) ?? []), player]);
  }

  const catalog: CatalogPlayer[] = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const usedSlugs = new Set<string>();
  const unmatched: string[] = [];
  const unmatchedReasons: Record<string, 'not-in-2k26-current-roster' | '2k26-row-has-no-ratings'> =
    {};
  const matched: Array<{
    playerId: string;
    rosterName: string;
    sourceName: string;
    sourceTeam: string;
    match: 'exact' | 'suffix-alias';
  }> = [];
  const mappedRanges = Object.fromEntries(
    KEYS.map((key) => [key, { min: Infinity, max: -Infinity, below40: 0 }]),
  ) as Record<AttrKey, { min: number; max: number; below40: number }>;

  for (const player of catalog) {
    player.dataVersion = DATA_VERSION;
    const exact = sourceByExactName.get(normalizeName(player.nameEn));
    const candidates = sourceByAlias.get(aliasName(player.nameEn)) ?? [];
    const source = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!source) {
      unmatched.push(player.nameEn);
      unmatchedReasons[player.nameEn] = sourceWithoutAttributes.has(normalizeName(player.nameEn))
        ? '2k26-row-has-no-ratings'
        : 'not-in-2k26-current-roster';
      continue;
    }
    if (usedSlugs.has(source.slug))
      throw new Error(`Source row ${source.slug} matched more than once`);
    usedSlugs.add(source.slug);
    const attributes = mappedAttributes(source);
    player.attributes = attributes;
    player.dataVersion = DATA_VERSION;
    player.evidence = Object.fromEntries(
      KEYS.map((key) => [
        key,
        {
          kind: 'derived',
          confidence: 'medium',
          sourceRefs: [sourceRef(source), 'local:docs/2k26-mapping.md#九维映射规则'],
        },
      ]),
    ) as CatalogPlayer['evidence'];
    for (const key of KEYS) {
      mappedRanges[key].min = Math.min(mappedRanges[key].min, attributes[key]);
      mappedRanges[key].max = Math.max(mappedRanges[key].max, attributes[key]);
      if (attributes[key] < 40) mappedRanges[key].below40 += 1;
    }
    matched.push({
      playerId: player.playerId,
      rosterName: player.nameEn,
      sourceName: source.name,
      sourceTeam: source.team,
      match: exact ? 'exact' : 'suffix-alias',
    });
  }

  const fileHash = createHash('sha256').update(rawText).digest('hex');
  const audit = {
    dataVersion: DATA_VERSION,
    source: {
      repository: 'wkoverfield/blacktop-blitz',
      commit: '90a25a24c54198799c2816730ee181731e3b4a55',
      rawUrl: `https://raw.githubusercontent.com/wkoverfield/blacktop-blitz/90a25a24c54198799c2816730ee181731e3b4a55/public/players-2k26.json`,
      sourcePage: SOURCE_URL,
      capturedAt: '2026-08-08T06:51:10Z',
      upstreamGameVersion: '2K26',
      rawSha256: fileHash,
      rawRows: raw.length,
      currentRows: current.length,
      rowsWithoutAttributes: current
        .filter((player) => !player.attributes || !player.cats)
        .map((player) => player.name),
      caveat:
        'Unofficial 2kratings.com-derived third-party data; current-team roster is the archived game roster, not a verified real-world NBA contract list.',
    },
    roster: {
      catalogPlayers: catalog.length,
      matchedPlayers: matched.length,
      unmatchedPlayers: unmatched.length,
    },
    mapping: {
      insideScoring: 'cats.ins (2K Inside Scoring category average)',
      outsideScoring: 'cats.out (2K Outside Scoring category average)',
      interiorDefense: 'attributes.interiorDefense (direct 2K attribute)',
      perimeterDefense: 'attributes.perimeterDefense (direct 2K attribute)',
      playmaking: 'cats.ply (2K Playmaking category average)',
      ballHandling: 'attributes.ballHandle (direct 2K attribute)',
      speed: 'attributes.speed (direct 2K Speed; not Speed with Ball)',
      physicality: 'attributes.strength (direct 2K Strength)',
      rebounding: 'round((attributes.offensiveRebound + attributes.defensiveRebound) / 2)',
    },
    mappedRanges,
    matched,
    unmatched,
    unmatchedReasons,
  };

  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog)}\n`);
  await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(
    `Mapped ${matched.length}/${catalog.length}; unmatched=${unmatched.length}; raw SHA-256=${fileHash}`,
  );
  console.log(
    `Some mapped dimensions are below 40; see ${AUDIT_PATH}. Values were preserved without clamping.`,
  );
}

void run();
