import * as React from "react";
import {
  getWrappedReport,
  getAvailableWrappedPeriods,
} from "@/lib/tauri";
import type { WrappedPeriod, WrappedReport, AvailableWrappedPeriods } from "@/types/wrapped";
import { RetroModal } from "./RetroModal";
import { NEXUS_LOGO } from "./logo";
import { SOURCE_CODE, fmtHours, fmtDur, fmtBar, fmtDate } from "./format";
import type { GameSource } from "@/stores/gameStore";

export interface RetroWrappedProps {
  enabled: boolean;
  onBack: () => void;
}

interface PeriodOption {
  label: string;
  period: WrappedPeriod;
}

function buildPeriodOptions(avail: AvailableWrappedPeriods): PeriodOption[] {
  const now = new Date();
  const options: PeriodOption[] = [];
  if (avail.thisYearHasData) options.push({ label: `THIS YEAR (${now.getFullYear()})`, period: { year: now.getFullYear() } });
  if (avail.lastYearHasData) options.push({ label: `LAST YEAR (${now.getFullYear() - 1})`, period: { year: now.getFullYear() - 1 } });
  if (avail.thisMonthHasData) options.push({ label: "THIS MONTH", period: { month: { year: now.getFullYear(), month: now.getMonth() + 1 } } });
  if (avail.lastMonthHasData) {
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    options.push({ label: "LAST MONTH", period: { month: { year: last.getFullYear(), month: last.getMonth() + 1 } } });
  }
  for (const y of avail.yearsWithSessions) {
    if (y !== now.getFullYear() && y !== now.getFullYear() - 1) {
      options.push({ label: String(y), period: { year: y } });
    }
  }
  return options;
}

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function srcLabel(source: string): string {
  return SOURCE_CODE[source as GameSource] ?? source.toUpperCase();
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center" }}>
      {children}
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <div className="retro-value" style={{ fontSize: "2em" }}>{children}</div>;
}

/**
 * WRAPPED.EXE — the year-in-review as a DOS slideshow. Enter/Space/Right
 * advance, Backspace/Left go back, Esc quits to the stats screen.
 */
export function RetroWrapped({ enabled, onBack }: RetroWrappedProps) {
  const [periods, setPeriods] = React.useState<PeriodOption[] | null>(null);
  const [periodSel, setPeriodSel] = React.useState(0);
  const [report, setReport] = React.useState<WrappedReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [slide, setSlide] = React.useState(0);

  React.useEffect(() => {
    getAvailableWrappedPeriods()
      .then((avail) => setPeriods(buildPeriodOptions(avail)))
      .catch(() => setPeriods([]));
  }, []);

  const pickPeriod = React.useCallback(async (option: PeriodOption) => {
    setLoading(true);
    try {
      const r = await getWrappedReport(option.period);
      setReport(r);
      setSlide(0);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const slides = React.useMemo(() => {
    if (!report) return [];
    const r = report;
    const list: React.ReactNode[] = [];

    list.push(
      <Center key="title">
        <div style={{ color: "var(--vga-bcyan)", whiteSpace: "pre", lineHeight: 1.05 }}>{NEXUS_LOGO.join("\n")}</div>
        <Big>WRAPPED.EXE</Big>
        <div className="retro-accent">{r.periodLabel}</div>
        <div className="retro-dim retro-blink" style={{ marginTop: 16 }}>PRESS ENTER</div>
      </Center>,
    );

    list.push(
      <Center key="totals">
        <div className="retro-label">YOU PLAYED</div>
        <Big>{fmtHours(r.totalPlayTimeS)} HOURS</Big>
        <div className="retro-value">{r.totalSessions} SESSIONS ACROSS {r.totalGamesPlayed} TITLES</div>
        <div className="retro-dim">LIBRARY: {r.totalGamesInLibrary} TITLES | NEW THIS PERIOD: {r.newTitlesInPeriod}</div>
        {r.comparisonPreviousPeriod && <div className="retro-accent">{r.comparisonPreviousPeriod.label}</div>}
      </Center>,
    );

    if (r.mostPlayedGame) {
      const max = r.topGames[0]?.playTimeS ?? 1;
      list.push(
        <Center key="top">
          <div className="retro-label">MOST PLAYED</div>
          <Big>{r.mostPlayedGame.name}</Big>
          <div className="retro-value">
            {fmtHours(r.mostPlayedGame.playTimeS)} HRS | {r.mostPlayedGame.sessionCount} SESSIONS | {srcLabel(r.mostPlayedGame.source)}
          </div>
          <div style={{ marginTop: 12, textAlign: "left" }}>
            {r.topGames.slice(0, 5).map((g, i) => (
              <div key={g.id} className="retro-row" style={{ padding: 0 }}>
                <span style={{ width: "4ch" }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="retro-value" style={{ width: "30ch", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                <span className="retro-dim">{fmtBar(g.playTimeS, max, 20)}</span>
                <span className="retro-value" style={{ width: "9ch", textAlign: "right" }}>{fmtHours(g.playTimeS)}</span>
              </div>
            ))}
          </div>
        </Center>,
      );
    }

    if (r.genreBreakdown.length > 0) {
      const max = r.genreBreakdown[0]?.playTimeS ?? 1;
      list.push(
        <Center key="genres">
          <div className="retro-label">YOUR GENRES</div>
          {r.mostPlayedGenre && <Big>{r.mostPlayedGenre}</Big>}
          {r.genreTagline && <div className="retro-accent">{r.genreTagline}</div>}
          <div style={{ marginTop: 12, textAlign: "left" }}>
            {r.genreBreakdown.slice(0, 6).map((g) => (
              <div key={g.name} className="retro-row" style={{ padding: 0 }}>
                <span className="retro-value" style={{ width: "20ch", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                <span className="retro-dim">{fmtBar(g.playTimeS, max, 20)}</span>
                <span className="retro-value" style={{ width: "6ch", textAlign: "right" }}>{Math.round(g.percent)}%</span>
              </div>
            ))}
          </div>
        </Center>,
      );
    }

    if (r.platformBreakdown.length > 0) {
      const max = r.platformBreakdown[0]?.playTimeS ?? 1;
      list.push(
        <Center key="platforms">
          <div className="retro-label">WHERE YOU PLAYED</div>
          <div style={{ marginTop: 12, textAlign: "left" }}>
            {r.platformBreakdown.map((p) => (
              <div key={p.source} className="retro-row" style={{ padding: 0 }}>
                <span className="retro-value" style={{ width: "10ch" }}>{srcLabel(p.source)}</span>
                <span className="retro-dim">{fmtBar(p.playTimeS, max, 24)}</span>
                <span className="retro-value" style={{ width: "6ch", textAlign: "right" }}>{Math.round(p.percent)}%</span>
              </div>
            ))}
          </div>
        </Center>,
      );
    }

    const dowMax = Math.max(...r.playTimeByDayOfWeek.map((d) => d.playTimeS), 1);
    list.push(
      <Center key="rhythm">
        <div className="retro-label">YOUR RHYTHM</div>
        <div style={{ textAlign: "left" }}>
          {r.playTimeByDayOfWeek.map((d) => (
            <div key={d.day} className="retro-row" style={{ padding: 0 }}>
              <span className="retro-value" style={{ width: "5ch" }}>{DOW[d.day] ?? d.day}</span>
              <span className="retro-dim">{fmtBar(d.playTimeS, dowMax, 24)}</span>
              <span className="retro-value" style={{ width: "8ch", textAlign: "right" }}>{fmtHours(d.playTimeS)}</span>
            </div>
          ))}
        </div>
        {r.busiestDay && (
          <div className="retro-accent" style={{ marginTop: 8 }}>
            BUSIEST DAY: {fmtDate(r.busiestDay)} ({fmtHours(r.busiestDayPlayTimeS)} HRS)
          </div>
        )}
        {r.longestSession && (
          <div className="retro-value">
            LONGEST SESSION: {r.longestSession.gameName} - {fmtDur(r.longestSession.durationS)}
          </div>
        )}
        {r.longestStreakDays > 0 && <div className="retro-value">LONGEST STREAK: {r.longestStreakDays} DAYS</div>}
      </Center>,
    );

    if (r.funFacts.length > 0 || r.trivia.length > 0 || r.hiddenGem || r.moodTagline) {
      list.push(
        <Center key="facts">
          <div className="retro-label">FUN FACTS</div>
          {r.moodTagline && <div className="retro-accent">{r.moodTagline}</div>}
          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}>
            {r.funFacts.map((f) => (
              <div key={f.kind} className="retro-value">* {f.label}</div>
            ))}
            {r.trivia.map((t, i) => (
              <div key={i} className="retro-dim">* {t}</div>
            ))}
            {r.hiddenGem && (
              <div className="retro-good">* HIDDEN GEM: {r.hiddenGem.name} - {r.hiddenGem.tagline}</div>
            )}
          </div>
        </Center>,
      );
    }

    list.push(
      <Center key="end">
        <Big>THAT WAS {r.periodLabel}</Big>
        <div className="retro-accent">GG. SEE YOU NEXT RUN.</div>
        <div className="retro-dim retro-blink" style={{ marginTop: 16 }}>ESC TO EXIT</div>
      </Center>,
    );

    return list;
  }, [report]);

  React.useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
        return;
      }
      if (!report) {
        // Period picker keys.
        if (!periods || periods.length === 0 || loading) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setPeriodSel((s) => Math.min(periods.length - 1, s + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setPeriodSel((s) => Math.max(0, s - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); pickPeriod(periods[periodSel]); }
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        setSlide((s) => Math.min(slides.length - 1, s + 1));
      } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSlide((s) => Math.max(0, s - 1));
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, report, periods, periodSel, loading, slides.length, pickPeriod, onBack]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }} data-testid="retro-wrapped">
      {report ? (
        <>
          {slides[slide]}
          <div className="retro-row retro-dim" style={{ justifyContent: "center" }}>
            SLIDE {slide + 1}/{slides.length}
          </div>
        </>
      ) : (
        <Center>
          {loading ? (
            <div className="retro-blink">CRUNCHING NUMBERS...</div>
          ) : periods == null ? (
            <div className="retro-dim">READING SESSION FILE...</div>
          ) : periods.length === 0 ? (
            <div className="retro-dim">NO SESSION DATA ON FILE - PLAY SOMETHING FIRST</div>
          ) : (
            <RetroModal title="WRAPPED.EXE - SELECT PERIOD" items={periods.map((p) => ({ label: p.label }))} selected={periodSel} footer="ENTER=RUN | ESC=CANCEL" onItemClick={(i) => pickPeriod(periods[i])} />
          )}
        </Center>
      )}
    </div>
  );
}
