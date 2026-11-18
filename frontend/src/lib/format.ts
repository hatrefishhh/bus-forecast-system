const intFmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : intFmt.format(n);
}

export function fmtAvg(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : oneDecimal.format(n);
}

const twoDecimals = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtPct(part: number, whole: number): string {
  if (!whole) return '不適用';
  const pct = (part / whole) * 100;
  if (part > 0 && pct < 0.01) return '<0.01%';
  return `${(pct < 1 ? twoDecimals : oneDecimal).format(pct)}%`;
}

export function fmtRange(start: string, end: string): string {
  return start === end ? start : `${start} 至 ${end}`;
}

/** 'YYYY-MM-DD' 轉成本地午夜時間戳；只用於圖表座標，不做時區換算。 */
export function dateToTs(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).getTime();
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) {
    const days = Math.floor(h / 24);
    return `${days} 天 ${h % 24} 小時 ${m} 分`;
  }
  return `${h} 小時 ${m} 分`;
}
