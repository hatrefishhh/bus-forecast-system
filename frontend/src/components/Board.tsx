import type { History } from '../lib/api';
import { fmtAvg, fmtInt, fmtRange } from '../lib/format';
import { InfoTip } from './InfoTip';

/** 摘要列：一塊墨色告示牌放期間總旅次，其餘三格同框相鄰。 */
export function Board({ data }: { data: History }) {
  const s = data.summary;
  const period = fmtRange(data.filters.start, data.filters.end);
  const none = s.recorded_days === 0;
  return (
    <section className="board" aria-label={`摘要，期間 ${period}`}>
      <div className="board__cell board__cell--plate">
        <span className="board__label">
          期間總刷卡旅次
          <InfoTip tip="刷卡旅次不等於獨立乘客人數，也不是車上人數。" label="刷卡旅次的說明" />
        </span>
        {none ? (
          <span className="board__figure board__figure--none">無紀錄</span>
        ) : (
          <span className="board__figure">
            {fmtInt(s.total_trips)}
            <small>次</small>
          </span>
        )}
        <span className="board__note">共 {fmtInt(s.calendar_days)} 天</span>
      </div>
      <div className="board__cell">
        <span className="board__label">有紀錄天數</span>
        <span className="board__figure">
          {fmtInt(s.recorded_days)}
          <small>天</small>
        </span>
      </div>
      <div className="board__cell">
        <span className="board__label">
          無紀錄天數
          <InfoTip tip="這些日期沒有任何刷卡紀錄，未補 0；不代表停駛。" label="無紀錄天數的說明" />
        </span>
        <span className="board__figure">
          {fmtInt(s.no_record_days)}
          <small>天</small>
        </span>
      </div>
      <div className="board__cell">
        <span className="board__label">
          有紀錄日平均
          <InfoTip tip="總旅次 ÷ 有紀錄天數；無紀錄日不計入。" label="有紀錄日平均的說明" />
        </span>
        {s.avg_trips_per_recorded_day === null ? (
          <span className="board__figure board__figure--none">不適用</span>
        ) : (
          <span className="board__figure">
            {fmtAvg(s.avg_trips_per_recorded_day)}
            <small>次/日</small>
          </span>
        )}
      </div>
    </section>
  );
}
