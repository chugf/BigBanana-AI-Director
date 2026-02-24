const DEFAULT_MEDIA_PROXY_ENDPOINT = '/api/media-proxy';
const LEGACY_MEDIA_PROXY_PATH = '/__bb_proxy_media';
const mediaProxyEnabled =
  String(import.meta.env.VITE_MEDIA_PROXY_ENABLED ?? 'true').toLowerCase() !== 'false';
const configuredProxyEndpoint = String(import.meta.env.VITE_MEDIA_PROXY_ENDPOINT ?? '').trim();
const mediaProxyEndpoint = configuredProxyEndpoint || DEFAULT_MEDIA_PROXY_ENDPOINT;

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isVolcengineMediaUrl = (value: string): boolean => /(^https?:\/\/|:\/\/)[^/?#]*volces\.com/i.test(value);

const isLikelyCorsOrNetworkError = (error: unknown): boolean => {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed')
  );
};

const buildProxyUrl = (endpoint: string, targetUrl: string): string => {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}url=${encodeURIComponent(targetUrl)}`;
};

const fetchViaSameOriginProxy = async (endpoint: string, url: string, init?: RequestInit): Promise<Response> => {
  const proxyUrl = buildProxyUrl(endpoint, url);
  return fetch(proxyUrl, {
    method: init?.method || 'GET',
    headers: init?.headers,
    credentials: 'same-origin',
  });
};

const fetchViaProxyChain = async (url: string, init?: RequestInit): Promise<Response> => {
  const primary = await fetchViaSameOriginProxy(mediaProxyEndpoint, url, init);
  if (primary.ok || mediaProxyEndpoint === LEGACY_MEDIA_PROXY_PATH) {
    return primary;
  }

  // Compatibility fallback for old deployments that only expose /__bb_proxy_media.
  try {
    return await fetchViaSameOriginProxy(LEGACY_MEDIA_PROXY_PATH, url, init);
  } catch {
    return primary;
  }
};

/**
 * Fetch remote media with a same-origin proxy fallback for CORS-blocked URLs.
 * In production, set `VITE_MEDIA_PROXY_ENDPOINT` to a backend Node.js proxy endpoint.
 */
export const fetchMediaWithCorsFallback = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const canUseProxy = mediaProxyEnabled && isHttpUrl(url);

  // Volcengine TOS links are frequently CORS-restricted in browser environments.
  // Use proxy-first to avoid a guaranteed failed direct fetch.
  if (canUseProxy && isVolcengineMediaUrl(url)) {
    return fetchViaProxyChain(url, init);
  }

  try {
    return await fetch(url, init);
  } catch (error) {
    const shouldFallback = canUseProxy && isLikelyCorsOrNetworkError(error);
    if (!shouldFallback) {
      throw error;
    }

    return fetchViaProxyChain(url, init);
  }
};

