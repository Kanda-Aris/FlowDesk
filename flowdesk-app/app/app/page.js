'use client';
// หน้ารายการงาน (เจ้าของไฟล์: A) เมนูและแท็บอยู่ใน layout.js
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../lib/api';
import { useLiveTasks } from '../../lib/api-views';
import { STATUS, PRIO, todayStr, fmtDate } from '../../lib/ui';
import TaskTable from '../../components/views/TaskTable';
import CommentsPanel from '../../components/collab/CommentsPanel';
import { useDialogs } from '../../components/ui/Dialogs';

function TaskDetail({ task, ws, user, members, readOnly, onChange, onClose }) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || '');
  const [err, setErr] = useState('');
  useEffect(() => { setTitle(task.title); setDesc(task.description || ''); }, [task.id]);

  const save = async (patch) => { setErr(''); try { await onChange(task.id, patch); } catch (e) { setErr(e.message || 'บันทึกไม่สำเร็จ'); } };
  const blurTitle = () => { const t = title.trim(); if (!t) { setTitle(task.title); return; } if (t !== task.title) save({ title: t }); };
  const blurDesc = () => { if (desc !== (task.description || '')) save({ description: desc }); };

  return (<>
    <div className="backdrop" onClick={onClose} />
    <aside className="drawer" aria-label="รายละเอียดงาน">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>รายละเอียดงาน</b>
        <button className="ibtn" onClick={onClose} aria-label="ปิด">✕</button>
      </div>
      {err && <div className="err">{err}</div>}
      <input value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} onBlur={blurTitle} aria-label="ชื่องาน" />
      <label className="muted">คำอธิบาย</label>
      <textarea className="area" rows={5} value={desc} disabled={readOnly} placeholder="เพิ่มรายละเอียดของงาน" onChange={(e) => setDesc(e.target.value)} onBlur={blurDesc} />
      <div className="grid2">
        <label className="muted">สถานะ
          <select value={task.status} disabled={readOnly} onChange={(e) => save({ status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="muted">ความสำคัญ
          <select value={task.priority} disabled={readOnly} onChange={(e) => save({ priority: e.target.value })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="muted">วันเริ่ม
          <input type="date" value={task.start_date || ''} disabled={readOnly} onChange={(e) => save({ start_date: e.target.value || null })} />
        </label>
        <label className="muted">กำหนดส่ง
          <input type="date" value={task.end_date || ''} disabled={readOnly} onChange={(e) => save({ end_date: e.target.value || null })} />
        </label>
      </div>
      <label className="muted">ผู้รับผิดชอบ
        <select value={task.assignee_id || ''} disabled={readOnly} onChange={(e) => save({ assignee_id: e.target.value || null })}>
          <option value="">＋ มอบหมาย</option>
          {members.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
        </select>
      </label>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        {user && <CommentsPanel taskId={task.id} currentUser={user} workspaceId={ws} />}
      </div>
    </aside>
  </>);
}

function ListPage() {
  const router = useRouter();
  const { askText } = useDialogs();
  const sp = useSearchParams();
  const ws = sp.get('ws');
  const project = sp.get('project');
  const taskId = sp.get('task');
  const mine = sp.get('view') === 'mine';
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [perms, setPerms] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [myList, setMyList] = useState([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  // งานที่กดลบแล้วแต่ยังอยู่ในช่วงให้ยกเลิก (id -> ชื่องาน): ซ่อนจากหน้าจอทันที แล้วลบจริงเมื่อครบเวลา
  const [gone, setGone] = useState({});
  const timers = useRef({});

  const run = useCallback(async (fn) => { try { setErr(''); return await fn(); } catch (e) { setErr(e.message || 'เกิดข้อผิดพลาด'); } }, []);

  useEffect(() => { api.currentUser().then(setUser); }, []);
  useEffect(() => { setMembers([]); if (ws) run(async () => setMembers(await api.listMembers(ws))); }, [ws, run]);
  useEffect(() => { setPerms(null); if (ws) api.myPermissions(ws).then(setPerms).catch(() => setPerms({ perms: [] })); }, [ws]);
  useEffect(() => { setTasks([]); if (project) run(async () => setTasks(await api.listTasks(project))); }, [project, run]);
  useEffect(() => { if (mine && user) run(async () => setMyList(await api.myTasks(user.id))); }, [mine, user, run]);
  useLiveTasks(project || null, setTasks);

  // อ่านอย่างเดียวเมื่อไม่มีสิทธิ์แก้งานเลยสักอย่าง (ตัดสินจากติ๊ก ไม่ใช่ชื่อบทบาท; ฐานข้อมูลตรวจซ้ำ)
  const readOnly = !!perms && !api.canEditAnyTask(perms);
  const shown = useMemo(() => tasks.filter((t) => !(t.id in gone)), [tasks, gone]);
  const stats = useMemo(() => ({
    all: shown.length,
    doing: shown.filter((t) => t.status === 'in_progress').length,
    done: shown.filter((t) => t.status === 'complete').length,
    late: shown.filter((t) => t.status !== 'complete' && t.end_date && t.end_date < todayStr()).length,
  }), [shown]);

  const onChange = async (id, patch) => { const t = await api.updateTask(id, patch); setTasks((a) => a.map((x) => (x.id === id ? t : x))); };
  const UNDO_MS = 6000;
  const dropGone = (id) => setGone((g) => { const n = { ...g }; delete n[id]; return n; });
  const commitDelete = async (id) => {
    delete timers.current[id];
    try {
      await api.deleteTask(id);
      setTasks((a) => a.filter((x) => x.id !== id));
    } catch (e) { setErr(e.message || 'ลบงานไม่สำเร็จ'); } // งานจะกลับมาแสดงตามเดิม
    dropGone(id);
  };
  // กดลบ: ซ่อนงานทันทีและให้เวลายกเลิก 6 วินาที ถ้าไม่ยกเลิกจึงลบจริง
  const onDelete = (id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || timers.current[id]) return;
    setGone((g) => ({ ...g, [id]: t.title }));
    timers.current[id] = setTimeout(() => commitDelete(id), UNDO_MS);
    if (id === taskId) closeTask();
  };
  const undoDelete = (id) => { clearTimeout(timers.current[id]); delete timers.current[id]; dropGone(id); };
  // ออกจากหน้านี้ระหว่างรอ: ลบจริงทันที (ปิดแท็บเฉยๆ จะถือว่ายกเลิก)
  useEffect(() => () => { Object.keys(timers.current).forEach((id) => { clearTimeout(timers.current[id]); api.deleteTask(id).catch(() => {}); }); timers.current = {}; }, []);
  const addTask = (e) => {
    e.preventDefault();
    if (!title.trim() || !project) return;
    run(async () => { const t = await api.createTask(project, { title: title.trim() }); setTasks((a) => (a.some((x) => x.id === t.id) ? a : [...a, t])); setTitle(''); });
  };
  const closeTask = () => router.replace(`/app?ws=${ws}&project=${project}`);
  const addWs = async () => {
    const n = await askText({ title: 'สร้าง Workspace ใหม่', label: 'ชื่อ Workspace', okLabel: 'สร้าง', maxLength: 60 });
    if (n) run(async () => { const w = await api.createWorkspace(n.trim()); router.push(`/app?ws=${w.id}`); });
  };
  const addProject = async () => {
    if (!ws) return;
    const n = await askText({ title: 'สร้างโปรเจกต์ใหม่', label: 'ชื่อโปรเจกต์', okLabel: 'สร้าง', maxLength: 80 });
    if (n) run(async () => { const p = await api.createProject(ws, n.trim()); router.push(`/app?ws=${ws}&project=${p.id}`); });
  };

  if (mine) {
    return (
      <div className="body">
        <h2 style={{ margin: 0 }}>งานของฉัน</h2>
        {err && <div className="err">{err}</div>}
        <div className="tasks">
          {myList.length === 0 && <div className="empty"><div className="big">🎉</div><div>ยังไม่มีงานที่มอบหมายให้คุณ</div><div style={{ fontSize: 13 }}>เปิดโปรเจกต์แล้วเลือกตัวเองเป็นผู้รับผิดชอบในงาน</div></div>}
          {myList.map((t) => (
            <Link key={t.id} href={`/app?ws=${t.projects?.workspace_id}&project=${t.project_id}&task=${t.id}`} className={'tr mine ' + t.status}>
              <span className={'dot ' + t.status} />
              <span className="ttl">{t.title}</span>
              <span className="meta"><span className="pill">{STATUS[t.status]}</span><span className="muted" style={{ fontSize: 13 }}>{t.projects?.name}</span><span className={'due' + (t.end_date && t.end_date < todayStr() ? ' late' : '')}>{t.end_date ? '▦ ' + fmtDate(t.end_date) : 'ไม่มีกำหนดส่ง'}</span></span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!ws) {
    return (
      <div className="welcome">
        <h2>ยินดีต้อนรับสู่ FlowDesk 👋</h2>
        <div className="muted">เริ่มใช้งานใน 3 ขั้นตอน</div>
        <div className="step"><i>1</i><div><b>สร้าง Workspace</b><div className="muted">พื้นที่ทำงานของทีม เช่น ชื่อวิชาหรือชื่อกลุ่ม</div></div></div>
        <div className="step"><i>2</i><div><b>สร้างโปรเจกต์</b><div className="muted">แยกงานเป็นเรื่องๆ ในแต่ละ Workspace</div></div></div>
        <div className="step"><i>3</i><div><b>เพิ่มงานและมอบหมาย</b><div className="muted">กำหนดสถานะ ความสำคัญ และวันส่ง</div></div></div>
        <button className="primary" onClick={addWs}>＋ สร้าง Workspace แรก</button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="body"><div className="empty"><div className="big">🗂️</div><div>ยังไม่มีโปรเจกต์ใน Workspace นี้</div><button className="primary" onClick={addProject}>＋ สร้างโปรเจกต์แรก</button></div></div>
    );
  }

  const openTask = shown.find((t) => t.id === taskId);
  return (
    <div className="body">
      {err && <div className="err">{err}</div>}
      <div className="stats">
        <div className="stat"><b>{stats.all}</b><span>งานทั้งหมด</span></div>
        <div className="stat"><b>{stats.doing}</b><span>กำลังทำ</span></div>
        <div className="stat"><b>{stats.done}</b><span>เสร็จแล้ว</span></div>
        <div className="stat late"><b>{stats.late}</b><span>เลยกำหนด</span></div>
      </div>
      {!readOnly && (
        <form className="add-row" onSubmit={addTask}>
          <input placeholder="＋ เพิ่มงานใหม่ แล้วกด Enter" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="primary">เพิ่ม</button>
        </form>
      )}
      <TaskTable tasks={shown} members={members} onChange={onChange} onDelete={onDelete} readOnly={readOnly} onOpen={(id) => router.push(`/app?ws=${ws}&project=${project}&task=${id}`)} />
      {openTask && <TaskDetail task={openTask} ws={ws} user={user} members={members} readOnly={readOnly} onChange={onChange} onClose={closeTask} />}
      {Object.keys(gone).length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {Object.entries(gone).map(([id, name]) => (
            <div className="toast" key={id}>
              <span className="tt">ลบงาน «{name}» แล้ว</span>
              <button type="button" onClick={() => undoDelete(id)}>ยกเลิก</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <ListPage />
    </Suspense>
  );
}
