import { useCallback, useEffect, useState } from 'react';
import { ApiError, getJson } from './api';

export type ApiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError };

/** 讀取 JSON；url 為 null 時不發請求。失敗時回報錯誤，不改用假資料。 */
export function useApi<T>(url: string | null): ApiState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = url ? `${url}#${attempt}` : null;
  const [result, setResult] = useState<{ key: string; state: ApiState<T> } | null>(null);

  useEffect(() => {
    if (!url || !key) return;
    const ctrl = new AbortController();
    getJson<T>(url, ctrl.signal)
      .then((data) => setResult({ key, state: { status: 'success', data } }))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        const e = err instanceof ApiError ? err : new ApiError(0, 'unknown', (err as Error).message || '未知錯誤');
        setResult({ key, state: { status: 'error', error: e } });
      });
    return () => ctrl.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: ApiState<T> = !key
    ? { status: 'idle' }
    : result && result.key === key
      ? result.state
      : { status: 'loading' };
  return { ...state, retry };
}
