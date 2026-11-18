import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { DailyPoint, GroupRow, HourlyPoint } from '../lib/api';
import { axisBase, chartTheme, escapeHtml, tooltipBase } from '../lib/chartTheme';
import { dateToTs, fmtAvg, fmtInt } from '../lib/format';
import { EChart } from './EChart';

const HALF_DAY = 12 * 3600 * 1000;

/** 連續的無紀錄日期合併成區段，畫成琥珀細帶。 */
function noRecordRuns(points: DailyPoint[]): [number, number][] {
  const runs: [number, number][] = [];
  let open: number | null = null;
  let last = 0;
  for (const p of points) {
    const ts = dateToTs(p.date);
    if (p.status === 'no_record') {
      if (open === null) open = ts;
      last = ts;
    } else if (open !== null) {
      runs.push([open, last]);
      open = null;
    }
  }
  if (open !== null) runs.push([open, last]);
  return runs;
}

export function DailyChart({ points, periodLabel }: { points: DailyPoint[]; periodLabel: string }) {
  const option = useMemo<EChartsCoreOption>(() => {
    const t = chartTheme();
    const ax = axisBase(t);
    const byTs = new Map(points.map((p) => [dateToTs(p.date), p]));
    const runs = noRecordRuns(points);
    const long = points.length > 120;
    const showSymbols = points.length <= 45;
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      grid: { left: 64, right: 24, top: 32, bottom: long ? 84 : 48 },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.ink, width: 1 } },
        formatter: (params: { value: [number, number | null] }[]) => {
          const ts = params[0]?.value?.[0];
          const p = ts !== undefined ? byTs.get(ts) : undefined;
          if (!p) return '';
          const head = `${p.date}（${p.weekday_label}）`;
          if (p.trips === null) {
            return `${escapeHtml(head)}<br/><b style="color:${t.amber}">無紀錄</b>（缺口，未補 0）`;
          }
          return `${escapeHtml(head)}<br/>刷卡旅次 <b style="color:${t.amber}">${fmtInt(p.trips)}</b> 次`;
        },
      },
      xAxis: {
        type: 'time',
        name: '日期',
        nameLocation: 'end',
        nameGap: 8,
        min: dateToTs(points[0].date) - HALF_DAY,
        max: dateToTs(points[points.length - 1].date) + HALF_DAY,
        ...ax,
        splitLine: { show: false },
        axisLabel: {
          ...ax.axisLabel,
          hideOverlap: true,
          formatter: {
            year: '{yyyy}',
            month: '{yyyy}-{MM}',
            day: '{MM}-{dd}',
          },
        },
      },
      yAxis: {
        type: 'value',
        name: '刷卡旅次（次）',
        nameLocation: 'end',
        nameGap: 12,
        min: 0,
        ...ax,
        axisLine: { show: false },
        splitNumber: 4,
      },
      dataZoom: long
        ? [
            { type: 'inside', filterMode: 'none' },
            {
              type: 'slider',
              filterMode: 'none',
              height: 24,
              bottom: 12,
              borderColor: t.ink,
              fillerColor: 'transparent',
              backgroundColor: t.paper,
              dataBackground: { lineStyle: { color: t.muted }, areaStyle: { color: t.paper2 } },
              selectedDataBackground: { lineStyle: { color: t.accent }, areaStyle: { color: t.paper2 } },
              handleStyle: { color: t.paper3, borderColor: t.ink },
              moveHandleStyle: { color: t.ink },
              textStyle: { color: t.muted, fontFamily: t.font, fontSize: 11 },
              labelFormatter: (v: number) => {
                const d = new Date(v);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              },
            },
          ]
        : [],
      series: [
        {
          name: '每日刷卡旅次',
          type: 'line',
          data: points.map((p) => [dateToTs(p.date), p.trips]),
          connectNulls: false,
          showSymbol: showSymbols,
          symbol: 'rect',
          symbolSize: 6,
          lineStyle: { color: t.accent, width: 2 },
          itemStyle: { color: t.accent },
          emphasis: { disabled: true },
          markArea: runs.length
            ? {
                silent: true,
                itemStyle: { color: t.amber, opacity: 0.85 },
                label: { show: false },
                data: runs.map(([a, b]) => [{ xAxis: a - HALF_DAY }, { xAxis: b + HALF_DAY }]),
              }
            : undefined,
        },
      ],
    };
  }, [points]);

  const recorded = points.filter((p) => p.trips !== null).length;
  return (
    <EChart
      option={option}
      label={`每日刷卡旅次折線圖，${periodLabel}，${recorded} 個有紀錄日，${points.length - recorded} 個無紀錄日以缺口標示`}
    />
  );
}

export function HourlyChart({ points, periodLabel }: { points: HourlyPoint[]; periodLabel: string }) {
  const option = useMemo<EChartsCoreOption>(() => {
    const t = chartTheme();
    const ax = axisBase(t);
    const runs: [number, number][] = [];
    points.forEach((p, i) => {
      if (p.status !== 'no_record') return;
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun[1] === i - 1) lastRun[1] = i;
      else runs.push([i, i]);
    });
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      grid: { left: 72, right: 16, top: 32, bottom: 48 },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.paper2, opacity: 0.6 } },
        formatter: (params: { dataIndex: number }[]) => {
          const p = points[params[0]?.dataIndex ?? 0];
          const span = `${String(p.hour).padStart(2, '0')}:00 至 ${String(p.hour).padStart(2, '0')}:59`;
          if (p.trips === null) return `${span}<br/><b style="color:${t.amber}">無紀錄</b>（期間內沒有任何刷卡）`;
          return `${span}<br/>期間累計 <b style="color:${t.amber}">${fmtInt(p.trips)}</b> 次<br/>有紀錄 ${fmtInt(p.recorded_days)} 天`;
        },
      },
      xAxis: {
        type: 'category',
        name: '時',
        nameGap: 8,
        data: points.map((p) => String(p.hour)),
        ...ax,
        splitLine: { show: false },
        axisLabel: { ...ax.axisLabel, interval: 1 },
      },
      yAxis: {
        type: 'value',
        name: '期間累計刷卡旅次（次）',
        nameLocation: 'end',
        nameGap: 12,
        min: 0,
        ...ax,
        axisLine: { show: false },
        splitNumber: 4,
      },
      series: [
        {
          name: '期間累計刷卡旅次',
          type: 'bar',
          data: points.map((p) => p.trips),
          barMaxWidth: 24,
          itemStyle: { color: t.accent, borderRadius: 0 },
          emphasis: { itemStyle: { color: t.ink } },
          markArea: runs.length
            ? {
                silent: true,
                itemStyle: { color: t.paper2 },
                label: {
                  show: true,
                  position: 'insideTop',
                  color: t.muted,
                  fontFamily: t.font,
                  fontSize: 12,
                  formatter: '無紀錄',
                },
                data: runs.map(([a, b]) => [{ xAxis: String(points[a].hour) }, { xAxis: String(points[b].hour) }]),
              }
            : undefined,
        },
      ],
    };
  }, [points]);

  return (
    <EChart
      className="chart chart--short"
      option={option}
      label={`各小時期間累計刷卡旅次長條圖，${periodLabel}，${points.filter((p) => p.trips === null).length} 個時段無紀錄`}
    />
  );
}

export function WeekdayChart({ rows, periodLabel }: { rows: GroupRow[]; periodLabel: string }) {
  const option = useMemo<EChartsCoreOption>(() => {
    const t = chartTheme();
    const ax = axisBase(t);
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      grid: { left: 72, right: 16, top: 32, bottom: 56 },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.paper2, opacity: 0.6 } },
        formatter: (params: { dataIndex: number }[]) => {
          const r = rows[params[0]?.dataIndex ?? 0];
          if (r.avg_trips_per_recorded_day === null) {
            return `${r.label}<br/><b style="color:${t.amber}">無紀錄</b>（期間內 ${r.calendar_days} 天皆無紀錄）`;
          }
          return [
            r.label,
            `有紀錄日平均 <b style="color:${t.amber}">${fmtAvg(r.avg_trips_per_recorded_day)}</b> 次`,
            `樣本 ${fmtInt(r.recorded_days)} 天，累計 ${fmtInt(r.total_trips)} 次`,
            r.no_record_days ? `另有 ${r.no_record_days} 天無紀錄，未計入平均` : '',
          ]
            .filter(Boolean)
            .join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => `${r.label}\n${r.recorded_days}`),
        ...ax,
        splitLine: { show: false },
        axisLabel: { ...ax.axisLabel, interval: 0, lineHeight: 16 },
      },
      yAxis: {
        type: 'value',
        name: '有紀錄日平均旅次（次/日）',
        nameLocation: 'end',
        nameGap: 12,
        min: 0,
        ...ax,
        axisLine: { show: false },
        splitNumber: 4,
      },
      series: [
        {
          name: '有紀錄日平均旅次',
          type: 'bar',
          data: rows.map((r) => r.avg_trips_per_recorded_day),
          barMaxWidth: 24,
          itemStyle: { color: t.accent, borderRadius: 0 },
          emphasis: { itemStyle: { color: t.ink } },
          label: {
            show: true,
            position: 'top',
            color: t.ink,
            fontFamily: t.font,
            fontSize: 11,
            formatter: (p: { value: number | null }) => (p.value === null ? '無紀錄' : fmtInt(Math.round(p.value))),
          },
        },
      ],
    };
  }, [rows]);

  return (
    <EChart
      className="chart chart--short"
      option={option}
      label={`各星期有紀錄日平均刷卡旅次長條圖，${periodLabel}，標示各組樣本天數`}
    />
  );
}
