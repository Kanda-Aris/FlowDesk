'use client';
// Dashboard (ต่อโปรเจกต์): "วันนี้สำหรับฉัน" ด้านบน แล้วจำนวนงานตามสถานะและจำนวนงานเลยกำหนด
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import {
  STATUS, STATUS_ORDER, PRIO,
  todayStr, dayNum, fmtDate, friendlyError, loadProjectData, useLiveTasks,
} from '../../../lib/api-views';
import s from './Dashboard.module.css';

function DashboardInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');
  const pjId = sp.get('project');

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [mine, setMine] = useState([]);
  const [members, setMembers] = useState([]);
  const [uid, setUid] = useState(null);
  const timer = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!wsId || !pjId) { setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      setUid(u.id);
      // myTasks คืนงานที่ยังไม่เสร็จของฉันจากทุกโปรเจกต์ ด้านล่างจะกรองเหลือเฉพาะ workspace นี้
      const [d, my] = await Promise.all([loadProjectData(wsId, pjId), api.myTasks(u.id)]);
      setProject(d.project); setTasks(d.tasks); setMembers(d.members); setMine(my);
    } catch (e) { setErr(friendlyError(e)); }
    setLoading(false);
  }, [wsId, pjId, router]);

  useEffect(() => { load(); }, [load]);

  // อัปเดตสด: จำนวนตามสถานะเปลี่ยนทันที ส่วน "วันนี้สำหรับฉัน" โหลดใหม่หลังเหตุการณ์หยุดนิ่ง 0.4 วินาที
  useLiveTasks(wsId && pjId ? pjId : null, setTasks, () => {
    if (!uid) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.myTasks(uid).then(setMine).catch((e) => setErr(friendlyError(e)));
    }, 400);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const today = todayStr();
  const todayN = dayNum(today);

  // งานของฉันที่ครบกำหนดวันนี้หรือเลยกำหนด (เฉพาะ workspace นี้) เลยกำหนดขึ้นก่อน
  const todayList = useMemo(() => mine
    .filter((t) => t.projects?.workspace_id === wsId && t.end_date && t.end_date <= today)
    .sort((a, b) => a.end_date.localeCompare(b.end_date)),
  [mine, wsId, today]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, todo: 0, in_progress: 0, complete: 0, late: 0 };
    tasks.forEach((t) => {
      if (c[t.status] !== undefined) c[t.status]++;
      if (t.status !== 'complete' && t.end_date && t.end_date < today) c.late++;
    });
    return c;
  }, [tasks, today]);
  // ใกล้ครบกำหนด: งานของฉันที่ยังไม่เสร็จ ครบกำหนดพรุ่งนี้ถึงอีก 3 วัน (วันนี้/เลยกำหนดอยู่ในหัวข้อ "วันนี้สำหรับฉัน" แล้ว)
  const soon = useMemo(() => mine
    .filter((t) => t.projects?.workspace_id === wsId && t.end_date && t.status !== 'complete')
    .map((t) => ({ t, n: dayNum(t.end_date) - todayN }))
    .filter((x) => x.n >= 1 && x.n <= 3)
    .sort((a, b) => a.n - b.n || String(a.t.title).localeCompare(String(b.t.title), 'th')),
  [mine, wsId, todayN]);

  // ภาระงาน: จำนวนงานที่ยังไม่เสร็จต่อคนในโปรเจกต์นี้ (รวมแถว "ยังไม่มอบหมาย")
  const workload = useMemo(() => {
    const by = {};
    members.forEach((m) => { by[m.profiles.id] = { name: m.profiles.name || m.profiles.email, n: 0, late: 0 }; });
    const former = { name: 'อดีตสมาชิก', n: 0, late: 0 };
    const none = { name: 'ยังไม่มอบหมาย', n: 0, late: 0 };
    const open = tasks.filter((t) => t.status !== 'complete');
    open.forEach((t) => {
      const o = !t.assignee_id ? none : by[t.assignee_id] || former;
      o.n++;
      if (t.end_date && t.end_date < today) o.late++;
    });
    const list = Object.entries(by)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'th'));
    if (former.n) list.push({ id: 'former', ...former });
    list.push({ id: 'none', ...none });
    return { list, open: open.length, max: Math.max(1, ...list.map((x) => x.n)) };
  }, [tasks, members, today]);
  const pct = counts.all ? Math.round((counts.complete / counts.all) * 100) : 0;

  if (!wsId || !pjId) {
    return (
      <div className={s.page}>
        <div className={s.notice}>
          <div>กรุณาเลือก Workspace และโปรเจกต์ก่อน</div>
          <Link href="/app" className={s.btnLink}>ไปหน้าหลัก</Link>
        </div>
      </div>
    );
  }

  const dueText = (d) => {
    const n = todayN - dayNum(d);
    return n === 0 ? 'ครบกำหนดวันนี้' : 'เลยกำหนด ' + n + ' วัน';
  };
  // project_id มากับ myTasks (A เพิ่มให้แล้ว) ถ้ายังไม่มีให้ใช้โปรเจกต์ปัจจุบันแทน
  const href = (t) => `/app?ws=${wsId}&project=${t.project_id || pjId}&task=${t.id}`;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>Dashboard</h1>
          <div className={s.sub}>{project ? project.name : ''}</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button>
      </header>

      {err && <div className="err" role="alert">{err} <button onClick={load} disabled={loading}>ลองใหม่</button></div>}

      <section className={s.panel}>
        <h2 className={s.h2}>วันนี้สำหรับฉัน</h2>
        {loading && mine.length === 0 ? (
          <div className="muted">กำลังโหลด…</div>
        ) : todayList.length === 0 ? (
          <div className={s.empty}><span className={s.big}>🎉</span><span>ไม่มีงานของคุณที่ครบกำหนดวันนี้หรือเลยกำหนด</span></div>
        ) : (
          <ul className={s.items}>
            {todayList.map((t) => {
              const late = t.end_date < today;
              return (
                <li key={t.id} className={s.item + (late ? ' ' + s.itemLate : '')}>
                  <Link href={href(t)} className={s.lnk}>{t.title}</Link>
                  <div className={s.itemMeta}>
                    <span className={late ? s.late : s.today}>{dueText(t.end_date)} ({fmtDate(t.end_date)})</span>
                    <span className={s.chip}>{STATUS[t.status]}</span>
                    <span className={s.chip + ' ' + s['c_' + t.priority]}>{PRIO[t.priority] || t.priority}</span>
                    {t.projects?.name && <span className="muted">{t.projects.name}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>ใกล้ครบกำหนด (ภายใน 3 วัน)</h2>
        {loading && mine.length === 0 ? (
          <div className="muted">กำลังโหลด…</div>
        ) : soon.length === 0 ? (
          <div className="muted">ไม่มีงานของคุณที่จะครบกำหนดใน 3 วันข้างหน้า</div>
        ) : (
          <ul className={s.items}>
            {soon.map(({ t, n }) => (
              <li key={t.id} className={s.item}>
                <Link href={href(t)} className={s.lnk}>{t.title}</Link>
                <div className={s.itemMeta}>
                  <span className={s.today}>{n === 1 ? 'พรุ่งนี้' : 'อีก ' + n + ' วัน'} ({fmtDate(t.end_date)})</span>
                  <span className={s.chip}>{STATUS[t.status]}</span>
                  <span className={s.chip + ' ' + s['c_' + t.priority]}>{PRIO[t.priority] || t.priority}</span>
                  {t.projects?.name && <span className="muted">{t.projects.name}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>ภาพรวมโปรเจกต์</h2>
        <div className={s.stats}>
          <div className={s.stat}><b>{counts.all}</b><span>งานทั้งหมด</span></div>
          {STATUS_ORDER.map((k) => (
            <div key={k} className={s.stat}><b>{counts[k]}</b><span>{STATUS[k]}</span></div>
          ))}
          <div className={s.stat + ' ' + (counts.late ? s.statLate : '')}><b>{counts.late}</b><span>เลยกำหนด</span></div>
        </div>
        {counts.all > 0 && (
          <div className={s.progress}>
            <div className={s.pText}>ความคืบหน้า {pct}%</div>
            <div className={s.bar} role="img" aria-label={'เสร็จแล้ว ' + pct + ' เปอร์เซ็นต์'}>
              <i className={s.segDone} style={{ width: (counts.complete / counts.all) * 100 + '%' }} />
              <i className={s.segProg} style={{ width: (counts.in_progress / counts.all) * 100 + '%' }} />
            </div>
          </div>
        )}
        <div className={s.links}>
          <Link href={`/app/board?ws=${wsId}&project=${pjId}`} className={s.btnLink}>เปิด Board</Link>
          <Link href={`/app/calendar?ws=${wsId}&project=${pjId}`} className={s.btnLink}>เปิดปฏิทิน</Link>
          <Link href={`/app/gantt?ws=${wsId}&project=${pjId}`} className={s.btnLink}>เปิด Gantt</Link>
        </div>
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>ภาระงานของแต่ละคน</h2>
        {loading && tasks.length === 0 ? (
          <div className="muted">กำลังโหลด…</div>
        ) : workload.open === 0 ? (
          <div className="muted">ไม่มีงานค้างในโปรเจกต์นี้</div>
        ) : (
          <ul className={s.load}>
            {workload.list.map((x) => (
              <li key={x.id} className={s.lrow}>
                <span className={s.lname}>{x.name}</span>
                <span className={s.lbar} aria-hidden="true">
                  <i className={x.id === 'none' ? s.lNone : s.lFill} style={{ width: (x.n / workload.max) * 100 + '%' }} />
                </span>
                <span className={s.lnum}>
                  {x.n} งาน{x.late > 0 && <em className={s.lLate}> (เลยกำหนด {x.late})</em>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// useSearchParams ต้องห่อด้วย Suspense ไม่งั้น next build จะ error
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
