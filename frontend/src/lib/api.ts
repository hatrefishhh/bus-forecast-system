// 前後端資料契約。前端只用相對路徑 /api，不寫死 localhost。

export interface Preset {
  key: string;
  label: string;
  start: string;
  end: string;
}

export interface Meta {
  app_name: string;
  data_version: string;
  loaded_at: string;
  timezone: string;
  routes: string[];
  default_route: string;
  period: { start: string; end: string };
  default_range: { start: string; end: string };
  presets: Preset[];
  directions: { value: string; label: string }[];
  direction_classification_available: boolean;
  features: Record<string, boolean>;
}

export type DayStatus = 'recorded' | 'no_record';

export interface DailyPoint {
  date: string;
  weekday: number;
  weekday_label: string;
  trips: number | null;
  status: DayStatus;
}

export interface HourlyPoint {
  hour: number;
  trips: number | null;
  recorded_days: number;
  status: DayStatus;
}

export interface GroupRow {
  weekday?: number;
  key?: string;
  label: string;
  calendar_days: number;
  recorded_days: number;
  no_record_days: number;
  total_trips: number | null;
  avg_trips_per_recorded_day: number | null;
}

export interface DayRef {
  date: string;
  weekday_label: string;
  trips: number;
}

export interface History {
  data_version: string;
  filters: { start: string; end: string; route: string; direction: string; direction_label: string };
  status: 'ok' | 'no_records';
  summary: {
    calendar_days: number;
    recorded_days: number;
    no_record_days: number;
    total_trips: number | null;
    avg_trips_per_recorded_day: number | null;
    peak_day: DayRef | null;
    low_day: DayRef | null;
  };
  daily: DailyPoint[];
  hourly: { basis: string; points: HourlyPoint[] };
  weekday_summary: { by_weekday: GroupRow[]; groups: GroupRow[] };
  no_record_dates: string[];
  warnings: { code: string; message: string }[];
}

export interface RuleExample {
  boarding_time: string;
  boarding_stop: string;
  alighting_time: string;
  alighting_stop: string;
  ride_minutes: number;
  source_sheet: string;
  source_row: number;
}

export interface NewRule {
  id: string;
  label: string;
  definition: string;
  threshold_minutes: number | null;
  threshold_note: string;
  count: number;
  by_year: { year: number; count: number; rows: number }[];
  distribution?: { bucket: string; count: number }[];
  top_stops?: { stop: string; count: number }[];
  examples: RuleExample[];
}

export interface Quality {
  data_version: string;
  route: string;
  coverage: {
    period_start: string;
    period_end: string;
    calendar_days: number;
    recorded_days: number;
    no_record_days: number;
    total_trips: number;
  };
  direction: {
    classified: boolean;
    unknown_rows: number | null;
    classified_rows: number | null;
    total_rows: number;
    template_pairs: number | null;
    template_filled: number | null;
    note: string;
  };
  no_record_dates: { date: string; weekday_label: string; status: string; listed_in_source: boolean }[];
  existing_checks: {
    source: string;
    rows_checked: number | null;
    counted_boarding_trips: number | null;
    rules: { id: string; label: string; definition: string; count: number }[];
    notes: string[];
    note: string;
  };
  new_checks: {
    status: 'ready' | 'missing' | 'stale' | 'invalid';
    message: string;
    generated_at: string | null;
    data_version: string | null;
    rows_checked: number | null;
    ride_minutes_quantiles: { p50: number; p95: number; p99: number } | null;
    rules: NewRule[];
    overlap: { rule_ids: string[]; count: number; note: string } | null;
  };
  sheet_audit: { file: string; sheet: string; raw_rows: number; selected_rows: number }[];
  station_mapping: {
    by_year: { year: number; sequences: number; sequences_with_multiple_stops: number }[];
    multi_stop_sequences: { year: number; sequence: number; stops: { stop: string; count: number }[] }[];
  };
  limitations: { label: string; detail: string }[];
  load_warnings: string[];
}

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (d && typeof d === 'object') {
      return new ApiError(res.status, d.code ?? 'http_error', d.message ?? `伺服器回應 ${res.status}`, d.field);
    }
    return new ApiError(res.status, 'http_error', typeof d === 'string' ? d : `伺服器回應 ${res.status}`);
  } catch {
    return new ApiError(res.status, 'http_error', `伺服器回應 ${res.status}，且內容無法解析。`);
  }
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network', '無法連線到資料服務。請確認後端已啟動，再按重試。');
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export interface Filters {
  start: string;
  end: string;
  route: string;
  direction: string;
}

export function filterQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ start: f.start, end: f.end, route: f.route, direction: f.direction, ...extra });
  return p.toString();
}

export async function downloadCsv(f: Filters, kind: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api/export?${filterQuery(f, { kind })}`);
  } catch {
    throw new ApiError(0, 'network', '無法連線到資料服務，CSV 未下載。');
  }
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${f.route}_${kind}_${f.start}_${f.end}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
