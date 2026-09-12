import { z } from "zod";

// Competition definitions for cups and European tournaments
export const COMPETITIONS: Record<string, { name: string; shortName: string; emoji: string; type: "domestic_cup" | "european"; country?: string }> = {
  "eng.fa": { name: "FA Cup", shortName: "FA", emoji: "🏆", type: "domestic_cup", country: "England" },
  "eng.league_cup": { name: "Carabao Cup", shortName: "CC", emoji: "🏆", type: "domestic_cup", country: "England" },
  "ger.dfb_pokal": { name: "DFB-Pokal", shortName: "DFB", emoji: "🏆", type: "domestic_cup", country: "Germany" },
  "ita.coppa_italia": { name: "Coppa Italia", shortName: "CI", emoji: "🏆", type: "domestic_cup", country: "Italy" },
  "esp.copa_del_rey": { name: "Copa del Rey", shortName: "CdR", emoji: "🏆", type: "domestic_cup", country: "Spain" },
  "fra.coupe_de_france": { name: "Coupe de France", shortName: "CdF", emoji: "🏆", type: "domestic_cup", country: "France" },
  "uefa.champions": { name: "Champions League", shortName: "UCL", emoji: "⭐", type: "european" },
  "uefa.europa": { name: "Europa League", shortName: "UEL", emoji: "🟠", type: "european" },
  "uefa.europa.conf": { name: "Conference League", shortName: "UECL", emoji: "🟢", type: "european" },
};

// Map league slugs to their domestic cup slugs
export const LEAGUE_CUPS: Record<string, string[]> = {
  "eng.1": ["eng.fa", "eng.league_cup"],
  "ger.1": ["ger.dfb_pokal"],
  "ita.1": ["ita.coppa_italia"],
  "esp.1": ["esp.copa_del_rey"],
  "fra.1": ["fra.coupe_de_france"],
};

// European competition slugs
export const EURO_COMPS = ["uefa.champions", "uefa.europa", "uefa.europa.conf"];

// League configuration
export const LEAGUES = {
  "eng.1": { name: "Premier League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#3d195b", uclSpots: 4, europaSpots: 1, confSpots: 1, relegationSpots: 3, totalGames: 38, logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/23.png" },
  "ger.1": { name: "Bundesliga", country: "Germany", flag: "🇩🇪", color: "#d3010c", uclSpots: 4, europaSpots: 1, confSpots: 1, relegationSpots: 2, totalGames: 34, logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/10.png" },
  "ita.1": { name: "Serie A", country: "Italy", flag: "🇮🇹", color: "#024494", uclSpots: 4, europaSpots: 1, confSpots: 1, relegationSpots: 3, totalGames: 38, logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/12.png" },
  "esp.1": { name: "La Liga", country: "Spain", flag: "🇪🇸", color: "#ee8707", uclSpots: 4, europaSpots: 1, confSpots: 1, relegationSpots: 3, totalGames: 38, logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/15.png" },
  "fra.1": { name: "Ligue 1", country: "France", flag: "🇫🇷", color: "#091c3e", uclSpots: 3, europaSpots: 1, confSpots: 1, relegationSpots: 3, totalGames: 34, logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/9.png" },
} as const;

export type LeagueSlug = keyof typeof LEAGUES;

export const leagueSlugs = Object.keys(LEAGUES) as LeagueSlug[];

// Standing entry
export const standingEntrySchema = z.object({
  rank: z.number(),
  teamId: z.string(),
  teamName: z.string(),
  teamAbbreviation: z.string(),
  teamLogo: z.string(),
  gamesPlayed: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  goalDifference: z.number(),
  points: z.number(),
  form: z.string().optional(), // W-D-L record like "21-7-3"
  recentForm: z.string().optional(), // Last 5 results like "WDLWW"
  zone: z.string().optional(),
  zoneColor: z.string().optional(),
  gamesRemaining: z.number().optional(),
  ppg: z.number().optional(), // points per game
  maxPossiblePoints: z.number().optional(), // theoretical max
  isTitleContender: z.boolean().optional(), // team is a realistic title contender
  titleOdds: z.string().optional(), // implied probability of winning the title, e.g. "82%"
  relegationOdds: z.string().optional(), // implied probability of being relegated, e.g. "43%"
  activeCompetitions: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    shortName: z.string(),
    stage: z.string().optional(), // "Round of 16", "Quarterfinals", etc.
  })).optional(),
});

export type StandingEntry = z.infer<typeof standingEntrySchema>;

// Match odds
export const matchOddsSchema = z.object({
  homeMoneyline: z.string().optional(), // American odds like "+215"
  awayMoneyline: z.string().optional(),
  drawMoneyline: z.string().optional(),
  homeSpread: z.string().optional(),
  awaySpread: z.string().optional(),
  overUnder: z.number().optional(),
  favorite: z.string().optional(), // "home", "away", "toss-up"
  provider: z.string().optional(),
  details: z.string().optional(), // ESPN summary like "LIV +110"
});

export type MatchOdds = z.infer<typeof matchOddsSchema>;

// Match/fixture
export const matchSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: z.string(),
  statusDetail: z.string().optional(),
  homeTeam: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    logo: z.string(),
    score: z.number().nullable(),
    form: z.string().optional(), // WDLWW for this team
    rank: z.number().optional(),
  }),
  awayTeam: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    logo: z.string(),
    score: z.number().nullable(),
    form: z.string().optional(),
    rank: z.number().optional(),
  }),
  odds: matchOddsSchema.optional(),
  isUpset: z.boolean().optional(), // result went against the favorite
  upsetDetails: z.string().optional(),
});

export type Match = z.infer<typeof matchSchema>;

// News article
export const articleSchema = z.object({
  id: z.string(),
  headline: z.string(),
  description: z.string(),
  published: z.string(),
  url: z.string(),
  imageUrl: z.string().optional(),
  source: z.string(),
  type: z.string(),
});

export type Article = z.infer<typeof articleSchema>;

// Smart battle group - used for title race, European spots, relegation
export const battleGroupSchema = z.object({
  type: z.enum(["european", "relegation"]),
  label: z.string(),
  teams: z.array(standingEntrySchema),
  gapFromTarget: z.number().optional(), // gap from 1st (title) or safety line (relegation)
  insight: z.string().optional(), // generated insight text
  isCompetitive: z.boolean(), // is this a real fight or wrapped up?
});

export type BattleGroup = z.infer<typeof battleGroupSchema>;

// Upcoming fixture with context
export const upcomingFixtureSchema = z.object({
  match: matchSchema,
  significance: z.string().optional(), // "title clash", "relegation six-pointer", etc.
  isCloseOdds: z.boolean().optional(), // exciting matchup based on odds
});

export type UpcomingFixture = z.infer<typeof upcomingFixtureSchema>;

// Full league data response
export const leagueDataSchema = z.object({
  slug: z.string(),
  name: z.string(),
  country: z.string(),
  flag: z.string(),
  logo: z.string().optional(),
  standings: z.array(standingEntrySchema),
  recentMatches: z.array(matchSchema),
  upcomingMatches: z.array(matchSchema),
  news: z.array(articleSchema),
  battles: z.array(battleGroupSchema).optional(),
  oddsSource: z.string().optional(), // "kalshi" or "fallback"
  lastUpdated: z.string(),
});

export type LeagueData = z.infer<typeof leagueDataSchema>;

// Dashboard overview (all leagues)
export const dashboardSchema = z.object({
  leagues: z.array(leagueDataSchema),
  lastUpdated: z.string(),
});

export type DashboardData = z.infer<typeof dashboardSchema>;

// ---- European Cup Types ----

// A team in a knockout tie
export const cupTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  logo: z.string(),
  seed: z.number().optional(),
});

export type CupTeam = z.infer<typeof cupTeamSchema>;

// A single match (leg) in a knockout tie
export const cupMatchSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: z.string(), // STATUS_FULL_TIME, STATUS_SCHEDULED, STATUS_IN_PROGRESS, etc.
  statusDetail: z.string().optional(),
  homeTeam: cupTeamSchema.extend({ score: z.number().nullable() }),
  awayTeam: cupTeamSchema.extend({ score: z.number().nullable() }),
  leg: z.string().optional(), // "1st Leg", "2nd Leg", or empty for single-leg
  odds: matchOddsSchema.optional(),
});

export type CupMatch = z.infer<typeof cupMatchSchema>;

// A knockout tie (two legs or single match)
export const cupTieSchema = z.object({
  team1: cupTeamSchema,
  team2: cupTeamSchema,
  matches: z.array(cupMatchSchema),
  aggregateScore: z.string().optional(), // "3-1", "Tied 2-2"
  aggregateNote: z.string().optional(), // "Arsenal advance 3-1 on aggregate"
  winner: z.string().optional(), // team ID of winner, if decided
  isComplete: z.boolean(),
  team1TournamentOdds: z.number().nullable().optional(), // Kalshi win-tournament %
  team2TournamentOdds: z.number().nullable().optional(),
  team1AdvanceOdds: z.number().nullable().optional(), // % chance to advance from this tie
  team2AdvanceOdds: z.number().nullable().optional(),
  advanceOddsSource: z.enum(["kalshi", "implied", "none"]).optional(),
});

export type CupTie = z.infer<typeof cupTieSchema>;

// A round in the knockout bracket
export const cupRoundSchema = z.object({
  name: z.string(), // "Round of 16", "Quarter-finals", "Semi-finals", "Final"
  ties: z.array(cupTieSchema),
  isCurrent: z.boolean(), // is this the active round?
});

export type CupRound = z.infer<typeof cupRoundSchema>;

// Tournament favorites ranking
export const cupFavoriteSchema = z.object({
  team: cupTeamSchema,
  tournamentOdds: z.number(), // 0-100%
  isEliminated: z.boolean(),
  eliminatedBy: z.string().optional(), // team name that knocked them out
});

export type CupFavorite = z.infer<typeof cupFavoriteSchema>;

export const cupStandingRowSchema = z.object({
  rank: z.number(),
  team: cupTeamSchema,
  gamesPlayed: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  goalDifference: z.number(),
  points: z.number(),
  zone: z.string().optional(),
  zoneColor: z.string().optional(),
});

export type CupStandingRow = z.infer<typeof cupStandingRowSchema>;

export const cupGroupTableSchema = z.object({
  name: z.string(),
  standings: z.array(cupStandingRowSchema),
});

export type CupGroupTable = z.infer<typeof cupGroupTableSchema>;

export const cupLeaguePhaseSchema = z.object({
  label: z.string(), // "League Phase" | "Group Stage"
  tables: z.array(cupGroupTableSchema),
  recentMatches: z.array(cupMatchSchema),
  upcomingMatches: z.array(cupMatchSchema),
});

export type CupLeaguePhase = z.infer<typeof cupLeaguePhaseSchema>;

// Full European cup data
export const europeanCupDataSchema = z.object({
  slug: z.string(), // "uefa.champions", "uefa.europa", "uefa.europa.conf"
  name: z.string(),
  shortName: z.string(),
  logo: z.string().optional(),
  seasonLabel: z.string().optional(),
  currentRound: z.string(), // "League Phase", "Round of 16", etc.
  phase: z.enum(["qualifying", "league", "knockout"]).optional(),
  rounds: z.array(cupRoundSchema),
  leaguePhase: cupLeaguePhaseSchema.optional(),
  favorites: z.array(cupFavoriteSchema),
  oddsSource: z.string().optional(), // "kalshi" or "none"
  lastUpdated: z.string(),
});

export type EuropeanCupData = z.infer<typeof europeanCupDataSchema>;

// Domestic cup match (simpler than European ties)
export const domesticCupMatchSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: z.string(), // ESPN status type
  statusText: z.string(), // Human readable: "Full Time", "Scheduled", etc.
  homeTeam: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    logo: z.string(),
    score: z.number().nullable(),
    winner: z.boolean(),
    penaltyScore: z.number().nullable().optional(),
  }),
  awayTeam: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    logo: z.string(),
    score: z.number().nullable(),
    winner: z.boolean(),
    penaltyScore: z.number().nullable().optional(),
  }),
  note: z.string().optional(), // e.g. "advances 5-3 on penalties"
  round: z.string().optional(), // e.g. "Quarter-Final"
  homeOdds: z.number().optional(), // implied match win % derived from tournament winner odds
  awayOdds: z.number().optional(),
});

export type DomesticCupMatch = z.infer<typeof domesticCupMatchSchema>;

// Domestic cup tournament favorite
export const domesticCupFavoriteSchema = z.object({
  teamName: z.string(),
  teamLogo: z.string().optional(),
  probability: z.number(), // 0-100
  isEliminated: z.boolean(),
});

export type DomesticCupFavorite = z.infer<typeof domesticCupFavoriteSchema>;

// Full domestic cup data
export const domesticCupDataSchema = z.object({
  slug: z.string(),
  name: z.string(),
  shortName: z.string(),
  country: z.string(),
  countryFlag: z.string(),
  logo: z.string(),
  seasonLabel: z.string().optional(),
  currentRound: z.string(),
  recentResults: z.array(domesticCupMatchSchema), // completed matches in current/recent round
  upcomingMatches: z.array(domesticCupMatchSchema), // scheduled future matches
  favorites: z.array(domesticCupFavoriteSchema).optional(), // tournament winner odds
  lastUpdated: z.string(),
});

export type DomesticCupData = z.infer<typeof domesticCupDataSchema>;

// European cup config
export const EURO_CUP_CONFIG: Record<string, { name: string; shortName: string; espnSlug: string; kalshiTicker: string; color: string; icon: string; logo: string }> = {
  "uefa.champions": { name: "Champions League", shortName: "UCL", espnSlug: "uefa.champions", kalshiTicker: "KXUCL", color: "#1a56db", icon: "⭐", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2.png" },
  "uefa.europa": { name: "Europa League", shortName: "UEL", espnSlug: "uefa.europa", kalshiTicker: "KXUEL", color: "#ea580c", icon: "🟠", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2310.png" },
  "uefa.europa.conf": { name: "Conference League", shortName: "UECL", espnSlug: "uefa.europa.conf", kalshiTicker: "KXUECL", color: "#16a34a", icon: "🟢", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/20296.png" },
};

// Domestic cup config
export const DOMESTIC_CUP_CONFIG: Record<string, { name: string; shortName: string; espnSlug: string; country: string; countryFlag: string; leagueSlug: string; logo: string; kalshiTicker?: string }> = {
  "eng.fa": { name: "FA Cup", shortName: "FA", espnSlug: "eng.fa", country: "England", countryFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", leagueSlug: "eng.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/40.png", kalshiTicker: "KXFACUP" },
  "eng.league_cup": { name: "Carabao Cup", shortName: "CC", espnSlug: "eng.league_cup", country: "England", countryFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", leagueSlug: "eng.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/41.png" },
  "ger.dfb_pokal": { name: "DFB-Pokal", shortName: "DFB", espnSlug: "ger.dfb_pokal", country: "Germany", countryFlag: "🇩🇪", leagueSlug: "ger.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2061.png", kalshiTicker: "KXDFBPOKAL" },
  "ita.coppa_italia": { name: "Coppa Italia", shortName: "CI", espnSlug: "ita.coppa_italia", country: "Italy", countryFlag: "🇮🇹", leagueSlug: "ita.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2192.png", kalshiTicker: "KXCOPPAITALIA" },
  "esp.copa_del_rey": { name: "Copa del Rey", shortName: "CdR", espnSlug: "esp.copa_del_rey", country: "Spain", countryFlag: "🇪🇸", leagueSlug: "esp.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/80.png", kalshiTicker: "KXCOPADELREY" },
  "fra.coupe_de_france": { name: "Coupe de France", shortName: "CdF", espnSlug: "fra.coupe_de_france", country: "France", countryFlag: "🇫🇷", leagueSlug: "fra.1", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/182.png" },
};
