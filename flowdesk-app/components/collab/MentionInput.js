'use client';
// ช่องพิมพ์ข้อความที่มีตัวเลือก @mention (AI B)
// พิมพ์ "@" แล้วเลือกชื่อจากรายการ ในช่องจะเห็น @ชื่อ แต่ตอนส่งให้เรียก toTokens() เพื่อแปลงเป็น @[uuid]
// props: value, onChange(string), members (จาก listMembers), meId, picked (useRef(new Map())), onKeyDown, className, ...textarea props
import { useMemo, useRef, useState } from 'react';
import { memberName } from './mentions';
import styles from './MentionInput.module.css';

export default function MentionInput({ value, onChange, members, meId, picked, onKeyDown, className, ...rest }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null); // { start, end, query } เมื่อกำลังพิมพ์ @...

  const people = useMemo(
    () => (members || []).map((x) => x.profiles).filter((p) => p && p.id !== meId && memberName(p)),
    [members, meId]
  );
  const q = at ? at.query.toLowerCase() : '';
  const matches = at ? people.filter((p) => (memberName(p) + ' ' + (p.email || '')).toLowerCase().includes(q)).slice(0, 20) : [];

  // ดูว่าเคอร์เซอร์อยู่หลัง "@คำค้น" หรือไม่ (ต้องขึ้นต้นบรรทัดหรือมีช่องว่างนำหน้า)
  const detect = (el) => {
    const caret = el.selectionStart;
    const m = el.value.slice(0, caret).match(/(?:^|\s)@([^\s@\[\]]{0,30})$/);
    setAt(m ? { start: caret - m[1].length - 1, end: caret, query: m[1] } : null);
  };

  const pick = (p) => {
    const name = memberName(p);
    picked.current.set(name, p.id);
    onChange(value.slice(0, at.start) + '@' + name + ' ' + value.slice(at.end));
    const caret = at.start + name.length + 2;
    setAt(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(caret, caret); }
    });
  };

  const key = (e) => {
    if (at && matches.length) {
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) { e.preventDefault(); pick(matches[0]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAt(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className={styles.root}>
      <textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }}
        onKeyDown={key}
        onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detect(e.target); }}
        onClick={(e) => detect(e.target)}
        onBlur={() => setAt(null)}
      />
      {at && matches.length > 0 && (
        <ul className={styles.list} aria-label="เลือกสมาชิกที่ต้องการกล่าวถึง">
          {matches.map((p) => (
            <li key={p.id}>
              {/* onMouseDown กัน textarea เสียโฟกัสก่อนที่จะคลิกเลือก */}
              <button type="button" className={styles.opt} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <b>{memberName(p)}</b>
                {p.name && p.email && <span>{p.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
