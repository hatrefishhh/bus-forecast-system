import { useCallback, useSyncExternalStore } from 'react';

// 極簡路由：路徑決定頁籤，查詢字串保存已套用條件與表格狀態，重新整理可還原。

export type View = 'history' | 'quality';

const PATHS: Record<View, string> = { history: '/', quality: '/quality' };

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener('app:navigate', cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener('app:navigate', cb);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function useLocation() {
  const loc = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(loc, window.location.origin);
  const view: View = url.pathname.replace(/\/+$/, '') === '/quality' ? 'quality' : 'history';
  return { view, params: url.searchParams };
}

export function hrefFor(view: View, params: URLSearchParams): string {
  const q = params.toString();
  return PATHS[view] + (q ? `?${q}` : '');
}

export function navigate(href: string, { replace = false } = {}) {
  if (href === snapshot()) return;
  if (replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  window.dispatchEvent(new Event('app:navigate'));
}

export function useUpdateParams() {
  return useCallback((view: View, changes: Record<string, string | null>, opts?: { replace?: boolean }) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    navigate(hrefFor(view, params), opts);
  }, []);
}
