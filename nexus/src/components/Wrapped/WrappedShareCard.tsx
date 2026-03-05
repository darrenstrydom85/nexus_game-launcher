/**
 * WrappedShareCard — 1080×1080px off-screen shareable poster.
 *
 * IMPORTANT: All styles MUST be inline. html-to-image does not reliably
 * capture computed styles from external stylesheets or CSS variables.
 * No Tailwind classes, no CSS variables — only inline style objects.
 */
import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import nexusLogo from "@/assets/nexus-onboarding-logo.png";
import type { WrappedReport } from "@/types/wrapped";

// ── Design tokens (hardcoded for offline rendering) ─────────────────────────
const BASE_COLORS = {
  background: "#0A0A0F",
  card: "#13131A",
  foreground: "#F8FAFC",
  mutedFg: "#94A3B8",
  border: "#1E1E2E",
};

function buildColors(accent: string) {
  // Parse hex to r,g,b for rgba() usage
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return {
    ...BASE_COLORS,
    primary: accent,
    accent1: `rgba(${r}, ${g}, ${b}, 0.18)`,
    accent2: `rgba(${r}, ${g}, ${b}, 0.09)`,
    glow1: `rgba(${r}, ${g}, ${b}, 0.22)`,
    glow2: `rgba(${r}, ${g}, ${b}, 0.12)`,
    border2: `rgba(${r}, ${g}, ${b}, 0.25)`,
  };
}

const FONTS = {
  sans: "'Geist Sans', 'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', 'Fira Code', monospace",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function resolveImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}

// ── Sub-components (all inline styles) ──────────────────────────────────────

function NexusLogo({ colors }: { colors: ReturnType<typeof buildColors> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* Icon badge — mirrors the onboarding/titlebar logo treatment */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: colors.primary,
          boxShadow: `0 0 24px ${colors.glow1}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <img
          src={nexusLogo}
          alt="Nexus"
          style={{ width: 28, height: 28, objectFit: "contain" }}
        />
      </div>
      <span
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 700,
          fontSize: 24,
          color: colors.foreground,
          letterSpacing: "-0.03em",
        }}
      >
        Nexus
      </span>
    </div>
  );
}

interface GameRowProps {
  rank: number;
  name: string;
  coverUrl: string | null;
  playTimeS: number;
  colors: ReturnType<typeof buildColors>;
}

function GameRow({ rank, name, coverUrl, playTimeS, colors }: GameRowProps) {
  const resolvedUrl = resolveImageUrl(coverUrl);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "16px 0",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 700,
          fontSize: 28,
          color: rank === 1 ? colors.primary : colors.mutedFg,
          width: 36,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Cover art */}
      <div
        style={{
          width: 52,
          height: 72,
          borderRadius: 6,
          overflow: "hidden",
          flexShrink: 0,
          background: colors.card,
          border: `1px solid ${colors.border}`,
        }}
      >
        {resolvedUrl ? (
          <img
            src={resolvedUrl}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${colors.accent1}, ${colors.card})`,
            }}
          />
        )}
      </div>

      {/* Name + time */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 600,
            fontSize: 24,
            color: colors.foreground,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 400,
            fontSize: 18,
            color: colors.mutedFg,
            marginTop: 4,
          }}
        >
          {formatHours(playTimeS)}
        </div>
      </div>
    </div>
  );
}

interface HighlightTileProps {
  emoji: string;
  label: string;
  value: string;
  sub?: string;
  colors: ReturnType<typeof buildColors>;
}

function HighlightTile({ emoji, label, value, sub, colors }: HighlightTileProps) {
  return (
    <div
      style={{
        flex: 1,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 11,
            fontWeight: 600,
            color: colors.mutedFg,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: FONTS.sans,
          fontSize: 20,
          fontWeight: 700,
          color: colors.foreground,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 13,
            fontWeight: 400,
            color: colors.mutedFg,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export interface WrappedShareCardProps {
  report: WrappedReport;
  /** User's accent color — defaults to the app default #7600da */
  accentColor?: string;
}

export const WrappedShareCard = React.forwardRef<
  HTMLDivElement,
  WrappedShareCardProps
>(function WrappedShareCard({ report, accentColor = "#7600da" }, ref) {
  const colors = buildColors(accentColor);
  const top3 = report.topGames.slice(0, 3);
  const primaryFact = report.funFacts[0] ?? null;
  const totalHours = Math.floor(report.totalPlayTimeS / 3600);

  return (
    <div
      ref={ref}
      data-testid="wrapped-share-card"
      style={{
        width: 1080,
        height: 1080,
        background: colors.background,
        fontFamily: FONTS.sans,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 72,
        boxSizing: "border-box",
      }}
    >
      {/* Decorative accent glow top-right */}
      <div
        style={{
          position: "absolute",
          top: -140,
          right: -140,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.glow1} 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Decorative accent glow bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.glow2} 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Header row: logo + period label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 40,
        }}
      >
        <NexusLogo colors={colors} />
        <span
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 500,
            fontSize: 18,
            color: colors.mutedFg,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          My {report.periodLabel} in Gaming
        </span>
      </div>

      {/* Hero stat: total play time */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 800,
            fontSize: 96,
            color: colors.foreground,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {totalHours}
          <span
            style={{
              fontSize: 52,
              fontWeight: 600,
              color: colors.primary,
              marginLeft: 8,
            }}
          >
            hours
          </span>
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 400,
            fontSize: 22,
            color: colors.mutedFg,
            marginTop: 8,
          }}
        >
          across{" "}
          <span style={{ color: colors.foreground, fontWeight: 600 }}>
            {report.totalGamesPlayed} game{report.totalGamesPlayed !== 1 ? "s" : ""}
          </span>{" "}
          in{" "}
          <span style={{ color: colors.foreground, fontWeight: 600 }}>
            {report.totalSessions} session{report.totalSessions !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Top 3 games */}
      {top3.length > 0 && (
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 600,
              fontSize: 14,
              color: colors.primary,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Top Games
          </div>
          {top3.map((game, i) => (
            <GameRow
              key={game.id}
              rank={i + 1}
              name={game.name}
              coverUrl={game.coverUrl}
              playTimeS={game.playTimeS}
              colors={colors}
            />
          ))}
        </div>
      )}

      {/* Highlights section label */}
      <div
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 14,
          color: colors.primary,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: 28,
          marginBottom: 12,
        }}
      >
        Highlights
      </div>

      {/* Highlights grid — 2 columns × up to 2 rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Row 1 */}
        <div style={{ display: "flex", gap: 10 }}>
          {report.longestSession && (
            <HighlightTile
              emoji="🔥"
              label="Epic Binge"
              value={`${formatHours(report.longestSession.durationS)} — ${report.longestSession.gameName}`}
              colors={colors}
            />
          )}
          {report.longestStreakDays > 0 && (
            <HighlightTile
              emoji="🏆"
              label="Longest Streak"
              value={`${report.longestStreakDays} day${report.longestStreakDays !== 1 ? "s" : ""} in a row`}
              colors={colors}
            />
          )}
        </div>

        {/* Row 2 */}
        <div style={{ display: "flex", gap: 10 }}>
          {report.mostPlayedGenre && (
            <HighlightTile
              emoji="🎮"
              label="Top Genre"
              value={report.mostPlayedGenre}
              colors={colors}
            />
          )}
          {report.busiestDay && (
            <HighlightTile
              emoji="📅"
              label="Busiest Day"
              value={formatDate(report.busiestDay)}
              sub={`${formatHours(report.busiestDayPlayTimeS)} played`}
              colors={colors}
            />
          )}
        </div>
      </div>

      {/* Fun fact + footer */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {primaryFact ? (
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 15,
              fontWeight: 400,
              color: colors.mutedFg,
              fontStyle: "italic",
              flex: 1,
            }}
          >
            {primaryFact.label}
          </span>
        ) : (
          <span />
        )}
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 13,
            color: colors.border,
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          nexus.gg
        </span>
      </div>
    </div>
  );
});
