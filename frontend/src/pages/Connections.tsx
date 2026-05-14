import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2Icon, ExternalLinkIcon, MegaphoneIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  disconnectMeta,
  getMetaStatus,
  listMetaAdAccounts,
  startMetaConnect,
  type MetaAdAccount,
  type MetaStatus,
} from "../lib/meta-api";

export function ConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = params.get("meta");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const next = await getMetaStatus();
      setStatus(next);
      if (next.connected) {
        try {
          const list = await listMetaAdAccounts();
          setAccounts(list.accounts);
        } catch (err) {
          setAccounts([]);
          setError(err instanceof Error ? err.message : "Failed to load ad accounts");
        }
      } else {
        setAccounts(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Meta status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (flash === "connected" || flash === "error") {
      const timeout = setTimeout(() => {
        const next = new URLSearchParams(params);
        next.delete("meta");
        setParams(next, { replace: true });
      }, 4000);
      return () => clearTimeout(timeout);
    }
  }, [flash, params, setParams]);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const url = await startMetaConnect();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Meta connection");
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await disconnectMeta();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Meta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Platform connections</h1>
        <p className="mt-2 text-muted-foreground">
          Authorize Meta so the agent can launch and manage Facebook + Instagram campaigns on your behalf.
        </p>
      </header>

      {flash === "connected" && (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Meta connected successfully.
        </div>
      )}
      {flash === "error" && (
        <div className="rounded-lg border border-red-300/50 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Meta authorization failed. Please try again.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MegaphoneIcon className="size-5" />
            </div>
            <div>
              <CardTitle>Meta (Facebook + Instagram)</CardTitle>
              <CardDescription>
                Required permissions: ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_posts.
              </CardDescription>
            </div>
          </div>
          {status?.connected ? (
            <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2Icon className="mr-1 size-3.5" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full">
              Not connected
            </Badge>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && status && !status.configured && (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              The server is missing META_APP_ID / META_APP_SECRET / META_REDIRECT_URI. For Page publishing, also set META_LOGIN_CONFIG_ID from Facebook Login for Business. Add them in
              <code className="mx-1 rounded bg-background px-1 py-0.5">backend/.env</code>
              and restart.
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-300/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {status?.connected && (
            <div className="space-y-3">
              <div className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Token expires</span>
                <span className="font-medium">
                  {status.connection?.expiresAt
                    ? new Date(status.connection.expiresAt).toLocaleString()
                    : "Long-lived (no explicit expiry)"}
                </span>
              </div>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold">Ad accounts</h3>
                {!accounts && <p className="text-sm text-muted-foreground">Loading ad accounts…</p>}
                {accounts && accounts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No ad accounts found for this Meta user.</p>
                )}
                {accounts && accounts.length > 0 && (
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                    {accounts.map((account) => (
                      <li key={account.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium">{account.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {account.id} · {account.currency} · {account.timezone_name}
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          status {account.account_status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="rounded-full"
          >
            <RefreshCwIcon className="mr-2 size-4" />
            Refresh
          </Button>
          <div className="flex gap-2">
            {status?.connected ? (
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={busy}
                className="rounded-full"
              >
                <UnplugIcon className="mr-2 size-4" />
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={busy || !status?.configured}
                className="rounded-full"
              >
                <ExternalLinkIcon className="mr-2 size-4" />
                Connect Meta
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </section>
  );
}
