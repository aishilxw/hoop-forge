import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type CareerState,
  type CommandPayload,
} from '../../src/contracts';
import { NBA_TEAMS } from '../../src/data/teams';
import { catalog } from '../../src/data/catalog';
import { applyCommand, createCareer } from '../../src/domain';
import { loadSave, persistSave, SAVE_KEY, validateSave } from '../../src/application/save';

function created(seed = 771): CareerState {
  const result = createCareer(seed, catalog);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
function command(state: CareerState, payload: CommandPayload): CareerState {
  const result = applyCommand(
    state,
    {
      ...payload,
      commandId: `integration-${state.revision}`,
      expectedRevision: state.revision,
    },
    catalog,
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
function ready(seed = 771): CareerState {
  const state = created(seed);
  const assignments = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key, index) => [key, state.initialCards[index].instanceId]),
  ) as Record<AttributeKey, string>;
  return command(state, {
    type: 'CONFIRM_DRAFT',
    name: '独立验收',
    style: 'teamOrganizer',
    assignments,
    teamId: NBA_TEAMS[0].id,
  });
}
const roundTrip = (state: CareerState): CareerState =>
  validateSave(JSON.parse(JSON.stringify(state)), catalog);

describe('real catalog and persistence boundary', () => {
  it('round-trips a created and drafted save without changing the state', () => {
    for (const state of [created(), ready()]) expect(roundTrip(state)).toEqual(state);
  });
  it('rejects unknown data/rules versions and unknown inventory players', () => {
    const state = ready();
    expect(() => validateSave({ ...state, dataVersion: 'unknown' }, catalog)).toThrow();
    expect(() => validateSave({ ...state, rulesVersion: 'future' }, catalog)).toThrow();
    const unknown = structuredClone(state);
    unknown.inventory[0].playerId = 'missing-player';
    expect(() => validateSave(unknown, catalog)).toThrow();
  });
  it('rejects duplicate inventory instances and malformed attributes', () => {
    const state = ready();
    expect(() =>
      validateSave({ ...state, inventory: [...state.inventory, state.inventory[0]] }, catalog),
    ).toThrow();
    const invalid = structuredClone(state);
    invalid.player!.attributes.speed = Number.NaN;
    expect(() => validateSave(invalid, catalog)).toThrow();
  });
  it('resuming a result does not allow the same match command to pay twice', () => {
    const state = ready();
    const first = applyCommand(
      state,
      { type: 'PLAY_NEXT_MATCH', commandId: 'one-match', expectedRevision: state.revision },
      catalog,
    );
    if (!first.ok) throw new Error(first.error.code);
    const resumed = roundTrip(first.value);
    const second = applyCommand(
      resumed,
      { type: 'PLAY_NEXT_MATCH', commandId: 'one-match', expectedRevision: state.revision },
      catalog,
    );
    expect(second).toEqual({ ok: true, value: resumed });
  });
  it('rejects a schedule cursor that cannot be played', () => {
    const state = ready();
    expect(() => validateSave({ ...state, scheduleIndex: 999 }, catalog)).toThrow();
  });
  it('rejects a result phase without its actual match', () => {
    const state = ready();
    expect(() =>
      validateSave({ ...state, phase: 'result', currentMatchId: 'missing-match' }, catalog),
    ).toThrow();
  });
  it('rejects a corrupt initial draft with repeated instances', () => {
    const state = roundTrip(created());
    state.initialCards[1] = structuredClone(state.initialCards[0]);
    expect(() => validateSave(state, catalog)).toThrow();
  });
});

describe('full career persistence regression', () => {
  it('saves a full NBA season and can continue the same career', () => {
    let state = ready(771),
      transitions = 0;
    while (state.phase !== 'seasonSummary' && transitions++ < 250) {
      if (state.phase === 'ready') state = command(state, { type: 'PLAY_NEXT_MATCH' });
      else if (state.phase === 'result') state = command(state, { type: 'ACK_MATCH_RESULT' });
      else throw new Error(`Unexpected phase ${state.phase}`);
      state = roundTrip(state);
    }
    expect(state.phase).toBe('seasonSummary');
    expect(state.matches.filter((m) => m.input.stage === 'regular')).toHaveLength(82);
    expect(state.league!.standings.every((r) => r.wins + r.losses === 82)).toBe(true);
    expect(state.seasonArchives).toHaveLength(1);
    state = roundTrip(command(state, { type: 'ACK_MATCH_RESULT' }));
    expect(state.phase).toBe('offseason');
    state = roundTrip(command(state, { type: 'START_NEXT_SEASON' }));
    expect(state.season).toBe(2);
    expect(state.phase).toBe('ready');
    expect(state.schedule).toHaveLength(82);
  }, 60000);
});

describe('storage commit failures', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the active save intact if its replacement write fails', () => {
    const memory = new Map<string, string>();
    let rejectActiveWrite = false;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (rejectActiveWrite && key === SAVE_KEY) throw new Error('QuotaExceededError');
        memory.set(key, value);
      },
    });
    const original = ready();
    persistSave(original);
    const next = command(original, { type: 'PLAY_NEXT_MATCH' });
    rejectActiveWrite = true;
    expect(() => persistSave(next)).toThrow('QuotaExceededError');
    expect(loadSave(catalog)).toEqual(original);
    expect(JSON.parse(memory.get(`${SAVE_KEY}:backup`)!)).toEqual(original);
  });
});
