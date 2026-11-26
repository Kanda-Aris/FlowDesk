'use client';
// TaskTable: ตารางงานที่เรียงลำดับ/กรองได้ แก้สถานะ ความสำคัญ ผู้รับผิดชอบ วันกำหนดส่ง ลบงาน และเลือกหลายงานเพื่อแก้พร้อมกัน
// ตารางนี้ "ไม่เรียกฐานข้อมูลเอง" หน้าที่เรียกคือ onChange / onDelete / onOpen ที่หน้าหลักส่งมา
//
// props:
//   tasks     งานของโปรเจกต์ (แถวจาก tasks)
//   members   ผลจาก listMembers(ws) = [{ role, profiles: { id, name, email } }]
//   onChange  (taskId, patch) => void | Promise   เช่น patch = { status: 'complete' }
//   onDelete  (taskId) => void | Promise          หน้าหลักเป็นคนถามยืนยันและลบ
//   onOpen    (taskId) => void                    (ไม่บังคับ) ถ้ามี ชื่องานจะเป็นปุ่มที่เปิดรายละเอียดงาน
//   readOnly  true = แก้/ลบ/เลือกหลายงานไม่ได้ (เช่น ผู้ดู)
import { useMemo, useState } from 'react';
import { STATUS, STATUS_ORDER, PRIO, todayStr, friendlyError } from '../../lib/api-views';
import s from './TaskTable.module.css';

const PRIO_ORDER = ['urgent', 'high', 'normal', 'low'];
const SORTS = { none: 'เรียงตามเดิม', due: 'กำหนดส่ง', priority: 'ความสำคัญ', assignee: 'ผู้รับผิดชอบ' };
const NO_ONE = '__none'; // ค่าพิเศษในเมนูมอบหมายหลายงาน = ล้างผู้รับผิดชอบ

export default function TaskTable({ tasks = [], members = [], onChange, onDelete, onOpen, readOnly = false }) {
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fWho, setFWho] = useState('all'); // 'all' | 'none' | user id
  const [sortKey, setSortKey] = useState('none');
  const [dir, setDir] = useState('asc');
  const [pending, setPending] = useState({}); // ค่าที่เพิ่งแก้ แสดงไว้ก่อนจนกว่าหน้าหลักจะบันทึกเสร็จ
  const [busy, setBusy] = useState({});
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState({}); // งานที่เลือกไว้ { id: true }
  const [bulk, setBulk] = useState(null); // กำลังแก้หลายงาน { done, total }
  const [bulkMsg, setBulkMsg] = useState(null); // ผลล่าสุด { ok, failed: [{ title, msg }] }

  const locked = readOnly || !onChange;
  const selectable = !locked; // ผู้ดูไม่เห็นช่องเลือก
  const today = todayStr();
  // ตัดสมาชิกที่ไม่มีโปรไฟล์ออก กันตารางพัง
  const people = useMemo(() => members.filter((m) => m && m.profiles), [members]);

  const nameOf = useMemo(() => {
    const m = {};
    people.forEach((x) => { m[x.profiles.id] = x.profiles.name || x.profiles.email; });
    return m;
  }, [people]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tasks
      .map((t) => ({ ...t, ...pending[t.id] }))
      .filter((t) => (needle ? (t.title || '').toLowerCase().includes(needle) : true))
      .filter((t) => (fStatus === 'all' ? true : t.status === fStatus))
      .filter((t) => (fWho === 'all' ? true : fWho === 'none' ? !t.assignee_id : t.assignee_id === fWho));

    if (sortKey !== 'none') {
      // ค่าว่าง (ไม่มีวันส่ง / ไม่มีผู้รับผิดชอบ) อยู่ท้ายสุดเสมอ ไม่ว่าจะเรียงทิศไหน
      const val = (t) => {
        if (sortKey === 'due') return t.end_date || null;
        if (sortKey === 'priority') { const i = PRIO_ORDER.indexOf(t.priority); return i < 0 ? 99 : i; }
        return t.assignee_id ? (nameOf[t.assignee_id] || '~').toLowerCase() : null;
      };
      list.sort((a, b) => {
        const va = val(a); const vb = val(b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        const r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'th');
        return dir === 'asc' ? r : -r;
      });
    }
    return list;
  }, [tasks, pending, q, fStatus, fWho, sortKey, dir, nameOf]);

  // งานที่เลือกและมองเห็นอยู่ (งานที่ถูกตัวกรองซ่อนไว้จะไม่ถูกแก้โดยไม่รู้ตัว)
  const selIds = selectable ? rows.filter((t) => picked[t.id]).map((t) => t.id) : [];
  const allPicked = rows.length > 0 && selIds.length === rows.length;
  const bulking = !!bulk;

  const clearBusy = (id) => {
    setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    setPending((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  // เรียก handler ของหน้าหลัก ระหว่างรอให้แถวเป็นสถานะ "กำลังบันทึก" ถ้า handler พังให้แสดงข้อความ
  const run = async (id, patch, fn) => {
    setErr(''); setBulkMsg(null);
    setBusy((b) => ({ ...b, [id]: true }));
    if (patch) setPending((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    try { await fn(); } catch (e) { setErr(friendlyError(e)); } finally { clearBusy(id); }
  };
  const change = (id, patch) => run(id, patch, () => onChange(id, patch));
  const remove = (id) => run(id, null, () => onDelete(id));

  // แก้หลายงาน: เรียก onChange ทีละงานต่อกัน (ไม่ยิงพร้อมกัน) แสดงความคืบหน้า แล้วสรุปงานที่ไม่สำเร็จ
  const applyBulk = async (patch) => {
    if (bulking || selIds.length === 0) return;
    const ids = selIds.slice();
    const titleOf = {};
    rows.forEach((t) => { titleOf[t.id] = t.title; });
    const failed = [];
    setErr(''); setBulkMsg(null);
    setBulk({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setBusy((b) => ({ ...b, [id]: true }));
      setPending((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
      try { await onChange(id, patch); } catch (e) { failed.push({ id, title: titleOf[id], msg: friendlyError(e) }); } finally { clearBusy(id); }
      setBulk({ done: i + 1, total: ids.length });
    }
    setBulk(null);
    setBulkMsg({ ok: ids.length - failed.length, failed });
    // งานที่สำเร็จเอาออกจากที่เลือก งานที่พลาดยังเลือกค้างไว้ให้ลองใหม่ได้
    const keep = {};
    failed.forEach((f) => { keep[f.id] = true; });
    setPicked(keep);
  };

  const togglePick = (id) => setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const togglePickAll = () => {
    if (allPicked) setPicked({});
    else { const n = {}; rows.forEach((t) => { n[t.id] = true; }); setPicked(n); }
  };
  const clearPick = () => { setPicked({}); setBulkMsg(null); };

  const clickSort = (key) => {
    if (sortKey === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir('asc'); }
  };
  const filtered = q.trim() || fStatus !== 'all' || fWho !== 'all';
  const clearFilter = () => { setQ(''); setFStatus('all'); setFWho('all'); };
  const arrow = (key) => (sortKey === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  const ariaSort = (key) => (sortKey === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const trCls = selectable ? ' ' + s.selOn : '';

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <input
          type="search" className={s.search} placeholder="ค้นหาชื่องาน" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาชื่องาน"
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="กรองตามสถานะ">
          <option value="all">ทุกสถานะ</option>
          {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
        </select>
        <select value={fWho} onChange={(e) => setFWho(e.target.value)} aria-label="กรองตามผู้รับผิดชอบ">
          <option value="all">ทุกคน</option>
          <option value="none">ยังไม่มอบหมาย</option>
          {people.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
        </select>
        {/* บนมือถือไม่มีหัวคอลัมน์ให้กด จึงใช้เมนูเรียงลำดับแทน */}
        <div className={s.sortBox}>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="เรียงตาม">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{k === 'none' ? v : 'เรียงตาม' + v}</option>)}
          </select>
          <button
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))} disabled={sortKey === 'none'}
            aria-label={dir === 'asc' ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย'}
          >{dir === 'asc' ? '▲' : '▼'}</button>
        </div>
      </div>

      {err && <div className="err" role="alert">{err}</div>}

      <div className={s.count}>
        <span>แสดง {rows.length} จาก {tasks.length} งาน</span>
        {filtered && <button className={s.linkBtn} onClick={clearFilter}>ล้างตัวกรอง</button>}
        {selectable && rows.length > 0 && (
          <button className={s.linkBtn} onClick={togglePickAll} disabled={bulking}>
            {allPicked ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมดที่แสดง'}
          </button>
        )}
      </div>

      {/* แถบจัดการหลายงาน แสดงเมื่อเลือกอย่างน้อย 1 งาน */}
      {selectable && selIds.length > 0 && (
        <div className={s.bulk} role="region" aria-label="จัดการหลายงาน">
          <span className={s.bulkCount}>เลือกแล้ว {selIds.length} งาน</span>
          <select className={s.bulkSel} value="" disabled={bulking} aria-label="เปลี่ยนสถานะงานที่เลือก"
            onChange={(e) => e.target.value && applyBulk({ status: e.target.value })}>
            <option value="">เปลี่ยนสถานะ…</option>
            {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
          </select>
          <select className={s.bulkSel} value="" disabled={bulking} aria-label="มอบหมายงานที่เลือก"
            onChange={(e) => e.target.value && applyBulk({ assignee_id: e.target.value === NO_ONE ? null : e.target.value })}>
            <option value="">มอบหมาย…</option>
            <option value={NO_ONE}>ไม่มอบหมาย (ล้างผู้รับผิดชอบ)</option>
            {people.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
          </select>
          <button onClick={clearPick} disabled={bulking}>ล้างที่เลือก</button>
        </div>
      )}
      {bulk && <div className={s.progress} role="status" aria-live="polite">กำลังบันทึก {bulk.done}/{bulk.total} งาน…</div>}
      {bulkMsg && (
        <div className={bulkMsg.failed.length ? 'err' : s.okMsg} role={bulkMsg.failed.length ? 'alert' : 'status'}>
          {bulkMsg.ok > 0 && <div>บันทึกสำเร็จ {bulkMsg.ok} งาน</div>}
          {bulkMsg.failed.length > 0 && (
            <div>
              ไม่สำเร็จ {bulkMsg.failed.length} งาน (ยังเลือกค้างไว้ ลองใหม่ได้):
              <ul className={s.failList}>
                {bulkMsg.failed.map((f) => <li key={f.id}>{f.title} — {f.msg}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className={s.table}>
        {tasks.length > 0 && (
          <div className={s.tr + ' ' + s.th + trCls} role="row">
            {selectable && <span />}
            <span />
            <span>ชื่องาน</span>
            <span>สถานะ</span>
            <button className={s.sortBtn} onClick={() => clickSort('priority')} aria-sort={ariaSort('priority')}>ความสำคัญ{arrow('priority')}</button>
            <button className={s.sortBtn} onClick={() => clickSort('assignee')} aria-sort={ariaSort('assignee')}>ผู้รับผิดชอบ{arrow('assignee')}</button>
            <button className={s.sortBtn} onClick={() => clickSort('due')} aria-sort={ariaSort('due')}>กำหนดส่ง{arrow('due')}</button>
            <span />
          </div>
        )}

        {tasks.length === 0 && <div className={s.empty}>ยังไม่มีงานในโปรเจกต์นี้</div>}
        {tasks.length > 0 && rows.length === 0 && (
          <div className={s.empty}>ไม่พบงานที่ตรงกับตัวกรอง <button onClick={clearFilter}>ล้างตัวกรอง</button></div>
        )}

        {rows.map((t) => {
          const isBusy = !!busy[t.id];
          const off = locked || isBusy;
          const late = t.status !== 'complete' && t.end_date && t.end_date < today;
          const isPicked = selectable && !!picked[t.id];
          return (
            <div
              key={t.id}
              className={s.tr + trCls + (t.status === 'complete' ? ' ' + s.done : '') + (isBusy ? ' ' + s.busy : '') + (isPicked ? ' ' + s.picked : '')}
              aria-busy={isBusy}
            >
              {selectable && (
                <label className={s.chkCell}>
                  <input type="checkbox" className={s.chk} checked={isPicked} disabled={isBusy || bulking}
                    onChange={() => togglePick(t.id)} aria-label={'เลือกงาน ' + t.title} />
                </label>
              )}
              <span className={s.dot + ' ' + s['d_' + t.status]} aria-hidden="true" />
              <span className={s.ttl}>
                {onOpen
                  ? <button type="button" className={s.ttlBtn} onClick={() => onOpen(t.id)}>{t.title}</button>
                  : t.title}
              </span>
              <span className={s.meta}>
                <select className={s.sel} value={t.status} disabled={off} aria-label={'สถานะของ ' + t.title}
                  onChange={(e) => change(t.id, { status: e.target.value })}>
                  {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                </select>
                <select className={s.sel + ' ' + s['pr_' + t.priority]} value={t.priority} disabled={off} aria-label={'ความสำคัญของ ' + t.title}
                  onChange={(e) => change(t.id, { priority: e.target.value })}>
                  {PRIO_ORDER.map((k) => <option key={k} value={k}>{PRIO[k]}</option>)}
                </select>
                <select className={s.sel} value={t.assignee_id || ''} disabled={off} aria-label={'ผู้รับผิดชอบของ ' + t.title}
                  onChange={(e) => change(t.id, { assignee_id: e.target.value || null })}>
                  <option value="">＋ มอบหมาย</option>
                  {t.assignee_id && !nameOf[t.assignee_id] && <option value={t.assignee_id}>อดีตสมาชิก</option>}
                  {people.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
                </select>
                <input type="date" className={s.date + (late ? ' ' + s.late : '')} value={t.end_date || ''} disabled={off}
                  aria-label={'กำหนดส่งของ ' + t.title}
                  onChange={(e) => change(t.id, { end_date: e.target.value || null })} />
              </span>
              {!readOnly && onDelete
                ? <button className={s.del + ' ' + s.delCell} onClick={() => remove(t.id)} disabled={isBusy || bulking} aria-label={'ลบงาน ' + t.title}>🗑</button>
                : <span className={s.delCell} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
