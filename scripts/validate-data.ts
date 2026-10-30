import assert from 'node:assert/strict';
import { ATTRIBUTE_KEYS } from '../src/contracts';
import { catalog } from '../src/data/catalog';
import { NBA_TEAMS } from '../src/data/teams';

const ids = new Set<string>();
const teams = new Set<string>();
const positions = ['guard', 'wing', 'big'] as const;
for (const player of catalog.players) {
  assert(!ids.has(player.playerId), `Duplicate ID: ${player.playerId}`);
  ids.add(player.playerId);
  teams.add(player.teamLabel);
  assert(player.nameEn.trim(), 'Empty player name');
  assert(
    player.nameZh && /[\p{Script=Han}]/u.test(player.nameZh),
    `Missing Chinese display name: ${player.nameEn}`,
  );
  assert(positions.includes(player.drawPosition), `Invalid position: ${player.playerId}`);
  assert.equal(player.dataVersion, catalog.dataVersion);
  for (const key of ATTRIBUTE_KEYS) {
    const value = player.attributes[key];
    assert(
      Number.isInteger(value) && value >= 25 && value <= 99,
      `Invalid ${player.playerId}.${key}`,
    );
    assert(player.evidence[key].sourceRefs.length, `Missing evidence: ${player.playerId}.${key}`);
  }
}
assert.equal(teams.size, 30, 'Roster must cover 30 teams');
assert.equal(NBA_TEAMS.length, 30, 'Exactly 30 team definitions required');
assert.equal(new Set(NBA_TEAMS.map((t) => t.id)).size, 30, 'Unique team IDs');
for (const conference of ['east', 'west'])
  assert.equal(
    NBA_TEAMS.filter((t) => t.conference === conference).length,
    15,
    '15 teams per conference',
  );
for (const division of new Set(NBA_TEAMS.map((t) => t.division)))
  assert.equal(NBA_TEAMS.filter((t) => t.division === division).length, 5, '5 teams per division');
const assigned = NBA_TEAMS.flatMap((t) => t.playerIds);
assert.equal(assigned.length, ids.size, 'Every roster player assigned once');
assert.equal(new Set(assigned).size, ids.size, 'No player assigned to two teams');
for (const team of NBA_TEAMS) {
  assert(team.playerIds.length >= 12, `Insufficient roster for ${team.id}`);
  for (const id of team.playerIds) {
    const p = catalog.players.find((p) => p.playerId === id);
    assert(p && p.teamLabel === team.id, `Wrong team ${id}`);
  }
}

assert.equal(catalog.starIds.length, 40, 'Star pool must contain 40 players');
const stars = new Set(catalog.starIds);
assert.equal(stars.size, 40, 'Duplicate star ID');
for (const id of stars) assert(ids.has(id), `Unknown star: ${id}`);
for (const position of positions) {
  const players = catalog.players.filter((player) => player.drawPosition === position);
  assert(
    players.some((player) => stars.has(player.playerId)),
    `No stars: ${position}`,
  );
  assert(
    players.some((player) => !stars.has(player.playerId)),
    `No ordinary players: ${position}`,
  );
}
console.log(
  JSON.stringify(
    {
      validStructure: true,
      status: catalog.status,
      players: ids.size,
      teams: teams.size,
      stars: stars.size,
      dataVersion: catalog.dataVersion,
      asOfDate: catalog.asOfDate,
      notes: catalog.notes,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--release') && catalog.status !== 'verified') {
  console.error('Release data gate failed: roster/rating verification remains incomplete.');
  process.exitCode = 1;
}
