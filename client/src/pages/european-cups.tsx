import { useCachedQuery } from "@/hooks/use-cached-query";
import { apiRequest } from "@/lib/queryClient";
import type { EuropeanCupData, CupTie, CupRound, CupFavorite, CupMatch, DomesticCupData, DomesticCupMatch, DomesticCupFavorite } from "@shared/schema";
import { Link, useRoute, useLocation } from "wouter";
import { RefreshCw, Trophy, ArrowLeft, ChevronRight, Clock, Check, Swords, Crown, Minus, Globe, Flag, List, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import { useState, useRef, useEffect, useCallback } from "react";

// Competition color schemes
const COMP_THEMES: Record<string, { accent: string; accentBg: string; accentBorder: string; badge: string }> = {
  UCL: {
    accent: "text-blue-400",
    accentBg: "bg-blue-600/15",
    accentBorder: "border-blue-500/30",
    badge: "bg-blue-600/20 text-blue-300 border-blue-500/30",
  },
  UEL: {
    accent: "text-orange-400",
    accentBg: "bg-orange-600/15",
    accentBorder: "border-orange-500/30",
    badge: "bg-orange-600/20 text-orange-300 border-orange-500/30",
  },
  UECL: {
    accent: "text-green-400",
    accentBg: "bg-green-600/15",
    accentBorder: "border-green-500/30",
    badge: "bg-green-600/20 text-green-300 border-green-500/30",
  },
};

// Format match date
function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return `Today ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function getStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "STATUS_FULL_TIME":
    case "STATUS_FINAL_AET":
    case "STATUS_FINAL_PEN":
      return { label: "FT", color: "text-muted-foreground" };
    case "STATUS_IN_PROGRESS":
    case "STATUS_HALFTIME":
    case "STATUS_FIRST_HALF":
    case "STATUS_SECOND_HALF":
      return { label: "LIVE", color: "text-green-400" };
    case "STATUS_SCHEDULED":
      return { label: "", color: "text-muted-foreground" };
    default:
      return { label: status.replace("STATUS_", ""), color: "text-muted-foreground" };
  }
}

// ---- Tie Card: Shows a matchup between two teams ----
// Get the primary odds to display: advance odds take priority, then tournament odds
function getDisplayOdds(tie: CupTie): { team1: number | null; team2: number | null; isAdvance: boolean; source: string } {
  if (tie.team1AdvanceOdds != null || tie.team2AdvanceOdds != null) {
    return {
      team1: tie.team1AdvanceOdds ?? null,
      team2: tie.team2AdvanceOdds ?? null,
      isAdvance: true,
      source: tie.advanceOddsSource === "kalshi" ? "Kalshi" : "implied",
    };
  }
  return {
    team1: tie.team1TournamentOdds ?? null,
    team2: tie.team2TournamentOdds ?? null,
    isAdvance: false,
    source: "tournament",
  };
}

function TieCard({ tie, theme }: { tie: CupTie; theme: typeof COMP_THEMES["UCL"] }) {
  const isComplete = tie.isComplete;
  const team1Won = tie.winner === tie.team1.id;
  const team2Won = tie.winner === tie.team2.id;
  const odds = getDisplayOdds(tie);

  return (
    <div className={`rounded-lg border ${isComplete ? "border-border/50" : "border-border"} bg-card overflow-hidden`}>
      {/* Team rows */}
      <div className="divide-y divide-border/50">
        {/* Team 1 */}
        <div className={`flex items-center gap-2 px-3 py-2 ${team1Won ? theme.accentBg : ""} ${!isComplete ? "" : team1Won ? "" : "opacity-50"}`}>
          <img src={tie.team1.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" crossOrigin="anonymous" />
          <span className={`text-xs font-medium flex-1 truncate ${team1Won ? "text-foreground" : "text-foreground/80"}`}>
            {tie.team1.name}
          </span>
          {odds.team1 != null && odds.team1 > 0 && !isComplete && (
            <span className={`text-[8px] font-bold px-1 py-0 rounded border leading-tight ${
              odds.isAdvance
                ? (odds.team1 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team1 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
                : theme.badge
            }`}>
              {odds.team1}%
            </span>
          )}
          {/* Aggregate goals for team1 */}
          {tie.aggregateScore && (
            <span className={`text-xs font-semibold tabular-nums w-4 text-center ${team1Won ? "text-foreground" : "text-muted-foreground"}`}>
              {tie.aggregateScore.split("-")[0]}
            </span>
          )}
          {team1Won && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
        </div>
        {/* Team 2 */}
        <div className={`flex items-center gap-2 px-3 py-2 ${team2Won ? theme.accentBg : ""} ${!isComplete ? "" : team2Won ? "" : "opacity-50"}`}>
          <img src={tie.team2.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" crossOrigin="anonymous" />
          <span className={`text-xs font-medium flex-1 truncate ${team2Won ? "text-foreground" : "text-foreground/80"}`}>
            {tie.team2.name}
          </span>
          {odds.team2 != null && odds.team2 > 0 && !isComplete && (
            <span className={`text-[8px] font-bold px-1 py-0 rounded border leading-tight ${
              odds.isAdvance
                ? (odds.team2 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team2 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
                : theme.badge
            }`}>
              {odds.team2}%
            </span>
          )}
          {tie.aggregateScore && (
            <span className={`text-xs font-semibold tabular-nums w-4 text-center ${team2Won ? "text-foreground" : "text-muted-foreground"}`}>
              {tie.aggregateScore.split("-")[1]}
            </span>
          )}
          {team2Won && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
        </div>
      </div>

      {/* Match details */}
      <div className="px-3 py-1.5 bg-muted/30 border-t border-border/50">
        {tie.matches.map((match, i) => (
          <MatchLine key={match.id} match={match} index={i} />
        ))}
        {tie.aggregateNote && (
          <p className="text-[9px] text-muted-foreground mt-0.5 italic">{tie.aggregateNote}</p>
        )}
      </div>
    </div>
  );
}

function MatchLine({ match, index }: { match: CupMatch; index: number }) {
  const status = getStatusLabel(match.status);
  const isScheduled = match.status === "STATUS_SCHEDULED";

  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[10px]">
      <span className="text-muted-foreground/60 w-9 flex-shrink-0">{match.leg || `Leg ${index + 1}`}</span>
      {isScheduled ? (
        <>
          <span className="text-muted-foreground flex-1">{match.homeTeam.abbreviation} vs {match.awayTeam.abbreviation}</span>
          <Clock className="w-2.5 h-2.5 text-muted-foreground/50" />
          <span className="text-muted-foreground/60">{formatMatchDate(match.date)}</span>
        </>
      ) : (
        <>
          <span className="text-foreground/80 flex-1">
            {match.homeTeam.abbreviation} {match.homeTeam.score} <Minus className="w-2 h-2 inline text-muted-foreground/50" /> {match.awayTeam.score} {match.awayTeam.abbreviation}
          </span>
          <span className={`${status.color} font-medium`}>{status.label}</span>
        </>
      )}
      {match.odds && !isScheduled && (
        <span className="text-muted-foreground/40 text-[8px] ml-1">
          {match.odds.homeMoneyline}/{match.odds.drawMoneyline}/{match.odds.awayMoneyline}
        </span>
      )}
    </div>
  );
}

// ---- Round Section ----
function RoundSection({ round, theme }: { round: CupRound; theme: typeof COMP_THEMES["UCL"] }) {
  if (round.ties.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className={`text-xs font-medium uppercase tracking-wider ${theme.accent}`}>{round.name}</h3>
          <span className="text-[10px] text-muted-foreground/50 italic">Upcoming</span>
        </div>
        <div className="border border-dashed border-border/40 rounded-lg px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground/50">Draw not yet confirmed</p>
        </div>
      </div>
    );
  }

  const completeTies = round.ties.filter(t => t.isComplete);
  const activeTies = round.ties.filter(t => !t.isComplete);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`text-xs font-medium uppercase tracking-wider ${theme.accent}`}>{round.name}</h3>
        {round.isCurrent && (
          <Badge className={`text-[8px] px-1.5 py-0 ${theme.badge}`}>Current</Badge>
        )}
        <span className="text-[10px] text-muted-foreground/50">
          {completeTies.length}/{round.ties.length} decided
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Active ties first, then completed */}
        {activeTies.map((tie, i) => <TieCard key={`active-${i}`} tie={tie} theme={theme} />)}
        {completeTies.map((tie, i) => <TieCard key={`done-${i}`} tie={tie} theme={theme} />)}
      </div>
    </div>
  );
}

// ---- Tournament Favorites ----
function FavoritesPanel({ favorites, theme, shortName }: { favorites: CupFavorite[]; theme: typeof COMP_THEMES["UCL"]; shortName: string }) {
  const activeFavs = favorites.filter(f => !f.isEliminated && f.tournamentOdds > 0);
  const eliminatedFavs = favorites.filter(f => f.isEliminated && f.tournamentOdds > 0);

  return (
    <Card className="bg-card border-card-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Crown className={`w-3.5 h-3.5 ${theme.accent}`} />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win {shortName}</span>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">via Kalshi</span>
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {activeFavs.map((fav, i) => (
          <div key={fav.team.id} className="flex items-center gap-2 px-4 py-2">
            <span className="text-[10px] text-muted-foreground tabular-nums w-4">{i + 1}</span>
            {fav.team.logo && (
              <img src={fav.team.logo} alt="" className="w-4 h-4 object-contain" loading="lazy" crossOrigin="anonymous" />
            )}
            <span className="text-xs font-medium text-foreground flex-1 truncate">{fav.team.name}</span>
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 rounded-full ${theme.accentBg.replace("/15", "/40")}`} style={{ width: `${Math.max(fav.tournamentOdds * 1.5, 6)}px` }} />
              <span className={`text-xs font-semibold tabular-nums ${theme.accent}`}>{fav.tournamentOdds}%</span>
            </div>
          </div>
        ))}
      </div>
      {eliminatedFavs.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground/60 mb-1">Eliminated</p>
          <div className="flex flex-wrap gap-2">
            {eliminatedFavs.slice(0, 6).map(fav => (
              <span key={fav.team.id} className="text-[10px] text-muted-foreground/40 line-through">
                {fav.team.name}{fav.eliminatedBy ? ` (by ${fav.eliminatedBy})` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- Competition Card (overview mode) ----
function CompetitionOverview({ cup }: { cup: EuropeanCupData }) {
  const theme = COMP_THEMES[cup.shortName] || COMP_THEMES.UCL;
  const currentRound = cup.rounds.find(r => r.isCurrent);
  const activeTies = currentRound?.ties.filter(t => !t.isComplete) || [];
  const completedTies = currentRound?.ties.filter(t => t.isComplete) || [];
  const topFavs = cup.favorites.filter(f => !f.isEliminated && f.tournamentOdds > 0).slice(0, 5);

  return (
    <Card className="bg-card border-card-border overflow-hidden" data-testid={`cup-card-${cup.slug}`}>
      {/* Header */}
      <Link href={`/cup/${encodeURIComponent(cup.slug)}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            {cup.logo ? (
              <img src={cup.logo} alt={cup.name} className="w-6 h-6 object-contain" loading="lazy" crossOrigin="anonymous" />
            ) : (
              <span className="text-xl">{cup.slug === "uefa.champions" ? "⭐" : cup.slug === "uefa.europa" ? "🟠" : "🟢"}</span>
            )}
            <div>
              <h2 className="font-semibold text-sm text-foreground">{cup.name}</h2>
              <p className="text-xs text-muted-foreground">{cup.currentRound}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </Link>

      {/* Current round matchups */}
      {currentRound && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Swords className={`w-3.5 h-3.5 ${theme.accent}`} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{currentRound.name}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              {completedTies.length}/{currentRound.ties.length} decided
            </span>
          </div>
          <div className="space-y-1.5">
            {/* Show active ties first */}
            {activeTies.map((tie, i) => (
              <TieRow key={`active-${i}`} tie={tie} theme={theme} />
            ))}
            {completedTies.map((tie, i) => (
              <TieRow key={`done-${i}`} tie={tie} theme={theme} />
            ))}
          </div>
        </div>
      )}

      {/* Top favorites */}
      {topFavs.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Crown className={`w-3.5 h-3.5 ${theme.accent}`} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Favorites</span>
          </div>
          <div className="space-y-1">
            {topFavs.map((fav, i) => (
              <div key={fav.team.id} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground tabular-nums w-3">{i + 1}</span>
                {fav.team.logo && (
                  <img src={fav.team.logo} alt="" className="w-3.5 h-3.5 object-contain" loading="lazy" crossOrigin="anonymous" />
                )}
                <span className="text-[11px] text-foreground/80 flex-1 truncate">{fav.team.name}</span>
                <span className={`text-[11px] font-semibold tabular-nums ${theme.accent}`}>{fav.tournamentOdds}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Compact tie row for overview
function TieRow({ tie, theme }: { tie: CupTie; theme: typeof COMP_THEMES["UCL"] }) {
  const team1Won = tie.winner === tie.team1.id;
  const team2Won = tie.winner === tie.team2.id;
  const isLive = tie.matches.some(m => m.status.includes("PROGRESS") || m.status.includes("HALF"));

  // Find next scheduled match for upcoming info
  const nextMatch = tie.matches.find(m => m.status === "STATUS_SCHEDULED");

  return (
    <div className={`flex items-center gap-1.5 py-1.5 px-2 rounded text-xs ${tie.isComplete ? "bg-muted/20" : isLive ? "bg-green-500/5 border border-green-500/20" : "bg-muted/10"}`}>
      {/* Team 1 */}
      <img src={tie.team1.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
      <span className={`truncate ${team1Won ? "font-semibold text-foreground" : tie.isComplete && !team1Won ? "text-muted-foreground/50 line-through" : "text-foreground/80"}`}>
        {tie.team1.abbreviation}
      </span>
      {(() => { const odds = getDisplayOdds(tie); return odds.team1 != null && odds.team1 > 0 && !tie.isComplete ? (
        <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
          odds.isAdvance
            ? (odds.team1 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team1 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
            : theme.badge
        }`}>{odds.team1}%</span>
      ) : null; })()}

      {/* Score / VS */}
      <span className="text-muted-foreground/50 mx-0.5 flex-shrink-0">
        {tie.aggregateScore ? (
          <span className="tabular-nums font-medium text-foreground/60">{tie.aggregateScore}</span>
        ) : (
          "vs"
        )}
      </span>

      {/* Team 2 */}
      <img src={tie.team2.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
      <span className={`truncate ${team2Won ? "font-semibold text-foreground" : tie.isComplete && !team2Won ? "text-muted-foreground/50 line-through" : "text-foreground/80"}`}>
        {tie.team2.abbreviation}
      </span>
      {(() => { const odds = getDisplayOdds(tie); return odds.team2 != null && odds.team2 > 0 && !tie.isComplete ? (
        <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
          odds.isAdvance
            ? (odds.team2 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team2 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
            : theme.badge
        }`}>{odds.team2}%</span>
      ) : null; })()}

      <div className="flex-1" />

      {/* Status */}
      {tie.isComplete ? (
        <Check className="w-3 h-3 text-green-500/60 flex-shrink-0" />
      ) : isLive ? (
        <span className="text-[9px] font-medium text-green-400">LIVE</span>
      ) : nextMatch ? (
        <span className="text-[9px] text-muted-foreground/50">{formatMatchDate(nextMatch.date)}</span>
      ) : null}
    </div>
  );
}

// ---- Bracket Tie Card (compact for bracket view) ----
function BracketTieCard({ tie, theme, isCompact }: { tie: CupTie; theme: typeof COMP_THEMES["UCL"]; isCompact?: boolean }) {
  const team1Won = tie.winner === tie.team1.id;
  const team2Won = tie.winner === tie.team2.id;
  const odds = getDisplayOdds(tie);

  return (
    <div className={`rounded-md border bg-card overflow-hidden ${
      tie.isComplete ? "border-border/40" : "border-border"
    }`} style={{ minWidth: isCompact ? 160 : 180 }}>
      {/* Team 1 */}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 ${
        team1Won ? theme.accentBg : ""
      } ${!tie.isComplete ? "" : team1Won ? "" : "opacity-40"}`}>
        <img src={tie.team1.logo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
        <span className={`text-[11px] font-medium flex-1 truncate ${
          team1Won ? "text-foreground" : "text-foreground/80"
        }`}>{tie.team1.abbreviation}</span>
        {odds.team1 != null && odds.team1 > 0 && !tie.isComplete && (
          <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
            odds.isAdvance
              ? (odds.team1 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team1 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
              : theme.badge
          }`}>{odds.team1}%</span>
        )}
        {tie.aggregateScore && (
          <span className={`text-[11px] font-semibold tabular-nums w-3 text-center ${
            team1Won ? "text-foreground" : "text-muted-foreground"
          }`}>{tie.aggregateScore.split("-")[0]}</span>
        )}
        {team1Won && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
      </div>
      {/* Divider */}
      <div className="border-t border-border/30" />
      {/* Team 2 */}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 ${
        team2Won ? theme.accentBg : ""
      } ${!tie.isComplete ? "" : team2Won ? "" : "opacity-40"}`}>
        <img src={tie.team2.logo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
        <span className={`text-[11px] font-medium flex-1 truncate ${
          team2Won ? "text-foreground" : "text-foreground/80"
        }`}>{tie.team2.abbreviation}</span>
        {odds.team2 != null && odds.team2 > 0 && !tie.isComplete && (
          <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
            odds.isAdvance
              ? (odds.team2 >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" : odds.team2 <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" : theme.badge)
              : theme.badge
          }`}>{odds.team2}%</span>
        )}
        {tie.aggregateScore && (
          <span className={`text-[11px] font-semibold tabular-nums w-3 text-center ${
            team2Won ? "text-foreground" : "text-muted-foreground"
          }`}>{tie.aggregateScore.split("-")[1]}</span>
        )}
        {team2Won && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
      </div>
    </div>
  );
}

// ---- Empty bracket slot (TBD) ----
function BracketTBDSlot() {
  return (
    <div className="rounded-md border border-dashed border-border/30 bg-card/30 overflow-hidden" style={{ minWidth: 160 }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="w-4 h-4 rounded-full bg-muted/30 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground/40 italic">TBD</span>
      </div>
      <div className="border-t border-border/20" />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="w-4 h-4 rounded-full bg-muted/30 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground/40 italic">TBD</span>
      </div>
    </div>
  );
}

// ---- Bracket View (horizontal tournament tree) ----
function BracketView({ cup, theme }: { cup: EuropeanCupData; theme: typeof COMP_THEMES["UCL"] }) {
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [connectors, setConnectors] = useState<{ x1: number; y1: number; x2: number; y2: number; won: boolean }[]>([]);

  const roundOrder = ["Knockout Playoff", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];
  const orderedRounds = roundOrder
    .map(name => cup.rounds.find(r => r.name === name))
    .filter(Boolean) as CupRound[];

  const expectedTieCount: Record<string, number> = {
    "Knockout Playoff": 8,
    "Round of 16": 8,
    "Quarter-finals": 4,
    "Semi-finals": 2,
    "Final": 1,
  };

  // Calculate connector lines based on DOM positions
  const calcConnectors = useCallback(() => {
    if (!bracketRef.current) return;
    const container = bracketRef.current;
    const containerRect = container.getBoundingClientRect();
    const sl = container.scrollLeft;
    const st = container.scrollTop;

    // Set SVG size to the full scrollable content
    setSvgSize({ width: container.scrollWidth, height: container.scrollHeight });

    const newConnectors: typeof connectors = [];
    const columns = container.querySelectorAll('[data-bracket-round]');

    for (let colIdx = 0; colIdx < columns.length - 1; colIdx++) {
      const currentCells = columns[colIdx].querySelectorAll('[data-bracket-tie]');
      const nextCells = columns[colIdx + 1].querySelectorAll('[data-bracket-tie]');
      const roundName = columns[colIdx].getAttribute('data-bracket-round') || '';
      const round = orderedRounds.find(r => r.name === roundName);

      for (let j = 0; j < currentCells.length; j += 2) {
        const nextIdx = Math.floor(j / 2);
        if (nextIdx >= nextCells.length) break;

        const topEl = currentCells[j];
        const bottomEl = currentCells[j + 1];
        const targetEl = nextCells[nextIdx];
        if (!topEl || !targetEl) continue;

        const topRect = topEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Convert from viewport coords to container-scroll coords
        const ox = containerRect.left - sl;
        const oy = containerRect.top - st;

        const x1Top = topRect.right - ox;
        const y1Top = topRect.top + topRect.height / 2 - oy;
        const x2 = targetRect.left - ox;
        const y2 = targetRect.top + targetRect.height / 2 - oy;

        const topWon = !!(round?.ties[j]?.winner);
        newConnectors.push({ x1: x1Top, y1: y1Top, x2, y2, won: topWon });

        if (bottomEl) {
          const bottomRect = bottomEl.getBoundingClientRect();
          const x1Bot = bottomRect.right - ox;
          const y1Bot = bottomRect.top + bottomRect.height / 2 - oy;
          const bottomWon = !!(round?.ties[j + 1]?.winner);
          newConnectors.push({ x1: x1Bot, y1: y1Bot, x2, y2, won: bottomWon });
        }
      }
    }
    setConnectors(newConnectors);
  }, [orderedRounds]);

  useEffect(() => {
    const timer = setTimeout(calcConnectors, 150);
    window.addEventListener('resize', calcConnectors);
    return () => { clearTimeout(timer); window.removeEventListener('resize', calcConnectors); };
  }, [calcConnectors, cup]);

  if (orderedRounds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xs text-muted-foreground/50">No bracket data available yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Desktop bracket (horizontal scroll) */}
      <div
        ref={bracketRef}
        className="hidden md:flex gap-0 overflow-x-auto pb-4 relative"
        style={{ minHeight: 400 }}
        onScroll={calcConnectors}
      >
        {/* SVG connector layer — sized to scroll content */}
        <svg
          ref={svgRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: svgSize.width || '100%', height: svgSize.height || '100%', zIndex: 0 }}
        >
          {connectors.map((c, i) => {
            const midX = (c.x1 + c.x2) / 2;
            return (
              <path
                key={i}
                d={`M${c.x1},${c.y1} C${midX},${c.y1} ${midX},${c.y2} ${c.x2},${c.y2}`}
                fill="none"
                stroke={c.won ? "rgba(74,222,128,0.4)" : "rgba(148,163,184,0.25)"}
                strokeWidth={c.won ? 2 : 1.5}
                strokeDasharray={c.won ? "none" : "4 3"}
              />
            );
          })}
        </svg>

        {orderedRounds.map((round, roundIdx) => {
          const expected = expectedTieCount[round.name] || round.ties.length || 1;
          const tiesWithPlaceholders = round.ties.length > 0 ? round.ties : Array.from({ length: expected }, () => null);
          // Vertical spacing grows with each round to vertically center ties
          const spacingMultiplier = Math.pow(2, roundIdx);

          return (
            <div
              key={round.name}
              data-bracket-round={round.name}
              className="flex flex-col items-center flex-shrink-0 relative z-10"
              style={{ minWidth: 210, paddingLeft: roundIdx === 0 ? 0 : 24, paddingRight: 24 }}
            >
              {/* Round header */}
              <div className="mb-3 text-center">
                <h4 className={`text-[10px] font-medium uppercase tracking-wider ${theme.accent}`}>{round.name}</h4>
                {round.isCurrent && (
                  <Badge className={`text-[7px] px-1 py-0 mt-0.5 ${theme.badge}`}>Current</Badge>
                )}
              </div>
              {/* Ties */}
              <div className="flex flex-col justify-around flex-1 w-full" style={{ gap: `${Math.max(8, 8 * spacingMultiplier)}px` }}>
                {tiesWithPlaceholders.map((tie, tieIdx) => (
                  <div key={tieIdx} data-bracket-tie={tieIdx} className="flex items-center justify-center">
                    {tie ? (
                      <BracketTieCard tie={tie} theme={theme} />
                    ) : (
                      <BracketTBDSlot />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile bracket (vertical stacked) */}
      <div className="md:hidden space-y-4">
        {orderedRounds.map((round) => {
          if (round.ties.length === 0) {
            return (
              <div key={round.name} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className={`text-xs font-medium uppercase tracking-wider ${theme.accent}`}>{round.name}</h4>
                  {round.isCurrent && <Badge className={`text-[7px] px-1 py-0 ${theme.badge}`}>Current</Badge>}
                </div>
                <div className="border border-dashed border-border/30 rounded-lg px-4 py-4 text-center">
                  <p className="text-[11px] text-muted-foreground/40">Draw not yet confirmed</p>
                </div>
              </div>
            );
          }
          return (
            <div key={round.name} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <h4 className={`text-xs font-medium uppercase tracking-wider ${theme.accent}`}>{round.name}</h4>
                {round.isCurrent && <Badge className={`text-[7px] px-1 py-0 ${theme.badge}`}>Current</Badge>}
                <span className="text-[10px] text-muted-foreground/50">
                  {round.ties.filter(t => t.isComplete).length}/{round.ties.length} decided
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {round.ties.map((tie, i) => (
                  <BracketTieCard key={i} tie={tie} theme={theme} isCompact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Competition Detail Page ----
function CompetitionDetail({ cup }: { cup: EuropeanCupData }) {
  const theme = COMP_THEMES[cup.shortName] || COMP_THEMES.UCL;
  const [viewMode, setViewMode] = useState<"list" | "bracket">("list");

  return (
    <div className="max-w-5xl mx-auto">
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="view-toggle-list"
          >
            <List className="w-3.5 h-3.5" />
            Rounds
          </button>
          <button
            onClick={() => setViewMode("bracket")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === "bracket" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="view-toggle-bracket"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Bracket
          </button>
        </div>
      </div>

      {viewMode === "bracket" ? (
        <div className="space-y-4">
          <BracketView cup={cup} theme={theme} />
          {/* Favorites panel below bracket */}
          <FavoritesPanel favorites={cup.favorites} theme={theme} shortName={cup.shortName} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Rounds list */}
          <div className="lg:col-span-2">
            {cup.rounds.map((round) => (
              <RoundSection key={round.name} round={round} theme={theme} />
            ))}
          </div>

          {/* Right: Tournament Favorites */}
          <div>
            <FavoritesPanel favorites={cup.favorites} theme={theme} shortName={cup.shortName} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Domestic Cup Detail Page ----
function DomesticCupDetail({ cup }: { cup: DomesticCupData }) {
  const activeFavs = cup.favorites?.filter(f => !f.isEliminated) || [];
  const eliminatedFavs = cup.favorites?.filter(f => f.isEliminated) || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <img src={cup.logo} alt={cup.name} className="w-10 h-10 object-contain" loading="lazy" crossOrigin="anonymous" />
        <div>
          <h2 className="text-lg font-bold text-foreground">{cup.name}</h2>
          <p className="text-xs text-muted-foreground">{cup.currentRound} {cup.countryFlag}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Matches */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Matches */}
          {cup.upcomingMatches.length > 0 && (
            <Card className="bg-card border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming — {cup.currentRound}</span>
                  {cup.upcomingMatches.some(m => m.homeOdds != null) && (
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">implied odds</span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border/30">
                {cup.upcomingMatches.map(match => (
                  <div key={match.id} className="px-4 py-3">
                    <DomesticMatchDetailRow match={match} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Results */}
          {cup.recentResults.length > 0 && (
            <Card className="bg-card border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Results</span>
                </div>
              </div>
              <div className="divide-y divide-border/30">
                {cup.recentResults.map(match => (
                  <div key={match.id} className="px-4 py-3">
                    <DomesticMatchDetailRow match={match} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: Tournament Winner Odds */}
        <div className="space-y-4">
          {activeFavs.length > 0 && (
            <Card className="bg-card border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win {cup.shortName}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">via Kalshi</span>
                </div>
              </div>
              <div className="divide-y divide-border/50">
                {activeFavs.map((fav, i) => (
                  <div key={fav.teamName} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums w-4">{i + 1}</span>
                    {fav.teamLogo && (
                      <img src={fav.teamLogo} alt="" className="w-4 h-4 object-contain" loading="lazy" crossOrigin="anonymous" />
                    )}
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{fav.teamName}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 rounded-full bg-amber-500/30" style={{ width: `${Math.max(fav.probability * 1.5, 6)}px` }} />
                      <span className="text-xs font-semibold tabular-nums text-amber-400">{fav.probability}%</span>
                    </div>
                  </div>
                ))}
              </div>
              {eliminatedFavs.length > 0 && (
                <div className="px-4 py-2 border-t border-border bg-muted/20">
                  <p className="text-[10px] text-muted-foreground/60 mb-1">Eliminated</p>
                  <div className="flex flex-wrap gap-2">
                    {eliminatedFavs.map(fav => (
                      <span key={fav.teamName} className="text-[10px] text-muted-foreground/40 line-through">
                        {fav.teamName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Match info */}
          <Card className="bg-card border-card-border overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-[10px] text-muted-foreground/60">Total matches shown: {cup.recentResults.length + cup.upcomingMatches.length}</p>
              {cup.lastUpdated && (
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  Updated {formatDistanceToNow(new Date(cup.lastUpdated), { addSuffix: true })}
                </p>
              )}
              {cup.upcomingMatches.some(m => m.homeOdds != null) && (
                <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
                  Match odds are implied from tournament winner probabilities
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Expanded match row for detail view
function DomesticMatchDetailRow({ match }: { match: DomesticCupMatch }) {
  const isScheduled = match.status === "STATUS_SCHEDULED";
  const isLive = match.status.includes("PROGRESS") || match.status.includes("HALF");
  const isPenalties = match.statusText.toLowerCase().includes("penalties");
  const hasOdds = match.homeOdds != null && match.awayOdds != null;

  return (
    <div className="flex items-center gap-3">
      {/* Home team */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className={`text-sm truncate text-right ${
          match.homeTeam.winner ? "font-semibold text-foreground" :
          !isScheduled && !match.homeTeam.winner ? "text-muted-foreground/60" : "text-foreground/80"
        }`}>
          {match.homeTeam.name}
        </span>
        {hasOdds && isScheduled && match.homeOdds! > 0 && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border leading-tight flex-shrink-0 ${
            match.homeOdds! >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" :
            match.homeOdds! <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" :
            "bg-amber-600/20 text-amber-300 border-amber-500/30"
          }`}>{match.homeOdds}%</span>
        )}
        {match.homeTeam.logo && (
          <img src={match.homeTeam.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
        )}
      </div>

      {/* Score / Date */}
      <div className="flex flex-col items-center flex-shrink-0 w-20">
        {isScheduled ? (
          <>
            <span className="text-xs text-muted-foreground/60">vs</span>
            <span className="text-[9px] text-muted-foreground/40">{formatMatchDate(match.date)}</span>
          </>
        ) : (
          <>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {match.homeTeam.score} - {match.awayTeam.score}
            </span>
            {isPenalties && match.homeTeam.penaltyScore != null && (
              <span className="text-[9px] text-muted-foreground/50">({match.homeTeam.penaltyScore} - {match.awayTeam.penaltyScore} pens)</span>
            )}
            <span className={`text-[9px] ${
              isLive ? "text-green-400 font-medium" : "text-muted-foreground/50"
            }`}>{isLive ? "LIVE" : isPenalties ? "FT (pens)" : "FT"}</span>
          </>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {match.awayTeam.logo && (
          <img src={match.awayTeam.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
        )}
        {hasOdds && isScheduled && match.awayOdds! > 0 && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border leading-tight flex-shrink-0 ${
            match.awayOdds! >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" :
            match.awayOdds! <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" :
            "bg-amber-600/20 text-amber-300 border-amber-500/30"
          }`}>{match.awayOdds}%</span>
        )}
        <span className={`text-sm truncate ${
          match.awayTeam.winner ? "font-semibold text-foreground" :
          !isScheduled && !match.awayTeam.winner ? "text-muted-foreground/60" : "text-foreground/80"
        }`}>
          {match.awayTeam.name}
        </span>
      </div>

      {/* Note (e.g. "Round of 16") */}
      {match.note && (
        <span className="text-[9px] text-muted-foreground/40 flex-shrink-0 hidden sm:block">{match.note}</span>
      )}
    </div>
  );
}

// ---- Skeleton ----
function CupCardSkeleton() {
  return (
    <Card className="bg-card border-card-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-6 h-6 rounded" />
          <div>
            <Skeleton className="w-28 h-4 mb-1" />
            <Skeleton className="w-16 h-3" />
          </div>
        </div>
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="px-4 py-2 border-b border-border/50">
          <Skeleton className="w-full h-6" />
        </div>
      ))}
    </Card>
  );
}

// ---- Domestic Cup Card ----
function DomesticCupCard({ cup }: { cup: DomesticCupData }) {
  const allMatches = [...cup.recentResults, ...cup.upcomingMatches];

  return (
    <Card className="bg-card border-card-border overflow-hidden hover:border-amber-500/30 transition-colors" data-testid={`cup-card-${cup.slug}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors group">
        <div className="flex items-center gap-3">
          <img src={cup.logo} alt={cup.name} className="w-6 h-6 object-contain" loading="lazy" crossOrigin="anonymous" />
          <div>
            <h2 className="font-semibold text-sm text-foreground">{cup.name}</h2>
            <p className="text-xs text-muted-foreground">{cup.currentRound} {cup.countryFlag}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>

      {/* Upcoming matches */}
      {cup.upcomingMatches.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming</span>
          </div>
          <div className="space-y-1.5">
            {cup.upcomingMatches.map(match => (
              <DomesticMatchRow key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      {cup.recentResults.length > 0 && (
        <div className={`px-4 py-3 ${cup.favorites && cup.favorites.length > 0 ? 'border-b border-border' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Results</span>
          </div>
          <div className="space-y-1.5">
            {cup.recentResults.slice(0, 4).map(match => (
              <DomesticMatchRow key={match.id} match={match} />
            ))}
            {cup.recentResults.length > 4 && (
              <p className="text-[10px] text-muted-foreground/50 text-center">+ {cup.recentResults.length - 4} more</p>
            )}
          </div>
        </div>
      )}

      {/* Tournament winner odds */}
      {cup.favorites && cup.favorites.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win {cup.shortName}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">via Kalshi</span>
          </div>
          <div className="space-y-1">
            {cup.favorites.filter(f => !f.isEliminated).slice(0, 5).map((fav, i) => (
              <div key={fav.teamName} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground tabular-nums w-3">{i + 1}</span>
                {fav.teamLogo && (
                  <img src={fav.teamLogo} alt="" className="w-3.5 h-3.5 object-contain" loading="lazy" crossOrigin="anonymous" />
                )}
                <span className="text-[11px] text-foreground/80 flex-1 truncate">{fav.teamName}</span>
                <span className="text-[11px] font-semibold tabular-nums text-amber-400">{fav.probability}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {allMatches.length === 0 && !cup.favorites?.length && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground/50">No current matches</p>
        </div>
      )}
    </Card>
  );
}

// Domestic cup match row — shows match odds when available
function DomesticMatchRow({ match }: { match: DomesticCupMatch }) {
  const isScheduled = match.status === "STATUS_SCHEDULED";
  const isLive = match.status.includes("PROGRESS") || match.status.includes("HALF");
  const isPenalties = match.statusText.toLowerCase().includes("penalties");
  const hasOdds = isScheduled && match.homeOdds != null && match.awayOdds != null;

  return (
    <div className={`flex items-center gap-1.5 py-1.5 px-2 rounded text-xs ${
      isLive ? "bg-green-500/5 border border-green-500/20" : "bg-muted/10"
    }`}>
      {/* Home team */}
      {match.homeTeam.logo && (
        <img src={match.homeTeam.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
      )}
      <span className={`truncate ${
        match.homeTeam.winner ? "font-semibold text-foreground" : 
        !isScheduled && !match.homeTeam.winner ? "text-muted-foreground/60" : "text-foreground/80"
      }`}>
        {match.homeTeam.name}
      </span>
      {hasOdds && match.homeOdds! > 0 && (
        <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
          match.homeOdds! >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" :
          match.homeOdds! <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" :
          "bg-amber-600/20 text-amber-300 border-amber-500/30"
        }`}>{match.homeOdds}%</span>
      )}

      {/* Score / VS */}
      <span className="text-muted-foreground/50 mx-0.5 flex-shrink-0 tabular-nums">
        {isScheduled ? "vs" : (
          <span className="font-medium text-foreground/60">
            {match.homeTeam.score} - {match.awayTeam.score}
          </span>
        )}
      </span>

      {/* Away team */}
      {match.awayTeam.logo && (
        <img src={match.awayTeam.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" crossOrigin="anonymous" />
      )}
      <span className={`truncate ${
        match.awayTeam.winner ? "font-semibold text-foreground" : 
        !isScheduled && !match.awayTeam.winner ? "text-muted-foreground/60" : "text-foreground/80"
      }`}>
        {match.awayTeam.name}
      </span>
      {hasOdds && match.awayOdds! > 0 && (
        <span className={`text-[7px] font-bold px-0.5 rounded border leading-tight ${
          match.awayOdds! >= 60 ? "bg-green-600/20 text-green-300 border-green-500/30" :
          match.awayOdds! <= 30 ? "bg-red-600/15 text-red-300 border-red-500/30" :
          "bg-amber-600/20 text-amber-300 border-amber-500/30"
        }`}>{match.awayOdds}%</span>
      )}

      <div className="flex-1" />

      {/* Status */}
      {isLive ? (
        <span className="text-[9px] font-medium text-green-400">LIVE</span>
      ) : isScheduled ? (
        <span className="text-[9px] text-muted-foreground/50">{formatMatchDate(match.date)}</span>
      ) : isPenalties ? (
        <span className="text-[9px] text-muted-foreground/50">Pens</span>
      ) : (
        <span className="text-[9px] text-muted-foreground/50">FT</span>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function EuropeanCups() {
  const { refetchInterval } = useAutoRefresh();
  const [, navigate] = useLocation();
  const [routeMatch, routeParams] = useRoute("/cup/:slug");
  const selectedCup = routeMatch ? decodeURIComponent(routeParams!.slug) : null;

  const { data: cups, error, dataUpdatedAt, isFetching } = useCachedQuery<EuropeanCupData[]>({
    queryKey: ["/api/european-cups"],
    refetchInterval,
    staleTime: 60_000,
  });

  const { data: domesticCups } = useCachedQuery<DomesticCupData[]>({
    queryKey: ["/api/domestic-cups"],
    refetchInterval,
    staleTime: 60_000,
  });

  const activeCup = selectedCup ? cups?.find(c => c.slug === selectedCup) : null;
  const activeDomesticCup = selectedCup ? domesticCups?.find(c => c.slug === selectedCup) : null;
  const latestUpdate = Math.max(dataUpdatedAt || 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer group">
                <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Euro Football Hub">
                  <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" className="text-primary"/>
                  <path d="M16 4 L16 28 M4 16 L28 16" stroke="currentColor" strokeWidth="1.5" opacity="0.3" className="text-primary"/>
                  <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" className="text-primary"/>
                  <circle cx="16" cy="16" r="1.5" fill="currentColor" className="text-primary"/>
                </svg>
                <div>
                  <h1 className="text-base font-bold text-foreground tracking-tight">Euro Football Hub</h1>
                  <p className="text-[10px] text-muted-foreground">Cup Competitions</p>
                </div>
              </div>
            </Link>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-1">
            <Link href="/">
              <span className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer">
                Leagues
              </span>
            </Link>
            <span className="text-xs px-3 py-1.5 rounded-md bg-accent text-foreground font-medium cursor-default">
              Cups
            </span>
          </div>

          <div className="flex items-center gap-3">
            {latestUpdate > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
                <span>Updated {formatDistanceToNow(latestUpdate, { addSuffix: true })}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && !cups && (
          <div className="text-center py-12">
            <p className="text-destructive text-sm">Failed to load data. Retrying...</p>
          </div>
        )}

        {/* Detail view — European cup */}
        {activeCup ? (
          <div>
            <button
              onClick={() => navigate("/cups")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              data-testid="back-to-cups"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to all competitions
            </button>
            <div className="flex items-center gap-3 mb-6">
              {activeCup.logo ? (
                <img src={activeCup.logo} alt={activeCup.name} className="w-8 h-8 object-contain" loading="lazy" crossOrigin="anonymous" />
              ) : (
                <span className="text-2xl">{activeCup.slug === "uefa.champions" ? "⭐" : activeCup.slug === "uefa.europa" ? "🟠" : "🟢"}</span>
              )}
              <div>
                <h2 className="text-lg font-bold text-foreground">{activeCup.name}</h2>
                <p className="text-xs text-muted-foreground">{activeCup.currentRound}</p>
              </div>
            </div>
            <CompetitionDetail cup={activeCup} />
          </div>
        ) : activeDomesticCup ? (
          <div>
            <button
              onClick={() => navigate("/cups")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              data-testid="back-to-cups"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to all competitions
            </button>
            <DomesticCupDetail cup={activeDomesticCup} />
          </div>
        ) : (
          <div className="space-y-8">
            {/* European Cups Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">European Cups</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {!cups
                  ? [...Array(3)].map((_, i) => <CupCardSkeleton key={i} />)
                  : cups.map(cup => (
                      <CompetitionOverview key={cup.slug} cup={cup} />
                    ))
                }
              </div>
            </section>

            {/* Domestic Cups Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Domestic Cups</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {!domesticCups
                  ? [...Array(5)].map((_, i) => <CupCardSkeleton key={i} />)
                  : domesticCups.map(cup => (
                      <Link key={cup.slug} href={`/cup/${encodeURIComponent(cup.slug)}`}>
                        <div className="cursor-pointer">
                          <DomesticCupCard cup={cup} />
                        </div>
                      </Link>
                    ))
                }
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-4 py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Data from ESPN. Tournament odds via <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Kalshi</a>.</p>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
