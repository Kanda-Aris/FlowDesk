'use client';
// Gantt (อ่านอย่างเดียว): แถบงานจาก start_date ถึง end_date มีเส้น "วันนี้" และเลื่อนซ้าย-ขวาได้ในกรอบของตัวเอง
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import {
  STATUS, PRIO, todayStr, fmtDate, colorOf, initial, friendlyError, loadProjectData, useLiveTasks,
} from '../../../lib/api-views';
import s from './Gantt.module.css';

const DAY = 86400000;
const DW = 36; // ความกว้างต่อวัน (px) ต้องตรงกับ background-size ใน Gantt.module.css
// แปลง 'YYYY-MM-DD' เป็นเลขวัน (ใช้ UTC เพื่อไม่ให้เวลาออมแสง/เขตเวลาทำให้เพี้ยน)
const dnum = (str) => { const [y, m, d] = str.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };

function GanttInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');
  const pjId = sp.get('project');
  // ลิงก์ไปหน้ารายละเอียดงานในหน้าหลักของ A (ถ้ายังไม่รองรับ พารามิเตอร์ task จะถูกละไว้เฉยๆ)
  const taskHref = (id) => `/app?ws=${wsId}&project=${pjId}&task=${id}`;
  const box = useRef(null);

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

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

  const todayN = dnum(todayStr());

  // งานที่มีวันที่ (ถ้ามีวันเดียวให้เป็นแถบ 1 วัน) เรียงตามวันเริ่ม
  const { dated, undated } = useMemo(() => {
    const dated = [];
    const undated = [];
    tasks.forEach((t) => {
      if (!t.start_date && !t.end_date) { undated.push(t); return; }
      let a = dnum(t.start_date || t.end_date);
      let b = dnum(t.end_date || t.start_date);
      if (a > b) [a, b] = [b, a];
      dated.push({ t, a, b });
    });
    dated.sort((x, y) => x.a - y.a || x.b - y.b);
    return { dated, undated };
  }, [tasks]);

  // ช่วงวันที่ที่แสดง: ครอบคลุมทุกงาน + วันนี้ แต่จำกัดไม่เกิน -120/+240 วันจากวันนี้ (กันวันที่พิมพ์ผิดจนหน้าค้าง)
  const range = useMemo(() => {
    let lo = todayN; let hi = todayN;
    dated.forEach((x) => { lo = Math.min(lo, x.a); hi = Math.max(hi, x.b); });
    lo = Math.max(lo, todayN - 120) - 2;
    hi = Math.min(hi, todayN + 240) + 2;
    hi = Math.max(hi, lo + 13);
    return { lo, hi, n: hi - lo + 1 };
  }, [dated, todayN]);

  const visible = dated.filter((x) => x.b >= range.lo && x.a <= range.hi);
  const outside = dated.length - visible.length;
  const W = range.n * DW;

  // หัวตาราง: วัน และกลุ่มเดือน
  const { days, months } = useMemo(() => {
    const days = []; const months = [];
    for (let i = 0; i < range.n; i++) {
      const d = new Date((range.lo + i) * DAY);
      const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
      days.push({ n: range.lo + i, day: d.getUTCDate(), weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 });
      const last = months[months.length - 1];
      if (last && last.key === key) last.count++;
      else months.push({ key, count: 1, label: d.toLocaleDateString('th-TH', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
    }
    return { days, months };
  }, [range]);

  const scrollToday = useCallback(() => {
    if (box.current) box.current.scrollLeft = Math.max(0, (todayN - range.lo) * DW - 100);
  }, [todayN, range.lo]);
  useEffect(() => { if (!loading) scrollToday(); }, [loading, scrollToday]);

  const barClass = (t, b) =>
    t.status === 'complete' ? s.bDone
      : b < todayN ? s.bLate
      : t.status === 'in_progress' ? s.bProg : s.bTodo;

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

  const rangeText = (t) => {
    const a = t.start_date ? fmtDate(t.start_date) : '';
    const b = t.end_date ? fmtDate(t.end_date) : '';
    return a && b && a !== b ? a + ' – ' + b : a || b;
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>Gantt</h1>
          <div className={s.sub}>{project ? project.name : ''}</div>
        </div>
        <button onClick={scrollToday}>ไปที่วันนี้</button>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button>
      </header>

      {err && <div className="err" role="alert">{err} <button onClick={load} disabled={loading}>ลองใหม่</button></div>}

      <div className={s.legend}>
        <span><i className={s.sw + ' ' + s.bTodo} />ต้องทำ</span>
        <span><i className={s.sw + ' ' + s.bProg} />กำลังทำ</span>
        <span><i className={s.sw + ' ' + s.bDone} />เสร็จแล้ว</span>
        <span><i className={s.sw + ' ' + s.bLate} />เลยกำหนด</span>
        <span><i className={s.swLine} />วันนี้</span>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="muted">กำลังโหลด…</div>
      ) : err && tasks.length === 0 ? null : visible.length === 0 ? (
        <div className={s.panel + ' muted'}>ยังไม่มีงานที่กำหนดวัน ใส่วันกำหนดส่งในหน้ารายการเพื่อให้แสดงที่นี่</div>
      ) : (
        <div className={s.gantt} ref={box} tabIndex={0} role="region" aria-label="แผนภาพ Gantt เลื่อนซ้ายขวาได้">
          <div className={s.inner} style={{ width: 'calc(var(--nw) + ' + W + 'px)' }}>
            <div className={s.hrow}>
              <div className={s.nameCell + ' ' + s.hname}>งาน</div>
              <div className={s.tl} style={{ width: W }}>
                <div className={s.months}>
                  {months.map((m) => <div key={m.key} className={s.month} style={{ width: m.count * DW }}>{m.label}</div>)}
                </div>
                <div className={s.dayrow}>
                  {days.map((d) => (
                    <div key={d.n} className={s.day + (d.weekend ? ' ' + s.wk : '') + (d.n === todayN ? ' ' + s.tdy : '')}>{d.day}</div>
                  ))}
                </div>
              </div>
            </div>

            {visible.map(({ t, a, b }) => {
              const from = Math.max(a, range.lo); const to = Math.min(b, range.hi);
              const width = (to - from + 1) * DW;
              const who = t.assignee_id ? nameOf[t.assignee_id] || 'ไม่ทราบชื่อ' : 'ยังไม่มอบหมาย';
              return (
                <div key={t.id} className={s.row}>
                  <div className={s.nameCell}>
                    <div className={s.tt}><Link href={taskHref(t.id)} className={s.lnk}>{t.title}</Link></div>
                    <div className={s.who}>{who}</div>
                  </div>
                  <div className={s.tl + ' ' + s.gridbg} style={{ width: W }}>
                    <div
                      className={s.bar + ' ' + barClass(t, b)}
                      style={{ left: (from - range.lo) * DW, width }}
                      title={t.title + ' (' + rangeText(t) + ')'}
                    >
                      {width >= 96 ? rangeText(t) : ''}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className={s.todayLayer} style={{ width: W }} aria-hidden="true">
              <div className={s.todayLine} style={{ left: (todayN - range.lo) * DW + DW / 2 }} />
            </div>
          </div>
        </div>
      )}

      {outside > 0 && <div className="muted" style={{ fontSize: 13 }}>มี {outside} งานที่วันที่อยู่ไกลเกินช่วงที่แสดง</div>}

      {undated.length > 0 && (
        <section className={s.panel}>
          <h2 className={s.h2}>งานที่ยังไม่กำหนดวัน ({undated.length})</h2>
          <ul className={s.items}>
            {undated.map((t) => {
              const who = t.assignee_id ? nameOf[t.assignee_id] || 'ไม่ทราบชื่อ' : '';
              return (
                <li key={t.id} className={s.item}>
                  <div className={s.itemTitle}><Link href={taskHref(t.id)} className={s.lnkBlock}>{t.title}</Link></div>
                  <div className={s.itemMeta}>
                    <span className={s.chip}>{STATUS[t.status]}</span>
                    <span className={s.chip}>{PRIO[t.priority] || t.priority}</span>
                    {who
                      ? <span className={s.whoRow}><span className="av sm" style={{ background: colorOf(t.assignee_id) }}>{initial(who)}</span>{who}</span>
                      : <span className="muted">ยังไม่มอบหมาย</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// useSearchParams ต้องห่อด้วย Suspense ไม่งั้น next build จะ error
export default function GanttPage() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <GanttInner />
    </Suspense>
  );
}
