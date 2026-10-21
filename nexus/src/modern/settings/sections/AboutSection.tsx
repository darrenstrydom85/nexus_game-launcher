import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Bug, Cpu, Download, ExternalLink, Gpu, Heart, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getHardwareCached, trimCpuName, trimGpuName } from "@/lib/hardware";
import type { HardwareInfo } from "@/lib/tauri";
import { KnownIssuesDialog } from "@/components/Settings/KnownIssuesDialog";
import { USAGE_COUNT_SOURCE_URL, USAGE_COUNT_URL } from "@/lib/usageCount";
import { RowIcon, SettingsCard, SettingsRow, ToggleRow } from "../SettingsKit";

const DISCORD = "https://discord.gg/dh2tDGJNYD";
const PAYPAL = "https://paypal.me/darrenstrydom85";

export function useAppVersion() {
  const [version, setVersion] = React.useState<string | null>(null);
  React.useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  return version;
}

function LinkButton({ href, children, ...rest }: { href: string; children: React.ReactNode } & React.ComponentPropsWithoutRef<"a">) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
      </a>
    </Button>
  );
}

export function AboutSection() {
  const version = useAppVersion();
  const [knownIssuesOpen, setKnownIssuesOpen] = React.useState(false);
  const { updateAvailable, latestVersion, notes, phase, downloadedBytes, totalBytes, runCheck, downloadAndInstall, restart } = useUpdateStore();
  const showOnHome = useSettingsStore((s) => s.showHardwareOnHome);
  const setShowOnHome = useSettingsStore((s) => s.setShowHardwareOnHome);
  const usageEnabled = useSettingsStore((s) => s.usageCountEnabled);
  const setUsageEnabled = useSettingsStore((s) => s.setUsageCountEnabled);
  const lastSent = useSettingsStore((s) => s.usageCountLastSent);
  const [hw, setHw] = React.useState<HardwareInfo | null>(null);

  React.useEffect(() => {
    runCheck().catch(() => {});
    let cancelled = false;
    getHardwareCached()
      .then((info) => !cancelled && setHw(info))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runCheck]);

  const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : null;
  const status =
    phase === "checking"
      ? "Checking for updates…"
      : phase === "downloading"
        ? `Downloading ${latestVersion ?? "update"}${pct != null ? ` · ${pct}%` : "…"}`
        : phase === "ready"
          ? `${latestVersion ?? "The update"} is installed. Restart to finish.`
          : updateAvailable
            ? `Version ${latestVersion} is available`
            : "You’re up to date";

  return (
    <>
      <SettingsCard title="Nexus" data-testid="about-section">
        <SettingsRow label={<span data-testid="about-version">Version {version ?? "…"}</span>} description={<span data-testid="about-update-status">{status}</span>}>
          {phase === "ready" ? (
            <Button size="sm" onClick={() => restart().catch(() => {})}>
              <RefreshCw className="size-3.5" strokeWidth={2} />
              Restart to update
            </Button>
          ) : updateAvailable ? (
            <Button size="sm" data-testid="about-update-now" disabled={phase === "downloading"} onClick={() => downloadAndInstall().catch(() => {})}>
              <Download className="size-3.5" strokeWidth={2} />
              {phase === "downloading" ? "Downloading…" : "Update now"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" data-testid="about-check-updates" disabled={phase === "checking"} onClick={() => runCheck().catch(() => {})}>
              Check for updates
            </Button>
          )}
        </SettingsRow>
        {phase === "downloading" && pct != null && (
          <div className="px-[18px] py-3">
            <span role="progressbar" aria-label="Update download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="block h-1.5 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
          </div>
        )}
        {updateAvailable && notes && (
          <SettingsRow label="What’s new" description={<span className="whitespace-pre-line">{notes}</span>} />
        )}
        <SettingsRow label="Known issues" description="Problems we know about and their workarounds">
          <Button variant="outline" size="sm" data-testid="about-known-issues" onClick={() => setKnownIssuesOpen(true)}>
            View
          </Button>
        </SettingsRow>
        <SettingsRow label="Community" description="Chat, ask for help or report a bug">
          <LinkButton href={DISCORD} data-testid="about-discord">
            <MessageCircle className="size-3.5" strokeWidth={1.75} />
            Discord
          </LinkButton>
          <LinkButton href={DISCORD} data-testid="about-bug">
            <Bug className="size-3.5" strokeWidth={1.75} />
            Report a bug
          </LinkButton>
        </SettingsRow>
        <SettingsRow label="Support the project">
          <LinkButton href={PAYPAL} data-testid="about-support" aria-label="Support this project via PayPal">
            <Heart className="size-3.5" strokeWidth={1.75} />
            PayPal
          </LinkButton>
        </SettingsRow>
        <SettingsRow label="Licence">
          <span data-testid="about-license" className="text-[13px] text-muted-foreground">
            MIT
          </span>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Usage count" data-testid="about-usage-count">
        <ToggleRow
          data-testid="pref-usage-count"
          label="Count me as a user"
          description="Once a day, Nexus sends an anonymous “opened today” count and the app version to nexusgamelauncher.com. Nothing else."
          checked={usageEnabled}
          onCheckedChange={setUsageEnabled}
        />
        <SettingsRow
          label="Last request sent"
          description={
            lastSent ? (
              <>
                {new Date(lastSent.sentAt).toLocaleString()}
                <pre data-testid="about-usage-last-sent" className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                  {JSON.stringify(lastSent.payload, null, 2)}
                </pre>
              </>
            ) : (
              "Nothing sent yet"
            )
          }
        />
        <SettingsRow label="Check it yourself" description="The code is open source and every stored number is public">
          <LinkButton href={USAGE_COUNT_SOURCE_URL} data-testid="about-usage-code">
            Read the code
          </LinkButton>
          <LinkButton href={USAGE_COUNT_URL} data-testid="about-usage-data">
            All stored data
          </LinkButton>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="This PC" data-testid="about-this-pc">
        {hw && hw.cpuBrand !== "unknown" && (
          <SettingsRow
            label={<span className="break-words">{trimCpuName(hw.cpuBrand, hw.cpuName)}</span>}
            description="CPU"
            leading={
              <RowIcon>
                <Cpu className="size-[18px]" strokeWidth={1.5} />
              </RowIcon>
            }
          />
        )}
        {hw && hw.gpuBrand !== "unknown" && (
          <SettingsRow
            label={<span className="break-words">{trimGpuName(hw.gpuBrand, hw.gpuName)}</span>}
            description="Graphics"
            leading={
              <RowIcon>
                <Gpu className="size-[18px]" strokeWidth={1.5} />
              </RowIcon>
            }
          />
        )}
        <ToggleRow
          data-testid="pref-show-hardware-home"
          label="Show on Home"
          description="Adds a This PC tile to the dashboard"
          checked={showOnHome}
          onCheckedChange={setShowOnHome}
        />
      </SettingsCard>

      <KnownIssuesDialog open={knownIssuesOpen} onClose={() => setKnownIssuesOpen(false)} />
    </>
  );
}
