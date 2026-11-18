// 圖表顏色與字體一律取自 CSS tokens（tokens.css），不在這裡寫死色碼。
// ECharts 不解析 oklch()，所以用 canvas 把 token 轉成 rgb()。

export interface ChartTheme {
  ink: string;
  ink2: string;
  muted: string;
  rule: string;
  paper: string;
  paper2: string;
  paper3: string;
  accent: string;
  amber: string;
  font: string;
}

let cached: ChartTheme | null = null;

function toRgb(color: string, ctx: CanvasRenderingContext2D): string {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export function chartTheme(): ChartTheme {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const conv = (name: string) => (ctx ? toRgb(v(name), ctx) : v(name));
  cached = {
    ink: conv('--color-ink'),
    ink2: conv('--color-ink-2'),
    muted: conv('--color-muted'),
    rule: conv('--color-rule'),
    paper: conv('--color-paper'),
    paper2: conv('--color-paper-2'),
    paper3: conv('--color-paper-3'),
    accent: conv('--color-accent'),
    amber: conv('--color-accent-2'),
    font: v('--font-body'),
  };
  return cached;
}

/** 圖表共用：tooltip 是墨色底、琥珀數字（Wayfind：琥珀只出現在墨色上）。 */
export function tooltipBase(t: ChartTheme) {
  return {
    backgroundColor: t.ink,
    borderColor: t.ink,
    borderWidth: 0,
    padding: [8, 12],
    textStyle: { color: t.paper3, fontFamily: t.font, fontSize: 13 },
    extraCssText: 'border-radius:0;box-shadow:none;',
  };
}

export function axisBase(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.ink, width: 2 } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.font, fontSize: 12 },
    nameTextStyle: { color: t.ink, fontFamily: t.font, fontSize: 12, fontWeight: 500 as const },
    splitLine: { lineStyle: { color: t.rule, width: 1 } },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
