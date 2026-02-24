const DEV_MEDIA_PROXY_PATH = '/__bb_proxy_media';

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isLikelyCorsOrNetworkError = (error: unknown): boolean => {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed')
  );
};

/**
 * Fetch remote media with a local dev-server fallback for CORS-blocked URLs.
 * In dev mode, when direct cross-origin fetch fails, it retries via same-origin proxy.
 */
export const fetchMediaWithCorsFallback = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (error) {
    const shouldFallback =
      import.meta.env.DEV &&
      isHttpUrl(url) &&
      isLikelyCorsOrNetworkError(error);

    if (!shouldFallback) {
      throw error;
    }

    const proxyUrl = `${DEV_MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, {
      method: init?.method || 'GET',
      headers: init?.headers,
      credentials: 'same-origin',
    });
  }
};
