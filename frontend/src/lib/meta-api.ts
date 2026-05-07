import { api } from "./api";

export interface MetaStatus {
  connected: boolean;
  configured: boolean;
  connection: {
    id: string;
    scope: string | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export async function getMetaStatus() {
  return api<MetaStatus>("/api/meta/status");
}

export async function startMetaConnect(): Promise<string> {
  const { url } = await api<{ url: string }>("/api/meta/connect");
  return url;
}

export async function disconnectMeta() {
  return api<{ ok: true }>("/api/meta/disconnect", { method: "POST" });
}

export interface MetaAdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

export async function listMetaAdAccounts() {
  return api<{ accounts: MetaAdAccount[] }>("/api/meta/ad-accounts");
}
