import type {
  Attributes,
  BoxScore,
  DrawPosition,
  MatchEvent,
  MatchInput,
  MatchResult,
  OriginalPlayer,
  PlayerDefinition,
  PlayStyle,
  TacticalPlan,
} from '../../contracts';
import { BALANCE } from '../../config/balance';
import { DEFAULT_PLAN, SIM_CONFIG as C, STYLE_CONFIG } from '../../config/simulation';
import { clamp, hashSeed, Random } from '../rng';
interface Actor {
  id: string;
  name: string;
  position: DrawPosition;
  attributes: Attributes;
  style: PlayStyle;
  box: BoxScore;
  quality: number;
  stamina: number;
  starter: boolean;
  threeRate: number;
}
const zeroBox = (id: string, name: string): BoxScore => ({
  playerId: id,
  name,
  minutes: 0,
  points: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fgm: 0,
  fga: 0,
  threePM: 0,
  threePA: 0,
  ftm: 0,
  fta: 0,
  fouls: 0,
});
const quality = (a: Attributes) =>
  Math.max(a.insideScoring, a.outsideScoring) * 0.33 +
  a.playmaking * 0.17 +
  (a.interiorDefense + a.perimeterDefense) * 0.12 +
  a.rebounding * 0.1 +
  a.ballHandling * 0.08 +
  a.speed * 0.08;
const inferredPosition = (style: PlayStyle): DrawPosition =>
  style === 'interiorAnchor' ? 'big' : style === 'offBallScorer' ? 'wing' : 'guard';
function makeTeam(roster: PlayerDefinition[], restDays: number, player?: OriginalPlayer): Actor[] {
  if (roster.length < 8) throw Error('A real roster with at least eight players is required');
  const actors: Actor[] = roster.map((p) => ({
    id: p.playerId,
    name: p.nameZh || p.nameEn,
    position: p.drawPosition,
    attributes: p.attributes,
    style:
      p.drawPosition === 'big'
        ? 'interiorAnchor'
        : p.attributes.playmaking > p.attributes.outsideScoring
          ? 'teamOrganizer'
          : 'offBallScorer',
    box: zeroBox(p.playerId, p.nameZh || p.nameEn),
    quality: quality(p.attributes),
    stamina: clamp(100 - Math.max(0, 2 - restDays) * 5, 85, 100),
    starter: false,
    threeRate: clamp(
      C.actorThree[p.drawPosition] +
        (p.attributes.outsideScoring - p.attributes.insideScoring) * C.actorThree.skillDifference,
      C.actorThree.min,
      C.actorThree.max,
    ),
  }));
  const starters: Actor[] = [];
  for (const position of ['guard', 'guard', 'wing', 'wing', 'big'] as const) {
    const available = actors.filter((a) => !starters.includes(a));
    const a = [...available].sort(
      (a, b) =>
        b.quality +
        (b.position === position ? 25 : 0) -
        (a.quality + (a.position === position ? 25 : 0)),
    )[0];
    a.starter = true;
    starters.push(a);
  }
  // Keep positional reserves before filling remaining rotation slots by quality.
  const rotation = [...starters];
  for (const position of ['guard', 'wing', 'big'] as const) {
    const a = actors
      .filter((a) => a.position === position && !rotation.includes(a))
      .sort((a, b) => b.quality - a.quality)[0];
    if (a) rotation.push(a);
  }
  for (const a of [...actors].sort((a, b) => b.quality - a.quality))
    if (!rotation.includes(a)) rotation.push(a);
  if (player)
    rotation.unshift({
      id: 'original-player',
      name: player.displayName,
      position: inferredPosition(player.playStyle),
      attributes: player.attributes,
      style: player.playStyle,
      box: zeroBox('original-player', player.displayName),
      quality: quality(player.attributes),
      stamina: clamp(player.condition ?? 100, 30, 100),
      starter: true,
      threeRate: STYLE_CONFIG[player.playStyle].three,
    });
  return rotation;
}
function weighted<T>(items: T[], weight: (item: T) => number, rng: Random): T {
  if (!items.length) throw Error('EMPTY_ELIGIBLE_LINEUP');
  const total = items.reduce((n, a) => n + Math.max(0.001, weight(a)), 0);
  let cursor = rng.next() * total;
  for (const item of items) {
    cursor -= Math.max(0.001, weight(item));
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}
const average = (actors: Actor[], key: keyof Attributes) =>
  actors.reduce((n, a) => n + a.attributes[key], 0) / actors.length;
const skill = (actor: Actor, key: keyof Attributes) =>
  actor.attributes[key] *
  (1 -
    clamp((C.fatigue.skillThreshold - actor.stamina) * C.fatigue.penalty, 0, C.fatigue.maxPenalty));
function validatePlan(plan: TacticalPlan, roster: PlayerDefinition[]): TacticalPlan {
  if (
    !['balanced', 'attackPaint', 'perimeter', 'pickAndRoll'].includes(plan.offense) ||
    !['balanced', 'protectPaint', 'pressurePerimeter'].includes(plan.defense) ||
    !['slow', 'normal', 'fast'].includes(plan.pace) ||
    !['balanced', 'starters', 'bench'].includes(plan.rotation) ||
    ![26, 32, 38].includes(plan.originalMinutes)
  )
    throw Error('INVALID_TACTICAL_PLAN');
  if (
    plan.focusPlayerId &&
    plan.focusPlayerId !== 'original-player' &&
    !roster.some((p) => p.playerId === plan.focusPlayerId)
  )
    throw Error('INVALID_FOCUS_PLAYER');
  return { ...plan };
}
function opponentPlan(actors: Actor[]): TacticalPlan {
  const inside = average(actors, 'insideScoring'),
    outside = average(actors, 'outsideScoring');
  return {
    ...DEFAULT_PLAN,
    offense: inside > outside + 5 ? 'attackPaint' : outside > inside + 5 ? 'perimeter' : 'balanced',
    defense:
      average(actors, 'interiorDefense') > average(actors, 'perimeterDefense') + 5
        ? 'protectPaint'
        : 'balanced',
  };
}
function chooseLineup(
  actors: Actor[],
  plan: TacticalPlan,
  quarter: number,
  slot: number,
  overtime: boolean,
): Actor[] {
  const original = actors.find((a) => a.id === 'original-player');
  const focus = actors.find((a) => a.id === plan.focusPlayerId);
  const depth = plan.rotation === 'starters' ? 9 : plan.rotation === 'bench' ? 12 : 10;
  const legal = actors.filter((a) => (a.box.fouls ?? 0) < C.foul.limit);
  const eligible = legal.filter(
    (a) => a === original || a === focus || actors.filter((x) => x !== original).indexOf(a) < depth,
  );
  for (const a of legal) if (eligible.length < 5 && !eligible.includes(a)) eligible.push(a);
  // The official emergency exception leaves a team with five eligible players; normal rotations use 11–12.
  const available =
    eligible.length >= 5
      ? eligible
      : [
          ...eligible,
          ...actors
            .filter((a) => !eligible.includes(a))
            .sort((a, b) => (a.box.fouls ?? 0) - (b.box.fouls ?? 0))
            .slice(0, 5 - eligible.length),
        ];
  const selected: Actor[] = [];
  const targetSlots = plan.originalMinutes / 2;
  const originalOn =
    original &&
    available.includes(original) &&
    (overtime ||
      Math.floor(((slot + 1) * targetSlots) / 24) > Math.floor((slot * targetSlots) / 24));
  if (originalOn) selected.push(original);
  const slots: DrawPosition[] = ['guard', 'guard', 'wing', 'wing', 'big'];
  if (originalOn) {
    const i = slots.indexOf(original.position);
    slots.splice(i >= 0 ? i : 2, 1);
  }
  if (focus && focus !== original && available.includes(focus) && slot % 3 !== 2) {
    selected.push(focus);
    const i = slots.indexOf(focus.position);
    slots.splice(i >= 0 ? i : Math.min(2, slots.length - 1), 1);
  }
  const elapsed = (quarter - 1) * 12 + slot / 2;
  for (const position of slots) {
    const options = available.filter(
      (a) => !selected.includes(a) && (!original || a !== original || originalOn),
    );
    const fallback = options.length ? options : available.filter((a) => !selected.includes(a));
    const positional = fallback.filter((a) => a.position === position);
    const candidates = positional.length ? positional : fallback;
    const score = (a: Actor) => {
      const target = a.starter
        ? plan.rotation === 'starters'
          ? 36
          : plan.rotation === 'bench'
            ? 25
            : 31
        : plan.rotation === 'starters'
          ? 12
          : plan.rotation === 'bench'
            ? 24
            : 19;
      const deficit = (target / 48) * elapsed - a.box.minutes;
      return (
        a.quality +
        (a.position === position ? 28 : 0) +
        deficit * 3.3 +
        (a.stamina - 90) * 0.45 +
        (plan.rotation === 'bench' && !a.starter ? 8 : 0)
      );
    };
    selected.push([...candidates].sort((a, b) => score(b) - score(a))[0]);
  }
  return selected;
}
export function calculateMatchReward(
  result: Pick<MatchResult, 'homeBox' | 'won'>,
  style: PlayStyle,
): number {
  const b = result.homeBox[0];
  const efg = b.fga ? (b.fgm + 0.5 * b.threePM) / b.fga : 0;
  const factor = efg < 0.4 ? 0.6 : efg < 0.55 ? 0.8 : 1;
  const scoring = b.fga ? Math.min(10, Math.floor(b.points / 4)) * factor : 0;
  const organization = clamp(Math.floor(b.assists * 1.5 - b.turnovers), 0, 10);
  const interior = clamp(Math.floor(b.rebounds * 0.6 + b.blocks * 1.5), 0, 10);
  const raw =
    style === 'primaryCreator'
      ? (scoring + organization) / 2
      : style === 'teamOrganizer'
        ? organization
        : style === 'interiorAnchor'
          ? interior
          : scoring;
  return BALANCE.baseReward + (result.won ? BALANCE.winReward : 0) + Math.floor(clamp(raw, 0, 10));
}
/** Compute only played periods. A later plan cannot consume random numbers in an earlier period. */
export function simulateThroughQuarter(
  input: MatchInput,
  plans: TacticalPlan[],
  throughQuarter: number,
): MatchResult {
  if (!Number.isInteger(throughQuarter) || throughQuarter < 1 || throughQuarter > 4)
    throw Error('INVALID_QUARTER');
  const ownRoster = input.ownRoster ?? [],
    opponentRoster = input.opponentRoster ?? [];
  const actualPlans = Array.from({ length: throughQuarter }, (_, i) =>
    validatePlan(plans[i] ?? DEFAULT_PLAN, ownRoster),
  );
  const rng = new Random(input.seed);
  const own = makeTeam(
    ownRoster,
    input.ownRestDays ?? 2,
    input.includeOriginal === false ? undefined : input.player,
  );
  const other = makeTeam(opponentRoster, input.opponentRestDays ?? 2);
  const opponentTactics = opponentPlan(other);
  const result: MatchResult = {
    matchId: input.matchId,
    input: { ...structuredClone(input), quarterPlans: actualPlans },
    homeScore: 0,
    awayScore: 0,
    won: false,
    homeBox: own.map((a) => a.box),
    awayBox: other.map((a) => a.box),
    events: [],
    overtimes: 0,
    reward: 0,
    quarters: [],
  };
  let liveOwn: Actor[] = [],
    liveOther: Actor[] = [],
    currentQuarter = 1,
    secondsRemaining = 720;
  const ownAdvantage = input.isHome === false ? -C.homeAdvantage : C.homeAdvantage;
  function record(
    text: string,
    kind: MatchEvent['kind'],
    actor: Actor,
    ownSide: boolean,
    three = false,
  ) {
    const visual = new Random(hashSeed(`${input.seed}:visual:${result.events.length}`));
    const toward = three ? 61 + visual.next() * 15 : 84 + visual.next() * 11;
    result.events.push({
      quarter: currentQuarter,
      secondsRemaining,
      text,
      kind,
      actorId: actor.id,
      side: ownSide ? 'own' : 'opponent',
      x: ownSide ? toward : 100 - toward,
      y: 20 + visual.next() * 60,
      ownLineup: liveOwn.map((a) => a.id),
      opponentLineup: liveOther.map((a) => a.id),
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
  }
  function addPoints(actor: Actor, points: number, ownSide: boolean) {
    actor.box.points += points;
    if (ownSide) result.homeScore += points;
    else result.awayScore += points;
  }
  let ownFouls = 0,
    otherFouls = 0;
  function foul(actor: Actor, ownSide: boolean, offensive = false) {
    actor.box.fouls = (actor.box.fouls ?? 0) + 1;
    if (ownSide) ownFouls++;
    else otherFouls++;
    record(
      actor.name +
        (offensive ? '进攻犯规' : actor.box.fouls >= 6 ? '第六次犯规，离场' : '防守犯规'),
      'foul',
      actor,
      ownSide,
    );
    if (actor.box.fouls >= 6) {
      const active = ownSide ? liveOwn : liveOther,
        actors = ownSide ? own : other;
      const replacement = actors
        .filter((a) => !active.includes(a) && (a.box.fouls ?? 0) < 6)
        .sort(
          (a, b) =>
            b.quality +
            (b.position === actor.position ? 25 : 0) -
            (a.quality + (a.position === actor.position ? 25 : 0)),
        )[0];
      const index = active.indexOf(actor);
      if (replacement && index >= 0) {
        active[index] = replacement;
        record(
          replacement.name + '替换六犯离场的' + actor.name,
          'substitution',
          replacement,
          ownSide,
        );
      }
    }
  }
  function freeThrows(actor: Actor, n: number, ownSide: boolean): boolean {
    // This roster has no FT attribute: estimate conservatively from shooting and playmaking.
    const p = clamp(
      C.freeThrow.base +
        (actor.attributes.outsideScoring - 50) * C.freeThrow.outsideSkill +
        (actor.attributes.playmaking - 50) * C.freeThrow.organizationSkill,
      C.freeThrow.min,
      C.freeThrow.max,
    );
    let lastMade = false;
    for (let i = 0; i < n; i++) {
      actor.box.fta = (actor.box.fta ?? 0) + 1;
      lastMade = rng.next() < p;
      if (lastMade) {
        actor.box.ftm = (actor.box.ftm ?? 0) + 1;
        addPoints(actor, 1, ownSide);
      }
      record(
        actor.name + `第${i + 1}/${n}次罚球` + (lastMade ? '命中' : '未中'),
        'freeThrow',
        actor,
        ownSide,
      );
    }
    return lastMade;
  }
  function rebound(off: Actor[], def: Actor[], ownSide: boolean, attempt: number): Actor | null {
    const p = clamp(
      C.rebound.base +
        (average(off, 'rebounding') - average(def, 'rebounding')) * C.rebound.skill +
        (average(off, 'physicality') - average(def, 'physicality')) * C.rebound.physical,
      C.rebound.min,
      C.rebound.max,
    );
    if (attempt < C.maxSecondChances && rng.next() < p) {
      const a = weighted(off, (a) => skill(a, 'rebounding'), rng);
      a.box.rebounds++;
      record(a.name + '抢下进攻篮板', 'rebound', a, ownSide);
      return a;
    }
    const a = weighted(def, (a) => skill(a, 'rebounding'), rng);
    a.box.rebounds++;
    record(a.name + '收下防守篮板', 'rebound', a, !ownSide);
    return null;
  }
  function possession(
    off: Actor[],
    def: Actor[],
    ownSide: boolean,
    plan: TacticalPlan,
    defPlan: TacticalPlan,
  ) {
    const offense = C.offense[plan.offense];
    const defense = C.defense[defPlan.defense];
    const weight = (a: Actor) =>
      Math.pow(Math.max(skill(a, 'insideScoring'), skill(a, 'outsideScoring')) / 70, 2) *
      STYLE_CONFIG[a.style].usage *
      (plan.focusPlayerId === a.id ? 1.65 : 1);
    let shooter = weighted(off, weight, rng);
    let defender = def.find((a) => a.position === shooter.position) ?? def[0];
    if (rng.next() < C.foul.offensive) {
      foul(shooter, ownSide, true);
      shooter.box.turnovers++;
      return;
    }
    const oppDefense =
      0.6 * skill(defender, 'perimeterDefense') + 0.4 * average(def, 'perimeterDefense');
    const turnover = clamp(
      C.turnover.base +
        (oppDefense - skill(shooter, 'ballHandling')) * C.turnover.defense -
        (skill(shooter, 'playmaking') - 70) * C.turnover.organization +
        offense.turnover +
        (plan.pace === 'fast' ? 0.01 : 0),
      C.turnover.min,
      C.turnover.max,
    );
    if (rng.next() < turnover) {
      shooter.box.turnovers++;
      if (rng.next() < C.stealShare)
        weighted(def, (a) => skill(a, 'perimeterDefense'), rng).box.steals++;
      record(shooter.name + '持球失误', 'turnover', shooter, ownSide);
      return;
    }
    if (rng.next() < C.foul.nonShooting) {
      foul(defender, !ownSide);
      if ((ownSide ? otherFouls : ownFouls) >= C.foul.bonusAt) {
        if (freeThrows(shooter, 2, ownSide)) return;
        const recovered = rebound(off, def, ownSide, 0);
        if (!recovered) return;
        shooter = recovered;
      }
    }
    let passer: Actor | null = null;
    if (
      rng.next() <
      clamp(
        (C.pass.base + (skill(shooter, 'playmaking') - 70) * C.pass.skill) *
          STYLE_CONFIG[shooter.style].assist +
          offense.passing,
        C.pass.min,
        C.pass.max,
      )
    ) {
      passer = shooter;
      shooter = weighted(
        off.filter((a) => a !== shooter),
        weight,
        rng,
      );
    }
    for (let attempt = 0; attempt <= C.maxSecondChances; attempt++) {
      defender = def.find((a) => a.position === shooter.position) ?? def[0];
      const three = rng.next() < clamp(shooter.threeRate + offense.three, 0.02, 0.9);
      const key = three ? 'perimeterDefense' : 'interiorDefense';
      const effectiveDefense =
        0.6 * skill(defender, key) +
        0.4 * average(def, key) +
        (three ? defense.outside : defense.inside);
      const creation = clamp(
        (passer ? clamp((skill(passer, 'playmaking') - 60) * 0.001, 0, 0.04) : 0) +
          clamp((skill(shooter, 'speed') - skill(defender, 'speed')) * 0.001, 0, 0.02),
        0,
        0.06,
      );
      const advantage = ownSide ? ownAdvantage : -ownAdvantage;
      const p = three
        ? clamp(
            C.outside.base +
              (skill(shooter, 'outsideScoring') - effectiveDefense) * C.outside.skill +
              creation +
              offense.accuracy +
              advantage,
            C.outside.min,
            C.outside.max,
          )
        : clamp(
            C.inside.base +
              (skill(shooter, 'insideScoring') - effectiveDefense) * C.inside.skill +
              (skill(shooter, 'physicality') - skill(defender, 'physicality')) * C.inside.physical +
              creation +
              offense.accuracy +
              advantage,
            C.inside.min,
            C.inside.max,
          );
      const foulP =
        (three ? C.foul.shootingThree : C.foul.shootingInside) +
        (defPlan.defense === 'pressurePerimeter' ? C.foul.pressureExtra : 0);
      const shootingFoul = rng.next() < foulP;
      const made = rng.next() < (shootingFoul ? p * C.foul.andOneFactor : p);
      if (shootingFoul) foul(defender, !ownSide);
      if (!shootingFoul || made) {
        shooter.box.fga++;
        if (three) shooter.box.threePA++;
      }
      if (made) {
        shooter.box.fgm++;
        if (three) shooter.box.threePM++;
        addPoints(shooter, three ? 3 : 2, ownSide);
        if (passer) passer.box.assists++;
        record(
          shooter.name + (three ? '外线三分命中' : '篮下终结得分'),
          three ? 'three' : 'two',
          shooter,
          ownSide,
          three,
        );
        if (!shootingFoul || freeThrows(shooter, 1, ownSide)) return;
      } else if (shootingFoul) {
        if (freeThrows(shooter, three ? 3 : 2, ownSide)) return;
      } else {
        if (
          !three &&
          rng.next() <
            clamp(
              C.block.base +
                (skill(defender, 'interiorDefense') - skill(shooter, 'insideScoring')) *
                  C.block.skill,
              C.block.min,
              C.block.max,
            )
        )
          defender.box.blocks++;
        record(
          shooter.name + (three ? '三分未中' : '近筐出手未中'),
          'miss',
          shooter,
          ownSide,
          three,
        );
      }
      const next = rebound(off, def, ownSide, attempt);
      if (!next) return;
      shooter = next;
      passer = null;
    }
  }
  function period(quarter: number, plan: TacticalPlan, overtime = false) {
    currentQuarter = quarter;
    ownFouls = 0;
    otherFouls = 0;
    const minutes = overtime ? 5 : 12,
      slots = minutes * 2;
    const offset =
      plan.pace === 'fast'
        ? C.quarterPossessions.fast
        : plan.pace === 'slow'
          ? C.quarterPossessions.slow
          : 0;
    const perTeam = overtime
      ? 10
      : Math.max(
          18,
          C.quarterPossessions.base + Math.floor(rng.next() * C.quarterPossessions.range) + offset,
        );
    const beforeOwn = result.homeScore,
      beforeOther = result.awayScore;
    for (let slot = 0; slot < slots; slot++) {
      const n = Math.floor(((slot + 1) * perTeam) / slots) - Math.floor((slot * perTeam) / slots);
      const turns = n * 2;
      const account = (dt: number) => {
        for (const [actors, active, fast] of [
          [own, liveOwn, plan.pace === 'fast'],
          [other, liveOther, plan.pace === 'fast'],
        ] as const)
          for (const a of actors) {
            if (active.includes(a)) {
              a.box.minutes += dt;
              a.stamina = clamp(
                a.stamina - dt * C.fatigue.drain * (fast ? C.fatigue.fastMultiplier : 1),
                0,
                100,
              );
            } else a.stamina = clamp(a.stamina + dt * C.fatigue.recovery, 0, 100);
          }
      };
      liveOwn = chooseLineup(own, plan, quarter, slot, overtime);
      liveOther = chooseLineup(other, opponentTactics, quarter, slot, overtime);
      if (!turns) {
        account(0.5);
        continue;
      }
      for (let turn = 0; turn < turns; turn++) {
        // Re-check after each dead-ball opportunity so six-foul players cannot keep acting.
        liveOwn = chooseLineup(own, plan, quarter, slot, overtime);
        liveOther = chooseLineup(other, opponentTactics, quarter, slot, overtime);
        secondsRemaining = Math.max(
          0,
          Math.round(minutes * 60 - slot * 30 - ((turn + 1) * 30) / turns),
        );
        possession(
          turn % 2 === 0 ? liveOwn : liveOther,
          turn % 2 === 0 ? liveOther : liveOwn,
          turn % 2 === 0,
          turn % 2 === 0 ? plan : opponentTactics,
          turn % 2 === 0 ? opponentTactics : plan,
        );
        account(0.5 / turns);
      }
    }
    result.quarters!.push({
      quarter,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      ownPoints: result.homeScore - beforeOwn,
      opponentPoints: result.awayScore - beforeOther,
      plan: { ...plan },
    });
  }
  for (let q = 1; q <= throughQuarter; q++) period(q, actualPlans[q - 1]);
  if (throughQuarter === 4) {
    while (result.homeScore === result.awayScore) {
      if (result.overtimes >= C.maxOvertimes) throw Error('SIMULATION_BUDGET_EXCEEDED');
      result.overtimes++;
      period(4 + result.overtimes, actualPlans[3], true);
    }
    result.won = result.homeScore > result.awayScore;
    result.reward = calculateMatchReward(result, input.player.playStyle);
  }
  // Present stable decimal minutes while preserving exact team total for aggregate checks.
  for (const actors of [own, other]) {
    const target = 5 * (throughQuarter * 12 + result.overtimes * 5);
    for (const a of actors) a.box.minutes = Math.round(a.box.minutes * 100) / 100;
    const last = [...actors].reverse().find((a) => a.box.minutes > 0)!;
    last.box.minutes =
      target - actors.filter((a) => a !== last).reduce((n, a) => n + a.box.minutes, 0);
  }
  return result;
}
export function simulateMatch(input: MatchInput): MatchResult {
  return simulateThroughQuarter(
    input,
    input.quarterPlans ?? Array.from({ length: 4 }, () => ({ ...DEFAULT_PLAN })),
    4,
  );
}
