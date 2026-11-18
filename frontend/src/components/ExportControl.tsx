import { useId, useState } from 'react';
import { ApiError, downloadCsv, type Filters } from '../lib/api';
import { Spinner } from './DataState';

const KINDS = [
  { value: 'daily', label: '每日旅次（含無紀錄日）' },
  { value: 'hourly', label: '每小時明細（只列有紀錄時段）' },
  { value: 'hourly_summary', label: '小時分布（期間累計）' },
];

/** 匯出永遠使用「已套用」條件，與畫面上的圖表一致。 */
export function ExportControl({ filters, disabled }: { filters: Filters; disabled?: boolean }) {
  const id = useId();
  const [kind, setKind] = useState('daily');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const name = await downloadCsv(filters, kind);
      setMsg({ ok: true, text: `已下載 ${name}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : '匯出失敗，請重試。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-kind`}>
          匯出 CSV
        </label>
        <span className="select-wrap">
          <select
            id={`${id}-kind`}
            name="kind"
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-describedby={`${id}-msg`}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </span>
        <span
          id={`${id}-msg`}
          className={`field__help${msg && !msg.ok ? ' field__help--error' : ''}`}
          role="status"
        >
          {msg?.text ?? '依已套用條件匯出'}
        </span>
      </div>
      <div className="field">
        <span className="field__label" aria-hidden="true">
          &nbsp;
        </span>
        <button
          type="button"
          className="btn"
          onClick={run}
          disabled={disabled || busy}
          aria-busy={busy || undefined}
        >
          {busy && <Spinner />}
          下載
        </button>
        <span className="field__help" aria-hidden="true">
          &nbsp;
        </span>
      </div>
    </div>
  );
}
