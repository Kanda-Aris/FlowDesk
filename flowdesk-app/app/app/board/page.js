'use client';
// Board: งานแบ่งเป็น 3 คอลัมน์ตามสถานะ เปลี่ยนสถานะด้วยเมนู "สถานะ" บนการ์ด (ใช้ได้บนมือถือ)
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import {
  STATUS, STATUS_ORDER, PRIO,
  todayStr, fmtDate, colorOf, initial, friendlyError, loadProjectData, useLiveTasks,
} from '../../../lib/api-views';
import s from './Board.module.css';

function BoardInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');
  const pjId = sp.get('project');
  // ลิงก์ไปหน้ารายละเอียดงานในหน้าหลักของ A (ถ้ายังไม่รองรับ พารามิเตอร์ task จะถูกละไว้เฉยๆ)
  const taskHref = (id) => `/app?ws=${wsId}&project=${pjId}&task=${id}`;

  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [perms, setPerms] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!wsId || !pjId) { setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      setUser(u);
      const d = await loadProjectData(wsId, pjId);
      setMembers(d.members); setTasks(d.tasks); setProject(d.project);
    } catch (e) { setErr(friendlyError(e)); }
    setLoading(false);
  }, [wsId, pjId, router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPerms(null); if (wsId) api.myPermissions(wsId).then(setPerms).catch(() => setPerms({ perms: [] })); }, [wsId]);

  // อัปเดตสดเมื่อมีคนแก้งานในโปรเจกต์นี้ (ปุ่มรีเฟรชยังใช้ได้เหมือนเดิม)
  useLiveTasks(wsId && pjId ? pjId : null, setTasks);

  // id -> ชื่อ
  const nameOf = useMemo(() => {
    const m = {};
    members.forEach((x) => { m[x.profiles.id] = x.profiles.name || x.profiles.email; });
    return m;
  }, [members]);

  // ไม่มีสิทธิ์เปลี่ยนสถานะงาน (ตัดสินจากติ๊ก) — ปิดเมนูไว้เพื่อความสะดวกเท่านั้น ตัวจริงฐานข้อมูลเป็นคนบังคับ
  const readOnly = !!perms && !api.hasPerm(perms, 'task.change_status');

  // เปลี่ยนสถานะ: อัปเดตหน้าจอก่อน ถ้าฐานข้อมูลปฏิเสธให้ย้อนกลับและแสดงข้อความ
  const move = async (task, status) => {
    if (status === task.status) return;
    const old = task.status;
    setErr('');
    setTasks((a) => a.map((x) => (x.id === task.id ? { ...x, status } : x)));
    try {
      const saved = await api.updateTask(task.id, { status });
      setTasks((a) => a.map((x) => (x.id === task.id ? saved : x)));
    } catch (e) {
      setTasks((a) => a.map((x) => (x.id === task.id ? { ...x, status: old } : x)));
      setErr(friendlyError(e));
    }
  };

  const today = todayStr();

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

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>Board</h1>
          <div className={s.sub}>{project ? project.name : ''}</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button>
      </header>

      {err && <div className="err" role="alert">{err} <button onClick={load} disabled={loading}>ลองใหม่</button></div>}
      {readOnly && <div className={s.hint}>บทบาทของคุณไม่มีสิทธิ์เปลี่ยนสถานะงาน จึงดูได้อย่างเดียว</div>}

      {loading && tasks.length === 0 ? (
        <div className="muted">กำลังโหลด…</div>
      ) : err && tasks.length === 0 ? null : tasks.length === 0 ? (
        <div className={s.emptyMsg}>ยังไม่มีงานในโปรเจกต์นี้ สร้างงานแรกได้จากหน้ารายการ</div>
      ) : (
        <div className={s.board}>
          {STATUS_ORDER.map((st) => {
            const col = tasks.filter((t) => t.status === st);
            return (
              <section key={st} className={s.col} aria-label={STATUS[st]}>
                <div className={s.colHead}>
                  <span className={s.dot + ' ' + s['d_' + st]} />
                  <span>{STATUS[st]}</span>
                  <span className={s.count}>{col.length}</span>
                </div>
                <ul className={s.list}>
                  {col.length === 0 && <li className={s.none}>ไม่มีงาน</li>}
                  {col.map((t) => {
                    const late = t.status !== 'complete' && t.end_date && t.end_date < today;
                    const who = t.assignee_id ? nameOf[t.assignee_id] || 'ไม่ทราบชื่อ' : '';
                    return (
                      <li key={t.id} className={s.card + ' ' + s['p_' + t.priority]}>
                        <div className={s.title}><Link href={taskHref(t.id)} className={s.lnk}>{t.title}</Link></div>
                        <div className={s.meta}>
                          <span className={s.chip + ' ' + s['c_' + t.priority]}>{PRIO[t.priority] || t.priority}</span>
                          {who ? (
                            <span className={s.who}>
                              <span className="av sm" style={{ background: colorOf(t.assignee_id) }}>{initial(who)}</span>
                              <span className={s.whoName}>{who}</span>
                            </span>
                          ) : (
                            <span className="muted">ยังไม่มอบหมาย</span>
                          )}
                          {t.end_date && <span className={late ? s.late : 'muted'}>▦ {fmtDate(t.end_date)}{late ? ' (เลยกำหนด)' : ''}</span>}
                        </div>
                        <label className={s.move}>
                          <span>สถานะ</span>
                          <select
                            value={t.status}
                            disabled={readOnly}
                            onChange={(e) => move(t, e.target.value)}
                            aria-label={'เปลี่ยนสถานะของ ' + t.title}
                          >
                            {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// useSearchParams ต้องห่อด้วย Suspense ไม่งั้น next build จะ error
export default function BoardPage() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <BoardInner />
    </Suspense>
  );
}
