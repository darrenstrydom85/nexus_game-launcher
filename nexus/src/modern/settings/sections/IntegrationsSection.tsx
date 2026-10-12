import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";
import { useSettingsStore, type ApiKeys } from "@/stores/settingsStore";
import { DANGER_BUTTON, RowIcon, SettingsCard, SettingsRow, ToggleRow } from "../SettingsKit";
import { errorMessage, maskKey, runSetupWizard, useApiKeys, type KeyCheck, type KeyProvider } from "../hooks/useApiKeys";
import { fmtDurationSecs, fmtTimestamp, useTwitchAccount, useTwitchDiagnostics } from "../hooks/useTwitchSettings";

const INPUT =
  "h-[34px] min-w-0 flex-[1_1_220px] rounded-lg border border-input bg-background/60 px-3 font-mono text-[13px] text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const PILL = "inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-semibold";
const PILL_GOOD = "bg-green-500/12 text-green-700 dark:text-green-400";
const PILL_MUTED = "bg-secondary text-muted-foreground";
const PILL_BAD = "bg-destructive/12 text-destructive";
const LINK = "rounded-sm font-medium text-foreground underline decoration-border underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring";

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

// ── API keys ──────────────────────────────────────────────────────────────

interface KeyFieldDef {
  key: keyof ApiKeys;
  /** Shown before the masked value when a provider has more than one field. */
  label: string;
  /** Accessible name of the input. */
  inputLabel: string;
  testId: string;
}

interface ProviderDef {
  id: KeyProvider;
  name: string;
  /** "SteamGridDB key" / "IGDB keys", for button names and the remove dialog. */
  noun: string;
  purpose: string;
  help: React.ReactNode;
  fields: KeyFieldDef[];
  removeDescription: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "steamgrid",
    name: "SteamGridDB",
    noun: "SteamGridDB key",
    purpose: "Cover art, hero images and logos",
    help: (
      <>
        Paste the key from <ExtLink href="https://www.steamgriddb.com/profile/preferences/api">steamgriddb.com</ExtLink>, under Preferences → API.
      </>
    ),
    fields: [{ key: "steamGridDbKey", label: "Key", inputLabel: "SteamGridDB API key", testId: "steamgrid" }],
    removeDescription: "Nexus stops fetching new cover art, hero images and logos until you add a key again.",
  },
  {
    id: "igdb",
    name: "IGDB / Twitch app",
    noun: "IGDB keys",
    purpose: "Descriptions, genres, release dates and time to beat",
    help: (
      <>
        Copy both from your app at <ExtLink href="https://dev.twitch.tv/console/apps">dev.twitch.tv</ExtLink>. Generate a new secret if you don’t have one.
      </>
    ),
    fields: [
      { key: "igdbClientId", label: "Client ID", inputLabel: "IGDB client ID", testId: "igdb-id" },
      { key: "igdbClientSecret", label: "Secret", inputLabel: "IGDB client secret", testId: "igdb-secret" },
    ],
    removeDescription: "Nexus stops fetching game details from IGDB until you add the client ID and secret again.",
  },
];

function statusPill(configured: boolean, partial: boolean, check: KeyCheck | undefined): { label: string; tone: string } {
  if (!configured) return { label: partial ? "Incomplete" : "Not set", tone: PILL_MUTED };
  if (check?.state === "checking") return { label: "Checking…", tone: PILL_MUTED };
  if (check?.state === "invalid") return { label: "Rejected", tone: PILL_BAD };
  return { label: "Configured", tone: PILL_GOOD };
}

function KeyRow({
  provider,
  values,
  check,
  onSave,
  onRemove,
}: {
  provider: ProviderDef;
  values: ApiKeys;
  check: KeyCheck | undefined;
  onSave: (keys: Partial<ApiKeys>) => Promise<void>;
  onRemove: () => void;
}) {
  const { id, fields, noun } = provider;
  const [editing, setEditing] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Partial<ApiKeys>>({});
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  const restoreFocus = React.useRef(false);

  const hasAny = fields.some((f) => values[f.key]);
  const configured = fields.every((f) => values[f.key]);
  const canSave = !saving && fields.every((f) => (drafts[f.key] ?? "").trim());
  const pill = statusPill(configured, hasAny, check);

  // After the editor closes or the key is removed, put focus back on Edit / Add.
  React.useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing, hasAny]);

  const startEditing = () => {
    setDrafts(Object.fromEntries(fields.map((f) => [f.key, values[f.key]])));
    setSaveError(null);
    setEditing(true);
  };

  const stopEditing = () => {
    restoreFocus.current = true;
    setSaveError(null);
    setEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(drafts);
      setRevealed(false);
      stopEditing();
    } catch (err) {
      setSaveError(`Couldn’t save: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <SettingsRow data-testid={`${id}-key-row`} label={provider.name} description={provider.help} stacked>
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              stopEditing();
            }
          }}
        >
          {fields.map((f, i) => (
            <input
              key={f.key}
              data-testid={`${f.testId}-input`}
              aria-label={f.inputLabel}
              placeholder={f.inputLabel}
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoFocus={i === 0}
              className={INPUT}
              value={drafts[f.key] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          ))}
          <Button type="submit" size="sm" data-testid={`${id}-save`} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" size="sm" data-testid={`${id}-cancel`} onClick={stopEditing}>
            Cancel
          </Button>
          {saveError && (
            <p role="alert" className="w-full text-[12.5px] text-destructive">
              {saveError}
            </p>
          )}
        </form>
      </SettingsRow>
    );
  }

  const description = hasAny ? (
    <>
      {fields.map((f) => (
        <span key={f.key} className="block">
          {fields.length > 1 && <span>{f.label} </span>}
          {values[f.key] ? (
            <span data-testid={`${f.testId}-masked`} className="break-all font-mono tabular-nums">
              {revealed ? values[f.key] : maskKey(values[f.key])}
            </span>
          ) : (
            "not set"
          )}
        </span>
      ))}
      {check?.state === "invalid" && <span className="block text-destructive">{check.message}</span>}
    </>
  ) : (
    provider.purpose
  );

  return (
    <>
      <SettingsRow data-testid={`${id}-key-row`} label={provider.name} description={description}>
        <span role="status" data-testid={`${id}-status`} className={cn(PILL, pill.tone)}>
          {pill.label}
        </span>
        {hasAny && (
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid={`${id}-toggle-show`}
            aria-label={`Show ${noun}`}
            aria-pressed={revealed}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
          </Button>
        )}
        <Button
          ref={editButtonRef}
          variant="outline"
          size="sm"
          data-testid={`${id}-${hasAny ? "edit" : "add"}`}
          aria-label={`${hasAny ? "Edit" : "Add"} ${noun}`}
          onClick={startEditing}
        >
          {hasAny ? "Edit" : "Add"}
        </Button>
        {hasAny && (
          <Button
            variant="outline"
            size="sm"
            className={DANGER_BUTTON}
            data-testid={`${id}-remove`}
            aria-label={`Remove ${noun}`}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        )}
      </SettingsRow>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${noun}?`}
        description={provider.removeDescription}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          restoreFocus.current = true;
          setRevealed(false);
          onRemove();
        }}
      />
    </>
  );
}

function ApiKeysCard() {
  const { apiKeys, checks, save, remove } = useApiKeys();

  return (
    <SettingsCard title="API keys" data-testid="api-key-manager">
      {PROVIDERS.map((p) => (
        <KeyRow
          key={p.id}
          provider={p}
          values={apiKeys}
          check={checks[p.id]}
          onSave={(keys) => save(p.id, keys)}
          onRemove={() => remove(p.id)}
        />
      ))}
      <SettingsRow label="Setup wizard" description="Go through first-time setup again. Steps for keys you’ve already added are skipped.">
        <Button variant="outline" size="sm" data-testid="run-setup-wizard" onClick={() => void runSetupWizard()}>
          Run wizard
        </Button>
      </SettingsRow>
    </SettingsCard>
  );
}

// ── Twitch ────────────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 120, label: "Every 2 minutes" },
  { value: 300, label: "Every 5 minutes" },
  { value: 0, label: "Manual only" },
] as const;

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      />
    );
  }
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
      {(name ?? "T").slice(0, 1).toUpperCase()}
    </span>
  );
}

function TwitchCard() {
  const account = useTwitchAccount();
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const setTwitchEnabled = useSettingsStore((s) => s.setTwitchEnabled);
  const refreshInterval = useSettingsStore((s) => s.twitchRefreshInterval);
  const setRefreshInterval = useSettingsStore((s) => s.setTwitchRefreshInterval);
  const notificationsEnabled = useSettingsStore((s) => s.twitchNotificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setTwitchNotificationsEnabled);
  const favouritesOnly = useSettingsStore((s) => s.twitchNotificationsFavoritesOnly);
  const setFavouritesOnly = useSettingsStore((s) => s.setTwitchNotificationsFavoritesOnly);

  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const [confirmTurnOff, setConfirmTurnOff] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const connectRef = React.useRef<HTMLButtonElement>(null);
  const focusConnect = React.useRef(false);

  // After disconnecting, the Disconnect button is gone; move focus to Connect.
  React.useEffect(() => {
    if (!account.isAuthenticated && focusConnect.current) {
      focusConnect.current = false;
      connectRef.current?.focus();
    }
  }, [account.isAuthenticated]);

  return (
    <SettingsCard title="Twitch" data-testid="twitch-settings">
      {account.isAuthenticated ? (
        <SettingsRow
          data-testid="twitch-account"
          leading={<Avatar url={account.avatarUrl} name={account.displayName} />}
          label={account.displayName ? `Connected as ${account.displayName}` : "Connected"}
          description="Followed channels, go-live alerts and trending games"
        >
          <Button
            variant="outline"
            size="sm"
            className={DANGER_BUTTON}
            aria-label="Disconnect Twitch"
            disabled={account.disconnecting}
            onClick={() => setConfirmDisconnect(true)}
          >
            {account.disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </SettingsRow>
      ) : (
        <SettingsRow
          data-testid="twitch-account"
          leading={
            <RowIcon>
              <TwitchIcon className="size-[18px]" />
            </RowIcon>
          }
          label="Twitch account"
          description="Not connected. Sign in to see who’s live and get go-live alerts."
        >
          <Button ref={connectRef} size="sm" disabled={account.connecting} aria-busy={account.connecting} onClick={() => void account.connect()}>
            <TwitchIcon className="size-3.5" />
            {account.connecting ? "Connecting…" : "Connect Twitch"}
          </Button>
        </SettingsRow>
      )}
      <ToggleRow
        data-testid="twitch-notifications-enabled"
        label="Go-live notifications"
        description="Tell me when a channel I follow goes live"
        checked={notificationsEnabled}
        onCheckedChange={setNotificationsEnabled}
      />
      <ToggleRow
        data-testid="twitch-notifications-favorites-only"
        label="Favourites only"
        description="Only notify for favourite channels"
        checked={favouritesOnly}
        onCheckedChange={setFavouritesOnly}
        disabled={!notificationsEnabled}
      />
      <SettingsRow label="Refresh interval" description="How often Nexus checks who’s live">
        <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
          <SelectTrigger aria-label="Refresh interval" data-testid="twitch-refresh-interval" className="h-[34px] min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFRESH_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <ToggleRow
        data-testid="twitch-enabled"
        label="Show Twitch tab"
        description="Turn off to hide Twitch everywhere in Nexus"
        checked={twitchEnabled}
        onCheckedChange={(on) => (on ? setTwitchEnabled(true) : setConfirmTurnOff(true))}
      />
      <SettingsRow label="Cached data" description="Saved channel and stream details. Fresh data loads on the next refresh.">
        <Button
          variant="outline"
          size="sm"
          className={DANGER_BUTTON}
          data-testid="twitch-clear-cache"
          aria-label="Clear Twitch cached data"
          disabled={account.clearingCache}
          onClick={() => setConfirmClear(true)}
        >
          {account.clearingCache ? "Clearing…" : "Clear"}
        </Button>
      </SettingsRow>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Twitch?"
        description="You’ll stop getting live channel updates and go-live alerts. You can connect again any time."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          focusConnect.current = true;
          void account.disconnect();
        }}
      />
      <ConfirmDialog
        open={confirmTurnOff}
        onOpenChange={setConfirmTurnOff}
        title="Turn off Twitch?"
        description="This hides the Twitch tab and every Twitch feature. You stay connected, so turning it back on picks up where you left off."
        confirmLabel="Turn off"
        onConfirm={() => setTwitchEnabled(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear Twitch cache?"
        description="Saved channel and stream details are removed. Fresh data loads on the next refresh."
        confirmLabel="Clear"
        destructive
        onConfirm={() => void account.clearCache()}
      />
    </SettingsCard>
  );
}

// ── Diagnostics ───────────────────────────────────────────────────────────

function DiagItem({ label, value, testId, title }: { label: string; value: React.ReactNode; testId?: string; title?: string }) {
  return (
    <div data-testid={testId} className="flex min-w-0 items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd title={title} className="min-w-0 truncate text-right font-mono text-xs tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function TwitchDiagnosticsCard() {
  const [open, setOpen] = React.useState(false);
  const { diag, error, testing, lastTest, copied, testConnection, copy } = useTwitchDiagnostics(open);
  const bodyId = React.useId();

  return (
    <SettingsCard title="Twitch diagnostics">
      <SettingsRow label="Connection details" description="Sign-in token, rate limit and live-event status. Updates every 5 seconds while shown.">
        <Button
          variant="outline"
          size="sm"
          data-testid="twitch-diagnostics-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </SettingsRow>
      {open && (
        <div id={bodyId} data-testid="twitch-diagnostics-body" className="divide-y divide-border/70">
          <div className="px-[18px] py-2.5">
            {error && (
              <p role="alert" className="py-1.5 text-[12.5px] text-destructive">
                {error}
              </p>
            )}
            {diag ? (
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <DiagItem label="Signed in" value={diag.tokenAuthenticated ? "Yes" : "No"} testId="diag-authenticated" />
                <DiagItem label="Account" value={diag.displayName ?? "—"} />
                <DiagItem label="Token expires in" value={fmtDurationSecs(diag.tokenExpiresInSecs)} testId="diag-expires-in" />
                <DiagItem label="Token expires at" value={fmtTimestamp(diag.tokenExpiresAt)} />
                <DiagItem label="Last refresh" value={fmtTimestamp(diag.lastRefreshAt)} testId="diag-last-refresh" />
                {diag.lastRefreshError && (
                  <DiagItem label="Last refresh error" value={<span className="text-destructive">{diag.lastRefreshError}</span>} title={diag.lastRefreshError} />
                )}
                <DiagItem label="Rate limit used" value={`${diag.rateLimit.tokensUsed} / ${diag.rateLimit.cap}`} testId="diag-rate-limit" />
                <DiagItem label="Rate limit resets" value={fmtTimestamp(diag.rateLimit.windowResetAt || null)} />
                <DiagItem label="EventSub connected" value={diag.eventsubConnected ? "Yes" : "No"} testId="diag-eventsub-connected" />
                <DiagItem label="EventSub session" value={diag.eventsubSessionId ?? "—"} title={diag.eventsubSessionId ?? undefined} />
                <DiagItem label="EventSub subscriptions" value={String(diag.eventsubSubscriptionCount)} />
                <DiagItem label="Last event" value={fmtTimestamp(diag.lastEventAt)} />
              </dl>
            ) : (
              !error && <p className="py-1.5 text-[12.5px] text-muted-foreground">Loading…</p>
            )}
          </div>
          <SettingsRow
            label="Test connection"
            description={
              <span
                role="status"
                data-testid={lastTest ? "twitch-test-connection-result" : undefined}
                className={cn(lastTest && (lastTest.ok ? "text-green-700 dark:text-green-400" : "text-destructive"))}
              >
                {lastTest
                  ? lastTest.ok
                    ? `Connected · ${lastTest.latencyMs} ms`
                    : `Failed: ${lastTest.error ?? "unknown error"}`
                  : "Check that Nexus can reach Twitch with your sign-in"}
              </span>
            }
          >
            <Button variant="outline" size="sm" data-testid="twitch-diagnostics-copy" disabled={!diag} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy details"}
            </Button>
            <Button variant="outline" size="sm" data-testid="twitch-test-connection" disabled={testing} onClick={() => void testConnection()}>
              {testing ? "Testing…" : "Test"}
            </Button>
          </SettingsRow>
        </div>
      )}
    </SettingsCard>
  );
}

export function IntegrationsSection() {
  return (
    <>
      <ApiKeysCard />
      <TwitchCard />
      <TwitchDiagnosticsCard />
    </>
  );
}
