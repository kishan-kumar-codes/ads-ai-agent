import { env } from "../../lib/env.js";

const GRAPH_BASE = "https://graph.facebook.com";

export class MetaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public type?: string,
    public fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export interface MetaRequestOptions {
  accessToken: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown> | FormData;
  method?: "GET" | "POST" | "DELETE";
}

function buildUrl(path: string, query?: MetaRequestOptions["query"]) {
  const version = env.META_GRAPH_API_VERSION;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GRAPH_BASE}/${version}${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function metaRequest<T = unknown>(options: MetaRequestOptions): Promise<T> {
  const method = options.method ?? (options.body ? "POST" : "GET");
  const url = buildUrl(options.path, options.query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
  };

  let body: string | FormData | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const json = text ? safeParseJson(text) : undefined;

  if (!response.ok) {
    const fbError = (json as any)?.error;
    throw new MetaApiError(
      fbError?.message ?? `Meta API ${method} ${options.path} failed (${response.status})`,
      response.status,
      fbError?.code,
      fbError?.type,
      fbError?.fbtrace_id,
    );
  }

  return json as T;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_REDIRECT_URI) {
    throw new MetaApiError("Meta OAuth env vars are not configured", 500);
  }
  const url = buildUrl("/oauth/access_token", {
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_REDIRECT_URI,
    code,
  });
  const response = await fetch(url);
  const text = await response.text();
  const json = text ? safeParseJson(text) : undefined;
  if (!response.ok) {
    throw new MetaApiError((json as any)?.error?.message ?? "Failed to exchange code", response.status);
  }
  return json as OAuthTokenResponse;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new MetaApiError("Meta OAuth env vars are not configured", 500);
  }
  const url = buildUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  const response = await fetch(url);
  const text = await response.text();
  const json = text ? safeParseJson(text) : undefined;
  if (!response.ok) {
    throw new MetaApiError((json as any)?.error?.message ?? "Failed to exchange long-lived token", response.status);
  }
  return json as OAuthTokenResponse;
}

export function buildAuthorizeUrl(state: string, scopes: string[]): string {
  if (!env.META_APP_ID || !env.META_REDIRECT_URI) {
    throw new MetaApiError("Meta OAuth env vars are not configured", 500);
  }
  const url = new URL(`https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_REDIRECT_URI);
  url.searchParams.set("state", state);
  if (env.META_LOGIN_CONFIG_ID) {
    url.searchParams.set("config_id", env.META_LOGIN_CONFIG_ID);
  } else {
    url.searchParams.set("scope", scopes.join(","));
  }
  url.searchParams.set("response_type", "code");
  return url.toString();
}
