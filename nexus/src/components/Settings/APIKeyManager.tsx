import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settingsStore";
import { Eye, EyeOff, Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
}

function KeyField({
  label: _label,
  value,
  settingKey,
  testId,
  onSaved,
}: {
  label: string;
  value: string;
  settingKey: string;
  testId: string;
  onSaved: (newValue: string) => void;
}) {
  const [show, setShow] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      await invoke("set_setting", { key: settingKey, value: draft });
      onSaved(draft);
      setEditing(false);
    } catch {
      // best-effort
    } finally {
      setSaving(false);
    }
  }, [draft, settingKey, onSaved]);

  const handleCancel = React.useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          data-testid={`${testId}-input`}
          type="text"
          className="flex-1 rounded-md border border-border bg-input px-2 py-1 font-mono text-xs text-foreground"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <button
          data-testid={`${testId}-save`}
          className="text-success hover:text-success/80"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </button>
        <button
          data-testid={`${testId}-cancel`}
          className="text-muted-foreground hover:text-foreground"
          onClick={handleCancel}
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  if (!value) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <code
        data-testid={`${testId}-masked`}
        className="flex-1 rounded bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground"
      >
        {show ? value : maskKey(value)}
      </code>
      <button
        data-testid={`${testId}-toggle-show`}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        data-testid={`${testId}-edit`}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}

export function APIKeyManager() {
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);

  const steamgridStatus = apiKeys.steamGridDbKey ? "configured" : "not set";
  const igdbStatus = apiKeys.igdbClientId && apiKeys.igdbClientSecret ? "configured" : "not set";

  return (
    <section data-testid="api-key-manager">
      <h3 className="mb-3 text-sm font-semibold text-foreground">API Keys</h3>

      {/* SteamGridDB */}
      <div data-testid="steamgrid-key-section" className="mb-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">SteamGridDB</span>
          <span
            data-testid="steamgrid-status"
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              steamgridStatus === "configured" ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground",
            )}
          >
            {steamgridStatus === "configured" ? "✓ Configured" : "Not set"}
          </span>
        </div>
        <KeyField
          label="SteamGridDB Key"
          value={apiKeys.steamGridDbKey}
          settingKey="steamgrid_api_key"
          testId="steamgrid"
          onSaved={(v) => setApiKeys({ steamGridDbKey: v })}
        />
        {!apiKeys.steamGridDbKey && (
          <Button
            data-testid="steamgrid-add"
            variant="ghost"
            size="xs"
            className="mt-2 gap-1 text-xs"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>('[data-testid="steamgrid-input"]');
              if (!el) {
                setApiKeys({ steamGridDbKey: " " });
                setTimeout(() => setApiKeys({ steamGridDbKey: "" }), 0);
              }
            }}
          >
            <Pencil className="size-3" /> Add Key
          </Button>
        )}
      </div>

      {/* IGDB */}
      <div data-testid="igdb-key-section" className="mb-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">IGDB / Twitch</span>
          <span
            data-testid="igdb-status"
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              igdbStatus === "configured" ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground",
            )}
          >
            {igdbStatus === "configured" ? "✓ Configured" : "Not set"}
          </span>
        </div>
        <KeyField
          label="Client ID"
          value={apiKeys.igdbClientId}
          settingKey="igdb_client_id"
          testId="igdb-id"
          onSaved={(v) => setApiKeys({ igdbClientId: v })}
        />
        <KeyField
          label="Client Secret"
          value={apiKeys.igdbClientSecret}
          settingKey="igdb_client_secret"
          testId="igdb-secret"
          onSaved={(v) => setApiKeys({ igdbClientSecret: v })}
        />
      </div>

      <Button
        data-testid="run-setup-wizard"
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => {
          invoke("set_setting", { key: "onboarding_completed", value: "false" }).catch(() => {});
          window.location.reload();
        }}
      >
        Run Setup Wizard
      </Button>
    </section>
  );
}
