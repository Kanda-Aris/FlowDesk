'use client';
// หน้าต่างโต้ตอบกลาง (AI B) ใช้แทน prompt() / confirm() ของเบราว์เซอร์
//
// วิธีใช้:
//   <DialogProvider> ... </DialogProvider>          // ครอบหน้า (A ติดตั้งครั้งเดียวใน layout ได้)
//   const { askText, askConfirm } = useDialogs();
//   const name = await askText({ title: 'สร้างช่อง', label: 'ชื่อช่อง' });   // string (ตัดช่องว่างแล้ว) หรือ null ถ้ายกเลิก
//   const ok = await askConfirm({ title: 'ลบงาน', message: '...', danger: true }); // true / false
//
// ถ้ามี DialogProvider ครอบอยู่แล้ว Provider ที่ซ้อนอยู่ข้างในจะไม่สร้างตัวใหม่ (ใช้ตัวนอกต่อ)
// จึงปล่อยให้หน้าของ B ครอบเองไว้ได้ แม้ A จะติดตั้งใน layout แล้วก็ไม่ซ้ำซ้อน
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dialogs.module.css';

const Ctx = createContext(null);
let nextId = 1;

export function useDialogs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialogs ต้องใช้ภายใน <DialogProvider>');
  return v;
}

export function DialogProvider({ children }) {
  const parent = useContext(Ctx);
  if (parent) return <>{children}</>;
  return <Root>{children}</Root>;
}

function Root({ children }) {
  const [queue, setQueue] = useState([]); // ถามซ้อนกันได้ จะแสดงทีละอัน
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const ask = useCallback((kind, opts) => new Promise((resolve) => {
    setQueue((q) => [...q, { id: nextId++, kind, opts: opts || {}, resolve, done: false }]);
  }), []);

  const api = useMemo(() => ({
    askText: (o) => ask('text', o),
    askConfirm: (o) => ask('confirm', o),
  }), [ask]);

  const finish = useCallback((result) => {
    const cur = queueRef.current[0];
    if (!cur || cur.done) return; // กันเรียกซ้ำ (เช่น กด Esc กับคลิกพร้อมกัน)
    cur.done = true;
    cur.resolve(result);
    setQueue((q) => q.slice(1));
  }, []);

  // ถ้า Provider ถูกถอดออกขณะยังมีคำถามค้าง ให้ถือว่ายกเลิก ไม่ปล่อยให้ promise ค้าง
  useEffect(() => () => {
    queueRef.current.forEach((d) => { if (!d.done) d.resolve(d.kind === 'text' ? null : false); });
  }, []);

  const cur = queue[0];
  return (
    <Ctx.Provider value={api}>
      {children}
      {cur && typeof document !== 'undefined' && createPortal(<Dialog key={cur.id} item={cur} onDone={finish} />, document.body)}
    </Ctx.Provider>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function Dialog({ item, onDone }) {
  const { kind, opts } = item;
  const isText = kind === 'text';
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const [value, setValue] = useState(opts.initial || '');
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const okRef = useRef(null);
  const cancelRef = useRef(null);

  const cancel = () => onDone(isText ? null : false);
  const submit = () => {
    if (isText) {
      const v = value.trim();
      if (!v) return; // ค่าว่างไม่รับ
      onDone(v);
    } else {
      onDone(true);
    }
  };

  // ย้ายโฟกัสเข้าหน้าต่าง, ล็อกการเลื่อนของหน้าหลัง, และคืนโฟกัสให้ที่เดิมเมื่อปิด
  useEffect(() => {
    const prev = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (isText) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      (opts.danger ? cancelRef : okRef).current?.focus(); // ลบ/อันตราย: โฟกัสที่ "ยกเลิก" ไว้ก่อน
    }
    return () => {
      document.body.style.overflow = overflow;
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc = ยกเลิก, Tab วนอยู่ในหน้าต่าง
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Tab') {
      const els = [...boxRef.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const title = opts.title || (isText ? 'กรอกข้อมูล' : 'ยืนยัน');
  const okLabel = opts.okLabel || 'ตกลง';

  return (
    // คลิกพื้นหลัง = ยกเลิก
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div
        ref={boxRef}
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={!isText && opts.message ? descId : undefined}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={styles.title}>{title}</h2>

        {isText ? (
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {opts.label && <label htmlFor={inputId} className={styles.label}>{opts.label}</label>}
            <input
              ref={inputRef}
              id={inputId}
              className={styles.input}
              value={value}
              maxLength={opts.maxLength}
              placeholder={opts.placeholder}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              // Enter ที่ใช้เลือกคำภาษาไทยจาก IME ต้องไม่ส่งฟอร์ม
              onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
            />
            <div className={styles.actions}>
              <button type="button" ref={cancelRef} onClick={cancel}>ยกเลิก</button>
              <button type="submit" ref={okRef} className="primary" disabled={!value.trim()}>{okLabel}</button>
            </div>
          </form>
        ) : (
          <>
            {opts.message && <p id={descId} className={styles.msg}>{opts.message}</p>}
            <div className={styles.actions}>
              <button type="button" ref={cancelRef} onClick={cancel}>ยกเลิก</button>
              <button type="button" ref={okRef} className={opts.danger ? styles.danger : 'primary'} onClick={submit}>{okLabel}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
