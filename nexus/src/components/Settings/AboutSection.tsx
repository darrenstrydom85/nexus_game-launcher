import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Bug, CircleAlert, Download, Heart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { KnownIssuesDialog } from "./KnownIssuesDialog";

export function AboutSection() {
  const [version, setVersion] = React.useState<string | null>(null);
  const [knownIssuesOpen, setKnownIssuesOpen] = React.useState(false);
  const updateAvailable = useUpdateStore((s) => s.updateAvailable);
  const downloadUrl = useUpdateStore((s) => s.downloadUrl);
  const runCheck = useUpdateStore((s) => s.runCheck);

  React.useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  React.useEffect(() => {
    runCheck().catch(() => {});
  }, [runCheck]);

  const handleUpdateNow = React.useCallback(() => {
    openUrl(downloadUrl).catch(() => {});
  }, [downloadUrl]);

  return (
    <section data-testid="about-section">
      <h3 className="mb-3 text-sm font-semibold text-foreground">About</h3>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span data-testid="about-version">Nexus v{version ?? "..."}</span>
        {updateAvailable && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-fit"
            onClick={handleUpdateNow}
            aria-label="Update now"
          >
            <Download className="size-3.5" aria-hidden />
            Update now
          </Button>
        )}
        <a
          data-testid="about-discord"
          href="https://discord.gg/dh2tDGJNYD"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <MessageCircle className="size-3.5" /> Discord
        </a>
        <a
          data-testid="about-bug"
          href="https://discord.gg/dh2tDGJNYD"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Bug className="size-3.5" /> Report a Bug
        </a>
        <button
          type="button"
          data-testid="about-known-issues"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => setKnownIssuesOpen(true)}
        >
          <CircleAlert className="size-3.5" /> Known Issues
        </button>
        <a
          data-testid="about-support"
          href="https://paypal.me/darrenstrydom85"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
          aria-label="Support this project via PayPal"
        >
          <Heart className="size-3.5" /> Support this project
        </a>
        <span data-testid="about-license" className="text-xs">MIT License</span>
      </div>
      <KnownIssuesDialog
        open={knownIssuesOpen}
        onClose={() => setKnownIssuesOpen(false)}
      />
    </section>
  );
}
