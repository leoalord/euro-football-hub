import { marketProbability, normalizeTeamName } from "./kalshi-client.ts";
import { findKalshiEntry, type KalshiOdds } from "./kalshi.ts";
import { findCupFavorite } from "./domestic-cups.ts";
import { findCupOdds } from "./european-cups.ts";
import { computeBattles, titleGapAllowance } from "./espn.ts";
import type { StandingEntry } from "@shared/schema";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq<T>(actual: T, expected: T, msg: string) {
  assert(actual === expected, `${msg}: expected ${expected}, got ${actual}`);
}

// ---- marketProbability: trust last trade only inside the live quotes ----
const mkt = (last: string, bid: string, ask: string) =>
  ({ last_price_dollars: last, yes_bid_dollars: bid, yes_ask_dollars: ask });

eq(marketProbability(mkt("0.9100", "0.8900", "0.9100")), 91, "last inside spread is kept (Bayern)");
eq(marketProbability(mkt("0.2600", "0.1300", "0.2300")), 18, "stale last above ask uses midpoint (Hamburg)");
eq(marketProbability(mkt("0.0000", "0.0200", "0.1100")), 7, "zero last below bid uses midpoint (Mainz)");
eq(marketProbability(mkt("0.1900", "0.2500", "0.3000")), 28, "last below bid uses midpoint (Levante)");
eq(marketProbability(mkt("0.3000", "0.0000", "0.0700")), 4, "stale last with 0-7c book (Stuttgart)");
eq(marketProbability(mkt("0.4200", "0.0000", "0.0000")), 42, "no quotes falls back to last");
eq(marketProbability({}), 0, "empty market is 0");

// ---- name normalization / Kalshi entry lookup ----
eq(normalizeTeamName("Málaga"), "malaga", "accents stripped");
eq(normalizeTeamName("M´gladbach"), "mgladbach", "acute apostrophe stripped");

const entries = (names: string[]): KalshiOdds[] =>
  names.map((teamName, i) => ({ teamName, probability: 50 - i, ticker: "" }));

eq(findKalshiEntry("Málaga", entries(["Malaga"]))?.teamName, "Malaga", "accent-insensitive match");
eq(findKalshiEntry("Athletic Club", entries(["Athletic Bilbao"]))?.teamName, "Athletic Bilbao", "Athletic Club alias");
eq(findKalshiEntry("Stade Rennais", entries(["Stade Rennes"]))?.teamName, "Stade Rennes", "Rennes alias");
eq(findKalshiEntry("Borussia Mönchengladbach", entries(["M´gladbach"]))?.teamName, "M´gladbach", "Gladbach alias");
// "Paris" (Paris FC) sorts first by odds but must not be picked for PSG.
eq(findKalshiEntry("Paris Saint-Germain", entries(["Paris", "PSG"]))?.teamName, "PSG", "exact alias beats substring");
eq(findKalshiEntry("Paris FC", entries(["PSG", "Paris"]))?.teamName, "Paris", "Paris FC still matched");

// ---- cup favorites: no first-word collisions, ESPN abbreviations resolved ----
const favs = entries(["Manchester City", "Manchester United", "Crystal Palace", "Bradford"]);
eq(findCupFavorite("Man City", favs)?.teamName, "Manchester City", "Man City alias");
eq(findCupFavorite("C Palace", favs)?.teamName, "Crystal Palace", "C Palace alias");
eq(findCupFavorite("Manchester Utd FC", favs), undefined, "ambiguous first word does not guess");
eq(findCupFavorite("Bradford City", favs)?.teamName, "Bradford", "substring still matches");

// ---- European cups: Kalshi spellings that share no substring with ESPN's ----
const euroOdds = entries(["Lille", "Lillestroem", "Enschede", "Crvena Zvezda"])
  .map(e => ({ ...e, isEliminated: false }));
eq(findCupOdds("Lillestrom", euroOdds)?.teamName, "Lillestroem", "Lille must not claim Lillestrom");
eq(findCupOdds("Lille", euroOdds)?.teamName, "Lille", "Lille still matches itself");
eq(findCupOdds("FC Twente", euroOdds)?.teamName, "Enschede", "Twente listed by city");
eq(findCupOdds("Red Star Belgrade", euroOdds)?.teamName, "Crvena Zvezda", "Red Star native name");

// ---- title contenders: points gap counts even when market is at 1c ----
eq(titleGapAllowance(26), 7, "allowance with 26 games left");
eq(titleGapAllowance(8), 2, "allowance with 8 games left");

function team(rank: number, name: string, points: number, played: number, total: number): StandingEntry {
  const remaining = total - played;
  return {
    rank, teamId: String(rank), teamName: name, teamAbbreviation: name.slice(0, 3).toUpperCase(),
    teamLogo: "", gamesPlayed: played, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    goalDifference: 0, points, gamesRemaining: remaining, ppg: points / played,
    maxPossiblePoints: points + remaining * 3,
  };
}

// La Liga after 12 games (from the reported screenshot).
const laLiga = [
  ["Barcelona", 33], ["Real Madrid", 30], ["Atlético Madrid", 28], ["Real Betis", 26],
  ["Real Sociedad", 22], ["Sevilla", 18], ["Athletic Club", 16], ["Villarreal", 15],
  ["Deportivo", 15], ["Racing Santander", 14], ["Celta Vigo", 13], ["Alavés", 13],
  ["Espanyol", 12], ["Rayo Vallecano", 12], ["Getafe", 12], ["Osasuna", 12],
  ["Levante", 11], ["Elche", 10], ["Valencia", 9], ["Málaga", 5],
].map(([n, p], i) => team(i + 1, n as string, p as number, 12, 38));

const laLigaOdds = {
  title: entries(["Barcelona", "Real Madrid", "Atletico Madrid", "Betis", "Real Sociedad"])
    .map((e, i) => ({ ...e, probability: [67, 28, 1, 1, 1][i] })),
  relegation: [{ teamName: "Malaga", probability: 79, ticker: "" }],
  lastUpdated: "",
};
const battles = computeBattles(laLiga, "esp.1", laLigaOdds);
const euro = battles.find(b => b.type === "european")!;
const contenders = euro.teams.filter(t => t.isTitleContender).map(t => t.teamName);
assert(
  JSON.stringify(contenders) === JSON.stringify(["Barcelona", "Real Madrid", "Atlético Madrid", "Real Betis"]),
  `La Liga contenders should include Atlético and Betis, got ${contenders}`,
);
assert(!contenders.includes("Real Sociedad"), "11pts back is not a contender");
const rel = battles.find(b => b.type === "relegation")!;
eq(rel.teams.find(t => t.teamName === "Málaga")?.relegationOdds, "79%", "Málaga relegation odds matched");

// Level on points: wording should not say "lead by 0pts".
const level = [team(1, "Bayern Munich", 21, 9, 34), team(2, "Borussia Dortmund", 21, 9, 34),
  ...Array.from({ length: 16 }, (_, i) => team(i + 3, `Team ${i + 3}`, 10 - Math.floor(i / 2), 9, 34))];
const levelInsight = computeBattles(level, "ger.1").find(b => b.type === "european")!.insight;
assert(!levelInsight.includes("by 0pt"), `tie wording: ${levelInsight}`);
assert(levelInsight.includes("level"), `tie wording should say level: ${levelInsight}`);

console.log("odds tests passed", { contenders, levelInsight });
