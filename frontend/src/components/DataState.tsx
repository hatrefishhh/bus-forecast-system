import type { ReactNode } from 'react';
import type { ApiError } from '../lib/api';
import { InfoTip } from './InfoTip';

function hintFor(error: ApiError): string {
  if (error.status === 503) return '來源檔缺少或格式不符。請依 README 確認 data/prepared/ 的檔案後重試。';
  if (error.status === 422) return '查詢條件不被接受，請調整條件後再套用。';
  if (error.status === 0) return '請確認後端服務已啟動。';
  return '請稍後重試；若持續發生，請回報這段訊息。';
}

/** 錯誤：標題、伺服器訊息一行，處理方式放進 InfoTip，加一個重試按鈕。 */
export function ErrorState({ error, onRetry, title = '資料載入失敗' }: { error: ApiError; onRetry?: () => void; title?: string }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{title}</p>
      <p className="state__body">
        {error.message}
        <InfoTip tip={hintFor(error)} label="處理方式" />
      </p>
      {onRetry && error.status !== 422 && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          重試
        </button>
      )}
    </div>
  );
}

/** 空狀態：一行短句，補充放 InfoTip，加一個動作。 */
export function EmptyState({ title, tip, action }: { title: string; tip?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <p className="state__title">
        {title}
        {tip && <InfoTip tip={tip} label="原因" />}
      </p>
      {action}
    </div>
  );
}

export function ChartSkeleton({ short = false }: { short?: boolean }) {
  return <div className="skeleton skeleton--chart" style={short ? undefined : { height: 320 }} aria-hidden="true" />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton--row" />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
