import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Bug } from "lucide-react";

export function AboutSection() {
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  return (
    <section data-testid="about-section">
      <h3 className="mb-3 text-sm font-semibold text-foreground">About</h3>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span data-testid="about-version">Nexus v{version ?? "..."}</span>
        <a
          data-testid="about-bug"
          href="mailto:hello@darrenstrydom.com?subject=Nexus%20Bug%20Report"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Bug className="size-3.5" /> Report a Bug
        </a>
        <span data-testid="about-license" className="text-xs">MIT License</span>
      </div>
    </section>
  );
}
