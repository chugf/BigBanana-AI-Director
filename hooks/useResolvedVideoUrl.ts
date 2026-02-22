import { useEffect, useState } from 'react';
import { resolveVideoPlaybackSrc } from '../services/videoStorageService';

export const useResolvedVideoUrl = (videoUrl?: string): string | undefined => {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(videoUrl);

  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | undefined;

    if (!videoUrl) {
      setResolvedUrl(undefined);
      return () => undefined;
    }

    resolveVideoPlaybackSrc(videoUrl)
      .then(result => {
        if (cancelled) {
          result.revoke?.();
          return;
        }
        revoke = result.revoke;
        setResolvedUrl(result.src || videoUrl);
      })
      .catch(error => {
        console.warn('Failed to resolve video playback source.', error);
        if (!cancelled) {
          setResolvedUrl(videoUrl);
        }
      });

    return () => {
      cancelled = true;
      if (revoke) {
        revoke();
      }
    };
  }, [videoUrl]);

  return resolvedUrl;
};
