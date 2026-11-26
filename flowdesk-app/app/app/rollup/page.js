'use client';
// มุมมองรวมงานของ Workspace นี้ + Sub ทุกชั้นที่ผู้ใช้มีสิทธิ์เห็น (เจ้าของไฟล์: A) อ่านอย่างเดียว
// ฐานข้อมูลกรองให้ตามสิทธิ์ของแต่ละคน: สมาชิก Head ที่ไม่ได้อยู่ใน Sub จะไม่เห็นงานของ Sub
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import { flattenTree, treeIds } from '../../../lib/workspace-tree';
import { STATUS, PRIO, todayStr, fmtDate, errText } from '../../../lib/ui';
import s from './Rollup.module.css';

const FILTERS = [
  ['open', 'ยังไม่เสร็จ'],
  ['late', 'เลยกำหนด'],
  ['all', 'ทั้งหมด'],
];

function RollupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ws = sp.get('ws');
  const [state, setState] = useState({ loading: true, err: '', wss: [], tasks: [], names: {} });
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    if (!ws) { setState((x) => ({ ...x, loading: false })); return undefined; }
    let alive = true;
    setState({ loading: true, err: '', wss: [], tasks: [], names: {} });
    (async () => {
      try {
        const u = await api.currentUser();
        if (!u) { router.replace('/login'); return; }
        const wss = await api.listWorkspaces();
        if (!wss.some((w) => w.id === ws)) throw new Error('ไม่พบ Workspace นี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
        const ids = treeIds(wss, ws);
        const tasks = await api.listTasksInWorkspaces(ids);
        // ชื่อผู้รับผิดชอบ: ดึงรายชื่อสมาชิกของแต่ละ workspace (ถ้าดึงบางอันไม่ได้ก็แสดงเท่าที่มี)
        const lists = await Promise.allSettled(ids.map((id) => api.listMembers(id)));
        const names = {};
        for (const r of lists) if (r.status === 'fulfilled') for (const m of r.value) names[m.profiles.id] = m.profiles.name || m.profiles.email;
        if (alive) setState({ loading: false, err: '', wss, tasks, names });
      } catch (e) {
        if (alive) setState((x) => ({ ...x, loading: false, err: errText(e) }));
      }
    })();
    return () => { alive = false; };
  }, [ws, router]);

  const { loading, err, wss, tasks, names } = state;
  const today = todayStr();

  const groups = useMemo(() => {
    if (!ws || wss.length === 0) return [];
    const ids = new Set(treeIds(wss, ws));
    const flat = flattenTree(wss.filter((w) => ids.has(w.id)));
    const keep = (t) => (filter === 'all' ? true : filter === 'late' ? t.status !== 'complete' && t.end_date && t.end_date < today : t.status !== 'complete');
    return flat.map(({ ws: w, depth }) => ({
      ws: w, depth,
      tasks: tasks.filter((t) => t.projects?.workspace_id === w.id && keep(t)),
    }));
  }, [ws, wss, tasks, filter, today]);

  const total = groups.reduce((a, g) => a + g.tasks.length, 0);

  if (!ws) return <div className={s.wrap}><div className={s.empty}>กรุณาเลือก Workspace จากเมนูด้านซ้ายก่อน</div></div>;
  if (loading) return <div className="center muted">กำลังโหลด…</div>;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <h2 className={s.h}>งานรวม (รวม Sub)</h2>
        <label className={s.filter}>
          <span className="muted">แสดง</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="ตัวกรองงาน">
            {FILTERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className={'muted ' + s.note}>แสดงเฉพาะงานที่คุณมีสิทธิ์เห็น · ใช้ดูอย่างเดียว กดที่งานเพื่อเปิดแก้ไขในโปรเจกต์นั้น</div>
      {err && <div className="err">{err}</div>}
      {!err && total === 0 && (
        <div className={s.empty}><div className={s.big}>🎉</div><div>ไม่มีงานตามตัวกรองนี้</div></div>
      )}
      {!err && groups.map((g) => (g.tasks.length === 0 ? null : (
        <section key={g.ws.id} className={s.grp}>
          <div className={s.gt} style={{ paddingLeft: 12 + Math.min(g.depth, 4) * 14 }}>
            <b className={s.gname}>{g.ws.name}</b>
            {g.depth > 0 && <span className={s.tag}>Sub</span>}
            <span className="muted">{g.tasks.length} งาน</span>
          </div>
          {g.tasks.map((t) => {
            const late = t.status !== 'complete' && t.end_date && t.end_date < today;
            return (
              <Link key={t.id} className={s.row + (t.status === 'complete' ? ' ' + s.done : '')}
                href={`/app?ws=${g.ws.id}&project=${t.project_id}&task=${t.id}`}>
                <span className={'dot ' + t.status} />
                <span className={s.ttl}>{t.title}</span>
                <span className={s.meta}>
                  <span className="pill">{STATUS[t.status] || t.status}</span>
                  {t.priority && t.priority !== 'normal' && <span className="pill">{PRIO[t.priority] || t.priority}</span>}
                  <span className="muted">{t.projects?.name}</span>
                  <span className="muted">{t.assignee_id ? (names[t.assignee_id] || 'สมาชิก') : 'ยังไม่มอบหมาย'}</span>
                  <span className={s.due + (late ? ' ' + s.late : '')}>{t.end_date ? '▦ ' + fmtDate(t.end_date) : 'ไม่มีกำหนดส่ง'}</span>
                </span>
              </Link>
            );
          })}
        </section>
      )))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <RollupPage />
    </Suspense>
  );
}
