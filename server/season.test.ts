import {
  getFootballSeason,
  currentSeasonScoreboardMonths,
  domesticCupScoreboardWindow,
  scoreboardMonths,
  isEventInWindow,
  isInSeason,
  normalizeRoundName,
  inferEuropeanRoundFromDate,
  resolveDomesticRound,
  isLeagueOrGroupPhase,
  isKnockoutRound,
  leaguePhaseZone,
  collectRoundHints,
} from "./season.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const sept2026 = new Date("2026-09-12T12:00:00Z");
const apr2026 = new Date("2026-04-15T18:00:00Z");
const jan2027 = new Date("2027-01-20T18:00:00Z");

const season = getFootballSeason(sept2026);
assert(season.startYear === 2026, `startYear: ${season.startYear}`);
assert(season.endYear === 2027, `endYear: ${season.endYear}`);
assert(season.label === "2026-27", `label: ${season.label}`);
assert(season.start.toISOString().startsWith("2026-07-01"), `start: ${season.start.toISOString()}`);

const springSeason = getFootballSeason(apr2026);
assert(springSeason.label === "2025-26", `spring should still be 2025-26, got ${springSeason.label}`);

assert(isInSeason(sept2026, season), "Sept 2026 is in 2026-27");
assert(!isInSeason(apr2026, season), "April 2026 QF is NOT in 2026-27");
assert(isInSeason(jan2027, season), "Jan 2027 league phase is in 2026-27");

// ESPN rejects YYYYMMDD-YYYYMMDD ranges (400); only YYYYMM months are sent.
const months = currentSeasonScoreboardMonths(sept2026);
assert(months.every(m => /^\d{6}$/.test(m)), `months must be YYYYMM, got ${months.join(",")}`);
assert(!months.includes("202604"), `must not fetch last season QF window, got ${months.join(",")}`);
assert(months.includes("202609"), `must include Sept 2026, got ${months.join(",")}`);
assert(months[0] === "202607", `season fetch starts in July, got ${months[0]}`);
assert(months[months.length - 1] === "202703", `180-day lookahead ends in March, got ${months.join(",")}`);

assert(
  scoreboardMonths(new Date("2026-11-20T00:00:00Z"), new Date("2027-01-05T00:00:00Z")).join(",") === "202611,202612,202701",
  "months span year boundary",
);
assert(scoreboardMonths(new Date("2026-10-31T00:00:00Z"), new Date("2026-10-01T00:00:00Z")).length === 0, "empty when from > to");

const domestic = domesticCupScoreboardWindow(sept2026);
assert(domestic.months[0] === "202607", `domestic starts at season start (45d lookback is pre-season), got ${domestic.months[0]}`);
assert(domestic.months[domestic.months.length - 1] === "202706", `domestic runs through season end, got ${domestic.months.join(",")}`);
assert(!domestic.months.includes("202604"), "domestic must not fetch last season");
const octWindow = domesticCupScoreboardWindow(new Date("2026-10-13T12:00:00Z"));
assert(octWindow.from.toISOString().startsWith("2026-08-29"), `45-day lookback, got ${octWindow.from.toISOString()}`);
assert(octWindow.months[0] === "202608", `lookback month included, got ${octWindow.months[0]}`);

assert(isEventInWindow({ date: "2026-09-01T19:00Z" }, octWindow.from, octWindow.to), "event inside window");
assert(!isEventInWindow({ date: "2026-08-15T19:00Z" }, octWindow.from, octWindow.to), "event before lookback excluded");
assert(!isEventInWindow({}, octWindow.from, octWindow.to), "event without date excluded");

assert(normalizeRoundName(collectRoundHints({ season: { slug: "league-phase", type: { name: "League Phase" } } })) === "League Phase", "ESPN league-phase slug");
assert(normalizeRoundName(collectRoundHints({ season: { slug: "first-round" } })) === "First Round", "ESPN first-round slug");
assert(normalizeRoundName("Regular Season", sept2026) === "League Phase", "regular season → league phase");
assert(normalizeRoundName("League Stage") === "League Phase", "league stage");
assert(normalizeRoundName("Group Stage") === "Group Stage", "group stage");
assert(normalizeRoundName("1st Leg - Quarterfinals") === "Quarter-finals", "notes QF");
assert(normalizeRoundName("Round of 16") === "Round of 16", "R16");
assert(normalizeRoundName("", sept2026) === "League Phase", "Sept date fallback is league phase");
assert(normalizeRoundName("", apr2026) === "Quarter-finals", "Apr date fallback is QF");
assert(inferEuropeanRoundFromDate(sept2026) === "League Phase", "Sept = league phase");
assert(isLeagueOrGroupPhase("League Phase"), "league phase flag");
assert(isLeagueOrGroupPhase("Group Stage"), "group stage flag");
assert(!isLeagueOrGroupPhase("Champions League"), "competition name is not a phase");
assert(normalizeRoundName("Champions League", sept2026) === "League Phase", "bare competition name falls back to date");
assert(isKnockoutRound("Quarter-finals"), "QF is knockout");
assert(!isKnockoutRound("League Phase"), "league phase is not knockout");

assert(resolveDomesticRound(["Second Round", "Second Round", "Third Round"], 12, 8) === "Second Round", "majority ESPN round");
assert(resolveDomesticRound([undefined, undefined], 3, 0) === "Upcoming", "do not invent QF from 3 posted fixtures");
assert(resolveDomesticRound([], 1, 0) === "Upcoming", "single posted fixture is not the Final");
assert(resolveDomesticRound([], 0, 1) === "Final", "one completed leftover cluster can be the Final");
assert(resolveDomesticRound([], 16, 0) === "Round of 32", "large upcoming field uses counts");

assert(leaguePhaseZone(1).zone === "R16", "top 8 go to R16");
assert(leaguePhaseZone(16).zone === "Playoff", "9-24 playoff");
assert(leaguePhaseZone(30).zone === "Out", "25-36 out");

console.log("season tests passed");
