import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";
import { useToastStore } from "@/stores/toastStore";
import { useTwitchStore } from "@/stores/twitchStore";

function getErrorMessage(err: unknown): string {
  if (err == null) return "Something went wrong.";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function TwitchConnectPrompt() {
  const [loading, setLoading] = React.useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const setIsAuthenticated = useTwitchStore((s) => s.setIsAuthenticated);
  const fetchFollowedStreams = useTwitchStore((s) => s.fetchFollowedStreams);

  const handleConnect = React.useCallback(async () => {
    setLoading(true);
    console.log("[TwitchConnect] invoking twitch_auth_start...");
    try {
      await invoke("twitch_auth_start");
      console.log("[TwitchConnect] invoke resolved OK, setting authenticated");
      setIsAuthenticated(true);
      fetchFollowedStreams();
    } catch (err) {
      console.error("[TwitchConnect] auth failed:", err);
      console.error("[TwitchConnect] error type:", typeof err, JSON.stringify(err));
      const message = getErrorMessage(err);
      addToast({ type: "error", message, duration: 8000 });
    } finally {
      setLoading(false);
    }
  }, [addToast, setIsAuthenticated, fetchFollowedStreams]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <TwitchIcon
        className="size-12 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Connect your Twitch account
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          See which of your followed streamers are live, right from Nexus.
        </p>
      </div>
      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none"
        aria-label="Connect with Twitch"
        aria-busy={loading}
      >
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <TwitchIcon className="size-4 shrink-0" aria-hidden />
        )}
        {loading ? "Opening browser…" : "Connect with Twitch"}
      </button>
    </div>
  );
}
