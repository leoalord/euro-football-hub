import { EURO_CUP_CONFIG, type EuropeanCupData, type CupTeam, type CupMatch, type CupTie, type CupRound, type CupFavorite, type CupGroupTable, type CupLeaguePhase, type CupStandingRow, type MatchOdds } from "@shared/schema";
import { fetchKalshiMarkets as fetchKalshiMarketsRaw } from "./kalshi-client";
import { cached, getCacheTTL } from "./cache";
import { fetchEspnJSON } from "./espn-json";
import {
  collectRoundHints,
  currentSeasonScoreboardRanges,
  getFootballSeason,
  isInSeason,
  isKnockoutRound,
  isLeagueOrGroupPhase,
  isQualifyingRound,
  leaguePhaseZone,
  normalizeRoundName,
} from "./season";

async function fetchJSON(path: string): Promise<any> {
  return fetchEspnJSON(path);
}

// ---- Kalshi Tournament Odds ----
interface KalshiTournamentOdds {
  teamName: string;
  probability: number; // 0-100
  ticker: string;
  isEliminated: boolean; // finalized = eliminated
}

// Per-tie advance odds from Kalshi (e.g., KXUCLADVANCE)
interface KalshiAdvanceOdds {
  title: string;       // e.g. "Barcelona vs Newcastle"
  team1Name: string;
  team1Prob: number;   // 0-100
  team2Name: string;
  team2Prob: number;   // 0-100
  isSettled: boolean;
}

// Kalshi advance series per competition (only UCL has one currently)
const ADVANCE_SERIES: Record<string, string | undefined> = {
  "uefa.champions": "KXUCLADVANCE",
  "uefa.europa": undefined,
  "uefa.europa.conf": undefined,
};

async function fetchTournamentOdds(kalshiTicker: string): Promise<KalshiTournamentOdds[]> {
  return cached(`kalshi:cup:${kalshiTicker}`, 30 * 60 * 1000, async () => {
    try {
      const markets = await fetchKalshiMarketsRaw(kalshiTicker);

      const odds: KalshiTournamentOdds[] = markets
        .map((m: any) => ({
          teamName: m.no_sub_title || m.yes_sub_title || "",
          probability: Math.round(parseFloat(m.last_price_dollars || "0") * 100),
          ticker: m.ticker || "",
          isEliminated: m.status === "finalized" || m.status === "settled",
        }))
        .filter((o: KalshiTournamentOdds) => o.teamName);

      console.log(`[Kalshi] ${kalshiTicker}: ${odds.filter(o => !o.isEliminated).length} active teams`);
      return odds;
    } catch (error) {
      console.error(`[Kalshi] Error fetching ${kalshiTicker}:`, error);
      return [];
    }
  }, { shouldCache: (odds) => odds.length > 0 });
}

// Fetch per-tie advance odds from Kalshi (e.g., KXUCLADVANCE)
async function fetchAdvanceOdds(seriesTicker: string | undefined): Promise<KalshiAdvanceOdds[]> {
  if (!seriesTicker) return [];

  return cached(`kalshi:advance:${seriesTicker}`, 15 * 60 * 1000, async () => {
    const markets = await fetchKalshiMarketsRaw(seriesTicker);

    // Group markets by title (each tie has 2 markets)
    const tieMap = new Map<string, { team: string; prob: number; settled: boolean }[]>();
    for (const m of markets) {
      const title = m.title || "";
      const teamName = m.no_sub_title || m.yes_sub_title || "";
      const prob = Math.round(parseFloat(m.last_price_dollars || "0") * 100);
      const settled = m.status === "finalized" || m.status === "settled";
      if (!tieMap.has(title)) tieMap.set(title, []);
      tieMap.get(title)!.push({ team: teamName, prob, settled });
    }

    const results: KalshiAdvanceOdds[] = [];
    for (const [title, teams] of tieMap) {
      if (teams.length >= 2) {
        results.push({
          title,
          team1Name: teams[0].team,
          team1Prob: teams[0].prob,
          team2Name: teams[1].team,
          team2Prob: teams[1].prob,
          isSettled: teams[0].settled && teams[1].settled,
        });
      }
    }

    const active = results.filter(r => !r.isSettled);
    console.log(`[Kalshi] ${seriesTicker}: ${active.length} active advance ties, ${results.length} total`);
    return results;
  }, { shouldCache: (results) => results.length > 0 });
}

// Derive implied advance odds from tournament winner probabilities
// If no direct advance markets exist, use relative tournament odds as a proxy
function deriveImpliedAdvance(team1Name: string, team2Name: string, kalshiOdds: KalshiTournamentOdds[]): { team1: number; team2: number } | null {
  const t1Odds = getTeamOdds(team1Name, kalshiOdds);
  const t2Odds = getTeamOdds(team2Name, kalshiOdds);
  if (t1Odds === null && t2Odds === null) return null;

  const t1 = t1Odds || 0;
  const t2 = t2Odds || 0;
  const total = t1 + t2;
  if (total === 0) return null;

  // Normalize relative tournament odds to sum to ~100%
  // This isn't perfect but gives a reasonable implied advance probability
  const t1Advance = Math.round((t1 / total) * 100);
  const t2Advance = Math.round((t2 / total) * 100);
  return { team1: t1Advance, team2: t2Advance };
}

// Match advance odds to a specific tie
function getAdvanceOddsForTie(
  team1Name: string,
  team2Name: string,
  advanceOdds: KalshiAdvanceOdds[]
): { team1: number; team2: number } | null {
  for (const ao of advanceOdds) {
    // Check both orderings
    const t1MatchesFirst = matchCupTeam(ao.team1Name, team1Name) && matchCupTeam(ao.team2Name, team2Name);
    const t1MatchesSecond = matchCupTeam(ao.team1Name, team2Name) && matchCupTeam(ao.team2Name, team1Name);
    if (t1MatchesFirst) {
      return { team1: ao.team1Prob, team2: ao.team2Prob };
    }
    if (t1MatchesSecond) {
      return { team1: ao.team2Prob, team2: ao.team1Prob };
    }
  }
  return null;
}

// Team name matching for Kalshi -> ESPN
const CUP_TEAM_NAME_MAP: Record<string, string> = {
  // UCL
  "PSG": "Paris Saint-Germain",
  "Liverpool": "Liverpool",
  "Bayern Munich": "Bayern Munich",
  "Atletico": "Atlético Madrid",
  "Newcastle": "Newcastle United",
  "Tottenham": "Tottenham Hotspur",
  "Sporting Lisbon": "Sporting CP",
  "Galatasaray": "Galatasaray",
  // UEL
  "Nottingham": "Nottingham Forest",
  "Ferencvarosi": "Ferencvaros",
  "Vallecano": "Rayo Vallecano",
  "Czestochowa": "Raków Czestochowa",
  "Larnaca": "AEK Larnaca",
  // UECL
  "Shakhtar": "Shakhtar Donetsk",
  "Strasbourg Alsace": "Strasbourg",
  "Samsunpor": "Samsunspor",
  "Olomouc": "Sigma Olomouc",
};

function matchCupTeam(kalshiName: string, espnName: string): boolean {
  const kLower = kalshiName.toLowerCase();
  const eLower = espnName.toLowerCase();
  if (eLower.includes(kLower) || kLower.includes(eLower)) return true;
  const mapped = CUP_TEAM_NAME_MAP[kalshiName];
  if (mapped) {
    const mLower = mapped.toLowerCase();
    return eLower.includes(mLower) || mLower.includes(eLower);
  }
  return false;
}

function getTeamOdds(teamName: string, odds: KalshiTournamentOdds[]): number | null {
  for (const o of odds) {
    if (matchCupTeam(o.teamName, teamName)) return o.probability;
  }
  return null;
}

function isTeamEliminated(teamName: string, odds: KalshiTournamentOdds[]): boolean {
  for (const o of odds) {
    if (matchCupTeam(o.teamName, teamName)) return o.isEliminated;
  }
  return false;
}

// ---- Parse American odds ----
function americanToImpliedProb(odds: string): number {
  const n = parseInt(odds.replace("EVEN", "100").replace("+", ""));
  if (isNaN(n)) return 0;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}

function determineFavorite(homeML: string | undefined, awayML: string | undefined): string {
  if (!homeML || !awayML) return "unknown";
  const homeProb = americanToImpliedProb(homeML);
  const awayProb = americanToImpliedProb(awayML);
  if (Math.abs(homeProb - awayProb) < 0.05) return "toss-up";
  return homeProb > awayProb ? "home" : "away";
}

function extractOdds(comp: any): MatchOdds | undefined {
  const odds = comp?.odds?.[0];
  if (!odds) return undefined;
  const ml = odds.moneyline || {};
  const homeML = ml.home?.close?.odds;
  const awayML = ml.away?.close?.odds;
  const drawML = ml.draw?.close?.odds;
  if (!homeML && !awayML) return undefined;
  return {
    homeMoneyline: homeML,
    awayMoneyline: awayML,
    drawMoneyline: drawML,
    favorite: determineFavorite(homeML, awayML),
    provider: odds.provider?.name,
  };
}

// ---- ESPN Bracket / League-phase Data ----

function eventRoundName(event: any): string {
  const date = event.date ? new Date(event.date) : undefined;
  return normalizeRoundName(collectRoundHints(event), date);
}

function parseCupMatchFromEvent(event: any): CupMatch | null {
  const comp = event.competitions?.[0];
  if (!comp) return null;
  const competitors = comp.competitors || [];
  if (competitors.length < 2) return null;

  const notes = comp.notes || [];
  const note = notes[0]?.headline || "";
  const statusName = comp.status?.type?.name || "";
  const statusDetail = comp.status?.type?.shortDetail || comp.status?.type?.detail || "";

  let leg = "";
  if (note.includes("1st Leg")) leg = "1st Leg";
  else if (note.includes("2nd Leg")) leg = "2nd Leg";

  const home = competitors.find((c: any) => c.homeAway === "home") || competitors[0];
  const away = competitors.find((c: any) => c.homeAway === "away") || competitors[1];
  const homeName = home.team?.displayName || home.team?.name || "";
  const awayName = away.team?.displayName || away.team?.name || "";
  if (homeName.includes("Winner") || awayName.includes("Winner") || homeName.includes("TBD") || awayName.includes("TBD")) {
    return null;
  }

  return {
    id: event.id,
    date: event.date,
    status: statusName,
    statusDetail,
    homeTeam: {
      id: home.team.id,
      name: homeName,
      abbreviation: home.team.abbreviation || home.team.shortDisplayName || "",
      logo: home.team.logo || home.team.logos?.[0]?.href || "",
      score: statusName !== "STATUS_SCHEDULED" ? parseInt(home.score || "0") : null,
    },
    awayTeam: {
      id: away.team.id,
      name: awayName,
      abbreviation: away.team.abbreviation || away.team.shortDisplayName || "",
      logo: away.team.logo || away.team.logos?.[0]?.href || "",
      score: statusName !== "STATUS_SCHEDULED" ? parseInt(away.score || "0") : null,
    },
    leg: leg || undefined,
    odds: extractOdds(comp),
  };
}

// Current-season events only — last spring's knockouts are excluded after July 1.
async function fetchCupEvents(espnSlug: string, now = new Date()): Promise<any[]> {
  const allEvents: any[] = [];
  const seenIds = new Set<string>();
  const season = getFootballSeason(now);
  const dateRanges = currentSeasonScoreboardRanges(now);

  const results = await Promise.allSettled(
    dateRanges.map(range =>
      fetchJSON(`/site/v2/sports/soccer/${espnSlug}/scoreboard?dates=${range}&limit=300`)
    )
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const event of result.value?.events || []) {
      if (!event?.id || seenIds.has(event.id)) continue;
      if (event.date && !isInSeason(new Date(event.date), season)) continue;
      seenIds.add(event.id);
      allEvents.push(event);
    }
  }

  return allEvents;
}

function parseStandingEntries(entries: any[]): CupStandingRow[] {
  return entries.map((entry: any) => {
    const stats = entry.stats || [];
    const getStat = (name: string): number => {
      const stat = stats.find((s: any) => s.name === name);
      return stat ? Number(stat.value) || 0 : 0;
    };
    const rank = getStat("rank") || Number(entry.team?.rank) || 0;
    const zone = leaguePhaseZone(rank);
    return {
      rank,
      team: {
        id: entry.team?.id || "",
        name: entry.team?.displayName || entry.team?.name || "",
        abbreviation: entry.team?.abbreviation || "",
        logo: entry.team?.logos?.[0]?.href || entry.team?.logo || "",
      },
      gamesPlayed: getStat("gamesPlayed"),
      wins: getStat("wins"),
      draws: getStat("ties"),
      losses: getStat("losses"),
      goalsFor: getStat("pointsFor"),
      goalsAgainst: getStat("pointsAgainst"),
      goalDifference: getStat("pointDifferential"),
      points: getStat("points"),
      zone: entry.note?.description || zone.zone,
      zoneColor: entry.note?.color || zone.zoneColor,
    };
  }).filter(row => row.team.id && !row.team.name.includes("Winner"));
}

async function fetchCupStandings(espnSlug: string): Promise<CupGroupTable[]> {
  try {
    const data = await fetchJSON(`/v2/sports/soccer/${espnSlug}/standings`);
    const children = Array.isArray(data?.children) && data.children.length > 0
      ? data.children
      : data?.standings ? [data] : [];

    const tables: CupGroupTable[] = [];
    for (const child of children) {
      const entries = child?.standings?.entries || child?.standings?.[0]?.entries || [];
      if (!entries.length) continue;
      tables.push({
        name: child.name || child.abbreviation || "League Phase",
        standings: parseStandingEntries(entries).sort((a, b) => a.rank - b.rank),
      });
    }
    return tables;
  } catch (error) {
    console.error(`[EuroCup] Standings error for ${espnSlug}:`, error);
    return [];
  }
}

// Group events into ties (two-leg matchups between same teams)
function groupIntoTies(events: any[], kalshiOdds: KalshiTournamentOdds[], advanceOdds: KalshiAdvanceOdds[]): { ties: CupTie[]; roundName: string }[] {
  // Parse all events into matches first
  interface ParsedMatch {
    id: string;
    date: string;
    status: string;
    statusDetail: string;
    homeTeam: CupTeam & { score: number | null };
    awayTeam: CupTeam & { score: number | null };
    leg: string;
    note: string;
    odds?: MatchOdds;
    roundName: string;
  }

  const parsed: ParsedMatch[] = [];

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const competitors = comp.competitors || [];
    if (competitors.length < 2) continue;

    const notes = comp.notes || [];
    const note = notes[0]?.headline || "";
    const statusName = comp.status?.type?.name || "";
    const statusDetail = comp.status?.type?.shortDetail || comp.status?.type?.detail || "";

    // Determine the leg/round from notes
    let leg = "";
    if (note.includes("1st Leg")) leg = "1st Leg";
    else if (note.includes("2nd Leg")) leg = "2nd Leg";

    const eventDate = event.date ? new Date(event.date) : undefined;
    const roundName = normalizeRoundName(collectRoundHints(event) || note, eventDate);
    if (isLeagueOrGroupPhase(roundName) || isQualifyingRound(roundName)) continue;

    const home = competitors.find((c: any) => c.homeAway === "home") || competitors[0];
    const away = competitors.find((c: any) => c.homeAway === "away") || competitors[1];

    parsed.push({
      id: event.id,
      date: event.date,
      status: statusName,
      statusDetail,
      homeTeam: {
        id: home.team.id,
        name: home.team.displayName || home.team.name,
        abbreviation: home.team.abbreviation || home.team.shortDisplayName || "",
        logo: home.team.logo || home.team.logos?.[0]?.href || "",
        score: statusName !== "STATUS_SCHEDULED" ? parseInt(home.score || "0") : null,
      },
      awayTeam: {
        id: away.team.id,
        name: away.team.displayName || away.team.name,
        abbreviation: away.team.abbreviation || away.team.shortDisplayName || "",
        logo: away.team.logo || away.team.logos?.[0]?.href || "",
        score: statusName !== "STATUS_SCHEDULED" ? parseInt(away.score || "0") : null,
      },
      leg,
      note,
      odds: extractOdds(comp),
      roundName,
    });
  }

  // Group matches into ties (pairs of matches between same teams)
  const tieMap = new Map<string, ParsedMatch[]>();

  for (const match of parsed) {
    // Create a key from sorted team IDs to group home/away legs together
    const teamIds = [match.homeTeam.id, match.awayTeam.id].sort();
    const key = `${match.roundName}:${teamIds.join("-")}`;
    if (!tieMap.has(key)) tieMap.set(key, []);
    tieMap.get(key)!.push(match);
  }

  // Organize into rounds
  const roundMap = new Map<string, CupTie[]>();

  for (const [key, matches] of tieMap) {
    const roundName = key.split(":")[0];
    if (!roundMap.has(roundName)) roundMap.set(roundName, []);

    // Sort by date
    matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const firstMatch = matches[0];
    // team1 is always the home team in the 1st leg (or only match)
    const team1: CupTeam = {
      id: firstMatch.homeTeam.id,
      name: firstMatch.homeTeam.name,
      abbreviation: firstMatch.homeTeam.abbreviation,
      logo: firstMatch.homeTeam.logo,
    };
    const team2: CupTeam = {
      id: firstMatch.awayTeam.id,
      name: firstMatch.awayTeam.name,
      abbreviation: firstMatch.awayTeam.abbreviation,
      logo: firstMatch.awayTeam.logo,
    };

    // Build match objects
    const cupMatches: CupMatch[] = matches.map((m) => ({
      id: m.id,
      date: m.date,
      status: m.status,
      statusDetail: m.statusDetail,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      leg: m.leg || undefined,
      odds: m.odds,
    }));

    // Calculate aggregate score
    let team1Agg = 0;
    let team2Agg = 0;
    let allComplete = true;
    let anyStarted = false;

    for (const m of matches) {
      if (m.status === "STATUS_SCHEDULED") {
        allComplete = false;
      } else {
        anyStarted = true;
        // Figure out which side team1 and team2 are on in this match
        if (m.homeTeam.id === team1.id) {
          team1Agg += m.homeTeam.score || 0;
          team2Agg += m.awayTeam.score || 0;
        } else {
          team1Agg += m.awayTeam.score || 0;
          team2Agg += m.homeTeam.score || 0;
        }
      }
    }

    // Determine winner from notes or aggregate
    let winner: string | undefined;
    let aggregateNote: string | undefined;

    for (const m of matches) {
      if (m.note.includes("advance") || m.note.includes("win")) {
        aggregateNote = m.note.split(" - ").pop() || m.note;
        // Try to find the advancing team
        if (m.note.includes(team1.name) && m.note.includes("advance")) winner = team1.id;
        else if (m.note.includes(team2.name) && m.note.includes("advance")) winner = team2.id;
        // Also check abbreviations and partial names
        else {
          const noteLower = m.note.toLowerCase();
          if (noteLower.includes(team1.name.toLowerCase().split(" ")[0]) && noteLower.includes("advance")) winner = team1.id;
          else if (noteLower.includes(team2.name.toLowerCase().split(" ")[0]) && noteLower.includes("advance")) winner = team2.id;
        }
      }
    }

    // If no explicit winner from notes but aggregate is decisive and all games done
    const isComplete = allComplete && matches.length >= 2;
    if (!winner && isComplete && team1Agg !== team2Agg) {
      winner = team1Agg > team2Agg ? team1.id : team2.id;
    }

    const aggregateScore = anyStarted ? `${team1Agg}-${team2Agg}` : undefined;

    // Get tournament odds from Kalshi
    const team1Odds = getTeamOdds(team1.name, kalshiOdds);
    const team2Odds = getTeamOdds(team2.name, kalshiOdds);

    // Get advance odds: first try direct Kalshi advance markets, then derive from tournament odds
    let team1AdvanceOdds: number | null = null;
    let team2AdvanceOdds: number | null = null;
    let advanceOddsSource: "kalshi" | "implied" | "none" = "none";

    const directAdvance = getAdvanceOddsForTie(team1.name, team2.name, advanceOdds);
    if (directAdvance && !winner) {
      team1AdvanceOdds = directAdvance.team1;
      team2AdvanceOdds = directAdvance.team2;
      advanceOddsSource = "kalshi";
    } else if (!winner) {
      const implied = deriveImpliedAdvance(team1.name, team2.name, kalshiOdds);
      if (implied) {
        team1AdvanceOdds = implied.team1;
        team2AdvanceOdds = implied.team2;
        advanceOddsSource = "implied";
      }
    }

    const tie: CupTie = {
      team1,
      team2,
      matches: cupMatches,
      aggregateScore,
      aggregateNote,
      winner,
      isComplete: !!winner || isComplete,
      team1TournamentOdds: team1Odds,
      team2TournamentOdds: team2Odds,
      team1AdvanceOdds,
      team2AdvanceOdds,
      advanceOddsSource,
    };

    roundMap.get(roundName)!.push(tie);
  }

  // Convert to array and determine current round
  const roundOrder = ["Knockout Playoff", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];
  const result: { ties: CupTie[]; roundName: string }[] = [];

  for (const name of roundOrder) {
    if (roundMap.has(name)) {
      result.push({ roundName: name, ties: roundMap.get(name)! });
    }
  }

  // Also add any round names not in our predefined list
  for (const [name, ties] of roundMap) {
    if (!roundOrder.includes(name)) {
      result.push({ roundName: name, ties });
    }
  }

  return result;
}

// Build the favorites list from Kalshi odds
function buildFavorites(kalshiOdds: KalshiTournamentOdds[], ties: CupTie[]): CupFavorite[] {
  // Build a map of team logos from ties
  const teamLogos = new Map<string, { logo: string; abbr: string; id: string }>();
  for (const tie of ties) {
    teamLogos.set(tie.team1.name.toLowerCase(), { logo: tie.team1.logo, abbr: tie.team1.abbreviation, id: tie.team1.id });
    teamLogos.set(tie.team2.name.toLowerCase(), { logo: tie.team2.logo, abbr: tie.team2.abbreviation, id: tie.team2.id });
  }

  // Find eliminated team names from ties
  const eliminatedTeams = new Map<string, string>(); // eliminated team name -> eliminated by team name
  for (const tie of ties) {
    if (tie.winner) {
      const loser = tie.winner === tie.team1.id ? tie.team2 : tie.team1;
      const winnerTeam = tie.winner === tie.team1.id ? tie.team1 : tie.team2;
      eliminatedTeams.set(loser.name.toLowerCase(), winnerTeam.name);
    }
  }

  return kalshiOdds
    .filter(o => o.probability > 0 || !o.isEliminated) // Show active teams and eliminated with odds > 0
    .map(o => {
      // Try to find team info from ESPN data
      let teamInfo: { logo: string; abbr: string; id: string } | undefined;
      for (const [key, info] of teamLogos) {
        if (matchCupTeam(o.teamName, key)) {
          teamInfo = info;
          break;
        }
      }

      // Find who eliminated them
      let eliminatedBy: string | undefined;
      for (const [key, byName] of eliminatedTeams) {
        if (matchCupTeam(o.teamName, key)) {
          eliminatedBy = byName;
          break;
        }
      }

      return {
        team: {
          id: teamInfo?.id || o.teamName,
          name: o.teamName,
          abbreviation: teamInfo?.abbr || o.teamName.substring(0, 3).toUpperCase(),
          logo: teamInfo?.logo || "",
        },
        tournamentOdds: o.probability,
        isEliminated: o.isEliminated,
        eliminatedBy,
      };
    })
    .sort((a, b) => {
      // Active teams first, then by odds
      if (a.isEliminated && !b.isEliminated) return 1;
      if (!a.isEliminated && b.isEliminated) return -1;
      return b.tournamentOdds - a.tournamentOdds;
    });
}

// ---- Main Export ----

function splitEventsByPhase(events: any[]): { league: any[]; knockout: any[]; qualifying: any[] } {
  const league: any[] = [];
  const knockout: any[] = [];
  const qualifying: any[] = [];

  for (const event of events) {
    const roundName = eventRoundName(event);
    if (isLeagueOrGroupPhase(roundName)) league.push(event);
    else if (isQualifyingRound(roundName)) qualifying.push(event);
    else if (isKnockoutRound(roundName)) knockout.push(event);
    else {
      // Unknown ESPN label: treat Sep–Jan as league phase, otherwise knockout
      const date = event.date ? new Date(event.date) : undefined;
      const fallback = normalizeRoundName("", date);
      if (isLeagueOrGroupPhase(fallback) || isQualifyingRound(fallback)) {
        (isQualifyingRound(fallback) ? qualifying : league).push(event);
      } else {
        knockout.push(event);
      }
    }
  }
  return { league, knockout, qualifying };
}

function buildLeaguePhase(
  events: any[],
  tables: CupGroupTable[],
): CupLeaguePhase | undefined {
  const matches = events
    .map(parseCupMatchFromEvent)
    .filter((m): m is CupMatch => m !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (matches.length === 0 && tables.length === 0) return undefined;

  const upcomingMatches = matches
    .filter(m => m.status === "STATUS_SCHEDULED" || m.status === "STATUS_POSTPONED")
    .slice(0, 12);
  const recentMatches = matches
    .filter(m => m.status !== "STATUS_SCHEDULED" && m.status !== "STATUS_POSTPONED")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const looksLikeGroups = tables.length > 1 && tables.every(t => /^group\s/i.test(t.name));
  const label = looksLikeGroups ? "Group Stage" : "League Phase";

  return { label, tables, recentMatches, upcomingMatches };
}

function leaguePhaseTeamTies(phase: CupLeaguePhase | undefined): CupTie[] {
  if (!phase) return [];
  const teams: CupTeam[] = [];
  const seen = new Set<string>();
  for (const table of phase.tables) {
    for (const row of table.standings) {
      if (seen.has(row.team.id)) continue;
      seen.add(row.team.id);
      teams.push(row.team);
    }
  }
  for (const match of [...phase.recentMatches, ...phase.upcomingMatches]) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (seen.has(team.id)) continue;
      seen.add(team.id);
      teams.push({ id: team.id, name: team.name, abbreviation: team.abbreviation, logo: team.logo });
    }
  }
  if (teams.length < 2) return [];
  return [{
    team1: teams[0],
    team2: teams[1],
    matches: [],
    isComplete: false,
  }];
}

export async function fetchEuropeanCupData(slug: string): Promise<EuropeanCupData> {
  return cached(`eurocup:${slug}`, getCacheTTL(), async () => {
    const config = EURO_CUP_CONFIG[slug];
    if (!config) throw new Error(`Unknown European cup: ${slug}`);

    const season = getFootballSeason();
    const advanceTicker = ADVANCE_SERIES[slug];
    const [events, kalshiOdds, advanceOdds, standingsTables] = await Promise.all([
      fetchCupEvents(config.espnSlug),
      fetchTournamentOdds(config.kalshiTicker).catch(() => []),
      fetchAdvanceOdds(advanceTicker).catch(() => [] as KalshiAdvanceOdds[]),
      fetchCupStandings(config.espnSlug).catch(() => [] as CupGroupTable[]),
    ]);

    console.log(`[EuroCup] ${config.shortName} ${season.label}: ${events.length} events, ${standingsTables.length} tables, ${kalshiOdds.length} Kalshi markets`);

    const { league, knockout, qualifying } = splitEventsByPhase(events);
    const leaguePhase = buildLeaguePhase(league, standingsTables);
    const roundsData = groupIntoTies(knockout, kalshiOdds, advanceOdds);

    const allTies: CupTie[] = [];
    const rounds: CupRound[] = roundsData
      .filter(r => {
        return r.ties.some(t =>
          !t.team1.name.includes("Winner") && !t.team2.name.includes("Winner")
        );
      })
      .map(r => {
        const realTies = r.ties.filter(t =>
          !t.team1.name.includes("Winner") && !t.team2.name.includes("Winner")
        );
        allTies.push(...realTies);
        const hasActive = realTies.some(t => !t.isComplete);
        return {
          name: r.roundName,
          ties: realTies,
          isCurrent: hasActive,
        };
      });
    for (const r of roundsData) {
      const hasPlaceholders = r.ties.some(t => t.team1.name.includes("Winner") || t.team2.name.includes("Winner"));
      const alreadyAdded = rounds.some(existing => existing.name === r.roundName);
      if (hasPlaceholders && !alreadyAdded) {
        rounds.push({
          name: r.roundName,
          ties: [],
          isCurrent: false,
        });
      }
    }

    const hasActiveKnockout = rounds.some(r => r.isCurrent);
    const hasLeagueActivity = !!(leaguePhase && (
      leaguePhase.upcomingMatches.length > 0
      || leaguePhase.recentMatches.length > 0
      || leaguePhase.tables.some(t => t.standings.length > 0)
    ));
    const hasQualifying = qualifying.length > 0 && !hasLeagueActivity && !hasActiveKnockout;

    let phase: EuropeanCupData["phase"] = "knockout";
    let currentRound = rounds.find(r => r.isCurrent)?.name || "TBD";

    if (hasActiveKnockout) {
      phase = "knockout";
    } else if (hasLeagueActivity) {
      phase = "league";
      currentRound = leaguePhase!.label;
      for (const r of rounds) r.isCurrent = false;
    } else if (hasQualifying) {
      phase = "qualifying";
      currentRound = "Qualifying";
    } else if (rounds.length > 0) {
      rounds[rounds.length - 1].isCurrent = true;
      currentRound = rounds[rounds.length - 1].name;
      phase = "knockout";
    } else if (leaguePhase) {
      phase = "league";
      currentRound = leaguePhase.label;
    }

    const favorites = buildFavorites(kalshiOdds, [...allTies, ...leaguePhaseTeamTies(leaguePhase)]);

    return {
      slug,
      name: config.name,
      shortName: config.shortName,
      logo: config.logo,
      seasonLabel: season.label,
      currentRound,
      phase,
      rounds,
      leaguePhase,
      favorites,
      oddsSource: kalshiOdds.length > 0 ? "kalshi" : "none",
      lastUpdated: new Date().toISOString(),
    };
  }, { staleMs: 60 * 60 * 1000 });
}

export async function fetchAllEuropeanCups(): Promise<EuropeanCupData[]> {
  const slugs = Object.keys(EURO_CUP_CONFIG);
  return Promise.all(slugs.map(slug => fetchEuropeanCupData(slug)));
}
