import type { LeagueSlug } from "@shared/schema";
import { fetchKalshiMarkets as fetchKalshiMarketsRaw } from "./kalshi-client";
import { cached } from "./cache";

// Kalshi series tickers mapped to our league slugs
const TITLE_SERIES: Record<string, string> = {
  "eng.1": "KXPREMIERLEAGUE",
  "ger.1": "KXBUNDESLIGA",
  "ita.1": "KXSERIEA",
  "esp.1": "KXLALIGA",
  "fra.1": "KXLIGUE1",
};

const RELEGATION_SERIES: Record<string, string> = {
  "eng.1": "KXEPLRELEGATION",
  "ger.1": "KXBUNDESLIGARELEGATION",
  "ita.1": "KXSERIEARELEGATION",
  "esp.1": "KXLALIGARELEGATION",
  "fra.1": "KXLIGUE1RELEGATION",
};

// Team name normalization: Kalshi uses short names, ESPN uses full names
// We do fuzzy matching but some need explicit mapping
const TEAM_NAME_MAP: Record<string, string> = {
  // EPL
  "Man City": "Manchester City",
  "Man Utd": "Manchester United",
  "Wolves": "Wolverhampton Wanderers",
  "Sunderland": "Sunderland",
  "Leeds": "Leeds United",
  "Tottenham": "Tottenham Hotspur",
  "Nottingham Forest": "Nottingham Forest",
  "West Ham": "West Ham United",
  "Burnley": "Burnley",
  "Newcastle": "Newcastle United",
  "Crystal Palace": "Crystal Palace",
  "Bournemouth": "AFC Bournemouth",
  "Brighton": "Brighton & Hove Albion",
  "Aston Villa": "Aston Villa",
  // Bundesliga
  "M´gladbach": "Borussia Mönchengladbach",
  "Bayern Munich": "Bayern Munich",
  "Leverkusen": "Bayer Leverkusen",
  "Leipzig": "RB Leipzig",
  "Bremen": "Werder Bremen",
  "Frankfurt": "Eintracht Frankfurt",
  // FC Cologne: matches directly via fuzzy match
  "Dortmund": "Borussia Dortmund",
  "Hamburg": "Hamburger SV",
  "Mainz": "1. FSV Mainz 05",
  "Augsburg": "FC Augsburg",
  "Wolfsburg": "VfL Wolfsburg",
  "Stuttgart": "VfB Stuttgart",
  "Hoffenheim": "TSG Hoffenheim",
  "Union Berlin": "1. FC Union Berlin",
  "Heidenheim": "1. FC Heidenheim",
  "Freiburg": "SC Freiburg",
  "St. Pauli": "FC St. Pauli",
  // Serie A
  "Inter": "Internazionale",
  "Milan": "AC Milan",
  "Hellas Verona": "Verona",
  "Parma Calcio": "Parma",
  "Pisa": "Pisa",
  "Cremonese": "Cremonese",
  // La Liga
  "Betis": "Real Betis",
  "Atletico Madrid": "Atlético Madrid",
  "Oviedo": "Real Oviedo",
  "Levante": "Levante",
  "Alaves": "Deportivo Alavés",
  "Elche": "Elche",
  // Ligue 1
  "PSG": "Paris Saint-Germain",
  "Paris": "Paris FC",
  "Stade Brest 29": "Brest",
  "Stade Rennes": "Rennes",
  "Strasbourg Alsace": "Strasbourg",
  "Metz": "FC Metz",
  "Auxerre": "AJ Auxerre",
  "Lorient": "FC Lorient",
  "Le Havre": "Le Havre",
  "Angers": "Angers SCO",
};

export interface KalshiOdds {
  teamName: string;       // Kalshi team name
  probability: number;    // 0-100 (derived from last_price_dollars * 100)
  ticker: string;         // Market ticker for reference
}

export interface LeagueOdds {
  title: KalshiOdds[];
  relegation: KalshiOdds[];
  lastUpdated: string;
}

async function fetchKalshiMarkets(seriesTicker: string): Promise<any[]> {
  const markets = await fetchKalshiMarketsRaw(seriesTicker);
  // Filter out finalized/settled markets — keep open + active
  const liveMarkets = markets.filter((m: any) => m.status !== "finalized" && m.status !== "settled");
  console.log(`[Kalshi] ${seriesTicker}: ${liveMarkets.length} live markets (${markets.length} total)`);
  return liveMarkets;
}

function parseMarkets(markets: any[]): KalshiOdds[] {
  return markets
    .map((m: any) => {
      const price = parseFloat(m.last_price_dollars || "0");
      const teamName = m.no_sub_title || m.yes_sub_title || "";
      return {
        teamName,
        probability: Math.round(price * 100),
        ticker: m.ticker || "",
      };
    })
    .filter((o: KalshiOdds) => o.teamName && o.probability >= 0)
    .sort((a: KalshiOdds, b: KalshiOdds) => b.probability - a.probability);
}

export async function fetchLeagueOdds(slug: LeagueSlug): Promise<LeagueOdds> {
  return cached(`kalshi:${slug}`, 30 * 60 * 1000, async () => {
    const titleSeries = TITLE_SERIES[slug];
    const relSeries = RELEGATION_SERIES[slug];

    const [titleMarkets, relMarkets] = await Promise.all([
      titleSeries ? fetchKalshiMarkets(titleSeries) : Promise.resolve([]),
      relSeries ? fetchKalshiMarkets(relSeries) : Promise.resolve([]),
    ]);

    const odds: LeagueOdds = {
      title: parseMarkets(titleMarkets),
      relegation: parseMarkets(relMarkets),
      lastUpdated: new Date().toISOString(),
    };

    const topTitle = odds.title.filter(t => t.probability >= 5).map(t => `${t.teamName}(${t.probability}%)`);
    const topRel = odds.relegation.filter(t => t.probability >= 5).map(t => `${t.teamName}(${t.probability}%)`);
    console.log(`[Kalshi] ${slug}: title=[${topTitle.join(", ")}] relegation=[${topRel.join(", ")}]`);

    return odds;
  }, {
    shouldCache: (odds) => odds.title.length > 0 || odds.relegation.length > 0,
  });
}

// Match a Kalshi team name to an ESPN team name using fuzzy matching
export function matchKalshiTeam(kalshiName: string, espnName: string): boolean {
  const kLower = kalshiName.toLowerCase();
  const eLower = espnName.toLowerCase();

  // Direct fuzzy match first (handles exact and substring matches)
  if (eLower.includes(kLower) || kLower.includes(eLower)) return true;

  // Check explicit mapping
  const mapped = TEAM_NAME_MAP[kalshiName];
  if (mapped) {
    const mLower = mapped.toLowerCase();
    return eLower.includes(mLower) || mLower.includes(eLower);
  }

  return false;
}

// Get title odds for a specific team (returns probability 0-100 or null)
export function getTitleOddsForTeam(
  teamName: string,
  odds: LeagueOdds
): number | null {
  for (const entry of odds.title) {
    if (matchKalshiTeam(entry.teamName, teamName)) {
      return entry.probability;
    }
  }
  return null;
}

// Get relegation odds for a specific team (returns probability 0-100 or null)
export function getRelegationOddsForTeam(
  teamName: string,
  odds: LeagueOdds
): number | null {
  for (const entry of odds.relegation) {
    if (matchKalshiTeam(entry.teamName, teamName)) {
      return entry.probability;
    }
  }
  return null;
}

// Fetch odds for all leagues in parallel
export async function fetchAllLeagueOdds(): Promise<Record<string, LeagueOdds>> {
  const slugs = Object.keys(TITLE_SERIES) as LeagueSlug[];
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const odds = await fetchLeagueOdds(slug);
      return [slug, odds] as const;
    })
  );
  return Object.fromEntries(results);
}
