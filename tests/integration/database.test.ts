import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createCareer } from '../../src/domain';
import { catalog } from '../../src/data/catalog';
import { loadStoredCareer, storeCareer } from '../../src/application/repository';
describe('IndexedDB career persistence', () => {
  it('round trips a snapshot with atomic backup and allows replacement', async () => {
    const initial = createCareer(882, catalog);
    if (!initial.ok) throw Error(initial.error.code);
    await storeCareer(initial.value);
    expect(await loadStoredCareer(catalog)).toEqual(initial.value);
    const next = structuredClone(initial.value);
    next.coins = 500;
    next.revision++;
    await storeCareer(next);
    expect(await loadStoredCareer(catalog)).toEqual(next);
  });
});
