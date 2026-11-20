import { useLayoutEffect } from 'react';

/**
 * Keeps the page's URL, and the token in it, out of the Referer of anything it loads. A layout
 * effect, so it is in place before the effects of the screens inside it start their requests.
 */
export const useNoReferrer = () => {
  useLayoutEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = existing ?? document.head.appendChild(document.createElement('meta'));
    const previous = existing?.content;
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    return () => {
      if (previous === undefined) meta.remove();
      else meta.content = previous;
    };
  }, []);
};
