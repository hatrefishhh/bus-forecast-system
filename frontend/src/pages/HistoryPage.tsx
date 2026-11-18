import type { ReactNode } from 'react';
import type { ApiState } from '../lib/useApi';
import type { Filters, History } from '../lib/api';
import { fmtAvg, fmtInt, fmtRange } from '../lib/format';
import { Board } from '../components/Board';
import { DailyChart, HourlyChart, WeekdayChart } from '../components/Charts';
import { DailyTable } from '../components/DailyTable';
import type { SortKey } from '../lib/sort';
import { ChartSkeleton, EmptyState, ErrorState, RowsSkeleton } from '../components/DataState';
import { ExportControl } from '../components/ExportControl';
import { InfoTip } from '../components/InfoTip';
import { Panel } from '../components/Panel';

interface Props {
  state: ApiState<History> & { retry: () => void };
  filters: Filters;
  invalidReason: string | null;
  sort: SortKey;
  page: number;
  onTableChange: (sort: SortKey, page: number) => void;
  filterBar: ReactNode;
  reset: { label: string; run: () => void };
}

const NO_RECORD_TIP = '這天沒有任何刷卡紀錄。圖上留缺口，不連線、不補 0；不代表停駛或零需求。';

export function HistoryPage({ state, filters, invalidReason, sort, page, onTableChange, filterBar, reset }: Props) {
  const period = fmtRange(filters.start, filters.end);
  const head = (exportDisabled: boolean) => (
    <>
      <PageHead filters={filters} exportDisabled={exportDisabled} />
      {filterBar}
    </>
  );
  const resetButton = (
    <button type="button" className="btn btn--small" onClick={reset.run}>
      {reset.label}
    </button>
  );

  if (invalidReason) {
    return (
      <>
        {head(true)}
        <EmptyState title="日期條件需要修正" tip={invalidReason} action={resetButton} />
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        {head(true)}
        <ErrorState error={state.error} onRetry={state.retry} title="歷史需求資料載入失敗" />
      </>
    );
  }

  if (state.status !== 'success') {
    return (
      <>
        {head(true)}
        <p className="loading-line" role="status">
          正在載入 {period} 的資料…
        </p>
        <div className="board" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`board__cell${i === 0 ? ' board__cell--plate' : ''}`}>
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </div>
          ))}
        </div>
        <section className="panel" aria-hidden="true">
          <ChartSkeleton />
        </section>
        <div className="grid-2" aria-hidden="true">
          <section className="panel">
            <ChartSkeleton short />
          </section>
          <section className="panel">
            <ChartSkeleton short />
          </section>
        </div>
        <section className="panel" aria-hidden="true">
          <RowsSkeleton />
        </section>
      </>
    );
  }

  const data = state.data;
  const empty = data.status === 'no_records';
  const s = data.summary;
  const [weekdays, weekend] = data.weekday_summary.groups;
  // 方向、無紀錄日、無紀錄時段已用圖例與 InfoTip 表達，這裡只列其餘提醒（例如載入警告）
  const notices = data.warnings.filter(
    (w) => !['direction_unclassified', 'hours_without_records', 'no_record_dates'].includes(w.code),
  );

  return (
    <>
      {head(false)}
      {notices.length > 0 && (
        <ul className="notices" aria-label="資料提醒">
          {notices.map((w) => (
            <li key={w.code + w.message}>
              <span className="notices__tag">提醒</span>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      <Board data={data} />

      {empty ? (
        <EmptyState
          title="此期間沒有刷卡紀錄"
          tip={`${period} 的 ${s.calendar_days} 天都沒有紀錄。不代表已確認停駛或零需求；資料品質頁列出所有無紀錄日期。`}
          action={resetButton}
        />
      ) : (
        <>
          <Panel
            title="每日刷卡旅次"
            sub="單位：次"
            aside={
              <ul className="legend" aria-label="圖例">
                <li>
                  <span className="swatch swatch--line" aria-hidden="true" />
                  每日刷卡旅次
                </li>
                <li>
                  <span className="swatch swatch--amber" aria-hidden="true" />
                  無紀錄
                  <InfoTip tip={NO_RECORD_TIP} label="無紀錄的說明" />
                </li>
              </ul>
            }
          >
            <DailyChart points={data.daily} periodLabel={period} />
            {s.peak_day && s.low_day && (
              <dl className="facts">
                <div>
                  <dt>最高</dt>
                  <dd>
                    {s.peak_day.date}（{s.peak_day.weekday_label}）{fmtInt(s.peak_day.trips)} 次
                  </dd>
                </div>
                <div>
                  <dt>最低</dt>
                  <dd>
                    {s.low_day.date}（{s.low_day.weekday_label}）{fmtInt(s.low_day.trips)} 次
                  </dd>
                </div>
              </dl>
            )}
          </Panel>

          <div className="grid-2">
            <Panel
              title="每小時分布"
              sub={
                <>
                  <InfoTip tip="各小時在整段期間的刷卡旅次加總，不是平均每日需求。">期間累計</InfoTip>・次
                </>
              }
              aside={
                <ul className="legend" aria-label="圖例">
                  <li>
                    <span className="swatch swatch--none" aria-hidden="true" />
                    灰底＝無紀錄
                    <InfoTip
                      tip="這些時段在期間內沒有任何刷卡紀錄；未區分非營運或零旅次，不補 0。"
                      label="灰底時段的說明"
                    />
                  </li>
                </ul>
              }
            >
              <HourlyChart points={data.hourly.points} periodLabel={period} />
            </Panel>

            <Panel
              title="週一至週五與週末"
              sub={
                <>
                  <InfoTip tip="總旅次 ÷ 有紀錄天數，無紀錄日不計入。軸下數字是樣本天數。">有紀錄日平均</InfoTip>
                  ・次/日
                </>
              }
            >
              <WeekdayChart rows={data.weekday_summary.by_weekday} periodLabel={period} />
              <dl className="compare">
                {[weekdays, weekend].map((g) => (
                  <div key={g.key}>
                    <dt>
                      {g.key === 'weekend' ? (
                        <InfoTip tip="只含週六、週日，未含國定假日。">週末</InfoTip>
                      ) : (
                        '週一至週五'
                      )}
                    </dt>
                    <dd className="compare__figure">
                      {g.avg_trips_per_recorded_day === null ? '無紀錄' : fmtAvg(g.avg_trips_per_recorded_day)}
                    </dd>
                    <dd className="compare__note">
                      次/日，樣本 {g.recorded_days} 天{g.no_record_days ? `，另 ${g.no_record_days} 天無紀錄` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      )}

      <Panel title="每日明細" tip="依旅次排序時，無紀錄日固定排在最後。">
        <DailyTable rows={data.daily} sort={sort} page={page} onChange={onTableChange} />
      </Panel>
    </>
  );
}

function PageHead({ filters, exportDisabled = false }: { filters: Filters; exportDisabled?: boolean }) {
  return (
    <div className="page-head">
      <div className="page-head__title">
        <h1>歷史需求</h1>
        <p className="page-head__sub">已套用 {fmtRange(filters.start, filters.end)}</p>
      </div>
      <ExportControl filters={filters} disabled={exportDisabled} />
    </div>
  );
}
