import type { Catalog, PlayerDefinition } from '../contracts';
import players from './players.json';
import starIds from './star-pool.json';
import meta from './roster-meta.json';
// This is a roster reference, not a verified contemporary roster or 2K rating set.
export const catalog: Catalog = {
  players: players as PlayerDefinition[],
  starIds,
  dataVersion: meta.dataVersion,
  asOfDate: meta.asOfDate,
  status: 'partial',
  notes: meta.notes,
};
