/**
 * The web UI runs graders and writes files, and has no login. What keeps other
 * people and other websites out is that it only answers requests made to
 * localhost, from its own pages:
 *
 * - The server binds to 127.0.0.1, so nothing else on the network reaches it.
 * - The Host header must name localhost. A DNS-rebinding page (evil.example
 *   resolving to 127.0.0.1) sends its own host name, and is refused.
 * - A request that changes something must come from the UI's own origin. A
 *   cross-site form or fetch carries the other site's Origin, and is refused.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface RequestHeaders {
  host: string | null;
  origin: string | null;
  /** `Sec-Fetch-Site`, sent by every current browser. */
  fetchSite: string | null;
}

export function headersOf(request: { headers: { get(name: string): string | null } }): RequestHeaders {
  return {
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
  };
}

/** `localhost:4321` → `localhost`; `[::1]:4321` → `[::1]`. null when it isn't a host[:port]. */
function hostName(host: string): string | null {
  const m = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(host.trim());
  return m?.[1]?.toLowerCase() ?? null;
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = hostName(host);
  return name !== null && LOCAL_HOSTS.has(name);
}

/** Why the request is refused, or null when it may go ahead. Reads never need an Origin; writes do. */
export function refuseNonLocal(h: RequestHeaders, write: boolean): string | null {
  if (!isLocalHost(h.host)) return "the Dojo UI only answers on localhost";
  if (h.fetchSite && h.fetchSite !== "same-origin" && h.fetchSite !== "none" && write) {
    return "cross-site requests are refused";
  }
  if (!write) return null;
  if (!h.origin) return "a write needs an Origin header";
  let origin: URL;
  try {
    origin = new URL(h.origin);
  } catch {
    return "invalid Origin";
  }
  if (origin.protocol !== "http:" || origin.host.toLowerCase() !== h.host?.trim().toLowerCase()) {
    return "the request does not come from this page";
  }
  return null;
}
