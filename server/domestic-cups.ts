import { DOMESTIC_CUP_CONFIG, type DomesticCupData, type DomesticCupMatch, type DomesticCupFavorite } from "@shared/schema";
import { cached, getCacheTTL } from "./cache";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// Fetch events from ESPN scoreboard for a domestic cup
async function fetchCupEvents(espnSlug: string): Promise<any[]> {
  try {
    // Fetch recent + upcoming matches (last 2 months through end of season)
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const startDate = twoMonthsAgo.toISOString().slice(0, 10).replace(/-/g, "");
    const res = await fetch(
      `${ESPN_BASE}/${espnSlug}/scoreboard?dates=${startDate}-20260701&limit=100`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "EuroFootballHub/2.0",
        },
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (!res.ok) {
      console.error(`[DomesticCup] ESPN error ${res.status} for ${espnSlug}`);
      return [];
    }
    const data = await res.json();
    return data.events || [];
  } catch (error) {
    console.error(`[DomesticCup] Error fetching ${espnSlug}:`, error);
    return [];
  }
}

// Parse ESPN event into a DomesticCupMatch
function parseEvent(event: any): DomesticCupMatch | null {
  const comp = event.competitions?.[0];
  if (!comp || !comp.competitors || comp.competitors.length < 2) return null;

  const homeComp = comp.competitors.find((c: any) => c.homeAway === "home") || comp.competitors[0];
  const awayComp = comp.competitors.find((c: any) => c.homeAway === "away") || comp.competitors[1];

  const statusType = event.status?.type?.name || "STATUS_SCHEDULED";
  const statusText = event.status?.type?.description || "Scheduled";

  // Parse penalty scores from the linescores if available
  const parsePenaltyScore = (competitor: any): number | null => {
    const linescores = competitor.linescores;
    if (!linescores || !Array.isArray(linescores)) return null;
    // Penalty shootout is typically the last linescore period beyond normal + extra time
    if (linescores.length >= 4) {
      // 4th entry could be penalties
      return linescores[3]?.value ?? null;
    }
    return null;
  };

  const notes = comp.notes || [];
  const noteText = notes[0]?.headline || "";

  return {
    id: event.id || "",
    date: event.date || "",
    status: statusType,
    statusText,
    homeTeam: {
      id: homeComp.team?.id || "",
      name: homeComp.team?.shortDisplayName || homeComp.team?.displayName || "",
      abbreviation: homeComp.team?.abbreviation || "",
      logo: homeComp.team?.logo || "",
      score: statusType !== "STATUS_SCHEDULED" ? parseInt(homeComp.score || "0") : null,
      winner: homeComp.winner || false,
      penaltyScore: parsePenaltyScore(homeComp),
    },
    awayTeam: {
      id: awayComp.team?.id || "",
      name: awayComp.team?.shortDisplayName || awayComp.team?.displayName || "",
      abbreviation: awayComp.team?.abbreviation || "",
      logo: awayComp.team?.logo || "",
      score: statusType !== "STATUS_SCHEDULED" ? parseInt(awayComp.score || "0") : null,
      winner: awayComp.winner || false,
      penaltyScore: parsePenaltyScore(awayComp),
    },
    note: noteText || undefined,
  };
}

// Determine the current round name based on number of matches
function inferRound(totalMatches: number, upcomingCount: number, completedCount: number): string {
  // For upcoming matches, use the count to determine round
  const relevantCount = upcomingCount > 0 ? upcomingCount : completedCount;
  if (relevantCount <= 1) return "Final";
  if (relevantCount <= 2) return "Semi-Finals";
  if (relevantCount <= 4) return "Quarter-Finals";
  if (relevantCount <= 8) return "Round of 16";
  if (relevantCount <= 16) return "Round of 32";
  return "Early Rounds";
}

// ---- Kalshi Tournament Winner Odds ----
import { fetchKalshiMarkets as fetchKalshiMarketsRaw } from "./kalshi-client";

const KALSHI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchDomesticCupOdds(kalshiTicker: string, allMatches: DomesticCupMatch[]): Promise<DomesticCupFavorite[]> {
  return cached(`kalshi:domestic:${kalshiTicker}`, KALSHI_CACHE_TTL, async () => {
    const markets = await fetchKalshiMarketsRaw(kalshiTicker);

    // Normalize: strip diacritics, lowercase, trim
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    // Build a set of team logos from ESPN match data for cross-referencing
    const teamLogos = new Map<string, string>();
    for (const match of allMatches) {
      if (match.homeTeam.logo) teamLogos.set(norm(match.homeTeam.name), match.homeTeam.logo);
      if (match.awayTeam.logo) teamLogos.set(norm(match.awayTeam.name), match.awayTeam.logo);
    }

    const favorites: DomesticCupFavorite[] = markets
      .map((m: any) => {
        const teamName = m.no_sub_title || m.yes_sub_title || "";
        const probability = Math.round(parseFloat(m.last_price_dollars || "0") * 100);
        const isEliminated = m.status === "finalized" || m.status === "settled";

        // Try to find the team logo from ESPN data
        let teamLogo: string | undefined;
        const nameLower = norm(teamName);
        for (const [espnName, logo] of teamLogos) {
          if (espnName.includes(nameLower) || nameLower.includes(espnName) ||
              espnName.includes(nameLower.split(" ")[0]) || nameLower.includes(espnName.split(" ")[0])) {
            teamLogo = logo;
            break;
          }
        }

        return { teamName, probability, isEliminated, teamLogo };
      })
      .filter((f: DomesticCupFavorite) => f.teamName && (f.probability > 0 || !f.isEliminated))
      .sort((a: DomesticCupFavorite, b: DomesticCupFavorite) => {
        if (a.isEliminated && !b.isEliminated) return 1;
        if (!a.isEliminated && b.isEliminated) return -1;
        return b.probability - a.probability;
      });

    const active = favorites.filter(f => !f.isEliminated);
    console.log(`[Kalshi] ${kalshiTicker}: ${active.length} active, ${favorites.length} total`);
    return favorites;
  }, { shouldCache: (favorites) => favorites.length > 0 });
}

export async function fetchDomesticCupData(slug: string): Promise<DomesticCupData> {
  return cached(`domestic-cup:${slug}`, getCacheTTL(), async () => {
  const config = DOMESTIC_CUP_CONFIG[slug];
  if (!config) throw new Error(`Unknown domestic cup: ${slug}`);

  const events = await fetchCupEvents(config.espnSlug);
  console.log(`[DomesticCup] ${config.shortName}: ${events.length} events`);

  const allMatches = events
    .map(parseEvent)
    .filter((m): m is DomesticCupMatch => m !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // newest first

  // Split into completed and upcoming
  const completed = allMatches.filter(m =>
    m.status !== "STATUS_SCHEDULED" && m.status !== "STATUS_POSTPONED"
  );
  const upcoming = allMatches
    .filter(m => m.status === "STATUS_SCHEDULED")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // soonest first

  // Get the most recent completed matches (latest round)
  // Group by approximate date clusters (matches within 7 days = same round)
  const recentResults: DomesticCupMatch[] = [];
  if (completed.length > 0) {
    const latestDate = new Date(completed[0].date).getTime();
    for (const m of completed) {
      const daysDiff = (latestDate - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 10) {
        recentResults.push(m);
      }
    }
  }

  // Determine current round
  let currentRound: string;
  if (upcoming.length > 0) {
    currentRound = inferRound(allMatches.length, upcoming.length, recentResults.length);
  } else if (recentResults.length > 0) {
    // If all done and only 1 result, that was the Final
    currentRound = inferRound(allMatches.length, 0, recentResults.length);
  } else {
    currentRound = "TBD";
  }

  // If we have a final scheduled, override
  if (upcoming.length === 1) currentRound = "Final";
  if (upcoming.length === 2) currentRound = "Semi-Finals";
  if (upcoming.length <= 4 && upcoming.length > 2) currentRound = "Quarter-Finals";

  // Fetch Kalshi tournament winner odds if available
  let favorites: DomesticCupFavorite[] | undefined;
  if (config.kalshiTicker) {
    favorites = await fetchDomesticCupOdds(config.kalshiTicker, allMatches);
    if (favorites.length === 0) favorites = undefined;
  }

  // Derive implied match odds from tournament winner probabilities
  // Uses a floor probability so no team ever shows 100% or 0% pre-match.
  // A team not in the Kalshi market (or at 0%) gets a minimum floor, so the
  // ratio reflects the gap in quality without implying a certain outcome.
  const FLOOR_PROB = 1;    // minimum assumed tournament % for any team in a match
  const MAX_MATCH_ODDS = 92; // cap: no pre-match implied odds above this
  const MIN_MATCH_ODDS = 8;  // floor: no pre-match implied odds below this

  // Normalize team names: strip accents, lowercase, trim
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const findFavorite = (teamName: string) => {
    if (!favorites || favorites.length === 0) return undefined;
    const mn = normalize(teamName);
    return favorites.find(f => {
      const fn = normalize(f.teamName);
      return fn === mn || fn.includes(mn) || mn.includes(fn) ||
        fn.split(" ")[0] === mn.split(" ")[0];
    });
  };

  const enrichedUpcoming = upcoming.slice(0, 8).map(match => {
    if (!favorites || favorites.length === 0) return match;
    const homeFav = findFavorite(match.homeTeam.name);
    const awayFav = findFavorite(match.awayTeam.name);
    const homeRaw = homeFav?.probability || 0;
    const awayRaw = awayFav?.probability || 0;

    // Both teams missing from Kalshi — skip odds entirely
    if (homeRaw === 0 && awayRaw === 0) return match;

    // Apply floor so neither side can be 0
    const homeProb = Math.max(homeRaw, FLOOR_PROB);
    const awayProb = Math.max(awayRaw, FLOOR_PROB);
    const total = homeProb + awayProb;

    // Compute and clamp to [MIN, MAX]
    const homeOdds = Math.min(MAX_MATCH_ODDS, Math.max(MIN_MATCH_ODDS, Math.round((homeProb / total) * 100)));
    const awayOdds = Math.min(MAX_MATCH_ODDS, Math.max(MIN_MATCH_ODDS, Math.round((awayProb / total) * 100)));

    return { ...match, homeOdds, awayOdds };
  });

  const result: DomesticCupData = {
    slug,
    name: config.name,
    shortName: config.shortName,
    country: config.country,
    countryFlag: config.countryFlag,
    logo: config.logo,
    currentRound,
    recentResults: recentResults.slice(0, 8), // Limit to 8 most recent
    upcomingMatches: enrichedUpcoming,
    favorites,
    lastUpdated: new Date().toISOString(),
  };
  return result;
  }, { staleMs: 60 * 60 * 1000 });
}

export async function fetchAllDomesticCups(): Promise<DomesticCupData[]> {
  const slugs = Object.keys(DOMESTIC_CUP_CONFIG);
  // Fetch sequentially to avoid Kalshi rate limits (429)
  const results: DomesticCupData[] = [];
  for (const slug of slugs) {
    const data = await fetchDomesticCupData(slug);
    results.push(data);
    // Rate-limiting is now handled by the centralized kalshi-client
  }
  return results;
}
