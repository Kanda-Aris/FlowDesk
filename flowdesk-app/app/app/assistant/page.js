'use client';
// ผู้ช่วย AI: ถามเรื่องงานของฉัน / วิธีทำงาน / ทีม (อ่านอย่างเดียว) เจ้าของไฟล์: A
// อ่าน ?ws=<id>&c=<เซสชัน> หลายเซสชัน: ส่วนตัว (เห็นเฉพาะฉัน) หรือสาธารณะ (ทุกคนใน workspace เห็นและถามได้)
// คำตอบแสดงเป็นข้อความธรรมดาเสมอ (ไม่ใช้ HTML)
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import { listSessions, createSession, renameSession, deleteSession, clearAssistant, loadMessages, subscribeAssistant, askAssistant, sessionErr } from '../../../lib/api-ai';
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
  const { askConfirm, askText } = useDialogs();
  const [me, setMe] = useState(null);
  const [perms, setPerms] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [owners, setOwners] = useState({}); // id -> ชื่อ ของเจ้าของเซสชันสาธารณะ
  const [cid, setCid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [pending, setPending] = useState(null); // คำถามของฉันที่กำลังรอคำตอบ (ยังไม่ถูกบันทึก)
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(null); // null | { title, visibility }
  const endRef = useRef(null);
  const cidRef = useRef(null);
  cidRef.current = cid;

  const conv = sessions.find((x) => x.id === cid) || null;
  const shared = conv?.visibility === 'shared';
  const canManage = !!conv && !!me && (conv.user_id === me.id || (shared && api.hasPerm(perms, 'workspace.edit')));

  const syncUrl = (id) => {
    try { const u = new URL(window.location.href); if (id) u.searchParams.set('c', id); else u.searchParams.delete('c'); window.history.replaceState(null, '', u.toString()); } catch {}
  };
  const loadOwners = async (rows, meId) => {
    const ids = [...new Set(rows.filter((x) => x.visibility === 'shared' && x.user_id !== meId).map((x) => x.user_id))];
    if (!ids.length) return {};
    const { data } = await api.sb.from('profiles').select('id, name, email').in('id', ids);
    const m = {};
    for (const p of data || []) m[p.id] = p.name || (p.email || '').split('@')[0] || 'ผู้ใช้';
    return m;
  };
  const refreshMsgs = useCallback(async (id) => {
    const target = id || cidRef.current;
    if (!target) return;
    try { const m = await loadMessages(target); if (cidRef.current === target) setMsgs(m); } catch (e) { setErr(errText(e)); }
  }, []);
  const refreshSessions = useCallback(async (meId, prefer) => {
    try {
      const rows = await listSessions(wsId);
      setSessions(rows);
      setOwners(await loadOwners(rows, meId));
      const keep = prefer || cidRef.current;
      const next = rows.find((x) => x.id === keep) ? keep : (rows.find((x) => x.visibility === 'private') || rows[0])?.id || null;
      if (next !== cidRef.current) { setCid(next); syncUrl(next); setMsgs([]); await refreshMsgs(next); setErr(keep && next !== keep ? 'แชทที่เปิดอยู่ถูกลบไปแล้ว' : ''); }
      return next;
    } catch (e) { setErr(errText(e)); return null; }
  }, [wsId, refreshMsgs]);

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      setMe(u);
      api.myPermissions(wsId).then(setPerms).catch(() => setPerms({ perms: [] }));
      const rows = await listSessions(wsId);
      setSessions(rows);
      setOwners(await loadOwners(rows, u.id));
      const want = new URLSearchParams(window.location.search).get('c');
      const first = rows.find((x) => x.id === want) || rows.find((x) => x.visibility === 'private') || rows[0];
      setCid(first?.id || null); cidRef.current = first?.id || null; syncUrl(first?.id || null);
      if (first) setMsgs(await loadMessages(first.id));
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [wsId, router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, pending, busy]);

  // เรียลไทม์: ข้อความใหม่ในแชทสาธารณะ + รายการแชทของ workspace (หน่วงเล็กน้อยเพื่อไม่ให้โหลดถี่)
  useEffect(() => {
    if (!wsId || !me) return undefined;
    let t1 = null; let t2 = null;
    const off = subscribeAssistant(wsId, cid, {
      onMessages: () => { clearTimeout(t1); t1 = setTimeout(() => refreshMsgs(), 400); },
      onSessions: () => { clearTimeout(t2); t2 = setTimeout(() => refreshSessions(me.id), 400); },
    });
    return () => { clearTimeout(t1); clearTimeout(t2); off(); };
  }, [wsId, cid, me, refreshMsgs, refreshSessions]);

  const pick = async (id) => {
    if (!id || id === cid || busy) return;
    setCid(id); cidRef.current = id; syncUrl(id); setMsgs([]); setErr(''); setCreating(null);
    await refreshMsgs(id);
  };

  const create = async () => {
    if (!creating || busy) return;
    setErr('');
    try {
      const id = await createSession(wsId, creating.visibility, creating.title.trim());
      setCreating(null);
      await refreshSessions(me?.id, id);
      setCid(id); cidRef.current = id; syncUrl(id); setMsgs([]);
    } catch (e) { setErr(sessionErr(e)); }
  };
  const rename = async () => {
    if (!conv) return;
    const t = await askText({ title: 'เปลี่ยนชื่อแชท', label: 'ชื่อแชท (ไม่เกิน 60 ตัวอักษร)', initial: conv.title, okLabel: 'บันทึก' });
    if (!t) return;
    try { await renameSession(conv.id, t); await refreshSessions(me?.id); } catch (e) { setErr(sessionErr(e)); }
  };
  const remove = async () => {
    if (!conv) return;
    const ok = await askConfirm({ title: 'ลบแชทนี้', message: shared ? 'แชทสาธารณะนี้และข้อความทั้งหมดจะถูกลบ ทุกคนใน workspace จะไม่เห็นอีก ย้อนกลับไม่ได้' : 'แชทนี้และข้อความทั้งหมดจะถูกลบ ย้อนกลับไม่ได้', okLabel: 'ลบ', danger: true });
    if (!ok) return;
    try { await deleteSession(conv.id); setCid(null); cidRef.current = null; await refreshSessions(me?.id); } catch (e) { setErr(sessionErr(e)); }
  };

  const send = async (raw) => {
    const q = (raw ?? text).trim();
    if (!q || busy || !wsId || !cid) return;
    setErr(''); setBusy(true); setText('');
    setPending(q);
    try {
      const r = await askAssistant(wsId, q, cid);
      if (r.saved === false) {
        setMsgs((m) => [...m, { id: 'u-' + Date.now(), role: 'user', content: q, user_id: me?.id, author: null }, { id: 'a-' + Date.now(), role: 'assistant', content: r.answer }]);
        setErr('ตอบแล้ว แต่บันทึกประวัติไม่สำเร็จ');
      } else await refreshMsgs(cid);
      setPending(null);
    } catch (e) {
      setPending(null);
      setText(q);
      setErr(e.message);
    }
    setBusy(false);
  };

  const clear = async () => {
    if (!conv) return;
    const ok = await askConfirm({ title: 'ล้างประวัติแชท', message: shared ? 'ข้อความทั้งหมดในแชทสาธารณะนี้จะถูกลบ ทุกคนจะไม่เห็นอีก ย้อนกลับไม่ได้' : 'ข้อความทั้งหมดในแชทนี้จะถูกลบ ย้อนกลับไม่ได้', okLabel: 'ล้าง', danger: true });
    if (!ok) return;
    try { await clearAssistant(conv.id); setMsgs([]); } catch (e) { setErr(sessionErr(e)); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  if (!wsId) return <div className={s.notice}><div>กรุณาเลือก Workspace จากเมนูด้านข้างก่อน</div><Link className={s.btnLink} href="/app">กลับหน้ารายการ</Link></div>;
  if (loading) return <div className="center muted">กำลังโหลด…</div>;

  const mineList = sessions.filter((x) => x.user_id === me?.id && x.visibility === 'private');
  const sharedList = sessions.filter((x) => x.visibility === 'shared');
  const ownerName = (x) => (x.user_id === me?.id ? 'ฉัน' : owners[x.user_id] || 'ผู้ใช้');

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>🤖 ผู้ช่วย AI</h1>
          <div className={s.sub}>ถามเรื่องงานของคุณ วิธีทำงาน หรือภาพรวมทีม · อ่านอย่างเดียว</div>
        </div>
      </div>

      <div className={s.bar}>
        <select className={s.select} value={cid || ''} onChange={(e) => pick(e.target.value)} disabled={busy} aria-label="เลือกแชท">
          {mineList.length > 0 && <optgroup label="ส่วนตัว (เห็นเฉพาะฉัน)">{mineList.map((x) => <option key={x.id} value={x.id}>{'🔒 ' + x.title}</option>)}</optgroup>}
          {sharedList.length > 0 && <optgroup label="สาธารณะ (ทุกคนใน workspace)">{sharedList.map((x) => <option key={x.id} value={x.id}>{'👥 ' + x.title + ' · ' + ownerName(x)}</option>)}</optgroup>}
        </select>
        <button onClick={() => setCreating(creating ? null : { title: '', visibility: 'private' })} disabled={busy}>{creating ? 'ยกเลิก' : '+ แชทใหม่'}</button>
      </div>

      {creating && (
        <div className={s.newBox}>
          <input className={s.input1} value={creating.title} maxLength={60} placeholder="ชื่อแชท (ไม่ใส่ก็ได้)" aria-label="ชื่อแชท" onChange={(e) => setCreating({ ...creating, title: e.target.value })} />
          <div className={s.seg} role="radiogroup" aria-label="ใครเห็นแชทนี้">
            <button type="button" role="radio" aria-checked={creating.visibility === 'private'} className={creating.visibility === 'private' ? s.segOn : ''} onClick={() => setCreating({ ...creating, visibility: 'private' })}>🔒 ส่วนตัว<span>เห็นเฉพาะฉัน</span></button>
            <button type="button" role="radio" aria-checked={creating.visibility === 'shared'} className={creating.visibility === 'shared' ? s.segOn : ''} onClick={() => setCreating({ ...creating, visibility: 'shared' })}>👥 สาธารณะ<span>ทุกคนใน workspace เห็นและถามได้</span></button>
          </div>
          <button className="primary" onClick={create}>สร้างแชท</button>
        </div>
      )}

      {conv && (
        <div className={s.meta}>
          <div className={shared ? s.badgeShared : s.badgePrivate}>
            {shared ? '👥 สาธารณะ: ทุกคนใน workspace เห็นข้อความและคำตอบทั้งหมด (ข้อมูลที่ AI ใช้จำกัดเฉพาะ workspace นี้)' : '🔒 ส่วนตัว: เห็นเฉพาะคุณ'}
          </div>
          <div className={s.actions}>
            {canManage && <button onClick={rename} disabled={busy}>เปลี่ยนชื่อ</button>}
            {canManage && msgs.length > 0 && <button onClick={clear} disabled={busy}>ล้างประวัติ</button>}
            {canManage && <button onClick={remove} disabled={busy}>ลบแชท</button>}
          </div>
        </div>
      )}

      <div className={s.thread} aria-live="polite">
        {msgs.length === 0 && !pending && (
          <div className={s.empty}>
            <div>ลองถามเช่น{shared ? ' (ทุกคนจะเห็นคำถามนี้)' : ''}</div>
            <div className={s.chips}>
              {SUGGESTIONS.map((x) => <button key={x} className={s.chip} onClick={() => send(x)} disabled={busy || !cid}>{x}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => {
          const isMe = m.role === 'user' && (!shared || m.user_id === me?.id);
          return (
            <div key={m.id} className={m.role === 'user' ? (isMe ? s.mine : s.other) : s.theirs}>
              <div className={s.col}>
                {shared && m.role === 'user' && <div className={s.who}>{isMe ? 'ฉัน' : m.author || 'ผู้ใช้'}</div>}
                <div className={s.bubble}>{m.content}</div>
              </div>
            </div>
          );
        })}
        {pending && <div className={s.mine}><div className={s.col}>{shared && <div className={s.who}>ฉัน</div>}<div className={s.bubble}>{pending}</div></div></div>}
        {busy && <div className={s.theirs}><div className={s.bubble + ' ' + s.typing}>กำลังดูข้อมูลและคิดคำตอบ…</div></div>}
        <div ref={endRef} />
      </div>

      {err && <div className="err" role="alert">{err}</div>}

      <div className={s.composer}>
        <textarea className={s.input} rows={2} value={text} maxLength={1000} placeholder="พิมพ์คำถาม (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={busy || !cid} aria-label="คำถามถึงผู้ช่วย" />
        <button className="primary" onClick={() => send()} disabled={busy || !cid || !text.trim()}>ส่ง</button>
      </div>
      <div className={s.note}>คำตอบจาก AI อาจผิดพลาด ตรวจสอบกับข้อมูลในแอปก่อนตัดสินใจ{shared ? ' · ในแชทสาธารณะ "ฉัน" หมายถึงคนที่ถามข้อความนั้น' : ''}</div>
    </div>
  );
}

export default function AssistantPage() {
  return <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}><AssistantInner /></Suspense>;
}
