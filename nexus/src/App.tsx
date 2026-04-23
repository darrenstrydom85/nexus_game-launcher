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
import { WrappedView } from "@/components/Wrapped/WrappedView";
import { ArchiveView } from "@/components/Archive/ArchiveView";
import { CompletedView } from "@/components/Completed/CompletedView";
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
import { useGameStore, type Game, type GameStatus, refreshGames } from "@/stores/gameStore";
import { useCollectionStore, type Collection, refreshCollections } from "@/stores/collectionStore";
import { useCollections } from "@/hooks/useCollections";
import { useUiStore, type NavItem } from "@/stores/uiStore";
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
import { TwitchToastContainer } from "@/components/Twitch/TwitchToastContainer";
import { ToastNotifications } from "@/components/shared/ToastNotifications";
import { MilestoneToastStack } from "@/components/Milestones/MilestoneToastStack";
import { AchievementsView } from "@/components/Achievements/AchievementsView";
import { AchievementNotificationQueue } from "@/components/Achievements/AchievementNotificationQueue";
import { useAchievementStore } from "@/stores/achievementStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { twitchAuthStatus } from "@/lib/tauri";
import { useUpdateStore } from "@/stores/updateStore";
import { CloseDialogHost } from "@/components/Settings/CloseDialogHost";
import { UpdateAvailableDialog } from "@/components/Settings/UpdateAvailableDialog";
import { ProcessPickerModal } from "@/components/shared/ProcessPickerModal";
import { SessionNotePrompt } from "@/components/Sessions/SessionNotePrompt";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { useQueueStore } from "@/stores/queueStore";
import { useStreakStore } from "@/stores/streakStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useTagStore } from "@/stores/tagStore";
import { useXpStore } from "@/stores/xpStore";
import { LevelUpToast } from "@/components/Xp/LevelUpToast";
import { useCeremonyStore } from "@/stores/ceremonyStore";
import { RetirementCeremony } from "@/components/Ceremony/RetirementCeremony";

function SessionNotePromptWrapper() {
  const queue = useSessionNoteStore((s) => s.queue);
  const dequeue = useSessionNoteStore((s) => s.dequeue);
  const enabled = useSettingsStore((s) => s.sessionNotePromptEnabled);
  const timeoutS = useSettingsStore((s) => s.sessionNotePromptTimeout);
  if (!enabled) return null;
  return (
    <SessionNotePrompt
      queue={queue}
      onDismiss={dequeue}
      autoDismissMs={timeoutS > 0 ? timeoutS * 1000 : 0}
    />
  );
}

function MainApp() {
  const { launch: launchGame, onProcessSelected, onCancelProcessPicker, onForceIdentifyCancel, openForceIdentifyPicker } = useLaunchLifecycle();
  const forceIdentifyActiveRef = React.useRef(false);
  const activeSession = useGameStore((s) => s.activeSession);
  const showProcessPicker = useGameStore((s) => s.showProcessPicker);
  const activeNav = useUiStore((s) => s.activeNav);
  const loadSettings = useSettingsStore((s) => s.loadFromBackend);
  useCollections();
  const collections = useCollectionStore((s) => s.collections);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const [randomPickerOpen, setRandomPickerOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [collectionEditorOpen, setCollectionEditorOpen] = React.useState(false);
  const [editCollectionTarget, setEditCollectionTarget] = React.useState<Collection | null>(null);
  const [editGameTarget, setEditGameTarget] = React.useState<Game | null>(null);
  const [addToCollectionTarget, setAddToCollectionTarget] = React.useState<Game | null>(null);
  /** When creating a new collection from "Add to Collection" flow, add this game to it on save. Ref avoids stale closure in onSave. */
  const gameIdToAddToNewCollectionRef = React.useRef<string | null>(null);
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
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);
  const updateCheckTriggered = React.useRef(false);
  const runUpdateCheck = useUpdateStore((s) => s.runCheck);

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

  const handleForceIdentify = React.useCallback(() => {
    forceIdentifyActiveRef.current = true;
    openForceIdentifyPicker();
  }, [openForceIdentifyPicker]);

  const handleProcessPickerCancel = React.useCallback(() => {
    if (forceIdentifyActiveRef.current) {
      forceIdentifyActiveRef.current = false;
      onForceIdentifyCancel();
    } else {
      onCancelProcessPicker();
    }
  }, [onForceIdentifyCancel, onCancelProcessPicker]);

  const handleProcessSelected = React.useCallback(
    (exeName: string, pid: number) => {
      forceIdentifyActiveRef.current = false;
      onProcessSelected(exeName, pid);
    },
    [onProcessSelected],
  );

  // Auto-dismiss: if process detected while picker is open, close modal + toast
  const prevProcessDetectedRef = React.useRef(false);
  React.useEffect(() => {
    const detected = activeSession?.processDetected ?? false;
    if (detected && !prevProcessDetectedRef.current && showProcessPicker) {
      forceIdentifyActiveRef.current = false;
      useGameStore.getState().setShowProcessPicker(false);
      addToast({
        type: "success",
        message: `Detected ${activeSession?.exeName ?? "process"} automatically`,
      });
    }
    prevProcessDetectedRef.current = detected;
  }, [activeSession?.processDetected, activeSession?.exeName, showProcessPicker, addToast]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    useTagStore.getState().loadTags();
    useTagStore.getState().loadGameTagMap();
    useStreakStore.getState().fetchStreak();
    useMasteryStore.getState().fetchAll();
    useXpStore.getState().fetchXp();
    useAchievementStore.getState().initBadgeCount().then(() => {
      useAchievementStore.getState().evaluate();
    });
  }, []);


  useSettingsApplier();

  // Tray right-click menu navigation: the Rust side emits the bare nav id (e.g. "library",
  // "twitch") when the user clicks a nav entry in the tray context menu. Validate against
  // the known NavItem set so a stale payload can't push the UI into an unknown state.
  useTauriEvent<string>("nexus://navigate-to", (nav) => {
    const allowed: NavItem[] = [
      "library",
      "stats",
      "completed",
      "archive",
      "achievements",
      "twitch",
    ];
    if (typeof nav === "string" && (allowed as string[]).includes(nav)) {
      useUiStore.getState().setActiveNav(nav as NavItem);
    }
  });

  useTauriEvent<unknown>("backup-restored", () => {
    refreshGames().catch(() => {});
    refreshCollections().catch(() => {});
    useTagStore.getState().loadTags();
    useTagStore.getState().loadGameTagMap();
    useMasteryStore.getState().fetchAll();
    useQueueStore.getState().fetch();
    loadSettings();
    addToast({
      type: "success",
      message: "Library restored from backup successfully.",
      duration: 5000,
    });
  });

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

  React.useEffect(() => {
    useConnectivityStore.getState().checkConnectivity();
  }, []);

  // Version check on app load (once per session). If update available, show popup once unless dismissed.
  React.useEffect(() => {
    if (updateCheckTriggered.current) return;
    updateCheckTriggered.current = true;
    runUpdateCheck().then(() => {
      if (useUpdateStore.getState().updateAvailable && !useUpdateStore.getState().popupDismissed) {
        setUpdateDialogOpen(true);
      }
    });
  }, [runUpdateCheck]);

  // Hourly version check: show toast (not popup) when update available. Toast action opens Settings.
  const HOUR_MS = 60 * 60 * 1000;
  React.useEffect(() => {
    const id = setInterval(() => {
      runUpdateCheck().then(() => {
        if (!useUpdateStore.getState().updateAvailable) return;
        addToast({
          type: "info",
          message: "An update is available.",
          action: {
            label: "Open Settings",
            onClick: () => setSettingsOpen(true),
          },
        });
      });
    }, HOUR_MS);
    return () => clearInterval(id);
  }, [runUpdateCheck, addToast]);

  // Read Twitch auth state on startup and fetch data if authenticated. The backend
  // TwitchTokenManager owns all token state and refresh; the frontend only ever
  // reads a snapshot. The background refresh worker handles proactive refreshes,
  // so we no longer poll validateTwitchToken on a timer or on resume/online events.
  React.useEffect(() => {
    twitchAuthStatus()
      .then((status) => {
        useTwitchStore.getState().setIsAuthenticated(status.authenticated);
        if (status.authenticated) {
          useTwitchStore.getState().fetchFollowedStreams();
          useTwitchStore.getState().fetchTrending();
        }
      })
      .catch(() => {});
  }, []);

  // Story 19.11: when connectivity is restored (offline -> online), refresh the visible
  // Twitch data. We do NOT touch the token here -- the background worker handles that.
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const prevOnlineRef = React.useRef(isOnline);
  React.useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOffline && isOnline && useTwitchStore.getState().isAuthenticated) {
      useTwitchStore.getState().setRecoveryRefresh(true);
      useTwitchStore.getState().fetchFollowedStreams().finally(() => {
        useTwitchStore.getState().setRecoveryRefresh(false);
      });
      useTwitchStore.getState().fetchTrending();
    }
  }, [isOnline]);

  // On resume from background/sleep, just re-check connectivity and re-read the
  // current auth snapshot from the backend (no refresh side-effects -- the worker
  // already covered any expiry that elapsed during sleep).
  const lastVisibilityCheck = React.useRef(0);
  React.useEffect(() => {
    const RESUME_DEBOUNCE_MS = 5_000;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilityCheck.current < RESUME_DEBOUNCE_MS) return;
      lastVisibilityCheck.current = now;

      useConnectivityStore.getState().checkConnectivity();

      if (!useTwitchStore.getState().isAuthenticated) return;
      twitchAuthStatus()
        .then((status) => {
          useTwitchStore.getState().setIsAuthenticated(status.authenticated);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Story 19.10: Twitch polling from settings (interval 0 = manual only; twitchEnabled off = no polling).
  //
  // Story C3 polling fallback: when EventSub is connected (push-based live alerts),
  // we keep the poll loop alive but stretch the cadence to every 10 minutes. The
  // poll then only catches the edge cases EventSub cannot — power-followers past
  // the 145-broadcaster cap and any events dropped during a brief reconnect.
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const twitchRefreshInterval = useSettingsStore((s) => s.twitchRefreshInterval);
  const [eventsubConnected, setEventsubConnected] = React.useState(false);
  useTauriEvent<{ connected: boolean }>("twitch-eventsub-status", (payload) => {
    setEventsubConnected(Boolean(payload?.connected));
  });
  React.useEffect(() => {
    if (!twitchEnabled || twitchRefreshInterval <= 0) return;
    const baseMs = twitchRefreshInterval * 1000;
    const fallbackMs = 10 * 60 * 1000;
    const intervalMs = eventsubConnected ? Math.max(baseMs, fallbackMs) : baseMs;
    const id = setInterval(() => {
      if (!useTwitchStore.getState().isAuthenticated) return;
      useConnectivityStore.getState().checkConnectivity();
      useTwitchStore.getState().fetchFollowedStreams();
      useTwitchStore.getState().fetchTrending();
    }, intervalMs);
    return () => clearInterval(id);
  }, [twitchEnabled, twitchRefreshInterval, eventsubConnected]);

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
        refreshGames().catch(() => {});
      },
    });
  }, []);

  React.useEffect(() => {
    if (
      prevSyncActiveRef.current &&
      !syncIsActive &&
      overallTotal > 0 &&
      overallCompleted === overallTotal
    ) {
      refreshGames().catch(() => {});
    }
    prevSyncActiveRef.current = syncIsActive;
  }, [syncIsActive, overallCompleted, overallTotal]);

  const handleResync = React.useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const existingGames = useGameStore.getState().games;
      const existingIds = new Set(existingGames.map((g) => g.id));
      const scanResult = await invoke<{ games: unknown[] }>("scan_sources");
      const confirmed = await invoke<Game[]>("confirm_games", { detectedGames: scanResult.games });
      await invoke("relink_play_sessions");
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

  const games = useGameStore((s) => s.games);
  const collectionLabels = React.useMemo(
    () => collections.filter((c) => !c.isSmart).map((c) => `${c.icon} ${c.name}`),
    [collections],
  );
  const handleLibraryEditGame = React.useCallback((game: Game) => {
    setEditGameTarget(game);
  }, []);
  const handleLibrarySearchMetadata = React.useCallback((game: Game) => {
    setMetadataSearchGame(game);
  }, []);
  const handleLibraryRefetchMetadata = React.useCallback(
    async (game: Game) => {
      await invoke("fetch_metadata", { gameId: game.id });
      await refreshGames();
    },
    [refreshGames],
  );
  const handleLibraryHideGame = React.useCallback((game: Game) => {
    invoke("update_game", { id: game.id, fields: { isHidden: true } })
      .then(() => {
        useSettingsStore.getState().hideGame(game.id);
        useUiStore.getState().setDetailOverlayGameId(null);
      })
      .catch(() => {});
  }, []);
  const handleLibraryOpenFolder = React.useCallback((game: Game) => {
    if (game.folderPath) openPath(game.folderPath).catch(() => {});
  }, []);
  const handleLibrarySetStatus = React.useCallback(
    (gameId: string, status: GameStatus) => {
      invoke("update_game", { id: gameId, fields: { status } })
        .then(() => refreshGames())
        .then(() => {
          if (status === "completed" || status === "dropped") {
            const qs = useQueueStore.getState();
            if (qs.isQueued(gameId)) {
              const entry = qs.entries.find((e) => e.gameId === gameId);
              qs.remove(gameId, entry?.name);
            }
            // Epic 41: trigger retirement ceremony when game is retired.
            if (useSettingsStore.getState().retirementCeremonyEnabled) {
              useCeremonyStore.getState().openForGame(gameId, "retirement").catch(() => {});
            }
          }
        })
        .catch(() => {});
    },
    [],
  );
  const handleLibrarySetRating = React.useCallback(
    (gameId: string, rating: number | null) => {
      invoke("update_game", { id: gameId, fields: { rating } })
        .then(() => refreshGames())
        .catch(() => {});
    },
    [],
  );
  const handleLibraryAddToCollection = React.useCallback(
    (gameId: string, collectionLabel: string) => {
      if (collectionLabel === "__new__") {
        const game = games.find((g) => g.id === gameId);
        if (game) {
          gameIdToAddToNewCollectionRef.current = game.id;
          setCollectionEditorOpen(true);
        }
        return;
      }
      const collection = collections.find((c) => `${c.icon} ${c.name}` === collectionLabel);
      if (collection) {
        invoke("add_to_collection", { collectionId: collection.id, gameId })
          .then(() => useCollectionStore.getState().addGameToCollection(collection.id, gameId))
          .catch(() => {});
      }
    },
    [games, collections],
  );
  const handleRemoveFromCollection = React.useCallback(
    (gameId: string) => {
      const collectionId = useCollectionStore.getState().activeCollectionId;
      if (!collectionId) return;
      invoke("remove_from_collection", { collectionId, gameId })
        .then(() => useCollectionStore.getState().removeGameFromCollection(collectionId, gameId))
        .catch(() => {});
    },
    [],
  );
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const activeManualCollectionName = React.useMemo(() => {
    const active = collections.find((c) => c.id === activeCollectionId);
    return active && !active.isSmart ? active.name : null;
  }, [collections, activeCollectionId]);

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
      onPlayGame={(gameId) => {
        const game = useGameStore.getState().games.find((g) => g.id === gameId);
        if (game) launch(game);
      }}
      onStopGame={async () => {
        const session = useGameStore.getState().activeSession;
        if (session) {
          const startMs = new Date(session.startedAt).getTime();
          const durationS = Math.floor((Date.now() - startMs) / 1000);
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
            useSessionNoteStore.getState().enqueue({
              sessionId: session.sessionId,
              gameName: session.gameName,
              durationS,
            });
          }
          await refreshGames();

          // Refresh derived stores so the Stats screen / XP / streak / mastery
          // reflect the just-ended session without requiring an app restart.
          if (session.hasDbSession) {
            useGameStore.getState().bumpSessionEnded();
            useStreakStore.getState().refreshAfterSession();
            useMasteryStore.getState().refreshGame(session.gameId);
            useAchievementStore.getState().evaluate();
            useXpStore.getState().refreshXp().then(() => {
              const summary = useXpStore.getState().summary;
              if (summary?.leveledUp && summary.newLevel) {
                useXpStore.getState().showLevelUp(summary.newLevel, summary.totalXp);
              }
            });
          }
        }
      }}
      onGameDetails={(gameId) => {
        useUiStore.getState().setDetailOverlayGameId(gameId);
      }}
      onForceIdentify={handleForceIdentify}
    >
      {activeNav === "achievements" ? (
        <AchievementsView />
      ) : activeNav === "wrapped" ? (
        <WrappedView onClose={() => useUiStore.getState().setActiveNav("stats")} />
      ) : activeNav === "twitch" ? (
        <TwitchPanel />
      ) : activeNav === "stats" ? (
        <LibraryStats
          onOpenWrapped={() => useUiStore.getState().setActiveNav("wrapped")}
        />
      ) : activeNav === "completed" ? (
        <CompletedView />
      ) : activeNav === "archive" ? (
        <ArchiveView />
      ) : (
        <LibraryView
          onPlay={(game) => launch(game)}
          onSettingsClick={() => setSettingsOpen(true)}
          onResync={handleResync}
          isSyncing={isSyncing}
          syncResult={syncResult}
          onEdit={handleLibraryEditGame}
          onRefetchMetadata={handleLibraryRefetchMetadata}
          onSearchMetadata={handleLibrarySearchMetadata}
          onHide={handleLibraryHideGame}
          onOpenFolder={handleLibraryOpenFolder}
          onSetStatus={handleLibrarySetStatus}
          onSetRating={handleLibrarySetRating}
          onAddToCollection={handleLibraryAddToCollection}
          onRemoveFromCollection={handleRemoveFromCollection}
          activeCollectionName={activeManualCollectionName}
          collections={collectionLabels}
        />
      )}
      <GameDetailOverlay>
        {(game) => {
          const gameIsArchived = game.status === "removed";
          return (
            <DetailContent
              game={game}
              isPlaying={activeSession?.gameId === game.id}
              processDetected={activeSession?.gameId === game.id ? activeSession?.processDetected : undefined}
              isArchived={gameIsArchived}
              youtubeId={game.trailerUrl ? extractYoutubeId(game.trailerUrl) : null}
              collections={collections
                .filter((c) => c.gameIds.includes(game.id))
                .map((c) => `${c.icon} ${c.name}`)}
              onPlay={() => launch(game)}
              onForceIdentify={handleForceIdentify}
              onStatusChange={(status) => {
                if (gameIsArchived) {
                  const nextCompleted = status === "completed";
                  const wasCompleted = game.completed;
                  invoke("update_game", {
                    id: game.id,
                    fields: { completed: nextCompleted },
                  })
                    .then(() => refreshGames())
                    .then(() => {
                      // Epic 41: archived games stay status = "removed" so we
                      // trigger off the `completed` flag transitioning to true.
                      if (
                        nextCompleted &&
                        !wasCompleted &&
                        useSettingsStore.getState().retirementCeremonyEnabled
                      ) {
                        useCeremonyStore
                          .getState()
                          .openForGame(game.id, "retirement")
                          .catch(() => {});
                      }
                    })
                    .catch(() => {});
                } else {
                  invoke("update_game", { id: game.id, fields: { status } })
                    .then(() => refreshGames())
                    .then(() => {
                      if (status === "completed" || status === "dropped") {
                        const qs = useQueueStore.getState();
                        if (qs.isQueued(game.id)) {
                          qs.remove(game.id, game.name);
                        }
                        // Epic 41: trigger retirement ceremony when game is retired.
                        if (useSettingsStore.getState().retirementCeremonyEnabled) {
                          useCeremonyStore.getState().openForGame(game.id, "retirement").catch(() => {});
                        }
                      }
                    })
                    .catch(() => {});
                }
              }}
              onRatingChange={(rating) => {
                invoke("update_game", { id: game.id, fields: { rating } })
                  .then(() => refreshGames())
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
          );
        }}
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
                gameIdToAddToNewCollectionRef.current = addToCollectionTarget.id;
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
      <UpdateAvailableDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
      />
      <ProcessPickerModal
        open={showProcessPicker}
        gameName={activeSession?.gameName ?? ""}
        onProcessSelected={handleProcessSelected}
        onCancel={handleProcessPickerCancel}
      />
      <SessionNotePromptWrapper />
      <TwitchToastContainer />
      <MilestoneToastStack />
      <LevelUpToast />
      <AchievementNotificationQueue />
      <ToastNotifications />
      <RetirementCeremony />
      <CollectionEditor
        open={collectionEditorOpen}
        onClose={() => {
          setCollectionEditorOpen(false);
          setEditCollectionTarget(null);
          gameIdToAddToNewCollectionRef.current = null;
        }}
        editCollection={editCollectionTarget}
        onSave={(data) => {
          if (editCollectionTarget) {
            const fields: Record<string, unknown> = {
              name: data.name,
              icon: data.icon,
              color: data.color,
            };
            if (editCollectionTarget.isSmart) {
              fields.rulesJson = data.rulesJson;
            }
            invoke("update_collection", { id: editCollectionTarget.id, fields })
              .then(() => {
                const storeUpdates: Partial<Collection> = {
                  name: data.name,
                  icon: data.icon,
                  color: data.color,
                };
                if (editCollectionTarget.isSmart) {
                  storeUpdates.rulesJson = data.rulesJson;
                }
                useCollectionStore.getState().updateCollection(editCollectionTarget.id, storeUpdates);
                if (editCollectionTarget.isSmart && data.rulesJson) {
                  invoke<string[]>("evaluate_smart_collection", { rulesJson: data.rulesJson })
                    .then((ids) => {
                      useCollectionStore.getState().updateCollection(editCollectionTarget.id, { gameIds: ids });
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          } else {
            const gameIdToAdd = gameIdToAddToNewCollectionRef.current;
            gameIdToAddToNewCollectionRef.current = null;
            invoke<{ id: string; name: string; icon: string | null; color: string | null; sortOrder: number; isSmart: boolean; rulesJson: string | null }>(
              "create_collection",
              { name: data.name, icon: data.icon, color: data.color, isSmart: data.isSmart, rulesJson: data.rulesJson },
            )
              .then((created) => {
                const store = useCollectionStore.getState();
                store.addCollection({
                  id: created.id,
                  name: created.name,
                  icon: created.icon ?? "",
                  color: created.color,
                  sortOrder: created.sortOrder,
                  isSmart: created.isSmart,
                  rulesJson: created.rulesJson,
                  gameIds: [],
                });
                if (created.isSmart && data.rulesJson) {
                  invoke<string[]>("evaluate_smart_collection", { rulesJson: data.rulesJson })
                    .then((ids) => {
                      useCollectionStore.getState().updateCollection(created.id, { gameIds: ids });
                    })
                    .catch(() => {});
                } else if (gameIdToAdd) {
                  invoke("add_to_collection", { collectionId: created.id, gameId: gameIdToAdd })
                    .then(() => useCollectionStore.getState().addGameToCollection(created.id, gameIdToAdd))
                    .catch(() => {});
                }
              })
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

  // `CloseDialogHost` must live OUTSIDE the onboarding/main switch so the
  // `nexus://show-close-dialog` listener and dialog render are mounted in every
  // state -- otherwise the titlebar close button does nothing during onboarding
  // (Rust prevents the close and emits the event, but no one is listening).
  return (
    <>
      <CloseDialogHost />
      {!isOnboardingCompleted ? (
        <OnboardingWizard>
          {{
            welcome: <WelcomeStep />,
            steamgriddb: <SteamGridDBStep />,
            igdb: <IGDBStep />,
            sources: <SourcesStep />,
            confirm: <ConfirmLibraryStep />,
          }}
        </OnboardingWizard>
      ) : (
        <MainApp />
      )}
    </>
  );
}

export default App;
