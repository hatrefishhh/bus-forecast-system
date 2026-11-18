import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
  DataZoomComponent,
  SVGRenderer,
]);

interface Props {
  option: EChartsCoreOption;
  label: string;
  className?: string;
}

/** ECharts 包裝：跟隨容器大小，option 改變時整份替換（不殘留舊序列）。 */
export function EChart({ option, label, className = 'chart' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: 'svg', locale: 'ZH' });
    chart.current = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} role="img" aria-label={label} />;
}
