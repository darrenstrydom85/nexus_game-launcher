/**
 * CertificateCard — 1080×1080px retirement "certificate of completion" poster
 * for Epic 41 Story 41.3.
 *
 * IMPORTANT: All styles MUST be inline. html-to-image does not reliably
 * capture computed styles from external stylesheets or CSS variables.
 * No Tailwind classes, no CSS variables — only inline style objects.
 */
import * as React from "react";
import nexusLogo from "@/assets/nexus-onboarding-logo.png";
import type { GameCeremonyData, MasteryTierValue } from "@/lib/tauri";

// ── Design tokens (hardcoded for offline rendering) ─────────────────────────

const BASE_COLORS = {
  background: "#0A0A0F",
  card: "#13131A",
  foreground: "#F8FAFC",
  mutedFg: "#94A3B8",
  border: "#1E1E2E",
  success: "#22C55E",
  danger: "#EF4444",
};

const TIER_COLORS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  diamond: "#B9F2FF",
};

const TIER_LABELS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

function buildColors(accent: string) {
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return {
    ...BASE_COLORS,
    primary: accent,
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
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NexusLogo({ colors }: { colors: ReturnType<typeof buildColors> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: colors.primary,
          boxShadow: `0 0 18px ${colors.glow1}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <img
          src={nexusLogo}
          alt="Nexus"
          style={{ width: 22, height: 22, objectFit: "contain" }}
        />
      </div>
      <span
        style={{
          fontFamily: FONTS.sans,
          fontWeight: 700,
          fontSize: 20,
          color: colors.foreground,
          letterSpacing: "-0.03em",
        }}
      >
        Nexus
      </span>
    </div>
  );
}

function Stars({
  rating,
  colors,
}: {
  rating: number;
  colors: ReturnType<typeof buildColors>;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < rating;
        return (
          <svg
            key={i}
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill={filled ? "#FACC15" : "none"}
            stroke={filled ? "#FACC15" : colors.mutedFg}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      })}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  colors,
}: {
  label: string;
  value: string;
  sub?: string;
  colors: ReturnType<typeof buildColors>;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: 12,
          fontWeight: 600,
          color: colors.mutedFg,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: 28,
          fontWeight: 700,
          color: colors.foreground,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 14,
            color: colors.mutedFg,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export interface CertificateCardProps {
  data: GameCeremonyData;
  accentColor?: string;
  /** Whether the cover art loaded successfully. If false, use gradient fallback. */
  coverLoaded?: boolean;
}

export const CertificateCard = React.forwardRef<HTMLDivElement, CertificateCardProps>(
  function CertificateCard(
    { data, accentColor = "#7600da", coverLoaded = true },
    ref,
  ) {
    const colors = buildColors(accentColor);
    // Prefer the `completed` flag over `status === "completed"` so archived/
    // uninstalled games (status = "removed") still print the green "Completed"
    // badge when they were finished before being uninstalled.
    const isCompleted = data.completed;
    const isDropped = !isCompleted && data.status === "dropped";
    const statusColor = isCompleted
      ? colors.success
      : isDropped
        ? colors.mutedFg
        : colors.primary;
    const statusLabel = isCompleted
      ? "Completed"
      : isDropped
        ? "Moved On"
        : data.status === "removed"
          ? "Retired"
          : data.status.charAt(0).toUpperCase() + data.status.slice(1);

    const rating = data.rating ?? 0;
    const primaryFunFact = data.funFacts[0] ?? null;
    const activeTier =
      data.masteryTier !== "none"
        ? (data.masteryTier as Exclude<MasteryTierValue, "none">)
        : null;
    const coverUrl = data.heroArtUrl ?? data.coverArtUrl;
    const showBgArt = coverLoaded && coverUrl;

    return (
      <div
        ref={ref}
        data-testid="certificate-share-card"
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
        {/* Background art (blurred, low opacity) or gradient fallback */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: showBgArt
              ? colors.background
              : "linear-gradient(135deg, #1a1a2e 0%, #0a0a0f 100%)",
            zIndex: 0,
          }}
        />
        {showBgArt && (
          <img
            src={coverUrl ?? ""}
            alt=""
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.18,
              filter: "blur(24px)",
              zIndex: 1,
            }}
          />
        )}
        {/* Dark gradient overlay so text stays legible over bg art */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${colors.background}cc 0%, ${colors.background}ee 60%, ${colors.background} 100%)`,
            zIndex: 2,
          }}
        />

        {/* Accent glows */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -140,
            right: -140,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.glow1} 0%, transparent 65%)`,
            zIndex: 3,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: -120,
            left: -120,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.glow2} 0%, transparent 65%)`,
            zIndex: 3,
          }}
        />

        {/* Content layer */}
        <div
          style={{
            position: "relative",
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Header: logo + status banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 44,
            }}
          >
            <NexusLogo colors={colors} />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                background: `${statusColor}1A`,
                border: `1px solid ${statusColor}55`,
                color: statusColor,
                fontFamily: FONTS.sans,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor,
                  boxShadow: `0 0 10px ${statusColor}`,
                }}
              />
              {statusLabel}
            </div>
          </div>

          {/* Caption */}
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: 18,
              fontWeight: 500,
              color: colors.mutedFg,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Certificate of Play
          </div>

          {/* Game name (large) */}
          <h1
            style={{
              fontFamily: FONTS.sans,
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.05,
              color: colors.foreground,
              letterSpacing: "-0.03em",
              margin: 0,
              // Clamp long names
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data.gameName}
          </h1>

          {/* Rating stars (if set) */}
          {rating > 0 && (
            <div style={{ marginTop: 20 }}>
              <Stars rating={rating} colors={colors} />
            </div>
          )}

          {/* Hero stat: total play time */}
          <div style={{ marginTop: 40, marginBottom: 32 }}>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 12,
                fontWeight: 600,
                color: colors.primary,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Total play time
            </div>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 800,
                fontSize: 92,
                color: colors.foreground,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatHours(data.totalPlayTimeS)}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
            <StatTile
              label="Sessions"
              value={String(data.totalSessions)}
              colors={colors}
            />
            <StatTile
              label="Longest"
              value={formatHours(data.longestSessionS)}
              colors={colors}
            />
            {activeTier && (
              <div
                style={{
                  flex: 1,
                  background: colors.card,
                  border: `1px solid ${TIER_COLORS[activeTier]}55`,
                  borderRadius: 14,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.mutedFg,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Mastery
                </span>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 28,
                    fontWeight: 700,
                    color: TIER_COLORS[activeTier],
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {TIER_LABELS[activeTier]}
                </span>
              </div>
            )}
          </div>

          {/* Date range */}
          {data.firstPlayedAt && data.lastPlayedAt && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 22px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.mutedFg,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  First played
                </span>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 20,
                    fontWeight: 600,
                    color: colors.foreground,
                  }}
                >
                  {formatDate(data.firstPlayedAt)}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: `linear-gradient(90deg, ${colors.primary}77, ${colors.primary}33, ${colors.primary}77)`,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  alignItems: "flex-end",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.mutedFg,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Last played
                </span>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 20,
                    fontWeight: 600,
                    color: colors.foreground,
                  }}
                >
                  {formatDate(data.lastPlayedAt)}
                </span>
              </div>
            </div>
          )}

          {/* Fun fact */}
          {primaryFunFact && (
            <div
              style={{
                marginTop: "auto",
                padding: "18px 22px",
                borderLeft: `3px solid ${colors.primary}`,
                background: `${colors.primary}0A`,
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.primary,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Did you know
              </span>
              <p
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 17,
                  fontWeight: 500,
                  color: colors.foreground,
                  margin: 0,
                  lineHeight: 1.35,
                }}
              >
                {primaryFunFact}
              </p>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              marginTop: primaryFunFact ? 20 : "auto",
              paddingTop: 16,
              borderTop: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 13,
                color: colors.mutedFg,
                letterSpacing: "0.04em",
              }}
            >
              nexusgamelauncher.com
            </span>
            <span
              style={{
                fontFamily: FONTS.sans,
                fontSize: 12,
                color: colors.mutedFg,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Retirement Certificate
            </span>
          </div>
        </div>
      </div>
    );
  },
);
