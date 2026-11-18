import type { ReactNode } from 'react';
import type { ApiState } from '../lib/useApi';
import type { NewRule, Quality } from '../lib/api';
import { fmtDuration, fmtInt, fmtPct, fmtRange } from '../lib/format';
import { EmptyState, ErrorState, RowsSkeleton } from '../components/DataState';
import { InfoTip } from '../components/InfoTip';
import { Panel } from '../components/Panel';

function Table({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table className={`table${wide ? ' table--wide' : ''}`}>{children}</table>
    </div>
  );
}

const STATUS_TEXT: Record<string, { text: string; cls: string }> = {
  ready: { text: '新增規則已計算', cls: 'pill pill--cobalt' },
  stale: { text: '新增規則待重算', cls: 'pill pill--amber' },
  missing: { text: '新增規則待重算', cls: 'pill pill--amber' },
  invalid: { text: '新增規則待重算', cls: 'pill pill--amber' },
};

function RuleDetail({ rule, total }: { rule: NewRule; total: number }) {
  return (
    <div className="stack">
      <div className="panel__title-row">
        <h3 className="subhead">{rule.label}</h3>
        <InfoTip tip={rule.threshold_note} label={`${rule.label}的說明`} />
      </div>
      <dl className="dl-grid">
        <dt>定義</dt>
        <dd>{rule.definition}</dd>
        <dt>檢出</dt>
        <dd>
          {fmtInt(rule.count)} 筆，占 {fmtPct(rule.count, total)}
        </dd>
      </dl>
      <Table label={`${rule.label}，各年份筆數`}>
        <thead>
          <tr>
            <th scope="col">年份</th>
            <th scope="col" className="num">檢出筆數</th>
            <th scope="col" className="num">該年紀錄數</th>
            <th scope="col" className="num">占比</th>
          </tr>
        </thead>
        <tbody>
          {rule.by_year.map((y) => (
            <tr key={y.year}>
              <td>{y.year}</td>
              <td className="num">{fmtInt(y.count)}</td>
              <td className="num">{fmtInt(y.rows)}</td>
              <td className="num">{fmtPct(y.count, y.rows)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rule.distribution && (
        <Table label={`${rule.label}，乘車時間分組`}>
          <thead>
            <tr>
              <th scope="col">乘車時間</th>
              <th scope="col" className="num">筆數</th>
            </tr>
          </thead>
          <tbody>
            {rule.distribution.map((d) => (
              <tr key={d.bucket}>
                <td>{d.bucket}</td>
                <td className="num">{fmtInt(d.count)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {rule.top_stops && (
        <Table label={`${rule.label}，站名前十`}>
          <thead>
            <tr>
              <th scope="col">站名</th>
              <th scope="col" className="num">筆數</th>
            </tr>
          </thead>
          <tbody>
            {rule.top_stops.map((d) => (
              <tr key={d.stop}>
                <td>{d.stop}</td>
                <td className="num">{fmtInt(d.count)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <details className="disclosure">
        <summary>{rule.examples.length} 筆範例</summary>
        <Table label={`${rule.label}，範例`} wide>
          <thead>
            <tr>
              <th scope="col">上車時間</th>
              <th scope="col">上車站</th>
              <th scope="col">下車時間</th>
              <th scope="col">下車站</th>
              <th scope="col" className="num">乘車時間</th>
              <th scope="col">來源工作表／列</th>
            </tr>
          </thead>
          <tbody>
            {rule.examples.map((e) => (
              <tr key={`${e.source_sheet}-${e.source_row}`}>
                <td>{e.boarding_time}</td>
                <td>{e.boarding_stop}</td>
                <td>{e.alighting_time}</td>
                <td>{e.alighting_stop}</td>
                <td className="num">{fmtDuration(e.ride_minutes)}</td>
                <td>
                  {e.source_sheet} 第 {e.source_row} 列
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </details>
    </div>
  );
}

export function QualityPage({ state }: { state: ApiState<Quality> & { retry: () => void } }) {
  if (state.status === 'error') {
    return (
      <>
        <Head />
        <ErrorState error={state.error} onRetry={state.retry} title="資料品質摘要載入失敗" />
      </>
    );
  }
  if (state.status !== 'success') {
    return (
      <>
        <Head />
        <p className="loading-line" role="status">
          正在載入資料品質摘要…
        </p>
        <section className="panel" aria-hidden="true">
          <RowsSkeleton rows={8} />
        </section>
      </>
    );
  }

  const q = state.data;
  const total = q.coverage.total_trips;
  const nc = q.new_checks;
  const status = STATUS_TEXT[nc.status];
  const unknown = q.direction.unknown_rows;
  const ready = nc.status === 'ready';
  const ncDetail = [nc.message, ready && nc.generated_at ? `計算時間 ${nc.generated_at}，版本 ${nc.data_version}。` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Head range={fmtRange(q.coverage.period_start, q.coverage.period_end)} />

      <section className="board" aria-label="品質摘要">
        <div className="board__cell board__cell--plate">
          <span className="board__label">
            方向尚未分類
            <InfoTip tip="所有紀錄標為 UNKNOWN；方向對照表填完前，網站只提供兩方向合計。" label="方向尚未分類的說明" />
          </span>
          <span className="board__figure">
            {unknown === null ? '未提供' : fmtInt(unknown)}
            {unknown !== null && <small>筆</small>}
          </span>
          <span className="board__note">
            {unknown === null ? '缺少分方向彙整檔' : `占全部 ${fmtPct(unknown, q.direction.total_rows)}`}
          </span>
        </div>
        <div className="board__cell">
          <span className="board__label">
            無紀錄日期
            <InfoTip tip="可能是停駛、資料未匯出或其他原因，需向業者確認；不代表停駛。" label="無紀錄日期的說明" />
          </span>
          <span className="board__figure">
            {fmtInt(q.coverage.no_record_days)}
            <small>天</small>
          </span>
        </div>
        <div className="board__cell">
          <span className="board__label">
            現有報告規則
            <InfoTip tip={q.existing_checks.note} label="現有報告規則的說明" />
          </span>
          <span className="board__figure">
            {q.existing_checks.rules.length}
            <small>項</small>
          </span>
          <span className="board__note">命中 {fmtInt(q.existing_checks.rules.reduce((a, r) => a + r.count, 0))} 筆</span>
        </div>
        <div className="board__cell">
          <span className="board__label">
            新增規則
            <InfoTip
              tip={ready && nc.overlap ? nc.overlap.note : nc.message}
              label="新增規則的說明"
            />
          </span>
          <span className="board__figure">
            {ready ? nc.rules.length : '待重算'}
            {ready && <small>項</small>}
          </span>
          <span className="board__note">
            {ready && nc.overlap ? `重疊 ${fmtInt(nc.overlap.count)} 筆` : '待離線腳本重算'}
          </span>
        </div>
      </section>

      <Panel
        title="異常檢查範圍"
        tip="「現有報告已檢查」來自原整理腳本；「新增規則」由離線腳本依同一資料版本另外計算。"
      >
        <Table label="異常檢查規則" wide>
          <thead>
            <tr>
              <th scope="col">規則</th>
              <th scope="col">定義</th>
              <th scope="col" className="num">檢出筆數</th>
              <th scope="col">檢查狀態</th>
            </tr>
          </thead>
          <tbody>
            {q.existing_checks.rules.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td>{r.definition}</td>
                <td className="num">{fmtInt(r.count)}</td>
                <td>
                  <span className="pill pill--quiet">現有報告已檢查</span>
                </td>
              </tr>
            ))}
            {ready
              ? nc.rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.definition}</td>
                    <td className="num">{fmtInt(r.count)}</td>
                    <td>
                      <span className={status.cls}>{status.text}</span>
                    </td>
                  </tr>
                ))
              : ['乘車時間超過 6 小時', '上下車站名相同'].map((label) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>尚無符合目前資料版本的結果</td>
                    <td className="num">未計算</td>
                    <td>
                      <span className={status.cls}>{status.text}</span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </Table>
        <p className="panel__foot">
          檢查對象 {fmtInt(q.existing_checks.rows_checked)} 筆
          <InfoTip tip={`${q.existing_checks.note} ${ncDetail}`} label="檢查對象的說明" />
        </p>
      </Panel>

      {ready ? (
        <Panel title="新增規則彙總">
          {nc.ride_minutes_quantiles && (
            <dl className="facts" aria-label="全部紀錄的乘車時間">
              <div>
                <dt>乘車時間中位數</dt>
                <dd>{nc.ride_minutes_quantiles.p50} 分</dd>
              </div>
              <div>
                <dt>P95</dt>
                <dd>{nc.ride_minutes_quantiles.p95} 分</dd>
              </div>
              <div>
                <dt>P99</dt>
                <dd>{nc.ride_minutes_quantiles.p99} 分</dd>
              </div>
            </dl>
          )}
          <div className="grid-2">
            {nc.rules.map((r) => (
              <RuleDetail key={r.id} rule={r} total={total} />
            ))}
          </div>
          {nc.overlap && (
            <p className="panel__foot">
              兩項重疊 {fmtInt(nc.overlap.count)} 筆
              <InfoTip tip={nc.overlap.note} label="重疊的說明" />
            </p>
          )}
        </Panel>
      ) : (
        <EmptyState
          title="新增規則待重算"
          tip={nc.message}
          action={
            <button type="button" className="btn btn--small" onClick={state.retry}>
              重新讀取
            </button>
          }
        />
      )}

      <div className="grid-2">
        <Panel
          title="無紀錄日期"
          tip="整理後資料中沒有任何刷卡紀錄的日期，圖上留缺口、未補 0。可能是停駛、資料未匯出或其他原因，需向業者確認。"
        >
          {q.no_record_dates.length === 0 ? (
            <EmptyState title="資料期間內每天都有紀錄" />
          ) : (
            <Table label="無紀錄日期">
              <thead>
                <tr>
                  <th scope="col">日期</th>
                  <th scope="col">星期</th>
                  <th scope="col">狀態</th>
                </tr>
              </thead>
              <tbody>
                {q.no_record_dates.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.weekday_label}</td>
                    <td>
                      <span className="pill pill--amber">無紀錄，待查證</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel title="方向分類現況" tip={q.direction.note}>
          <dl className="dl-grid">
            <dt>未分類（UNKNOWN）</dt>
            <dd>{unknown === null ? '未提供' : `${fmtInt(unknown)} 筆`}</dd>
            <dt>已分類</dt>
            <dd>{q.direction.classified_rows === null ? '未提供' : `${fmtInt(q.direction.classified_rows)} 筆`}</dd>
            <dt>方向對照表</dt>
            <dd>
              {q.direction.template_pairs === null
                ? '未提供'
                : `${fmtInt(q.direction.template_filled)} / ${fmtInt(q.direction.template_pairs)} 組已填`}
            </dd>
          </dl>
          <Table label="各年份站序與站名對應">
            <thead>
              <tr>
                <th scope="col">年份</th>
                <th scope="col" className="num">站序數</th>
                <th scope="col" className="num">
                  同站序多站名
                  <InfoTip
                    tip="相同站序可對應不同站名，所以不能用站序正負差判斷去回程。"
                    label="同站序多站名的說明"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {q.station_mapping.by_year.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td className="num">{fmtInt(y.sequences)}</td>
                  <td className="num">{fmtInt(y.sequences_with_multiple_stops)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <details className="disclosure">
            <summary>同站序多站名明細</summary>
            <Table label="同站序對應多個站名明細" wide>
              <thead>
                <tr>
                  <th scope="col">年份</th>
                  <th scope="col" className="num">站序</th>
                  <th scope="col">站名（筆數）</th>
                </tr>
              </thead>
              <tbody>
                {q.station_mapping.multi_stop_sequences.map((m) => (
                  <tr key={`${m.year}-${m.sequence}`}>
                    <td>{m.year}</td>
                    <td className="num">{m.sequence}</td>
                    <td>{m.stops.map((s) => `${s.stop}（${fmtInt(s.count)}）`).join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
        </Panel>
      </div>

      <Panel title="每月原始筆數" tip={`來源 Excel 各工作表的原始筆數，與篩選路線 ${q.route} 後的筆數。`}>
        <Table label="每月原始筆數">
          <thead>
            <tr>
              <th scope="col">工作表</th>
              <th scope="col" className="num">原始筆數</th>
              <th scope="col" className="num">{q.route} 筆數</th>
              <th scope="col" className="num">{q.route} 占比</th>
            </tr>
          </thead>
          <tbody>
            {q.sheet_audit.map((r) => (
              <tr key={`${r.file}-${r.sheet}`}>
                <td>{r.sheet}</td>
                <td className="num">{fmtInt(r.raw_rows)}</td>
                <td className="num">{fmtInt(r.selected_rows)}</td>
                <td className="num">{fmtPct(r.selected_rows, r.raw_rows)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td className="num">{fmtInt(q.sheet_audit.reduce((a, r) => a + r.raw_rows, 0))}</td>
              <td className="num">{fmtInt(q.sheet_audit.reduce((a, r) => a + r.selected_rows, 0))}</td>
              <td className="num">
                {fmtPct(
                  q.sheet_audit.reduce((a, r) => a + r.selected_rows, 0),
                  q.sheet_audit.reduce((a, r) => a + r.raw_rows, 0),
                )}
              </td>
            </tr>
          </tfoot>
        </Table>
      </Panel>

      <Panel title="資料定義與限制">
        <ul className="list list--tight">
          {q.limitations.map((l) => (
            <li key={l.label}>
              {l.label}
              <InfoTip tip={l.detail} label={`${l.label}的說明`} />
            </li>
          ))}
          {q.load_warnings.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Head({ range }: { range?: string }) {
  return (
    <div className="page-head">
      <div className="page-head__title">
        <h1>資料品質</h1>
        <p className="page-head__sub">
          全資料期間{range ? ` ${range}` : ''}
          <InfoTip tip="這一頁不受日期篩選影響。" label="資料期間的說明" />
        </p>
      </div>
    </div>
  );
}
