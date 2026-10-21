import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppVersion } from "@/modern/settings/sections/AboutSection";
import { USAGE_COUNT_SOURCE_URL, USAGE_COUNT_URL, buildPayload, utcDay } from "@/lib/usageCount";

/**
 * One-time ask, shown before the first anonymous usage count is ever sent.
 * Either answer marks it seen; sending starts on the next open (lib/usageCount).
 */
export function UsageCountNotice() {
  const hydrated = useSettingsStore((s) => s._hydrated);
  const seen = useSettingsStore((s) => s.usageCountNoticeSeen);
  if (!hydrated || seen) return null;
  return <NoticeDialog />;
}

function answer(enabled: boolean) {
  const s = useSettingsStore.getState();
  s.setUsageCountEnabled(enabled);
  s.setUsageCountNoticeSeen(true);
}

const linkClass = "text-foreground underline underline-offset-2 hover:text-primary";

function NoticeDialog() {
  const version = useAppVersion();
  const preview = JSON.stringify(buildPayload(version ?? "…", null, utcDay(new Date())), null, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-notice-title"
      aria-describedby="usage-notice-desc"
      data-testid="usage-count-notice"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h4 id="usage-notice-title" className="text-sm font-semibold text-foreground">
          A quick, honest ask
        </h4>
        <div id="usage-notice-desc" className="mt-2 space-y-2 text-sm text-muted-foreground">
          <p>
            I build Nexus on my own, and I have no idea how many people actually use it. The Discord is my only
            clue, and most people never join.
          </p>
          <p>
            So once a day, when you open Nexus, it sends one anonymous count: “someone opened Nexus today”, plus the
            app version. No ID, no account, nothing about you, your PC or your games. Nexus can’t tell you apart from
            anyone else.
          </p>
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-foreground">See exactly what’s sent</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">{preview}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            That’s the whole request.{" "}
            <a href={USAGE_COUNT_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Read the code
            </a>{" "}
            or{" "}
            <a href={USAGE_COUNT_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              see everything stored
            </a>
            .
          </p>
        </details>

        <p className="mt-3 text-xs text-muted-foreground">You can change this any time in Settings › About.</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => answer(false)} data-testid="usage-notice-off">
            Turn it off
          </Button>
          <Button type="button" onClick={() => answer(true)} data-testid="usage-notice-ok">
            Sounds fair
          </Button>
        </div>
      </div>
    </div>
  );
}
