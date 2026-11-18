import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Meta } from '../lib/api';
import { hasErrors, validateRange, type RangeErrors } from '../lib/filters';
import { Spinner } from './DataState';
import { InfoTip } from './InfoTip';

interface Props {
  meta: Meta;
  applied: { start: string; end: string };
  busy: boolean;
  onApply: (start: string, end: string) => void;
}

export function FilterBar({ meta, applied, busy, onApply }: Props) {
  const [start, setStart] = useState(applied.start);
  const [end, setEnd] = useState(applied.end);
  const [touched, setTouched] = useState(false);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const errors: RangeErrors = validateRange(start, end, meta.period);
  const showErrors = touched || hasErrors(validateRange(applied.start, applied.end, meta.period));
  const dirty = start !== applied.start || end !== applied.end;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.start) return startRef.current?.focus();
    if (errors.end) return endRef.current?.focus();
    onApply(start, end);
  }

  function preset(s: string, en: string) {
    setStart(s);
    setEnd(en);
    setTouched(false);
    onApply(s, en);
  }

  const startErr = showErrors ? errors.start : undefined;
  const endErr = showErrors ? errors.end : undefined;

  return (
    <form className="filters" onSubmit={submit} noValidate aria-label="篩選條件">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-start`}>
          起日
        </label>
        <input
          ref={startRef}
          id={`${id}-start`}
          name="start"
          type="date"
          className="input"
          value={start}
          min={meta.period.start}
          max={meta.period.end}
          onChange={(e) => {
            setStart(e.target.value);
            setTouched(true);
          }}
          aria-invalid={startErr ? true : undefined}
          aria-describedby={`${id}-start-help`}
          required
        />
        <span id={`${id}-start-help`} className={`field__help${startErr ? ' field__help--error' : ''}`}>
          {startErr ?? '含當日'}
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-end`}>
          迄日
        </label>
        <input
          ref={endRef}
          id={`${id}-end`}
          name="end"
          type="date"
          className="input"
          value={end}
          min={meta.period.start}
          max={meta.period.end}
          onChange={(e) => {
            setEnd(e.target.value);
            setTouched(true);
          }}
          aria-invalid={endErr ? true : undefined}
          aria-describedby={`${id}-end-help`}
          required
        />
        <span id={`${id}-end-help`} className={`field__help${endErr ? ' field__help--error' : ''}`}>
          {endErr ?? '含當日'}
        </span>
      </div>

      <fieldset className="field filters__presets">
        <legend className="field__label">快速選擇</legend>
        <div className="seg">
          {meta.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className="seg__btn"
              aria-pressed={applied.start === p.start && applied.end === p.end}
              onClick={() => preset(p.start, p.end)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <span className="field__label" id={`${id}-route`}>
          路線
        </span>
        <span className="fixed-value" aria-labelledby={`${id}-route`}>
          {meta.default_route}
        </span>
      </div>

      <div className="field">
        <span className="field__label">
          <span id={`${id}-dir`}>方向</span>
          <InfoTip tip="去回程尚未分類，所有數字為兩方向合計。" label="方向的說明" />
        </span>
        <span className="fixed-value" aria-labelledby={`${id}-dir`}>
          {meta.directions[0]?.label}
        </span>
      </div>

      <div className="filters__actions">
        <span className="field__label" aria-hidden="true">
          &nbsp;
        </span>
        <div className="filters__actions-row">
          <button type="submit" className="btn btn--primary" aria-busy={busy || undefined}>
            {busy && <Spinner />}
            套用
          </button>
        </div>
        <span className="pending" role="status">
          {dirty ? '條件已修改，按套用更新' : ''}
        </span>
      </div>
    </form>
  );
}
