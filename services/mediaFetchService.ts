const MEDIA_PROXY_PATH = '/__bb_proxy_media';
const mediaProxyEnabled = String(import.meta.env.VITE_MEDIA_PROXY_ENABLED ?? 'true').toLowerCase() !== 'false';

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

/**
 * Fetch remote media with a same-origin proxy fallback for CORS-blocked URLs.
 * When direct cross-origin fetch fails in browser, it retries via /__bb_proxy_media.
 */
export const fetchMediaWithCorsFallback = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const canUseProxy = mediaProxyEnabled && isHttpUrl(url);
  const proxyUrl = `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;

  // Known CORS-hostile media sources should use proxy-first in browser.
  if (canUseProxy && isVolcengineMediaUrl(url)) {
    return fetch(proxyUrl, {
      method: init?.method || 'GET',
      headers: init?.headers,
      credentials: 'same-origin',
    });
  }

  try {
    return await fetch(url, init);
  } catch (error) {
    const shouldFallback = canUseProxy &&
      isHttpUrl(url) &&
      isLikelyCorsOrNetworkError(error);

    if (!shouldFallback) {
      throw error;
    }

    return fetch(proxyUrl, {
      method: init?.method || 'GET',
      headers: init?.headers,
      credentials: 'same-origin',
    });
  }
};
