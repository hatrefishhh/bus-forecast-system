import { useId } from 'react';
import type { DailyPoint } from '../lib/api';
import { fmtInt } from '../lib/format';
import type { SortKey } from '../lib/sort';
const PAGE_SIZE = 20;

function sortRows(rows: DailyPoint[], sort: SortKey): DailyPoint[] {
  const out = [...rows];
  const byDate = (a: DailyPoint, b: DailyPoint) => a.date.localeCompare(b.date);
  switch (sort) {
    case 'date-desc':
      return out.sort((a, b) => byDate(b, a));
    case 'trips-desc':
    case 'trips-asc': {
      const dir = sort === 'trips-desc' ? -1 : 1;
      // 無紀錄永遠排在最後，不當成 0 參與排序
      return out.sort((a, b) => {
        if (a.trips === null && b.trips === null) return byDate(a, b);
        if (a.trips === null) return 1;
        if (b.trips === null) return -1;
        return dir * (a.trips - b.trips) || byDate(a, b);
      });
    }
    default:
      return out.sort(byDate);
  }
}

interface Props {
  rows: DailyPoint[];
  sort: SortKey;
  page: number;
  onChange: (sort: SortKey, page: number) => void;
}

export function DailyTable({ rows, sort, page, onChange }: Props) {
  const captionId = useId();
  const sorted = sortRows(rows, sort);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const dateSort = sort.startsWith('date') ? (sort === 'date-asc' ? 'ascending' : 'descending') : 'none';
  const tripSort = sort.startsWith('trips') ? (sort === 'trips-asc' ? 'ascending' : 'descending') : 'none';
  const mark = (s: string) => (s === 'ascending' ? '↑' : s === 'descending' ? '↓' : '');

  return (
    <>
      <div className="table-wrap" tabIndex={0} role="region" aria-labelledby={captionId}>
        <table className="table">
          <caption id={captionId} className="visually-hidden">
            每日刷卡旅次明細，第 {current} 頁，共 {pages} 頁
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={dateSort}>
                <button
                  type="button"
                  className="sort"
                  onClick={() => onChange(sort === 'date-asc' ? 'date-desc' : 'date-asc', 1)}
                >
                  日期<span className="sort__mark" aria-hidden="true">{mark(dateSort)}</span>
                </button>
              </th>
              <th scope="col">星期</th>
              <th scope="col" className="num" aria-sort={tripSort}>
                <button
                  type="button"
                  className="sort"
                  onClick={() => onChange(sort === 'trips-desc' ? 'trips-asc' : 'trips-desc', 1)}
                >
                  刷卡旅次（次）<span className="sort__mark" aria-hidden="true">{mark(tripSort)}</span>
                </button>
              </th>
              <th scope="col">資料狀態</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.date}>
                <td className="nowrap">{r.date}</td>
                <td>{r.weekday_label}</td>
                <td className="num">{r.trips === null ? '—' : fmtInt(r.trips)}</td>
                <td>
                  {r.status === 'no_record' ? <span className="pill pill--amber">無紀錄，未補 0</span> : '有紀錄'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pager" aria-label="明細分頁">
        <span>
          第 {current} / {pages} 頁，共 {fmtInt(rows.length)} 天，每頁 {PAGE_SIZE} 天
        </span>
        <span className="pager__controls">
          <button type="button" className="btn btn--small" disabled={current <= 1} onClick={() => onChange(sort, 1)}>
            第一頁
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={current <= 1}
            onClick={() => onChange(sort, current - 1)}
          >
            上一頁
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={current >= pages}
            onClick={() => onChange(sort, current + 1)}
          >
            下一頁
          </button>
        </span>
      </nav>
    </>
  );
}
