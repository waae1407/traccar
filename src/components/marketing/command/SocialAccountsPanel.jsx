import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook, RefreshCw, Plug, PlugZap } from "lucide-react";

const ICONS = { instagram: Instagram, facebook_pages: Facebook, x: null };

const STATUS_STYLE = {
  connected: "bg-green-500/15 text-green-400 border-green-500/30",
  not_connected: "bg-muted text-muted-foreground border-border",
  expired: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SocialAccountsPanel({ accounts, onChanged }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const call = async (payload, label) => {
    setBusy(label);
    setMessage("");
    try {
      const res = await base44.functions.invoke("marketingControl", payload);
      const results = res.data?.results || [];
      setMessage(results.map((item) => `${item.platform}: ${item.status}${item.error ? ` (${item.error})` : ""}`).join(" · ") || "Done");
      await onChanged();
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-syne text-lg font-bold">Social accounts</h2>
        <Button size="sm" variant="outline" disabled={busy === "sync"} onClick={() => call({ action: "sync_accounts" }, "sync")}>
          <RefreshCw className={`w-4 h-4 mr-1 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync all
        </Button>
      </div>

      <div className="space-y-3">
        {accounts.map((account) => {
          const Icon = ICONS[account.platform];
          return (
            <div key={account.platform} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {account.profile_image_url ? (
                    <img src={account.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : Icon ? (
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <span className="text-sm font-bold">X</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{account.account_name || account.platform_label}</p>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[account.connection_status] || STATUS_STYLE.not_connected}`}>
                      {String(account.connection_status).replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{account.account_handle || account.platform_label}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
                    <span>Publish: {account.can_publish ? "granted" : "missing"}</span>
                    <span>Analytics: {account.can_read_analytics ? "granted" : "missing"}</span>
                    <span>Limit: {account.character_limit || "—"} chars</span>
                    <span>Last post: {formatDate(account.last_published_at)}</span>
                    <span>Synced: {formatDate(account.last_synced_at)}</span>
                    <span>Token: {account.token_expires_at ? formatDate(account.token_expires_at) : "managed by connector"}</span>
                  </div>
                  {account.last_error && <p className="text-[11px] text-red-400 mt-1">{account.last_error}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" disabled={busy === account.platform} onClick={() => call({ action: "test_connection", platform: account.platform }, account.platform)}>
                  <PlugZap className="w-3.5 h-3.5 mr-1" /> Test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === `${account.platform}-off`}
                  onClick={async () => {
                    setBusy(`${account.platform}-off`);
                    await base44.entities.SocialAccount.update(account.id, { publishing_enabled: false, can_publish: false });
                    await onChanged();
                    setBusy("");
                  }}
                >
                  <Plug className="w-3.5 h-3.5 mr-1" /> Disconnect
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Connections are authorized once by the app owner. Disconnecting here stops publishing for that platform; revoke the app's access in the platform's own settings to remove the grant.
      </p>
      {message && <p className="text-xs text-muted-foreground mt-2">{message}</p>}
    </div>
  );
}