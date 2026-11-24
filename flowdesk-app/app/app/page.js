'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';

const STATUS = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', complete: 'เสร็จแล้ว' };
const PRIO = { urgent: 'ด่วน', high: 'สูง', normal: 'ปกติ', low: 'ต่ำ' };
const COLORS = ['#E31C5F', '#3E8EF7', '#2FB675', '#E0A040', '#8A63D2', '#17A2B8'];
const colorOf = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initial = (s = '?') => (s.trim()[0] || '?').toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

function Av({ name, id, small }) {
  return <span className={'av' + (small ? ' sm' : '')} style={{ background: colorOf(id || name) }}>{initial(name)}</span>;
}

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [wss, setWss] = useState([]); const [ws, setWs] = useState(null);
  const [projects, setProjects] = useState([]); const [pj, setPj] = useState(null);
  const [members, setMembers] = useState([]); const [tasks, setTasks] = useState([]);
  const [mine, setMine] = useState(false); const [myList, setMyList] = useState([]);
  const [title, setTitle] = useState(''); const [err, setErr] = useState('');
  const [menu, setMenu] = useState(false); const [ready, setReady] = useState(false);

  const run = async (fn) => { try { setErr(''); return await fn(); } catch (e) { setErr(e.message || 'เกิดข้อผิดพลาด'); } };
  const nameOf = useMemo(() => { const m = {}; members.forEach((x) => { m[x.profiles.id] = x.profiles.name || x.profiles.email; }); return m; }, [members]);

  useEffect(() => { run(async () => {
    const u = await api.currentUser();
    if (!u) { router.replace('/login'); return; }
    setUser(u);
    const l = await api.listWorkspaces(); setWss(l); setWs(l[0] || null); setReady(true);
  }); }, []);

  useEffect(() => { if (!ws) { setProjects([]); setMembers([]); setPj(null); return; } run(async () => {
    const [p, m] = await Promise.all([api.listProjects(ws.id), api.listMembers(ws.id)]);
    setProjects(p); setMembers(m); setPj(p[0] || null);
  }); }, [ws]);

  useEffect(() => { if (!pj) { setTasks([]); return; } run(async () => setTasks(await api.listTasks(pj.id))); }, [pj]);
  useEffect(() => { if (mine && user) run(async () => setMyList(await api.myTasks(user.id))); }, [mine, user, tasks]);

  const addWs = () => { const n = prompt('ชื่อ Workspace'); if (n && n.trim()) run(async () => { const w = await api.createWorkspace(n.trim()); setWss((a) => [...a, w]); setWs(w); setMine(false); setMenu(false); }); };
  const addProject = () => { const n = prompt('ชื่อโปรเจกต์'); if (n && n.trim() && ws) run(async () => { const p = await api.createProject(ws.id, n.trim()); setProjects((a) => [...a, p]); setPj(p); setMine(false); setMenu(false); }); };
  const addTask = (e) => { e.preventDefault(); if (!title.trim() || !pj) return; run(async () => { const t = await api.createTask(pj.id, { title: title.trim() }); setTasks((a) => [...a, t]); setTitle(''); }); };
  const patch = (id, p) => run(async () => { const t = await api.updateTask(id, p); setTasks((a) => a.map((x) => (x.id === id ? t : x))); });
  const remove = (id) => { if (confirm('ลบงานนี้?')) run(async () => { await api.deleteTask(id); setTasks((a) => a.filter((x) => x.id !== id)); }); };
  const logout = async () => { await api.signOut(); router.replace('/login'); };

  const stats = useMemo(() => ({
    all: tasks.length,
    doing: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'complete').length,
    late: tasks.filter((t) => t.status !== 'complete' && t.end_date && t.end_date < today()).length,
  }), [tasks]);

  const side = (
    <aside className={'side' + (menu ? ' open' : '')}>
      <div className="logo"><b>Fd</b> FlowDesk</div>
      <button className={'nav' + (mine ? ' on' : '')} onClick={() => { setMine(true); setMenu(false); }}><span>📌</span><span className="nm">งานของฉัน</span></button>
      <div className="sec">Workspace</div>
      {wss.map((w) => (
        <button key={w.id} className={'nav' + (!mine && ws?.id === w.id ? ' on' : '')} onClick={() => { setWs(w); setMine(false); }}>
          <Av name={w.name} id={w.id} /><span className="nm">{w.name}</span>
        </button>
      ))}
      <button className="nav add" onClick={addWs}><span>＋</span><span className="nm">สร้าง Workspace</span></button>
      {ws && !mine && (<>
        <div className="sec">โปรเจกต์</div>
        {projects.map((p) => (
          <button key={p.id} className={'nav' + (pj?.id === p.id ? ' on' : '')} onClick={() => { setPj(p); setMenu(false); }}><span>▤</span><span className="nm">{p.name}</span></button>
        ))}
        <button className="nav add" onClick={addProject}><span>＋</span><span className="nm">โปรเจกต์ใหม่</span></button>
      </>)}
      <div className="me">
        <Av name={members.find((m) => m.profiles.id === user?.id)?.profiles.name || user?.email} id={user?.id} small />
        <span className="em">{user?.email}</span>
        <button className="ibtn" onClick={logout} title="ออกจากระบบ" aria-label="ออกจากระบบ">⎋</button>
      </div>
    </aside>
  );

  if (!ready) return <div className="center muted">กำลังโหลด…</div>;

  return (
    <div className="layout">
      {side}
      <main className="main">
        <div className="topbar">
          <button className="ibtn" onClick={() => setMenu(!menu)} aria-label="เมนู">☰</button>
          <div className="logo"><b>Fd</b> FlowDesk</div>
        </div>

        {mine ? (<>
          <div className="head"><div className="crumb"><b>งานของฉัน</b></div></div>
          <div className="body">
            {err && <div className="err">{err}</div>}
            <div className="tasks">
              {myList.length === 0 && <div className="empty"><div className="big">🎉</div><div>ยังไม่มีงานที่มอบหมายให้คุณ</div><div style={{ fontSize: 13 }}>เปิดโปรเจกต์แล้วเลือกตัวเองเป็นผู้รับผิดชอบในงาน</div></div>}
              {myList.map((t) => (
                <div key={t.id} className={'tr ' + t.status} style={{ gridTemplateColumns: undefined }}>
                  <span className={'dot ' + t.status} />
                  <span className="ttl">{t.title}</span>
                  <span className="meta"><span className="pill">{STATUS[t.status]}</span><span className="muted" style={{ fontSize: 13 }}>{t.projects?.name}</span><span className={'due' + (t.end_date && t.end_date < today() ? ' late' : '')}>{t.end_date ? '▦ ' + fmt(t.end_date) : 'ไม่มีกำหนดส่ง'}</span></span>
                </div>
              ))}
            </div>
          </div>
        </>) : !ws ? (
          <div className="welcome">
            <h2>ยินดีต้อนรับสู่ FlowDesk 👋</h2>
            <div className="muted">เริ่มใช้งานใน 3 ขั้นตอน</div>
            <div className="step"><i>1</i><div><b>สร้าง Workspace</b><div className="muted">พื้นที่ทำงานของทีม เช่น ชื่อวิชาหรือชื่อกลุ่ม</div></div></div>
            <div className="step"><i>2</i><div><b>สร้างโปรเจกต์</b><div className="muted">แยกงานเป็นเรื่องๆ ในแต่ละ Workspace</div></div></div>
            <div className="step"><i>3</i><div><b>เพิ่มงานและมอบหมาย</b><div className="muted">กำหนดสถานะ ความสำคัญ และวันส่ง</div></div></div>
            <button className="primary" onClick={addWs}>＋ สร้าง Workspace แรก</button>
          </div>
        ) : (<>
          <div className="head">
            <div className="crumb">{ws.name}{pj && <> / <b>{pj.name}</b></>}</div>
            <div className="tabs">
              <button className="tab on">รายการ</button>
              <button className="tab" disabled>Board<small>เร็วๆ นี้</small></button>
              <button className="tab" disabled>ปฏิทิน<small>เร็วๆ นี้</small></button>
              <button className="tab" disabled>Gantt<small>เร็วๆ นี้</small></button>
              <button className="tab" disabled>แชท<small>เร็วๆ นี้</small></button>
            </div>
          </div>
          <div className="body">
            {err && <div className="err">{err}</div>}
            {!pj ? (
              <div className="empty"><div className="big">🗂️</div><div>ยังไม่มีโปรเจกต์ใน {ws.name}</div><button className="primary" onClick={addProject}>＋ สร้างโปรเจกต์แรก</button></div>
            ) : (<>
              <div className="stats">
                <div className="stat"><b>{stats.all}</b><span>งานทั้งหมด</span></div>
                <div className="stat"><b>{stats.doing}</b><span>กำลังทำ</span></div>
                <div className="stat"><b>{stats.done}</b><span>เสร็จแล้ว</span></div>
                <div className="stat late"><b>{stats.late}</b><span>เลยกำหนด</span></div>
              </div>
              <form className="add-row" onSubmit={addTask}>
                <input placeholder="＋ เพิ่มงานใหม่ แล้วกด Enter" value={title} onChange={(e) => setTitle(e.target.value)} />
                <button className="primary">เพิ่ม</button>
              </form>
              <div className="tasks">
                {tasks.length > 0 && <div className="tr th"><span /><span>ชื่องาน</span><span>สถานะ</span><span>ความสำคัญ</span><span>ผู้รับผิดชอบ</span><span>กำหนดส่ง</span><span /></div>}
                {tasks.length === 0 && <div className="empty"><div className="big">✨</div><div>ยังไม่มีงานในโปรเจกต์นี้</div><div style={{ fontSize: 13 }}>พิมพ์ชื่องานในช่องด้านบนเพื่อเริ่ม</div></div>}
                {tasks.map((t) => (
                  <div key={t.id} className={'tr ' + t.status}>
                    <span className={'dot ' + t.status} />
                    <span className="ttl">{t.title}</span>
                    <span className="meta">
                      <select className="sel" value={t.status} onChange={(e) => patch(t.id, { status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <select className={'sel pr-' + t.priority} value={t.priority} onChange={(e) => patch(t.id, { priority: e.target.value })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <select className="sel" value={t.assignee_id || ''} onChange={(e) => patch(t.id, { assignee_id: e.target.value || null })}>
                        <option value="">＋ มอบหมาย</option>
                        {members.map((m) => <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.name || m.profiles.email}</option>)}
                      </select>
                      <input className={'due' + (t.status !== 'complete' && t.end_date && t.end_date < today() ? ' late' : '')} type="date" value={t.end_date || ''} onChange={(e) => patch(t.id, { end_date: e.target.value || null })} aria-label="กำหนดส่ง" />
                    </span>
                    <button className="ibtn" onClick={() => remove(t.id)} aria-label="ลบงาน">🗑</button>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </>)}
      </main>
    </div>
  );
}
