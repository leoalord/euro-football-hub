/** Football season calendar helpers — European club competitions run Aug–May/June. */

export interface FootballSeason {
  startYear: number;
  endYear: number;
  label: string;
  start: Date;
  end: Date;
}

export function addUtcDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Current European club season. Qualifying starts in July, so July 1 is the
 * rollover — April/May knockouts belong to the season that began the previous July.
 */
export function getFootballSeason(now: Date = new Date()): FootballSeason {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const startYear = month >= 6 ? year : year - 1; // July (6) onwards = new season
  return {
    startYear,
    endYear: startYear + 1,
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
    start: new Date(Date.UTC(startYear, 6, 1)),
    end: new Date(Date.UTC(startYear + 1, 5, 30, 23, 59, 59)),
  };
}

export function isInSeason(date: Date, season: FootballSeason = getFootballSeason()): boolean {
  return date.getTime() >= season.start.getTime() && date.getTime() <= season.end.getTime();
}

/** Monthly ESPN scoreboard ranges covering [from, to], inclusive. */
export function monthlyDateRanges(from: Date, to: Date): string[] {
  const ranges: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor <= endMonth) {
    const monthStart = cursor < from ? from : cursor;
    const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const monthEnd = addUtcDays(nextMonth, -1);
    const rangeEnd = monthEnd < to ? monthEnd : to;
    if (monthStart <= rangeEnd) {
      ranges.push(`${yyyymmdd(monthStart)}-${yyyymmdd(rangeEnd)}`);
    }
    cursor = nextMonth;
  }
  return ranges;
}

/**
 * Scoreboard windows for the current season: from season start through the
 * earlier of season end or `lookaheadDays` from now. Never includes last
 * season's spring knockouts once the new season has begun.
 */
export function currentSeasonScoreboardRanges(
  now: Date = new Date(),
  lookaheadDays = 180,
): string[] {
  const season = getFootballSeason(now);
  const horizon = addUtcDays(now, lookaheadDays);
  const to = horizon < season.end ? horizon : season.end;
  const from = season.start;
  if (from > to) return [];
  return monthlyDateRanges(from, to);
}

/** Domestic cups: recent results plus the rest of the current season. */
export function domesticCupScoreboardRange(now: Date = new Date(), lookbackDays = 45): string {
  const season = getFootballSeason(now);
  const lookback = addUtcDays(now, -lookbackDays);
  const from = lookback > season.start ? lookback : season.start;
  const to = season.end;
  return `${yyyymmdd(from)}-${yyyymmdd(to)}`;
}

export const KNOCKOUT_ROUND_ORDER = [
  "Knockout Playoff",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Final",
] as const;

export type KnockoutRoundName = (typeof KNOCKOUT_ROUND_ORDER)[number];

const LEAGUE_PHASE_ALIASES = [
  "league phase",
  "league stage",
  "regular season",
];

const GROUP_STAGE_ALIASES = [
  "group stage",
  "group phase",
  "groups",
];

export function isLeagueOrGroupPhase(name: string): boolean {
  const s = canonicalize(name);
  if (s === "league") return true;
  return LEAGUE_PHASE_ALIASES.some(a => s === a || s.includes(a))
    || GROUP_STAGE_ALIASES.some(a => s === a || s.includes(a));
}

export function isQualifyingRound(name: string): boolean {
  const s = canonicalize(name);
  return /qualif/.test(s) || /play.?in/.test(s);
}

export function isKnockoutRound(name: string): boolean {
  return (KNOCKOUT_ROUND_ORDER as readonly string[]).includes(name);
}

function canonicalize(raw: string): string {
  return raw.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Map ESPN season-type / note text onto a stable round label.
 * Date is only used when ESPN gives no usable name.
 */
export function normalizeRoundName(raw: string | undefined, eventDate?: Date): string {
  const s = canonicalize(raw || "");

  if (s) {
    if (/knockout play/.test(s) || (/(^| )play.?offs?$/.test(s) && !/league/.test(s))) {
      return "Knockout Playoff";
    }
    if (/round of 16|last 16|r16|eighth/.test(s)) return "Round of 16";
    if (/quarter/.test(s)) return "Quarter-finals";
    if (/semi/.test(s)) return "Semi-finals";
    if (/(^| )finals?$/.test(s) && !/quarter|semi/.test(s)) return "Final";
    if (GROUP_STAGE_ALIASES.some(a => s.includes(a)) || /^group [a-h]$/.test(s)) return "Group Stage";
    if (s === "league" || LEAGUE_PHASE_ALIASES.some(a => s.includes(a))) return "League Phase";
    if (/qualif/.test(s)) return "Qualifying";
    if (/round of 32|last 32/.test(s)) return "Round of 32";
    if (/round of 64/.test(s)) return "Round of 64";
    if (/third.?round|3rd round/.test(s)) return "Third Round";
    if (/second.?round|2nd round/.test(s)) return "Second Round";
    if (/first.?round|1st round/.test(s)) return "First Round";
    if (/fourth.?round|4th round/.test(s)) return "Fourth Round";
    if (/fifth.?round|5th round/.test(s)) return "Fifth Round";
  }

  if (eventDate) return inferEuropeanRoundFromDate(eventDate);
  return raw?.trim() || "Unknown";
}

/** Date-based fallback for European competitions in the *current* season only. */
export function inferEuropeanRoundFromDate(date: Date): string {
  const month = date.getUTCMonth();
  if (month >= 6 && month <= 7) return "Qualifying"; // Jul–Aug
  if (month >= 8 || month === 0) return "League Phase"; // Sep–Jan
  if (month === 1) return "Knockout Playoff"; // Feb
  if (month === 2) return "Round of 16"; // Mar
  if (month === 3) return "Quarter-finals"; // Apr
  if (month === 4) return "Semi-finals"; // May
  return "Final"; // Jun
}

export function collectRoundHints(event: {
  season?: { type?: { name?: string; abbreviation?: string }; slug?: string; name?: string };
  competitions?: Array<{ notes?: Array<{ headline?: string; text?: string }> }>;
  notes?: Array<{ headline?: string }>;
}): string {
  const parts: string[] = [];
  const seasonType = event.season?.type?.name || event.season?.type?.abbreviation || "";
  if (seasonType) parts.push(seasonType);
  if (event.season?.slug) parts.push(event.season.slug.replace(/-/g, " "));
  if (event.season?.name) parts.push(event.season.name);
  for (const comp of event.competitions || []) {
    for (const note of comp.notes || []) {
      if (note.headline) parts.push(note.headline);
      if (note.text) parts.push(note.text);
    }
  }
  for (const note of event.notes || []) {
    if (note.headline) parts.push(note.headline);
  }
  return parts.join(" | ");
}

export function inferDomesticRoundFromCounts(upcomingCount: number, completedCount: number): string {
  const relevantCount = upcomingCount > 0 ? upcomingCount : completedCount;
  if (relevantCount <= 1) return "Final";
  if (relevantCount <= 2) return "Semi-Finals";
  if (relevantCount <= 4) return "Quarter-Finals";
  if (relevantCount <= 8) return "Round of 16";
  if (relevantCount <= 16) return "Round of 32";
  return "Early Rounds";
}

/**
 * Prefer ESPN-provided round names. Only guess from match counts when every
 * match lacks a label — never promote a handful of posted fixtures to QF/Final
 * just because ESPN has not published the rest of the round yet.
 */
export function resolveDomesticRound(
  matchRounds: Array<string | undefined>,
  upcomingCount: number,
  completedCount: number,
): string {
  const named = matchRounds
    .map(r => (r || "").trim())
    .filter(Boolean);
  if (named.length > 0) {
    const counts = new Map<string, number>();
    for (const name of named) counts.set(name, (counts.get(name) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }
  if (upcomingCount > 8 || completedCount > 8) {
    return inferDomesticRoundFromCounts(upcomingCount, completedCount);
  }
  if (upcomingCount === 0 && completedCount > 0 && completedCount <= 4) {
    return inferDomesticRoundFromCounts(0, completedCount);
  }
  return upcomingCount > 0 ? "Upcoming" : "TBD";
}

export function leaguePhaseZone(rank: number): { zone?: string; zoneColor?: string } {
  if (rank <= 0) return {};
  if (rank <= 8) return { zone: "R16", zoneColor: "#1a56db" };
  if (rank <= 24) return { zone: "Playoff", zoneColor: "#d97706" };
  return { zone: "Out", zoneColor: "#64748b" };
}
