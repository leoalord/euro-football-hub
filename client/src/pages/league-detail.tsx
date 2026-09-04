import { useCachedQuery } from "@/hooks/use-cached-query";
import type { LeagueData, StandingEntry, Match, Article, BattleGroup } from "@shared/schema";
import { Link, useParams } from "wouter";
import { ArrowLeft, ExternalLink, Clock, Trophy, ChevronUp, ChevronDown, Calendar, Zap, AlertTriangle, TrendingUp, Star, Shield, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDistanceToNow, format, parseISO } from "date-fns";

function getZoneClass(zone?: string): string {
  if (!zone) return "zone-none";
  const z = zone.toLowerCase();
  if (z.includes("champions")) return "zone-ucl";
  if (z.includes("europa") && !z.includes("conference")) return "zone-europa";
  if (z.includes("conference")) return "zone-conference";
  if (z.includes("relegation")) return "zone-relegation";
  return "zone-none";
}

function getZoneBadgeLabel(zone?: string): string | null {
  if (!zone) return null;
  const z = zone.toLowerCase();
  if (z.includes("champions")) return "Champions League";
  if (z.includes("europa") && !z.includes("conference")) return "Europa League";
  if (z.includes("conference")) return "Conference League";
  if (z.includes("relegation")) return "Relegation";
  return zone;
}

// Form indicator dots
function FormIndicator({ form, showLabel }: { form?: string; showLabel?: boolean }) {
  if (!form) return null;
  const chars = form.slice(0, 5).split("");

  // Calculate form points
  const pts = chars.reduce((acc, c) => acc + (c === "W" ? 3 : c === "D" ? 1 : 0), 0);

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5 items-center">
        {chars.map((c, i) => (
          <div
            key={i}
            className={`w-[7px] h-[7px] rounded-full ${
              c === "W" ? "bg-green-500" :
              c === "D" ? "bg-amber-500" :
              c === "L" ? "bg-red-500" :
              "bg-muted-foreground/30"
            }`}
            title={c === "W" ? "Win" : c === "D" ? "Draw" : "Loss"}
          />
        ))}
      </div>
      {showLabel && <span className="text-[10px] text-muted-foreground">{form}</span>}
    </div>
  );
}

// Competition badge colors
const COMP_COLORS: Record<string, string> = {
  "UCL": "bg-blue-600/20 text-blue-300 border-blue-500/30",
  "UEL": "bg-orange-600/20 text-orange-300 border-orange-500/30",
  "UECL": "bg-green-600/20 text-green-300 border-green-500/30",
  "FA": "bg-red-600/20 text-red-300 border-red-500/30",
  "CC": "bg-emerald-600/20 text-emerald-300 border-emerald-500/30",
  "DFB": "bg-red-600/20 text-red-300 border-red-500/30",
  "CI": "bg-blue-600/20 text-blue-300 border-blue-500/30",
  "CdR": "bg-red-600/20 text-red-300 border-red-500/30",
  "CdF": "bg-blue-600/20 text-blue-300 border-blue-500/30",
};

// Competition full names for legend
const COMP_NAMES: Record<string, string> = {
  "UCL": "Champions League",
  "UEL": "Europa League",
  "UECL": "Conference League",
  "FA": "FA Cup",
  "CC": "Carabao Cup",
  "DFB": "DFB-Pokal",
  "CI": "Coppa Italia",
  "CdR": "Copa del Rey",
  "CdF": "Coupe de France",
};

// Map league slugs to their domestic cup abbreviations
const LEAGUE_CUP_KEYS: Record<string, string[]> = {
  "eng.1": ["FA", "CC"],
  "ger.1": ["DFB"],
  "ita.1": ["CI"],
  "esp.1": ["CdR"],
  "fra.1": ["CdF"],
};

function CompetitionBadges({ competitions, size = "sm" }: { competitions?: StandingEntry["activeCompetitions"]; size?: "sm" | "md" }) {
  if (!competitions || competitions.length === 0) return null;
  const sizeClass = size === "md" ? "text-[9px] px-1.5 py-0.5" : "text-[8px] px-1 py-0";
  return (
    <div className="flex gap-0.5 items-center flex-wrap">
      {competitions.map((c) => (
        <span
          key={c.slug}
          className={`font-bold rounded border leading-tight ${sizeClass} ${COMP_COLORS[c.shortName] || "bg-muted text-muted-foreground border-border"}`}
          title={`${c.name}${c.stage ? ` — ${c.stage}` : ""}`}
        >
          {c.shortName}
        </span>
      ))}
    </div>
  );
}

function StandingsTable({ standings }: { standings: StandingEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="standings-table">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left py-2 px-2 w-8">#</th>
            <th className="text-left py-2 px-2">Team</th>
            <th className="text-center py-2 px-1 w-8">GP</th>
            <th className="text-center py-2 px-1 w-8">W</th>
            <th className="text-center py-2 px-1 w-8">D</th>
            <th className="text-center py-2 px-1 w-8">L</th>
            <th className="text-center py-2 px-1 w-10">GF</th>
            <th className="text-center py-2 px-1 w-10">GA</th>
            <th className="text-center py-2 px-1 w-10">GD</th>
            <th className="text-center py-2 px-2 w-10 font-semibold">Pts</th>
            <th className="text-center py-2 px-1 hidden sm:table-cell w-16">Form</th>
            <th className="text-left py-2 px-2 hidden md:table-cell">Zone</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => (
            <tr
              key={team.teamId}
              className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${getZoneClass(team.zone)}`}
              data-testid={`standing-row-${team.teamId}`}
            >
              <td className="py-2 px-2 tabular-nums text-xs text-muted-foreground font-medium">{team.rank}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <img
                    src={team.teamLogo}
                    alt=""
                    className="w-5 h-5 object-contain"
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                  <span className="font-medium text-foreground">{team.teamName}</span>
                  <CompetitionBadges competitions={team.activeCompetitions} />
                </div>
              </td>
              <td className="text-center py-2 px-1 tabular-nums text-muted-foreground">{team.gamesPlayed}</td>
              <td className="text-center py-2 px-1 tabular-nums text-foreground">{team.wins}</td>
              <td className="text-center py-2 px-1 tabular-nums text-muted-foreground">{team.draws}</td>
              <td className="text-center py-2 px-1 tabular-nums text-muted-foreground">{team.losses}</td>
              <td className="text-center py-2 px-1 tabular-nums text-muted-foreground">{team.goalsFor}</td>
              <td className="text-center py-2 px-1 tabular-nums text-muted-foreground">{team.goalsAgainst}</td>
              <td className="text-center py-2 px-1 tabular-nums font-medium">
                <span className={team.goalDifference > 0 ? "text-green-400" : team.goalDifference < 0 ? "text-red-400" : "text-muted-foreground"}>
                  {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                </span>
              </td>
              <td className="text-center py-2 px-2 tabular-nums font-bold text-foreground">{team.points}</td>
              <td className="py-2 px-1 hidden sm:table-cell">
                <FormIndicator form={team.recentForm} />
              </td>
              <td className="py-2 px-2 hidden md:table-cell">
                {team.zone && (
                  <span className="text-xs text-muted-foreground">{getZoneBadgeLabel(team.zone)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const isFinished = match.status.toLowerCase().includes("full") || match.status.toLowerCase().includes("final");
  const isLive = match.status.toLowerCase().includes("progress") || match.status.toLowerCase().includes("half");
  const isScheduled = !isFinished && !isLive;

  let dateStr = "";
  try {
    const d = parseISO(match.date);
    dateStr = format(d, "EEE MMM d, h:mm a");
  } catch {
    dateStr = match.date;
  }

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${
      match.isUpset ? 'bg-amber-500/5 border border-amber-500/15' :
      isLive ? 'bg-primary/5 border border-primary/20' :
      'bg-accent/30'
    }`}>
      <div className="flex-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-foreground">{match.homeTeam.name}</span>
            {match.homeTeam.form && <FormIndicator form={match.homeTeam.form} />}
          </div>
          {match.homeTeam.logo && (
            <img src={match.homeTeam.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" crossOrigin="anonymous" />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center min-w-[64px]">
        {isScheduled ? (
          <>
            <span className="text-sm font-medium text-muted-foreground">vs</span>
            <span className="text-[10px] text-muted-foreground">{dateStr}</span>
          </>
        ) : (
          <>
            <span className={`text-sm font-bold tabular-nums ${isLive ? 'text-primary' : 'text-foreground'}`}>
              {match.homeTeam.score} - {match.awayTeam.score}
            </span>
            <span className={`text-[10px] ${isLive ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              {isLive ? '● LIVE' : 'FT'}
            </span>
          </>
        )}
        {match.isUpset && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] text-amber-400 font-medium">UPSET</span>
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {match.awayTeam.logo && (
            <img src={match.awayTeam.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" crossOrigin="anonymous" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{match.awayTeam.name}</span>
            {match.awayTeam.form && <FormIndicator form={match.awayTeam.form} />}
          </div>
        </div>
      </div>
      {/* Odds for upcoming */}
      {isScheduled && match.odds && (
        <div className="hidden sm:flex flex-col items-end text-[10px] text-muted-foreground">
          {match.odds.details && <span>{match.odds.details}</span>}
          {match.odds.overUnder && <span>O/U {match.odds.overUnder}</span>}
        </div>
      )}
    </div>
  );
}

function NewsCard({ article }: { article: Article }) {
  let timeAgo = "";
  try {
    timeAgo = formatDistanceToNow(parseISO(article.published), { addSuffix: true });
  } catch {
    timeAgo = "";
  }

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      data-testid={`news-article-${article.id}`}
    >
      <Card className="bg-card border-card-border overflow-hidden hover:border-primary/30 transition-colors">
        <div className="flex gap-3 p-3">
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt=""
              className="w-20 h-14 object-cover rounded flex-shrink-0"
              loading="lazy"
              crossOrigin="anonymous"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
              {article.headline}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">{article.source}</span>
              {timeAgo && <span className="text-[10px] text-muted-foreground">· {timeAgo}</span>}
              <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}

function BattleCard({ battle, icon: Icon, iconColor }: { battle: BattleGroup; icon: any; iconColor: string }) {
  const leader = battle.teams[0];

  return (
    <Card className="bg-card border-card-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold text-foreground">{battle.label}</h3>
        {!battle.isCompetitive && (
          <Badge variant="secondary" className="text-[10px] ml-auto">Settled</Badge>
        )}
      </div>
      <div className="space-y-2">
        {battle.teams.map((team) => {
          const gap = leader ? leader.points - team.points : 0;
          return (
            <div key={team.teamId} className={`flex items-center gap-2 pl-1 rounded ${
              getZoneClass(team.zone)
            } ${team.isTitleContender ? 'bg-yellow-500/8 py-1 px-2' : ''}`}>
              {team.isTitleContender && (
                <Trophy className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
              )}
              <img src={team.teamLogo} alt="" className="w-5 h-5 object-contain" loading="lazy" crossOrigin="anonymous" />
              <span className={`text-sm truncate ${team.isTitleContender ? 'text-yellow-200 font-medium' : 'text-foreground'}`}>{team.teamName}</span>
              {team.titleOdds && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border leading-tight bg-yellow-600/20 text-yellow-300 border-yellow-500/30">
                  {team.titleOdds}
                </span>
              )}
              {team.relegationOdds && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border leading-tight bg-red-600/20 text-red-300 border-red-500/30">
                  {team.relegationOdds}
                </span>
              )}
              <CompetitionBadges competitions={team.activeCompetitions} size="md" />
              <div className="flex-1" />
              <FormIndicator form={team.recentForm} />
              <span className="text-[10px] text-muted-foreground tabular-nums">{team.gamesPlayed}gp</span>
              <span className="text-sm font-bold tabular-nums">{team.points}</span>
              {gap > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">-{gap}</span>
              )}
            </div>
          );
        })}
      </div>
      {battle.insight && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{battle.insight}</p>
      )}
    </Card>
  );
}

export default function LeagueDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "eng.1";
  const { refetchInterval } = useAutoRefresh();

  const { data, isFetching, dataUpdatedAt } = useCachedQuery<LeagueData>({
    queryKey: ["/api/league", slug],
    refetchInterval,
    staleTime: 60_000,
  });

  if (!data && isFetching) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <Skeleton className="w-48 h-6" />
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="w-full h-48" />
          <Skeleton className="w-full h-96" />
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">League not found</p>
      </div>
    );
  }

  const euroBattle = data.battles?.find(b => b.type === "european");
  const relBattle = data.battles?.find(b => b.type === "relegation");
  const upsets = data.recentMatches.filter(m => m.isUpset);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="back-button">
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            </Link>
            <div className="h-4 w-px bg-border" />
            {data.logo ? (
              <img src={data.logo} alt={data.name} className="w-7 h-7 object-contain" loading="lazy" crossOrigin="anonymous" />
            ) : (
              <span className="text-xl">{data.flag}</span>
            )}
            <div>
              <h1 className="text-base font-bold text-foreground">{data.name}</h1>
              <p className="text-[10px] text-muted-foreground">{data.country}</p>
            </div>
          </div>
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Key Battles Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {euroBattle && <BattleCard battle={euroBattle} icon={Star} iconColor="text-blue-400" />}
          {relBattle && <BattleCard battle={relBattle} icon={ChevronDown} iconColor="text-red-400" />}
        </div>

        {/* Upset Alert Banner */}
        {upsets.length > 0 && (
          <Card className="bg-amber-500/5 border-amber-500/15 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-300">Recent Upsets</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {upsets.slice(0, 6).map(match => (
                <div key={match.id} className="flex items-center gap-2 text-sm bg-amber-500/5 rounded px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="font-medium text-foreground">
                    {match.homeTeam.abbreviation} {match.homeTeam.score}-{match.awayTeam.score} {match.awayTeam.abbreviation}
                  </span>
                  {match.upsetDetails && (
                    <span className="text-xs text-muted-foreground truncate">{match.upsetDetails}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tabbed content */}
        <Tabs defaultValue="standings" className="w-full">
          <TabsList className="bg-muted">
            <TabsTrigger value="standings" data-testid="tab-standings">Standings</TabsTrigger>
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
            <TabsTrigger value="news" data-testid="tab-news">News</TabsTrigger>
          </TabsList>

          <TabsContent value="standings" className="mt-4">
            <Card className="bg-card border-card-border overflow-hidden">
              <StandingsTable standings={data.standings} />
            </Card>
            {/* Zone legend */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[hsl(152,55%,42%)]" />
                <span>Champions League</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[hsl(36,85%,58%)]" />
                <span>Europa League</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[hsl(210,65%,55%)]" />
                <span>Conference League</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[hsl(0,68%,52%)]" />
                <span>Relegation</span>
              </div>
            </div>
            {/* Competition badge legend */}
            <div className="border border-border rounded-lg px-3 py-2 mt-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Badges:</span>
                {["UCL", "UEL", "UECL", ...(LEAGUE_CUP_KEYS[slug] || [])].map((key) => (
                  <span key={key} className="flex items-center gap-1 text-[10px]">
                    <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS[key] || "bg-muted text-muted-foreground border-border"}`}>{key}</span>
                    <span className="text-muted-foreground">{COMP_NAMES[key] || key}</span>
                  </span>
                ))}
                <span className="text-muted-foreground/50">|</span>
                <span className="flex items-center gap-1 text-[10px]">
                  <Trophy className="w-3 h-3 text-yellow-500" />
                  <span className="text-muted-foreground">Title contender</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="font-bold px-1 py-0 rounded border leading-tight bg-yellow-600/20 text-yellow-300 border-yellow-500/30">%</span>
                  <span className="text-muted-foreground">Title odds</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="font-bold px-1 py-0 rounded border leading-tight bg-red-600/20 text-red-300 border-red-500/30">%</span>
                  <span className="text-muted-foreground">Relegation odds</span>
                </span>
                <span className="text-[10px] text-muted-foreground/60">(via Kalshi)</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4">
            {data.upcomingMatches.length > 0 ? (
              <div className="space-y-2">
                {data.upcomingMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No upcoming matches scheduled</p>
            )}
          </TabsContent>

          <TabsContent value="results" className="mt-4">
            {data.recentMatches.length > 0 ? (
              <div className="space-y-2">
                {data.recentMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No recent matches</p>
            )}
          </TabsContent>

          <TabsContent value="news" className="mt-4">
            {data.news.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.news.map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No news available</p>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border mt-8 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Data from ESPN &amp; DraftKings. Prediction markets via <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kalshi</a>. News from ESPN &amp; BBC Sport.</p>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
