import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { OnboardingWizard } from "@/components/Onboarding/OnboardingWizard";
import { WelcomeStep } from "@/components/Onboarding/WelcomeStep";
import { SteamGridDBStep } from "@/components/Onboarding/SteamGridDBStep";
import { IGDBStep } from "@/components/Onboarding/IGDBStep";
import { SourcesStep } from "@/components/Onboarding/SourcesStep";
import { ConfirmLibraryStep } from "@/components/Onboarding/ConfirmLibraryStep";
import { AppShell } from "@/components/shared/AppShell";
import { LibraryView } from "@/components/Library/LibraryView";
import { LibraryStats } from "@/components/Library/LibraryStats";
import { GameDetailOverlay } from "@/components/GameDetail/GameDetailOverlay";
import { DetailContent } from "@/components/GameDetail/DetailContent";
import { EditGameModal, type EditGameFields } from "@/components/GameDetail/EditGameModal";
import { MetadataSearchDialog } from "@/components/GameDetail/MetadataSearchDialog";
import { AddToCollectionPopover } from "@/components/Collections/AddToCollectionPopover";
import { RandomPickerModal } from "@/components/RandomPicker/RandomPickerModal";
import { SettingsSheet } from "@/components/Settings/SettingsSheet";
import { CollectionEditor } from "@/components/Collections/CollectionEditor";
import { SearchCommand } from "@/components/Search/SearchCommand";
import { useLaunchLifecycle } from "@/hooks/useLaunchLifecycle";
import { setRunningGame } from "@/lib/launcher";
import { buildLaunchErrorInfo } from "@/lib/launch-errors";
import { useTauriEvent } from "@/hooks/use-tauri-event";
import { initSyncStore, useSyncStore } from "@/stores/syncStore";
import { useGameStore, type Game, refreshGames } from "@/stores/gameStore";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSettingsApplier } from "@/hooks/useSettingsApplier";

function extractYoutubeId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}
import { useToastStore } from "@/stores/toastStore";
import { runScoreBackfill, checkLibraryHealth, type ScoreBackfillProgressEvent, type DeadGame } from "@/lib/tauri";
import { HealthCheckModal } from "@/components/Settings/HealthCheckModal";
import { TwitchPanel } from "@/components/Twitch/TwitchPanel";

function MainApp() {
  const { launch: launchGame } = useLaunchLifecycle();
  const activeSession = useGameStore((s) => s.activeSession);
  const setGames = useGameStore((s) => s.setGames);
  const activeNav = useUiStore((s) => s.activeNav);
  const loadSettings = useSettingsStore((s) => s.loadFromBackend);
  const collections = useCollectionStore((s) => s.collections);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const [randomPickerOpen, setRandomPickerOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [collectionEditorOpen, setCollectionEditorOpen] = React.useState(false);
  const [editCollectionTarget, setEditCollectionTarget] = React.useState<Collection | null>(null);
  const [editGameTarget, setEditGameTarget] = React.useState<Game | null>(null);
  const [addToCollectionTarget, setAddToCollectionTarget] = React.useState<Game | null>(null);
  const [metadataSearchGame, setMetadataSearchGame] = React.useState<Game | null>(null);
  const metadataTriggered = React.useRef(false);
  const backfillTriggered = React.useRef(false);
  const healthCheckTriggered = React.useRef(false);
  const backfillToastId = React.useRef<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const removeToast = useToastStore((s) => s.removeToast);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{ added: number; updated: number } | null>(null);
  const [healthModalOpen, setHealthModalOpen] = React.useState(false);
  const [healthDeadGames, setHealthDeadGames] = React.useState<DeadGame[]>([]);

  const lastHealthCheckAt = useSettingsStore((s) => s.lastHealthCheckAt);
  const healthCheckSnoozedUntil = useSettingsStore((s) => s.healthCheckSnoozedUntil);
  const autoHealthCheck = useSettingsStore((s) => s.autoHealthCheck);
  const setHealthCheckResult = useSettingsStore((s) => s.setHealthCheckResult);
  const setHealthCheckSnoozed = useSettingsStore((s) => s.setHealthCheckSnoozed);

  const launch = React.useCallback(
    async (game: Game) => {
      const result = await launchGame(game);
      if (result.status === "failed" && result.error) {
        const info = buildLaunchErrorInfo(result.error, game.name);
        addToast({ type: info.toastType, message: info.message, action: info.action });
      }
      return result;
    },
    [launchGame, addToast],
  );

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useSettingsApplier();

  React.useEffect(() => {
    if (activeNav === "random") {
      setRandomPickerOpen(true);
      useUiStore.getState().setActiveNav("library");
    }
  }, [activeNav]);

  React.useEffect(() => {
    if (metadataTriggered.current) return;
    metadataTriggered.current = true;
    invoke("fetch_all_metadata").catch(() => {});
  }, []);

  React.useEffect(() => {
    if (backfillTriggered.current) return;
    backfillTriggered.current = true;
    runScoreBackfill().catch(() => {});
  }, []);

  React.useEffect(() => {
    if (healthCheckTriggered.current) return;
    if (!autoHealthCheck) return;

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const lastCheck = lastHealthCheckAt ? new Date(lastHealthCheckAt).getTime() : 0;
    const cooldownElapsed = now - lastCheck > SEVEN_DAYS_MS;

    if (!cooldownElapsed) return;

    healthCheckTriggered.current = true;

    const timer = setTimeout(async () => {
      try {
        const report = await checkLibraryHealth();
        setHealthCheckResult(report.checkedAt, report.deadGames.length);

        if (report.deadGames.length === 0) return;

        // Check snooze
        if (healthCheckSnoozedUntil && now < healthCheckSnoozedUntil) return;

        setHealthDeadGames(report.deadGames);

        let reviewed = false;
        addToast({
          type: "warning",
          message: `${report.deadGames.length} game${report.deadGames.length !== 1 ? "s" : ""} in your library could not be found.`,
          duration: 10000,
          action: {
            label: "Review",
            onClick: () => {
              reviewed = true;
              setHealthModalOpen(true);
            },
          },
        });

        // If the toast expires without the user clicking "Review", snooze for 24h
        setTimeout(() => {
          if (!reviewed) {
            setHealthCheckSnoozed(Date.now() + 24 * 60 * 60 * 1000);
          }
        }, 11000);
      } catch {
        // silent — auto check should never surface errors to the user
      }
    }, 3000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHealthCheck]);

  const handleScoreBackfillProgress = React.useCallback(
    (event: ScoreBackfillProgressEvent) => {
      const { completed, total } = event;
      if (total === 0) return;

      if (completed < total) {
        const message = `Fetching review scores... ${completed}/${total}`;
        if (backfillToastId.current) {
          removeToast(backfillToastId.current);
        }
        backfillToastId.current = addToast({
          type: "info",
          message,
          duration: 0,
        });
      } else {
        if (backfillToastId.current) {
          removeToast(backfillToastId.current);
          backfillToastId.current = null;
        }
        refreshGames().catch(() => {});
      }
    },
    [addToast, removeToast],
  );

  useTauriEvent("score-backfill-progress", handleScoreBackfillProgress);

  const syncIsActive = useSyncStore((s) => s.isActive);
  const overallCompleted = useSyncStore((s) => s.overallCompleted);
  const overallTotal = useSyncStore((s) => s.overallTotal);
  const prevSyncActiveRef = React.useRef(false);

  React.useEffect(() => {
    initSyncStore({
      onLegacyComplete: () => {
        invoke<Game[]>("get_games", { params: {} })
          .then((games) => setGames(games))
          .catch(() => {});
      },
    });
  }, [setGames]);

  React.useEffect(() => {
    if (
      prevSyncActiveRef.current &&
      !syncIsActive &&
      overallTotal > 0 &&
      overallCompleted === overallTotal
    ) {
      invoke<Game[]>("get_games", { params: {} })
        .then((games) => setGames(games))
        .catch(() => {});
    }
    prevSyncActiveRef.current = syncIsActive;
  }, [syncIsActive, overallCompleted, overallTotal, setGames]);

  const handleResync = React.useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const existingGames = useGameStore.getState().games;
      const existingIds = new Set(existingGames.map((g) => g.id));
      const scanResult = await invoke<{ games: unknown[] }>("scan_sources");
      const confirmed = await invoke<Game[]>("confirm_games", { detectedGames: scanResult.games });
      const added = confirmed.filter((g) => !existingIds.has(g.id)).length;
      const updated = confirmed.length - added;
      await refreshGames();
      setSyncResult({ added, updated });
      setTimeout(() => setSyncResult(null), 6000);
    } catch {
      // best-effort
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return (
    <AppShell
      onSettingsClick={() => setSettingsOpen(true)}
      onAddCollection={() => { setEditCollectionTarget(null); setCollectionEditorOpen(true); }}
      onEditCollection={(c) => { setEditCollectionTarget(c); setCollectionEditorOpen(true); }}
      onDeleteCollection={(c) => {
        invoke("delete_collection", { id: c.id })
          .then(() => useCollectionStore.getState().removeCollection(c.id))
          .catch(() => {});
      }}
      onStopGame={async () => {
        const session = useGameStore.getState().activeSession;
        if (session) {
          if (session.pid) {
            invoke("stop_game", { pid: session.pid }).catch(() => {});
          }
          useGameStore.getState().setActiveSession(null);
          setRunningGame(null);
          if (session.hasDbSession) {
            try {
              await invoke("end_session", {
                sessionId: session.sessionId,
                endedAt: new Date().toISOString(),
              });
            } catch {
              // best-effort
            }
          }
          await refreshGames();
        }
      }}
      onGameDetails={(gameId) => {
        useUiStore.getState().setDetailOverlayGameId(gameId);
      }}
    >
      {activeNav === "twitch" ? (
        <TwitchPanel />
      ) : activeNav === "stats" ? (
        <LibraryStats />
      ) : (
        <LibraryView
          onPlay={(game) => launch(game)}
          onResync={handleResync}
          isSyncing={isSyncing}
          syncResult={syncResult}
        />
      )}
      <GameDetailOverlay>
        {(game) => (
          <DetailContent
            game={game}
            isPlaying={activeSession?.gameId === game.id}
            youtubeId={game.trailerUrl ? extractYoutubeId(game.trailerUrl) : null}
            collections={collections
              .filter((c) => c.gameIds.includes(game.id))
              .map((c) => `${c.icon} ${c.name}`)}
            onPlay={() => launch(game)}
            onStatusChange={(status) => {
              invoke("update_game", { id: game.id, fields: { status } })
                .then(() => invoke<Game[]>("get_games", { params: {} }))
                .then((games) => setGames(games))
                .catch(() => {});
            }}
            onRatingChange={(rating) => {
              invoke("update_game", { id: game.id, fields: { rating } })
                .then(() => invoke<Game[]>("get_games", { params: {} }))
                .then((games) => setGames(games))
                .catch(() => {});
            }}
            onRefetchMetadata={async () => {
              await invoke("fetch_metadata", { gameId: game.id });
              await refreshGames();
            }}
            onSearchMetadata={() => setMetadataSearchGame(game)}
            onEdit={() => setEditGameTarget(game)}
            onAddToCollection={() => setAddToCollectionTarget(game)}
            onOpenFolder={() => {
              if (game.folderPath) openPath(game.folderPath).catch(() => {});
            }}
            onHide={() => {
              invoke("update_game", { id: game.id, fields: { isHidden: true } })
                .then(() => {
                  useSettingsStore.getState().hideGame(game.id);
                  useUiStore.getState().setDetailOverlayGameId(null);
                })
                .catch(() => {});
            }}
          />
        )}
      </GameDetailOverlay>
      {metadataSearchGame && (
        <MetadataSearchDialog
          open={metadataSearchGame !== null}
          gameId={metadataSearchGame.id}
          initialQuery={metadataSearchGame.name}
          onClose={() => setMetadataSearchGame(null)}
          onSuccess={() => refreshGames()}
        />
      )}
      <EditGameModal
        game={editGameTarget}
        open={editGameTarget !== null}
        onClose={() => setEditGameTarget(null)}
        onSave={(fields: EditGameFields) => {
          if (!editGameTarget) return;
          setEditGameTarget(null);
          invoke("update_game", {
            id: editGameTarget.id,
            fields: {
              name: fields.name,
              exePath: fields.exePath,
              customCover: fields.customCover,
              customHero: fields.customHero,
              potentialExeNames: fields.potentialExeNames,
            },
          })
            .then(() => refreshGames())
            .catch(() => {});
        }}
      />
      {addToCollectionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAddToCollectionTarget(null)}
          />
          <div className="relative z-10">
            <AddToCollectionPopover
              gameId={addToCollectionTarget.id}
              gameName={addToCollectionTarget.name}
              open
              onClose={() => setAddToCollectionTarget(null)}
              onNewCollection={() => {
                setAddToCollectionTarget(null);
                setCollectionEditorOpen(true);
              }}
            />
          </div>
        </div>
      )}
      <RandomPickerModal
        open={randomPickerOpen}
        onClose={() => setRandomPickerOpen(false)}
        onPlay={(game) => { setRandomPickerOpen(false); launch(game); }}
        onViewDetails={(game) => { setRandomPickerOpen(false); useUiStore.getState().setDetailOverlayGameId(game.id); }}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <SearchCommand
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectAction={(actionId) => {
          if (actionId === "action-settings") setSettingsOpen(true);
          else if (actionId === "action-random") setRandomPickerOpen(true);
          else if (actionId === "action-scan") handleResync();
        }}
      />
      <HealthCheckModal
        open={healthModalOpen}
        deadGames={healthDeadGames}
        onClose={() => setHealthModalOpen(false)}
        onDeadGamesChange={setHealthDeadGames}
      />
      <CollectionEditor
        open={collectionEditorOpen}
        onClose={() => { setCollectionEditorOpen(false); setEditCollectionTarget(null); }}
        editCollection={editCollectionTarget}
        onSave={(data) => {
          if (editCollectionTarget) {
            invoke("update_collection", {
              id: editCollectionTarget.id,
              name: data.name,
              icon: data.icon,
              color: data.color,
            })
              .then(() =>
                useCollectionStore.getState().updateCollection(editCollectionTarget.id, {
                  name: data.name,
                  icon: data.icon,
                  color: data.color,
                }),
              )
              .catch(() => {});
          } else {
            invoke<Collection>("create_collection", { name: data.name, icon: data.icon, color: data.color })
              .then((created) => useCollectionStore.getState().addCollection({ ...created, gameIds: [] }))
              .catch(() => {});
          }
          setCollectionEditorOpen(false);
          setEditCollectionTarget(null);
        }}
      />
    </AppShell>
  );
}

function App() {
  const isOnboardingCompleted = useOnboardingStore((s) => s.isCompleted);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const skipStep = useOnboardingStore((s) => s.skipStep);
  const markStepCompleted = useOnboardingStore((s) => s.markStepCompleted);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      invoke<string | null>("get_setting", { key: "onboarding_completed" }),
      invoke<string | null>("get_setting", { key: "steamgrid_api_key" }),
      invoke<string | null>("get_setting", { key: "igdb_client_id" }),
      invoke<string | null>("get_setting", { key: "igdb_client_secret" }),
    ])
      .then(([completed, steamgridKey, igdbClientId, igdbClientSecret]) => {
        if (completed === "true") {
          completeOnboarding();
          return;
        }
        // Pre-skip API key steps when keys are already configured (e.g. after
        // a "reset, keep API keys" operation re-triggers onboarding).
        if (steamgridKey) {
          skipStep("steamgriddb");
          markStepCompleted("steamgriddb");
        }
        if (igdbClientId && igdbClientSecret) {
          skipStep("igdb");
          markStepCompleted("igdb");
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [completeOnboarding, skipStep, markStepCompleted]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
      </div>
    );
  }

  if (!isOnboardingCompleted) {
    return (
      <OnboardingWizard>
        {{
          welcome: <WelcomeStep />,
          steamgriddb: <SteamGridDBStep />,
          igdb: <IGDBStep />,
          sources: <SourcesStep />,
          confirm: <ConfirmLibraryStep />,
        }}
      </OnboardingWizard>
    );
  }

  return <MainApp />;
}

export default App;
