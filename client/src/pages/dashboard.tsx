import { useCachedQuery } from "@/hooks/use-cached-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardData, LeagueData, BattleGroup, Match, StandingEntry } from "@shared/schema";
import { Link } from "wouter";
import { ChevronRight, RefreshCw, Clock, Trophy, Star, ArrowDownRight, TrendingUp, AlertTriangle, Calendar, Zap, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDistanceToNow } from "date-fns";

function getZoneClass(zone?: string): string {
  if (!zone) return "zone-none";
  const z = zone.toLowerCase();
  if (z.includes("champions")) return "zone-ucl";
  if (z.includes("europa") && !z.includes("conference")) return "zone-europa";
  if (z.includes("conference")) return "zone-conference";
  if (z.includes("relegation")) return "zone-relegation";
  return "zone-none";
}

function getZoneBadge(zone?: string) {
  if (!zone) return null;
  const z = zone.toLowerCase();
  let variant: "default" | "secondary" | "destructive" = "secondary";
  let label = zone;
  if (z.includes("champions")) { variant = "default"; label = "UCL"; }
  else if (z.includes("europa")) { variant = "secondary"; label = "UEL"; }
  else if (z.includes("conference")) { variant = "secondary"; label = "UECL"; }
  else if (z.includes("relegat")) { variant = "destructive"; label = "REL"; }
  return <Badge variant={variant} className="text-[10px] px-1.5 py-0">{label}</Badge>;
}

// Form indicator dots: W=green, D=amber, L=red
function FormIndicator({ form }: { form?: string }) {
  if (!form) return null;
  const chars = form.slice(0, 5).split("");
  return (
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
  );
}

// Streak text from form string
function getStreakText(form?: string): string | null {
  if (!form || form.length === 0) return null;
  const first = form[0];
  let count = 1;
  for (let i = 1; i < form.length; i++) {
    if (form[i] === first) count++;
    else break;
  }
  if (count >= 3) {
    const label = first === "W" ? "wins" : first === "D" ? "draws" : "losses";
    return `${count} ${label} in a row`;
  }
  // Check unbeaten or winless runs
  const last5 = form.slice(0, 5);
  if (!last5.includes("L") && last5.length >= 4) return `Unbeaten in ${last5.length}`;
  if (!last5.includes("W") && last5.length >= 4) return `Winless in ${last5.length}`;
  return null;
}

// Competition badge colors — used in the legend and inline badges
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

function CompetitionBadges({ competitions }: { competitions?: StandingEntry["activeCompetitions"] }) {
  if (!competitions || competitions.length === 0) return null;
  return (
    <div className="flex gap-px items-center">
      {competitions.map((c) => (
        <span
          key={c.slug}
          className={`text-[7px] font-bold px-[3px] leading-[13px] rounded-sm border ${COMP_COLORS[c.shortName] || "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20"}`}
          title={`${c.name}${c.stage ? ` — ${c.stage}` : ""}`}
        >
          {c.shortName}
        </span>
      ))}
    </div>
  );
}

// Odds display - convert American to readable
function OddsDisplay({ match }: { match: Match }) {
  if (!match.odds) return null;
  const { homeMoneyline, awayMoneyline, drawMoneyline, favorite } = match.odds;
  if (!homeMoneyline && !awayMoneyline) return null;

  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={favorite === "home" ? "font-semibold text-foreground" : ""}>{match.homeTeam.abbreviation} {homeMoneyline}</span>
      <span className="text-muted-foreground/50">·</span>
      <span>Draw {drawMoneyline}</span>
      <span className="text-muted-foreground/50">·</span>
      <span className={favorite === "away" ? "font-semibold text-foreground" : ""}>{match.awayTeam.abbreviation} {awayMoneyline}</span>
    </div>
  );
}

function BattleSection({ battle, icon: Icon, iconColor }: { battle: BattleGroup; icon: any; iconColor: string }) {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{battle.label}</span>
        {battle.isCompetitive && battle.gapFromTarget !== undefined && battle.gapFromTarget > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">{battle.gapFromTarget}pt gap</span>
        )}
        {!battle.isCompetitive && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto italic">settled</span>
        )}
      </div>
      <div className="space-y-0.5">
        {battle.teams.map((team) => (
          <div key={team.teamId} className={`flex items-center gap-1.5 py-1 px-2 rounded ${
            getZoneClass(team.zone)
          } ${team.isTitleContender ? 'bg-yellow-500/8' : ''}`}>
            {/* Rank */}
            <span className="text-[11px] font-medium text-muted-foreground w-4 tabular-nums flex-shrink-0 text-right">{team.rank}</span>
            {/* Team logo */}
            <img
              src={team.teamLogo}
              alt=""
              className="w-4 h-4 object-contain flex-shrink-0"
              loading="lazy"
              crossOrigin="anonymous"
            />
            {/* Name + badges group — this is the flexible area */}
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
              <span className={`text-xs font-medium truncate ${
                team.isTitleContender ? 'text-yellow-200' : 'text-foreground'
              }`}>{team.teamName}</span>
              {/* Odds badge */}
              {team.titleOdds && (
                <span className="text-[8px] font-bold px-1 py-0 rounded border leading-tight bg-yellow-600/20 text-yellow-300 border-yellow-500/30 whitespace-nowrap flex-shrink-0">
                  {team.titleOdds}
                </span>
              )}
              {team.relegationOdds && (
                <span className="text-[8px] font-bold px-1 py-0 rounded border leading-tight bg-red-600/20 text-red-300 border-red-500/30 whitespace-nowrap flex-shrink-0">
                  {team.relegationOdds}
                </span>
              )}
              {battle.type === "relegation" && team.zone?.toLowerCase().includes("relegation") && !team.relegationOdds && (
                <Badge variant="destructive" className="text-[8px] px-1 py-0 flex-shrink-0">REL</Badge>
              )}
              <CompetitionBadges competitions={team.activeCompetitions} />
            </div>
            {/* Stats cluster — always visible */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <FormIndicator form={team.recentForm} />
              <span className="text-[10px] text-muted-foreground tabular-nums">{team.gamesPlayed}gp</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{team.points}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
              </span>
            </div>
          </div>
        ))}
      </div>
      {battle.insight && (
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{battle.insight}</p>
      )}
    </div>
  );
}

function UpsetAlert({ matches }: { matches: Match[] }) {
  const upsets = matches.filter(m => m.isUpset);
  if (upsets.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-amber-400/80 uppercase tracking-wider">Upsets</span>
      </div>
      <div className="space-y-1.5">
        {upsets.slice(0, 3).map((match) => (
          <div key={match.id} className="flex items-center gap-2 text-xs bg-amber-500/5 rounded px-2 py-1.5 border border-amber-500/10">
            <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-foreground flex-1">
              <span className="font-medium">{match.homeTeam.abbreviation} {match.homeTeam.score} - {match.awayTeam.score} {match.awayTeam.abbreviation}</span>
            </span>
            {match.odds?.details && (
              <span className="text-[10px] text-muted-foreground">was {match.odds.details}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingSection({ matches }: { matches: Match[] }) {
  if (matches.length === 0) return null;
  const next3 = matches.slice(0, 3);

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming</span>
      </div>
      <div className="space-y-1.5">
        {next3.map((match) => (
          <div key={match.id}>
            <div className="flex items-center gap-2 text-xs">
              <span className="truncate flex-1 text-right text-foreground">{match.homeTeam.abbreviation}</span>
              {match.homeTeam.form && <FormIndicator form={match.homeTeam.form} />}
              <span className="font-medium tabular-nums px-2 py-0.5 rounded bg-muted text-foreground min-w-[32px] text-center text-[10px]">
                vs
              </span>
              {match.awayTeam.form && <FormIndicator form={match.awayTeam.form} />}
              <span className="truncate flex-1 text-foreground">{match.awayTeam.abbreviation}</span>
            </div>
            {match.odds && (
              <div className="mt-0.5 text-center">
                <OddsDisplay match={match} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentSection({ matches }: { matches: Match[] }) {
  if (matches.length === 0) return null;
  const recent3 = matches.slice(0, 3);

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</span>
      </div>
      <div className="space-y-1.5">
        {recent3.map((match) => (
          <div key={match.id} className={`flex items-center gap-2 text-xs ${match.isUpset ? "bg-amber-500/5 rounded px-1 py-0.5" : ""}`}>
            <span className="truncate flex-1 text-right text-foreground">{match.homeTeam.abbreviation}</span>
            <span className={`font-semibold tabular-nums px-2 py-0.5 rounded min-w-[48px] text-center text-xs ${match.isUpset ? "bg-amber-500/10 text-amber-300" : "bg-muted text-foreground"}`}>
              {match.homeTeam.score ?? '-'} - {match.awayTeam.score ?? '-'}
            </span>
            <span className="truncate flex-1 text-foreground">{match.awayTeam.abbreviation}</span>
            {match.isUpset && <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeagueCard({ league }: { league: LeagueData }) {
  const euroBattle = league.battles?.find(b => b.type === "european");
  const relBattle = league.battles?.find(b => b.type === "relegation");
  const topNews = league.news.slice(0, 2);

  return (
    <Card className="bg-card border-card-border overflow-hidden" data-testid={`league-card-${league.slug}`}>
      {/* League header */}
      <Link href={`/league/${league.slug}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            {league.logo ? (
              <img src={league.logo} alt={league.name} className="w-6 h-6 object-contain" loading="lazy" crossOrigin="anonymous" />
            ) : (
              <span className="text-xl">{league.flag}</span>
            )}
            <div>
              <h2 className="font-semibold text-sm text-foreground">{league.name}</h2>
              <p className="text-xs text-muted-foreground">{league.country}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </Link>

      {/* Smart Battle Sections */}
      {euroBattle && <BattleSection battle={euroBattle} icon={Star} iconColor="text-blue-400" />}
      {relBattle && <BattleSection battle={relBattle} icon={ArrowDownRight} iconColor="text-red-500" />}

      {/* Upset Alerts */}
      <UpsetAlert matches={league.recentMatches} />

      {/* Upcoming with Odds */}
      <UpcomingSection matches={league.upcomingMatches} />

      {/* Recent Results */}
      <RecentSection matches={league.recentMatches} />

      {/* Headlines */}
      {topNews.length > 0 && (
        <div className="px-4 py-3">
          <div className="space-y-2">
            {topNews.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
                data-testid={`news-${article.id}`}
              >
                <p className="text-xs text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-relaxed">
                  {article.headline}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{article.source}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function LeagueCardSkeleton() {
  return (
    <Card className="bg-card border-card-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-6 h-6 rounded" />
          <div>
            <Skeleton className="w-24 h-4 mb-1" />
            <Skeleton className="w-16 h-3" />
          </div>
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-border">
          <Skeleton className="w-20 h-3 mb-2" />
          <div className="space-y-2">
            <Skeleton className="w-full h-5" />
            <Skeleton className="w-full h-5" />
            <Skeleton className="w-full h-5" />
          </div>
        </div>
      ))}
    </Card>
  );
}

export default function Dashboard() {
  const { refetchInterval } = useAutoRefresh();

  const { data, error, dataUpdatedAt, isFetching } = useCachedQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval,
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Euro Football Hub">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" className="text-primary"/>
              <path d="M16 4 L16 28 M4 16 L28 16" stroke="currentColor" strokeWidth="1.5" opacity="0.3" className="text-primary"/>
              <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" className="text-primary"/>
              <circle cx="16" cy="16" r="1.5" fill="currentColor" className="text-primary"/>
            </svg>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">Euro Football Hub</h1>
              <p className="text-[10px] text-muted-foreground">Top 5 European Leagues</p>
            </div>
          </div>
          {/* Nav tabs */}
          <div className="flex items-center gap-1">
            <span className="text-xs px-3 py-1.5 rounded-md bg-accent text-foreground font-medium cursor-default">
              Leagues
            </span>
            <Link href="/cups">
              <span className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer">
                Cups
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {dataUpdatedAt > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
                <span>Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && !data && (
          <div className="text-center py-12">
            <p className="text-destructive text-sm">Failed to load data. Retrying...</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {!data
            ? [...Array(5)].map((_, i) => <LeagueCardSkeleton key={i} />)
            : data.leagues.map((league) => (
                <LeagueCard key={league.slug} league={league} />
              ))}
        </div>
      </main>

      {/* Competition Legend */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="border border-border rounded-lg px-4 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">European</span>
              <div className="flex gap-2 mt-1">
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["UCL"]}`}>UCL</span>
                  <span className="text-muted-foreground">Champions League</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["UEL"]}`}>UEL</span>
                  <span className="text-muted-foreground">Europa League</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["UECL"]}`}>UECL</span>
                  <span className="text-muted-foreground">Conference League</span>
                </span>
              </div>
            </div>
            <div className="h-px sm:h-auto sm:w-px bg-border" />
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Domestic Cups</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["FA"]}`}>FA</span>
                  <span className="text-muted-foreground">FA Cup</span>
                  <span className="text-muted-foreground/50">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["CC"]}`}>CC</span>
                  <span className="text-muted-foreground">Carabao Cup</span>
                  <span className="text-muted-foreground/50">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["DFB"]}`}>DFB</span>
                  <span className="text-muted-foreground">DFB-Pokal</span>
                  <span className="text-muted-foreground/50">🇩🇪</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["CI"]}`}>CI</span>
                  <span className="text-muted-foreground">Coppa Italia</span>
                  <span className="text-muted-foreground/50">🇮🇹</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["CdR"]}`}>CdR</span>
                  <span className="text-muted-foreground">Copa del Rey</span>
                  <span className="text-muted-foreground/50">🇪🇸</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className={`font-bold px-1 py-0 rounded border leading-tight ${COMP_COLORS["CdF"]}`}>CdF</span>
                  <span className="text-muted-foreground">Coupe de France</span>
                  <span className="text-muted-foreground/50">🇫🇷</span>
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Trophy className="w-3 h-3 text-yellow-500" />
              <span className="text-[10px] text-muted-foreground">= Title contender</span>
              <span className="text-[8px] font-bold px-1 py-0 rounded border leading-tight bg-yellow-600/20 text-yellow-300 border-yellow-500/30">%</span>
              <span className="text-[10px] text-muted-foreground">= odds of winning the league</span>
              <span className="text-[8px] font-bold px-1 py-0 rounded border leading-tight bg-red-600/20 text-red-300 border-red-500/30">%</span>
              <span className="text-[10px] text-muted-foreground">= odds of being relegated</span>
              <span className="text-[10px] text-muted-foreground/60 ml-1">(via Kalshi prediction markets)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-4 py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Data from ESPN &amp; DraftKings. Prediction markets via <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kalshi</a>. News from ESPN &amp; BBC Sport.</p>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
