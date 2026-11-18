import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 說明浮層：補充、限制、免責文字一律放這裡，不在畫面上寫成段落。
// 開啟：滑鼠停留 800ms、鍵盤 focus 立即、點一下（觸控）。關閉：Esc、失焦、點外面、再點一下。
// 浮層掛在 body，避免被表格的捲動容器裁切；位置依視窗邊緣自動上下翻轉、左右夾住。
// 關閉時用 hidden；aria-describedby 直接指向它，螢幕閱讀器仍讀得到說明。

const HOVER_DELAY = 800;
const LEAVE_DELAY = 120;
const EDGE = 8;
const GAP = 6;

interface Props {
  /** 浮出的說明內容 */
  tip: ReactNode;
  /** 有 children：包住這段文字並加虛線底線；沒有：顯示小圖示 */
  children?: ReactNode;
  /** 圖示版的可讀名稱，例如「無紀錄的說明」 */
  label?: string;
  className?: string;
}

export function InfoTip({ tip, children, label = '說明', className }: Props) {
  const tipId = `${useId()}-tip`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const hoverRef = useRef(false);
  const openAtPress = useRef<boolean | null>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hover || focus || pinned);

  const place = useCallback(() => {
    const t = triggerRef.current;
    const el = tipRef.current;
    if (!t || !el) return;
    const r = t.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = r.top - GAP - h;
    let side = 'top';
    if (top < EDGE) {
      top = r.bottom + GAP;
      side = 'bottom';
      if (top + h > vh - EDGE) top = Math.max(EDGE, vh - EDGE - h);
    }
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), Math.max(EDGE, vw - EDGE - w));
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    el.dataset.side = side;
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, tip]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setDismissed(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setPinned(false);
      hoverRef.current = false;
      setHover(false);
    };
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove, { passive: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, place]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enter = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    if (hoverRef.current) return;
    timer.current = window.setTimeout(() => {
      hoverRef.current = true;
      setHover(true);
      setDismissed(false);
    }, HOVER_DELAY);
  };

  const leave = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    if (!hoverRef.current) return;
    timer.current = window.setTimeout(() => {
      hoverRef.current = false;
      setHover(false);
    }, LEAVE_DELAY);
  };

  const icon = children === undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`infotip ${icon ? 'infotip--icon' : 'infotip--term'}${className ? ` ${className}` : ''}`}
        aria-label={icon ? label : undefined}
        aria-describedby={tipId}
        data-open={open || undefined}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onPointerDown={() => {
          openAtPress.current = open;
        }}
        onClick={() => {
          const was = openAtPress.current ?? open;
          openAtPress.current = null;
          if (was) {
            setPinned(false);
            setDismissed(true);
          } else {
            setPinned(true);
            setDismissed(false);
          }
        }}
        onFocus={(e) => {
          // 只有鍵盤 focus 立即打開；滑鼠或觸控交給 hover 與 click
          if (e.currentTarget.matches(':focus-visible')) {
            setFocus(true);
            setDismissed(false);
          }
        }}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
      >
        {icon ? <span aria-hidden="true">i</span> : children}
      </button>
      {createPortal(
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className="infotip__tip"
          data-open={open || undefined}
          hidden={!open}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onMouseDown={(e) => e.preventDefault()}
        >
          {tip}
        </span>,
        document.body,
      )}
    </>
  );
}
