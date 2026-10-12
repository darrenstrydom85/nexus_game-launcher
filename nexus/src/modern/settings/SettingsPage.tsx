import * as React from "react";
import {
  Cloud,
  Database,
  Download,
  Info,
  Library,
  Monitor,
  Palette,
  Plug,
  Search,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore, type SettingsCategory } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUpdateStore } from "@/stores/updateStore";
import { SettingsHeader } from "./SettingsKit";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AboutSection, useAppVersion } from "./sections/AboutSection";
import { LibrarySection } from "./sections/LibrarySection";
import { TagsSection } from "./sections/TagsSection";
import { ThemeSection } from "./sections/ThemeSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { BackupSection } from "./sections/BackupSection";
import { DataSection } from "./sections/DataSection";
import { ExportSection } from "./sections/ExportSection";
import { DeveloperSection } from "./sections/DeveloperSection";

interface Category {
  id: SettingsCategory;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Extra words the search box matches, beyond the label. */
  keywords: string;
  render: () => React.ReactNode;
}

const CATEGORIES: Category[] = [
  {
    id: "library",
    label: "Library",
    icon: Library,
    description: "Where Nexus finds your games and how the library behaves.",
    keywords: "sources steam epic gog ubisoft battle.net xbox folders scan sort view continue playing progress status session note hltb how long to beat retirement ceremony",
    render: () => <LibrarySection />,
  },
  {
    id: "tags",
    label: "Tags",
    icon: Tag,
    description: "Colour-coded tags you can filter the library by.",
    keywords: "labels colours",
    render: () => <TagsSection />,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Monitor,
    description: "How Nexus looks and when it talks to you.",
    keywords: "theme dark light system transparency animations motion retro dos layout notifications sounds achievements milestones xp close tray",
    render: () => <AppearanceSection />,
  },
  {
    id: "theme",
    label: "Theme Studio",
    icon: Palette,
    description: "Pick a preset or tune your own palette and type.",
    keywords: "accent colour color font typography radius preset import export",
    render: () => <ThemeSection />,
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    description: "Artwork, metadata and Twitch.",
    keywords: "api keys steamgriddb igdb twitch notifications wizard",
    render: () => <IntegrationsSection />,
  },
  {
    id: "backup",
    label: "Cloud backup",
    icon: Cloud,
    description: "Keep your library, sessions and settings safe in Google Drive.",
    keywords: "google drive restore",
    render: () => <BackupSection />,
  },
  {
    id: "data",
    label: "Data & health",
    icon: Database,
    description: "Import, export and keep the library tidy.",
    keywords: "import export json health check missing hidden games sessions reset clear",
    render: () => <DataSection />,
  },
  {
    id: "export",
    label: "Export stats",
    icon: Download,
    description: "Download your play data for a date range.",
    keywords: "csv json stats report",
    render: () => <ExportSection />,
  },
  {
    id: "about",
    label: "About",
    icon: Info,
    description: "Version, updates and this PC.",
    keywords: "version update known issues discord bug licence paypal cpu gpu hardware this pc",
    render: () => <AboutSection />,
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: "developer" as const,
          label: "Developer",
          icon: Wrench,
          description: "Tools for working on Nexus. Only in dev builds.",
          keywords: "debug dev",
          render: () => <DeveloperSection />,
        },
      ]
    : []),
];

export function SettingsPage() {
  const category = useUiStore((s) => s.settingsCategory);
  const setCategory = useUiStore((s) => s.setSettingsCategory);
  const healthIssues = useSettingsStore((s) => s.healthCheckIssueCount);
  const updateAvailable = useUpdateStore((s) => s.updateAvailable);
  const version = useAppVersion();
  const [query, setQuery] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const shown = q ? CATEGORIES.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q)) : CATEGORIES;
  const current = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  // Each category starts at the top.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [current.id]);

  const dot = (id: SettingsCategory) => (id === "data" && healthIssues > 0) || (id === "about" && updateAvailable);

  return (
    <div data-testid="settings-page" className="flex h-full min-h-0">
      <aside className="flex w-[240px] shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-border bg-card/40 px-3 py-6 max-[1000px]:w-[208px]">
        <h1 className="px-2.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Settings</h1>
        <label className="flex h-[34px] shrink-0 items-center gap-2 rounded-lg border border-input bg-background/60 px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="sr-only">Search settings</span>
          <input
            type="search"
            data-testid="settings-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) setCategory(shown[0].id);
            }}
            placeholder="Search settings"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <nav aria-label="Settings categories" className="flex flex-col gap-px">
          {shown.map((c) => {
            const Icon = c.icon;
            const active = c.id === current.id;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`settings-cat-${c.id}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {dot(c.id) && (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary">
                    <span className="sr-only">{c.id === "about" ? "Update available" : `${healthIssues} library issues`}</span>
                  </span>
                )}
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted-foreground">Nothing matches “{query}”.</p>}
        </nav>
        <div className="flex-1" />
        {version && <span className="px-2.5 text-xs text-muted-foreground">Nexus {version}</span>}
      </aside>
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div data-testid={`settings-content-${current.id}`} className="flex max-w-[860px] flex-col gap-5 px-10 pb-12 pt-7">
          <SettingsHeader title={current.label} description={current.description} />
          {current.render()}
        </div>
      </div>
    </div>
  );
}
