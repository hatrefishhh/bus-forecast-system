import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

interface Props {
  title: string;
  /** 標題下最多一行副標，例如「單位：次」 */
  sub?: ReactNode;
  /** 標題旁的說明圖示 */
  tip?: ReactNode;
  /** 標題列右側：圖例或動作 */
  aside?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, sub, tip, aside, children }: Props) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel__head">
        <div className="panel__titles">
          <div className="panel__title-row">
            <h2>{title}</h2>
            {tip && <InfoTip tip={tip} label={`${title}的說明`} />}
          </div>
          {sub && <p className="panel__caption">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
