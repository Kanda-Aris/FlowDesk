'use client';
// Calendar (อ่านอย่างเดียว): แสดงงานตามวันกำหนดส่ง (end_date) ในตารางรายเดือน
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import {
  STATUS, PRIO, todayStr, colorOf, initial, friendlyError, loadProjectData, useLiveTasks,
} from '../../../lib/api-views';
import s from './Calendar.module.css';

const WEEK_START = 0; // 0 = เริ่มวันอาทิตย์, 1 = เริ่มวันจันทร์
const DOW_ALL = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DOW = [...DOW_ALL.slice(WEEK_START), ...DOW_ALL.slice(0, WEEK_START)];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function CalendarInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');
  const pjId = sp.get('project');
  // ลิงก์ไปหน้ารายละเอียดงานในหน้าหลักของ A (ถ้ายังไม่รองรับ พารามิเตอร์ task จะถูกละไว้เฉยๆ)
  const taskHref = (id) => `/app?ws=${wsId}&project=${pjId}&task=${id}`;

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const today = todayStr();
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState(today);

  const load = useCallback(async () => {
    if (!wsId || !pjId) { setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      const d = await loadProjectData(wsId, pjId);
      setMembers(d.members); setTasks(d.tasks); setProject(d.project);
    } catch (e) { setErr(friendlyError(e)); }
    setLoading(false);
  }, [wsId, pjId, router]);

  useEffect(() => { load(); }, [load]);

  // อัปเดตสดเมื่อมีคนแก้งานในโปรเจกต์นี้ (ปุ่มรีเฟรชยังใช้ได้เหมือนเดิม)
  useLiveTasks(wsId && pjId ? pjId : null, setTasks);

  const nameOf = useMemo(() => {
    const m = {};
    members.forEach((x) => { m[x.profiles.id] = x.profiles.name || x.profiles.email; });
    return m;
  }, [members]);

  // จัดกลุ่มงานตามวันกำหนดส่ง
  const byDay = useMemo(() => {
    const m = {};
    tasks.forEach((t) => { if (t.end_date) (m[t.end_date] = m[t.end_date] || []).push(t); });
    return m;
  }, [tasks]);
  const unscheduled = tasks.filter((t) => !t.end_date);
  const overdue = tasks.filter((t) => t.status !== 'complete' && t.end_date && t.end_date < today).length;

  // ช่องวันที่ของเดือนที่เปิดอยู่ (เติมวันของเดือนก่อน/ถัดไปให้ครบสัปดาห์)
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const offset = (first.getDay() - WEEK_START + 7) % 7;
    const dim = new Date(view.y, view.m + 1, 0).getDate();
    const total = Math.ceil((offset + dim) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(view.y, view.m, 1 - offset + i);
      return { date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === view.m };
    });
  }, [view]);

  const shift = (n) => { const d = new Date(view.y, view.m + n, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); setSel(null); };
  const goToday = () => { const d = new Date(); setView({ y: d.getFullYear(), m: d.getMonth() }); setSel(todayStr()); };

  const monthTitle = new Date(view.y, view.m, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const selTasks = sel ? byDay[sel] || [] : [];
  const selLabel = sel
    ? new Date(sel + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

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

  const taskLine = (t) => {
    const late = t.status !== 'complete' && t.end_date && t.end_date < today;
    const who = t.assignee_id ? nameOf[t.assignee_id] || 'ไม่ทราบชื่อ' : '';
    return (
      <li key={t.id} className={s.item + ' ' + s['p_' + t.priority] + (t.status === 'complete' ? ' ' + s.doneItem : '')}>
        <div className={s.itemTitle}><Link href={taskHref(t.id)} className={s.lnk}>{t.title}</Link></div>
        <div className={s.itemMeta}>
          <span className={s.chip}>{STATUS[t.status]}</span>
          <span className={s.chip + ' ' + s['c_' + t.priority]}>{PRIO[t.priority] || t.priority}</span>
          {who ? (
            <span className={s.who}>
              <span className="av sm" style={{ background: colorOf(t.assignee_id) }}>{initial(who)}</span>
              {who}
            </span>
          ) : <span className="muted">ยังไม่มอบหมาย</span>}
          {late && <span className={s.late}>เลยกำหนด</span>}
        </div>
      </li>
    );
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>ปฏิทิน</h1>
          <div className={s.sub}>{project ? project.name : ''}</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button>
      </header>

      {err && <div className="err" role="alert">{err} <button onClick={load} disabled={loading}>ลองใหม่</button></div>}

      <div className={s.bar}>
        <button onClick={() => shift(-1)} aria-label="เดือนก่อนหน้า">‹</button>
        <div className={s.month} aria-live="polite">{monthTitle}</div>
        <button onClick={() => shift(1)} aria-label="เดือนถัดไป">›</button>
        <button onClick={goToday}>วันนี้</button>
      </div>
      <div className={s.stats}>ไม่มีกำหนดส่ง {unscheduled.length} งาน · เลยกำหนด <span className={overdue ? s.late : ''}>{overdue}</span> งาน</div>

      <div className={s.cal}>
        <div className={s.dow}>{DOW.map((d) => <div key={d}>{d}</div>)}</div>
        <div className={s.grid}>
          {cells.map((c) => {
            const list = byDay[c.date] || [];
            const hasLate = list.some((t) => t.status !== 'complete' && c.date < today);
            return (
              <button
                key={c.date}
                className={s.cell + (c.inMonth ? '' : ' ' + s.dim) + (c.date === today ? ' ' + s.today : '') + (c.date === sel ? ' ' + s.sel : '')}
                onClick={() => setSel(c.date)}
                aria-pressed={c.date === sel}
                aria-label={c.date + (list.length ? ' มี ' + list.length + ' งาน' : '')}
              >
                <span className={s.dn}>{c.day}</span>
                {list.length > 0 && <span className={s.badge + (hasLate ? ' ' + s.badgeLate : '')}>{list.length}</span>}
                <span className={s.chips}>
                  {list.slice(0, 2).map((t) => (
                    <span key={t.id} className={s.ev + ' ' + s['p_' + t.priority]}>{t.title}</span>
                  ))}
                  {list.length > 2 && <span className={s.more}>+{list.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className={s.panel}>
        {sel ? (<>
          <h2 className={s.h2}>{selLabel}</h2>
          {selTasks.length === 0
            ? <div className="muted">ไม่มีงานที่ครบกำหนดในวันนี้</div>
            : <ul className={s.items}>{selTasks.map((t) => taskLine(t))}</ul>}
        </>) : <div className="muted">แตะที่วันที่เพื่อดูงานของวันนั้น</div>}
      </section>

      {unscheduled.length > 0 && (
        <details className={s.panel}>
          <summary className={s.sum}>งานที่ยังไม่กำหนดวันส่ง ({unscheduled.length})</summary>
          <ul className={s.items}>{unscheduled.map((t) => taskLine(t))}</ul>
        </details>
      )}
    </div>
  );
}

// useSearchParams ต้องห่อด้วย Suspense ไม่งั้น next build จะ error
export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <CalendarInner />
    </Suspense>
  );
}
