#!/usr/bin/env python3
"""整理6670刷卡資料（Python 3.10+）。
安裝：python -m pip install pandas openpyxl
執行：python prepare_bus_data.py --input-dir . --output-dir prepared
可選：--route 6670D --direction-map direction_map.csv
方向對照表欄位：year,route,boarding_stop,alighting_stop,direction
必須由站點資料核對後填寫；未提供的OD保留UNKNOWN。輸出UTF-8 BOM CSV。
不刪除疑似重複交易，不把缺資料補零，不輸出卡號或司機編號。
"""
from pathlib import Path
import argparse
import json
import re
import pandas as pd

COLS = ['路線公路編號','車號','上車時間(上)','計費站序(上)','計費站名(上)',
        '下車時間(下)','計費站序(下)','計費站名(下)']
RENAME = dict(zip(COLS, ['route','vehicle','boarding_time','boarding_sequence','boarding_stop',
                         'alighting_time','alighting_sequence','alighting_stop']))
KEY = ['year','route','boarding_stop','alighting_stop']

def save(df, path):
    df.to_csv(path, index=False, encoding='utf-8-sig')

def clean(df, filename, sheet):
    df = df.copy()
    df.columns = df.columns.astype(str).str.strip()
    missing = set(COLS) - set(df.columns)
    if missing:
        raise ValueError(f'{filename}/{sheet} 缺少欄位：{sorted(missing)}')
    # 原始Excel列號（第1列是標題）。在篩選前建立以利追查。
    df['source_row'] = range(2, len(df) + 2)
    df = df[COLS + ['source_row']].rename(columns=RENAME)
    for c in ['route','vehicle','boarding_stop','alighting_stop']:
        df[c] = df[c].astype('string').str.strip().fillna('')
    for c in ['boarding_time','alighting_time']:
        # 原始檔日期是Excel日期欄；不把意外數字誤讀為Unix奈秒。
        numeric = df[c].map(lambda x: isinstance(x, (int, float)) and pd.notna(x))
        df[c] = pd.to_datetime(df[c].mask(numeric), errors='coerce')
    for c in ['boarding_sequence','alighting_sequence']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df['source_file'], df['source_sheet'] = filename, sheet
    return df

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input-dir', type=Path, default=Path('.'))
    p.add_argument('--output-dir', type=Path, default=Path('prepared'))
    p.add_argument('--route', default='6670D')
    p.add_argument('--direction-map', type=Path)
    args = p.parse_args()
    files = sorted(f for f in args.input_dir.glob('*.xlsx')
                   if not f.name.startswith('~$') and '6670' in f.name)
    if not files:
        p.error('找不到檔名含6670的.xlsx，請將兩份原始檔放入input-dir。')
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    parts, audit = [], []
    for f in files:
        with pd.ExcelFile(f, engine='openpyxl') as book:
            for sheet in book.sheet_names:
                print(f'讀取 {f.name} / {sheet}', flush=True)
                raw = pd.read_excel(book, sheet_name=sheet)
                d = clean(raw, f.name, sheet)
                n = len(d)
                d = d[d.route.eq(args.route.strip())].copy()
                audit.append({'file':f.name,'sheet':sheet,'raw_rows':n,'selected_rows':len(d)})
                parts.append(d)
    d = pd.concat(parts, ignore_index=True)
    if d.empty:
        raise ValueError('所選路線沒有紀錄，請確認--route。')
    d['invalid_boarding_time'] = d.boarding_time.isna()
    d['invalid_alighting_time'] = d.alighting_time.isna()
    d['reversed_time'] = d.alighting_time.lt(d.boarding_time)
    d['missing_stop'] = d.boarding_stop.eq('') | d.alighting_stop.eq('')
    # 只以讀取欄位識別疑似重複：不同乘客可能同時同站上下車，不能自動刪除。
    d['possible_duplicate'] = d.duplicated(list(RENAME.values()), keep=False)
    d['year'] = d.boarding_time.dt.year.astype('Int64')
    expected = d.source_sheet.str.extract(r'(20\d{2})[.\-/](\d{1,2})')
    d['sheet_month_mismatch'] = ((d.boarding_time.dt.year != pd.to_numeric(expected[0],errors='coerce')) |
                                (d.boarding_time.dt.month != pd.to_numeric(expected[1],errors='coerce'))) & expected[0].notna() & d.boarding_time.notna()
    d['direction'] = 'UNKNOWN'
    if args.direction_map:
        m = pd.read_csv(args.direction_map, dtype='string').fillna('')
        if not set(KEY + ['direction']).issubset(m.columns):
            raise ValueError('方向對照表欄位不完整，請參照direction_map_template.csv。')
        for c in KEY + ['direction']:
            m[c] = m[c].str.strip()
        m['year'] = pd.to_numeric(m.year, errors='raise').astype('Int64')
        if m.duplicated(KEY).any():
            raise ValueError('方向對照表有重複鍵，請每年、路線、上下車站只保留一個方向。')
        d = d.drop(columns='direction').merge(m[KEY+['direction']],on=KEY,how='left',validate='many_to_one')
        d['direction'] = d.direction.fillna('UNKNOWN').replace('', 'UNKNOWN')
    flags = ['invalid_boarding_time','invalid_alighting_time','reversed_time','missing_stop','possible_duplicate','sheet_month_mismatch']
    save(d[d[flags].any(axis=1)], out/'review_rows.csv')
    # 上車時刻有效即可統計上車旅次；下車異常另留報告，不連帶刪除上車。
    valid = d[~d.invalid_boarding_time].copy()
    valid['date'] = valid.boarding_time.dt.strftime('%Y-%m-%d')
    valid['hour'] = valid.boarding_time.dt.hour
    valid['weekday'] = valid.boarding_time.dt.dayofweek # 0=週一，6=週日
    valid['is_weekend'] = valid.weekday.ge(5) # 非國定假日標記
    save(valid, out/'cleaned_trips.csv')
    hourly = valid.groupby(['date','route','hour'],as_index=False).size().rename(columns={'size':'trips'})
    save(hourly, out/'hourly_all_directions.csv')
    bydir = valid.groupby(['date','route','direction','hour'],as_index=False).size().rename(columns={'size':'trips'})
    save(bydir, out/'hourly_by_direction.csv')
    daily = valid.groupby(['date','route'],as_index=False).size().rename(columns={'size':'trips'})
    save(daily, out/'daily_trips.csv')
    od = valid.groupby(KEY,as_index=False).size().rename(columns={'size':'trips'})
    od['direction'] = ''
    save(od, out/'direction_map_template.csv')
    stations = pd.concat([valid[['year','route','boarding_sequence','boarding_stop']].rename(columns={'boarding_sequence':'sequence','boarding_stop':'stop'}),
                          valid[['year','route','alighting_sequence','alighting_stop']].rename(columns={'alighting_sequence':'sequence','alighting_stop':'stop'})])
    save(stations.groupby(['year','route','sequence','stop'],dropna=False,as_index=False).size(),out/'station_mapping_review.csv')
    # 逐年列出無紀錄日期，並不宣稱是停駛或零旅次。
    years = sorted(set(int(y) for f in files for y in re.findall(r'20\d{2}',f.name)) | set(valid.year.dropna().astype(int)))
    observed = set(valid.date)
    gaps = [{'date':dt.strftime('%Y-%m-%d'),'status':'NO_RECORD_VERIFY'} for y in years
            for dt in pd.date_range(f'{y}-01-01', f'{y}-12-31') if dt.strftime('%Y-%m-%d') not in observed]
    save(pd.DataFrame(gaps,columns=['date','status']),out/'dates_without_records.csv')
    save(pd.DataFrame(audit),out/'sheet_audit.csv')
    report = {'route':args.route,'selected_rows':len(d),'counted_boarding_trips':len(valid),
              'unknown_direction_rows':int(valid.direction.eq('UNKNOWN').sum()),
              'flags':{c:int(d[c].sum()) for c in flags},
              'notes':['沒有刪除疑似重複紀錄；可能是不同乘客。',
                       '小時表只含有紀錄時段，未補零，尚非可直接訓練的完整時間網格。',
                       'UNKNOWN須經方向對照核對；全方向表可先做總量分析。',
                       '刷卡旅次不等於獨立乘客、車上人數或未滿足需求。',
                       'is_weekend僅週六日；國定假日需另提供行事曆。']}
    (out/'quality_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    assert int(hourly.trips.sum()) == len(valid) == int(bydir.trips.sum())
    print(f'完成：{len(valid):,}筆有效上車紀錄，結果位於 {out.resolve()}',flush=True)

if __name__ == '__main__':
    main()
