const ESPN_HOSTS = [
  "https://site.web.api.espn.com/apis",
  "https://site.api.espn.com/apis",
];

/**
 * site.api.espn.com is the historical host but some networks (including
 * datacenter Akamai ACLs) return 403. ESPN's own site uses site.web.api
 * with the same path layout, so we fall back there.
 */
export async function fetchEspnJSON(path: string, timeoutMs = 12_000): Promise<any> {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  let lastError: Error | null = null;

  for (const host of ESPN_HOSTS) {
    const url = `${host}${suffix}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "EuroFootballHub/2.0",
          Accept: "application/json",
          Referer: "https://www.espn.com/soccer/",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.json();
      lastError = new Error(`ESPN API error: ${res.status} ${res.statusText} for ${url}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`ESPN API error for ${suffix}`);
}
