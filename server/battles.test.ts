import { computeBattles } from "./espn.ts";
import type { StandingEntry } from "@shared/schema";

function team(rank: number, name: string, points: number, zone?: string): StandingEntry {
  const gp = 2;
  return {
    rank,
    teamId: String(rank),
    teamName: name,
    teamAbbreviation: name.slice(0, 3).toUpperCase(),
    teamLogo: "",
    gamesPlayed: gp,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points,
    gamesRemaining: 36,
    ppg: points / gp,
    maxPossiblePoints: points + 36 * 3,
    zone,
  };
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function relRanks(standings: StandingEntry[]) {
  const battles = computeBattles(standings, "eng.1");
  const rel = battles.find(b => b.type === "relegation");
  if (!rel) throw new Error("missing relegation battle");
  return rel.teams.map(t => t.rank);
}

// Early-season bunched table: everyone is within 8pts of the drop zone.
const bunched: StandingEntry[] = [
  team(1, "City", 6),
  team(2, "Arsenal", 6),
  team(3, "Hull", 6),
  team(4, "Chelsea", 6),
  team(5, "Brentford", 4),
  team(6, "Newcastle", 4),
  team(7, "Everton", 4),
  team(8, "Leeds", 4),
  team(9, "Brighton", 3),
  team(10, "United", 3),
  team(11, "Sunderland", 3),
  team(12, "Ipswich", 3),
  team(13, "Liverpool", 2),
  team(14, "Bournemouth", 2),
  team(15, "Forest", 1),
  team(16, "Fulham", 1),
  team(17, "Coventry", 1),
  team(18, "Palace", 0, "Relegation"),
  team(19, "Villa", 0, "Relegation"),
  team(20, "Spurs", 0, "Relegation"),
];

const bunchedRanks = relRanks(bunched);
assert(bunchedRanks[0] >= 13, `bunched should start near the bottom, got ${bunchedRanks}`);
assert(!bunchedRanks.includes(1), `leaders must not appear in relegation battle: ${bunchedRanks}`);
assert(bunchedRanks.includes(20) && bunchedRanks.includes(18), `drop-zone teams missing: ${bunchedRanks}`);
assert(bunchedRanks.length <= 8, `too many relegation teams: ${bunchedRanks.length}`);

// Spread table: only the bottom cluster should appear, even if a mid-table
// team is more than 8pts clear.
const spread: StandingEntry[] = Array.from({ length: 20 }, (_, i) => {
  const rank = i + 1;
  const points = 60 - i * 3; // 60, 57, ... 3
  const zone = rank >= 18 ? "Relegation" : rank <= 4 ? "Champions League" : undefined;
  return team(rank, `Team ${rank}`, points, zone);
});
const spreadRanks = relRanks(spread);
assert(spreadRanks[0] >= 13, `spread should be bottom window, got ${spreadRanks}`);
assert(spreadRanks[spreadRanks.length - 1] === 20, `spread must include 20th: ${spreadRanks}`);
assert(!spreadRanks.includes(1) && !spreadRanks.includes(8), `spread leaked top teams: ${spreadRanks}`);

console.log("battles tests passed", { bunchedRanks, spreadRanks });
