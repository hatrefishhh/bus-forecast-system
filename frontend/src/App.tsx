import { useEffect, useMemo } from 'react';
import type { Filters, History, Meta, Quality } from './lib/api';
import { filterQuery } from './lib/api';
import { hasErrors, validateRange } from './lib/filters';
import { fmtRange } from './lib/format';
import { hrefFor, navigate, useLocation, useUpdateParams, type View } from './lib/router';
import { useApi } from './lib/useApi';
import { ErrorState, RowsSkeleton } from './components/DataState';
import { FilterBar } from './components/FilterBar';
import { InfoTip } from './components/InfoTip';
import { SORT_KEYS, type SortKey } from './lib/sort';
import { HistoryPage } from './pages/HistoryPage';
import { QualityPage } from './pages/QualityPage';

const TABS: { view: View; label: string }[] = [
  { view: 'history', label: '歷史需求' },
  { view: 'quality', label: '資料品質' },
];

export default function App() {
  const meta = useApi<Meta>('/api/meta');
  const { view, params } = useLocation();

  useEffect(() => {
    document.title = `${view === 'quality' ? '資料品質' : '歷史需求'}｜客運順起來`;
  }, [view]);

  return (
    <>
      <a className="skip" href="#main">
        跳到主要內容
      </a>
      <header className="topbar">
        <div className="container topbar__inner">
          <a className="wordmark" href={hrefFor('history', params)} aria-label="客運順起來，回到歷史需求" onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor('history', params));
          }}>
            客運順起來
          </a>
          {meta.status === 'success' && (
            <dl className="topbar__meta">
              <div>
                <dt>路線</dt>
                <dd>{meta.data.default_route}</dd>
              </div>
              <div>
                <dt>資料期間</dt>
                <dd>{fmtRange(meta.data.period.start, meta.data.period.end)}</dd>
              </div>
              <div>
                <dt>資料版本</dt>
                <dd>{meta.data.data_version}</dd>
              </div>
            </dl>
          )}
        </div>
      </header>
      <nav className="tabs" aria-label="頁面">
        <div className="container">
          <ul className="tabs__list">
            {TABS.map((t) => (
              <li key={t.view}>
                <a
                  className="tabs__link"
                  href={hrefFor(t.view, params)}
                  aria-current={view === t.view ? 'page' : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate(hrefFor(t.view, params));
                  }}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <main id="main" className="container main" tabIndex={-1}>
        {meta.status === 'success' ? (
          <Ready meta={meta.data} view={view} params={params} />
        ) : meta.status === 'error' ? (
          <ErrorState error={meta.error} onRetry={meta.retry} title="無法取得資料設定" />
        ) : (
          <>
            <p className="loading-line" role="status">
              正在連線資料服務…
            </p>
            <RowsSkeleton rows={4} />
          </>
        )}
      </main>
      <footer className="footer">
        <div className="container footer__inner">
          <p>
            資料：南投客運 6670{' '}
            <InfoTip tip="刷卡旅次不等於獨立乘客人數，也不是車上人數。">刷卡資料</InfoTip>
            {meta.status === 'success' ? ` ${meta.data.period.start.slice(0, 4)}–${meta.data.period.end.slice(0, 4)}` : ''}
            ・Asia/Taipei
          </p>
        </div>
      </footer>
    </>
  );
}

function Ready({ meta, view, params }: { meta: Meta; view: View; params: URLSearchParams }) {
  const update = useUpdateParams();
  const urlStart = params.get('start');
  const urlEnd = params.get('end');

  // 沒有日期參數時寫入預設（2025 全年），讓網址可分享、重新整理可還原
  useEffect(() => {
    if (!urlStart && !urlEnd) {
      update(view, { start: meta.default_range.start, end: meta.default_range.end }, { replace: true });
    }
  }, [urlStart, urlEnd, view, meta, update]);

  const start = urlStart ?? meta.default_range.start;
  const end = urlEnd ?? meta.default_range.end;
  const errs = validateRange(start, end, meta.period);
  const invalidReason = hasErrors(errs) ? `網址中的日期條件無效：${[errs.start, errs.end].filter(Boolean).join(' ')}` : null;

  const filters: Filters = useMemo(
    () => ({ start, end, route: meta.default_route, direction: 'all' }),
    [start, end, meta.default_route],
  );

  const historyUrl = view === 'history' && !invalidReason ? `/api/history?${filterQuery(filters)}` : null;
  const history = useApi<History>(historyUrl);
  const quality = useApi<Quality>(view === 'quality' ? '/api/quality' : null);

  const sortParam = params.get('sort') as SortKey | null;
  const sort: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'date-asc';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  if (view === 'quality') return <QualityPage state={quality} />;

  return (
    <HistoryPage
      state={history}
      filters={filters}
      invalidReason={invalidReason}
      sort={sort}
      page={page}
      reset={{
        label: `改看 ${meta.default_range.start.slice(0, 4)} 年`,
        run: () => update('history', { start: meta.default_range.start, end: meta.default_range.end, page: null }),
      }}
      onTableChange={(s, p) =>
        update('history', { sort: s === 'date-asc' ? null : s, page: p > 1 ? String(p) : null }, { replace: true })
      }
      filterBar={
        <FilterBar
          key={`${start}|${end}`}
          meta={meta}
          applied={{ start, end }}
          busy={history.status === 'loading'}
          onApply={(s, e) => {
            // 條件相同且上次失敗時，套用等同重試
            if (s === start && e === end && history.status === 'error') history.retry();
            update('history', { start: s, end: e, page: null });
          }}
        />
      }
    />
  );
}
