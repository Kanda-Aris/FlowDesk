'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';

const STATUS = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', complete: 'เสร็จแล้ว' };
const PRIO = { urgent: 'ด่วน', high: 'สูง', normal: 'ปกติ', low: 'ต่ำ' };

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [wss, setWss] = useState([]); const [ws, setWs] = useState(null);
  const [projects, setProjects] = useState([]); const [pj, setPj] = useState(null);
  const [members, setMembers] = useState([]); const [tasks, setTasks] = useState([]);
  const [mine, setMine] = useState(false); const [myList, setMyList] = useState([]);
  const [title, setTitle] = useState(''); const [err, setErr] = useState('');

  const run = async (fn) => { try { setErr(''); return await fn(); } catch (e) { setErr(e.message || 'เกิดข้อผิดพลาด'); } };

  useEffect(() => { run(async () => {
    const u = await api.currentUser();
    if (!u) { router.replace('/login'); return; }
    setUser(u);
    const l = await api.listWorkspaces(); setWss(l); setWs(l[0] || null);
  }); }, []);

  useEffect(() => { if (!ws) { setProjects([]); setMembers([]); setPj(null); return; } run(async () => {
    const [p, m] = await Promise.all([api.listProjects(ws.id), api.listMembers(ws.id)]);
    setProjects(p); setMembers(m); setPj(p[0] || null);
  }); }, [ws]);

  useEffect(() => { if (!pj) { setTasks([]); return; } run(async () => setTasks(await api.listTasks(pj.id))); }, [pj]);
  useEffect(() => { if (mine && user) run(async () => setMyList(await api.myTasks(user.id))); }, [mine, user, tasks]);

  const addWs = () => { const n = prompt('ชื่อ Workspace'); if (n && n.trim()) run(async () => { const w = await api.createWorkspace(n.trim()); setWss((a) => [...a, w]); setWs(w); setMine(false); }); };
  const addProject = () => { const n = prompt('ชื่อโปรเจกต์'); if (n && n.trim() && ws) run(async () => { const p = await api.createProject(ws.id, n.trim()); setProjects((a) => [...a, p]); setPj(p); }); };
  const addTask = (e) => { e.preventDefault(); if (!title.trim() || !pj) return; run(async () => { const t = await api.createTask(pj.id, { title: title.trim() }); setTasks((a) => [...a, t]); setTitle(''); }); };
  const patch = (id, p) => run(async () => { const t = await api.updateTask(id, p); setTasks((a) => a.map((x) => (x.id === id ? t : x))); });
  const remove = (id) => { if (confirm('ลบงานนี้?')) run(async () => { await api.deleteTask(id); setTasks((a) => a.filter((x) => x.id !== id)); }); };
  const logout = async () => { await api.signOut(); router.replace('/login'); };

  return (
    <div className="layout">
      <aside className="side">
        <div className="logo"><b>Fd</b> FlowDesk</div>
        <div className="muted">{user?.email}</div>
        <button className={'item' + (mine ? ' on' : '')} onClick={() => setMine(true)}>📌 งานของฉัน</button>
        <div className="muted">Workspace</div>
        {wss.map((w) => (<button key={w.id} className={'item' + (!mine && ws?.id === w.id ? ' on' : '')} onClick={() => { setWs(w); setMine(false); }}>{w.name}</button>))}
        <button onClick={addWs}>＋ สร้าง Workspace</button>
        <button onClick={logout}>ออกจากระบบ</button>
      </aside>

      <main className="main">
        {err && <div className="err">{err}</div>}
        {mine ? (
          <>
            <h2>งานของฉัน</h2>
            {myList.length === 0 && <div className="muted">ยังไม่มีงานที่มอบหมายให้คุณ</div>}
            {myList.map((t) => (<div key={t.id} className="task"><span className="t">{t.title}</span><span className="muted">{t.projects?.name}</span><span>{STATUS[t.status]}</span><span className="muted">{t.end_date || 'ไม่มีกำหนดส่ง'}</span></div>))}
          </>
        ) : !ws ? (
          <div className="muted">ยังไม่มี Workspace กด "＋ สร้าง Workspace" เพื่อเริ่มต้น</div>
        ) : (
          <>
            <h2>{ws.name}</h2>
            <div className="row">
              {projects.map((p) => (<button key={p.id} className={pj?.id === p.id ? 'primary' : ''} onClick={() => setPj(p)}>{p.name}</button>))}
              <button onClick={addProject}>＋ โปรเจกต์</button>
            </div>
            {pj && (
              <>
                <form className="row" onSubmit={addTask}>
                  <input style={{ flex: 1, minWidth: 180 }} placeholder="เพิ่มงานใหม่แล้วกด Enter" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <button className="primary">เพิ่ม</button>
                </form>
                {tasks.map((t) => (
                  <div key={t.id} className={'task ' + t.status}>
                    <span className="t">{t.title}</span>
                    <select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <select value={t.priority} onChange={(e) => patch(t.id, { priority: e.target.value })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <select value={t.assignee_id || ''} onChange={(e) => patch(t.id, { assignee_id: e.target.value || null })}>
                      <option value="">ยังไม่มอบหมาย</option>
                      {members.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
                    </select>
                    <input type="date" value={t.end_date || ''} onChange={(e) => patch(t.id, { end_date: e.target.value || null })} />
                    <button onClick={() => remove(t.id)} aria-label="ลบ">🗑</button>
                  </div>
                ))}
                {tasks.length === 0 && <div className="muted">ยังไม่มีงานในโปรเจกต์นี้</div>}
              </>
            )}
            {!pj && <div className="muted">สร้างโปรเจกต์แรกด้วยปุ่ม "＋ โปรเจกต์"</div>}
          </>
        )}
      </main>
    </div>
  );
}
