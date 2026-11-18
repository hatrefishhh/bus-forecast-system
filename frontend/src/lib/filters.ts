// 日期條件驗證：URL 還原與篩選列共用同一套規則。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RangeErrors {
  start?: string;
  end?: string;
}

function isRealDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateRange(start: string, end: string, period: { start: string; end: string }): RangeErrors {
  const errors: RangeErrors = {};
  if (!start) errors.start = '請選擇起日。';
  else if (!isRealDate(start)) errors.start = '起日格式應為 YYYY-MM-DD。';
  else if (start < period.start || start > period.end) errors.start = `起日需在 ${period.start} 至 ${period.end} 之間。`;

  if (!end) errors.end = '請選擇迄日。';
  else if (!isRealDate(end)) errors.end = '迄日格式應為 YYYY-MM-DD。';
  else if (end < period.start || end > period.end) errors.end = `迄日需在 ${period.start} 至 ${period.end} 之間。`;

  if (!errors.start && !errors.end && start > end) errors.start = '起日不可晚於迄日，請調整其中一個日期。';
  return errors;
}

export function hasErrors(e: RangeErrors): boolean {
  return Boolean(e.start || e.end);
}
