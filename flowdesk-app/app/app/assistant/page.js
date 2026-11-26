'use client';
// ผู้ช่วย AI: ถามเรื่องงานของฉัน / วิธีทำงาน / ทีม (อ่านอย่างเดียว) เจ้าของไฟล์: A
// อ่าน ?ws=<id> คำตอบแสดงเป็นข้อความธรรมดาเสมอ (ไม่ใช้ HTML)
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import { loadAssistant, askAssistant, clearAssistant } from '../../../lib/api-ai';
import { errText } from '../../../lib/ui';
import { useDialogs } from '../../../components/ui/Dialogs';
import s from './Assistant.module.css';

const SUGGESTIONS = [
  'วันนี้ฉันควรทำงานอะไรก่อน',
  'งานไหนของฉันเลยกำหนดแล้ว',
  'สรุปวิธีทำงานของฉันช่วง 30 วันที่ผ่านมา',
  'ใครในทีมมีงานค้างเยอะที่สุด',
];

function AssistantInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');
  const { askConfirm } = useDialogs();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const endRef = useRef(null);

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      const r = await loadAssistant(wsId);
      setConv(r.conversationId); setMsgs(r.messages);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [wsId, router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  const send = async (raw) => {
    const q = (raw ?? text).trim();
    if (!q || busy || !wsId) return;
    setErr(''); setBusy(true); setText('');
    const tmp = { id: 'tmp-' + Date.now(), role: 'user', content: q };
    setMsgs((m) => [...m, tmp]);
    try {
      const r = await askAssistant(wsId, q);
      setMsgs((m) => [...m, { id: 'a-' + Date.now(), role: 'assistant', content: r.answer }]);
      if (r.saved === false) setErr('ตอบแล้ว แต่บันทึกประวัติไม่สำเร็จ');
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== tmp.id));
      setText(q);
      setErr(e.message);
    }
    setBusy(false);
  };

  const clear = async () => {
    if (!conv) return;
    const ok = await askConfirm({ title: 'ล้างประวัติแชตผู้ช่วย', message: 'ประวัติแชตกับผู้ช่วยของคุณใน workspace นี้จะถูกลบ ย้อนกลับไม่ได้', okLabel: 'ล้าง', danger: true });
    if (!ok) return;
    try { await clearAssistant(conv); setMsgs([]); } catch (e) { setErr(errText(e)); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  if (!wsId) return <div className={s.notice}><div>กรุณาเลือก Workspace จากเมนูด้านข้างก่อน</div><Link className={s.btnLink} href="/app">กลับหน้ารายการ</Link></div>;
  if (loading) return <div className="center muted">กำลังโหลด…</div>;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>🤖 ผู้ช่วย AI</h1>
          <div className={s.sub}>ถามเรื่องงานของคุณ วิธีทำงาน หรือภาพรวมทีม · อ่านอย่างเดียว · ประวัติเห็นเฉพาะคุณ</div>
        </div>
        {msgs.length > 0 && <button onClick={clear} disabled={busy}>ล้างประวัติ</button>}
      </div>

      <div className={s.thread} aria-live="polite">
        {msgs.length === 0 && (
          <div className={s.empty}>
            <div>ลองถามเช่น</div>
            <div className={s.chips}>
              {SUGGESTIONS.map((x) => <button key={x} className={s.chip} onClick={() => send(x)} disabled={busy}>{x}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={m.role === 'user' ? s.mine : s.theirs}>
            <div className={s.bubble}>{m.content}</div>
          </div>
        ))}
        {busy && <div className={s.theirs}><div className={s.bubble + ' ' + s.typing}>กำลังดูข้อมูลและคิดคำตอบ…</div></div>}
        <div ref={endRef} />
      </div>

      {err && <div className="err" role="alert">{err}</div>}

      <div className={s.composer}>
        <textarea className={s.input} rows={2} value={text} maxLength={1000} placeholder="พิมพ์คำถาม (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={busy} aria-label="คำถามถึงผู้ช่วย" />
        <button className="primary" onClick={() => send()} disabled={busy || !text.trim()}>ส่ง</button>
      </div>
      <div className={s.note}>คำตอบจาก AI อาจผิดพลาด ตรวจสอบกับข้อมูลในแอปก่อนตัดสินใจ</div>
    </div>
  );
}

export default function AssistantPage() {
  return <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}><AssistantInner /></Suspense>;
}
