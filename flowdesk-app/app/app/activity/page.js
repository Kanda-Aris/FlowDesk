'use client';
// Activity: ประวัติสิ่งที่เกิดขึ้นใน Workspace (ใหม่สุดก่อน) โหลดทีละ 50 รายการ
// ใช้เฉพาะ ?ws=<id> (ไม่ต้องมี project) อ่านอย่างเดียว ข้อความจาก summary แสดงเป็นข้อความธรรมดาเสมอ
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../../lib/api';
import { friendlyError, listActivity } from '../../../lib/api-views';
import s from './Activity.module.css';

const PAGE = 50;
const ICON = { task: '✅', comment: '💬', member: '👤', project: '📁' };

// ตัดแถวซ้ำด้วย id (หน้าถัดไปอาจซ้อนแถวที่ขอบหน้า)
const mergeById = (a, b) => {
  const seen = new Set(a.map((x) => x.id));
  return [...a, ...b.filter((x) => !seen.has(x.id))];
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeText = (iso) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
function dayLabel(iso) {
  const k = dayKey(iso);
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (k === dayKey(now.toISOString())) return 'วันนี้';
  if (k === dayKey(y.toISOString())) return 'เมื่อวาน';
  return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function ActivityInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wsId = sp.get('ws');

  const [members, setMembers] = useState([]);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [moreErr, setMoreErr] = useState('');

  const load = useCallback(async () => {
    if (!wsId) { setLoading(false); return; }
    setLoading(true); setErr(''); setMoreErr('');
    try {
      const u = await api.currentUser();
      if (!u) { router.replace('/login'); return; }
      const [m, list] = await Promise.all([api.listMembers(wsId), listActivity(wsId, { limit: PAGE })]);
      setMembers(m.filter((x) => x && x.profiles)); setItems(list); setHasMore(list.length === PAGE);
    } catch (e) { setErr(friendlyError(e)); }
    setLoading(false);
  }, [wsId, router]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (loadingMore || items.length === 0) return;
    setLoadingMore(true); setMoreErr('');
    try {
      const list = await listActivity(wsId, { before: items[items.length - 1].created_at, limit: PAGE });
      const merged = mergeById(items, list);
      // ถ้าไม่ได้แถวใหม่เลย แปลว่าหมดแล้ว
      setHasMore(merged.length > items.length && list.length === PAGE);
      setItems(merged);
    } catch (e) { setMoreErr(friendlyError(e)); }
    setLoadingMore(false);
  };

  const nameOf = useMemo(() => {
    const m = {};
    members.forEach((x) => { m[x.profiles.id] = x.profiles.name || x.profiles.email; });
    return m;
  }, [members]);

  // จัดกลุ่มตามวัน (ลำดับเดิมคือใหม่สุดก่อน)
  const groups = useMemo(() => {
    const g = [];
    items.forEach((a) => {
      const k = dayKey(a.created_at);
      const last = g[g.length - 1];
      if (last && last.key === k) last.list.push(a);
      else g.push({ key: k, label: dayLabel(a.created_at), list: [a] });
    });
    return g;
  }, [items]);

  // ประโยคภาษาไทยของแต่ละ action ไม่รู้จัก action ไหนจะแสดงประโยคทั่วไป ไม่พัง
  const sentence = (a) => {
    // ผู้กระทำ: ชื่อจากรายชื่อสมาชิก ถ้าไม่ใช่สมาชิกแล้วแต่แถวเป็นเรื่องของตัวเอง (เข้าร่วม/ออกเอง) ใช้ชื่อใน summary
    const self = a.entity_type === 'member' && a.entity_id && a.entity_id === a.actor_id;
    const who = !a.actor_id ? 'ระบบ' : nameOf[a.actor_id] || (self && a.summary) || 'อดีตสมาชิก';
    const sum = a.summary ? <span className={s.sum}>«{a.summary}»</span> : null;
    let verb;
    switch (a.action) {
      case 'task_created': verb = ['สร้างงาน', sum]; break;
      case 'task_status_changed': verb = ['เปลี่ยนสถานะงาน', sum]; break;
      case 'task_assigned': verb = ['มอบหมายงาน', sum]; break;
      case 'task_deleted': verb = ['ลบงาน', sum]; break;
      case 'comment_added': verb = ['แสดงความคิดเห็นในงาน', sum]; break;
      case 'project_created': verb = ['สร้างโปรเจกต์', sum]; break;
      case 'member_joined': verb = ['เข้าร่วม Workspace', null]; break;
      case 'member_removed':
        // entity_id = คนที่ถูกนำออก ถ้าเท่ากับ actor_id แปลว่าออกเอง
        if (a.entity_id && a.entity_id === a.actor_id) verb = ['ออกจาก Workspace', null];
        else return <><b>{who}</b> นำ{sum ? <> {sum} </> : 'สมาชิก'}ออกจาก Workspace</>;
        break;
      case 'member_role_changed': verb = [sum ? 'เปลี่ยนบทบาทของ' : 'เปลี่ยนบทบาทสมาชิก', sum]; break;
      default: verb = ['มีการเปลี่ยนแปลงใน Workspace', null];
    }
    return <><b>{who}</b> {verb[0]} {verb[1]}</>;
  };

  if (!wsId) {
    return (
      <div className={s.page}>
        <div className={s.notice}>
          <div>กรุณาเลือก Workspace ก่อน</div>
          <Link href="/app" className={s.btnLink}>ไปหน้าหลัก</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleBox}>
          <h1 className={s.h1}>ความเคลื่อนไหว</h1>
          <div className={s.sub}>สิ่งที่เกิดขึ้นใน Workspace นี้ ใหม่สุดอยู่บน</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button>
      </header>

      {err ? (
        <div className={s.panel}>
          <div className="err" role="alert">โหลดประวัติกิจกรรมไม่สำเร็จ — {err}</div>
          <button onClick={load} disabled={loading}>ลองใหม่</button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="muted">กำลังโหลด…</div>
      ) : items.length === 0 ? (
        <div className={s.panel + ' ' + s.empty}>
          <span className={s.big}>🕘</span>
          <span>ยังไม่มีกิจกรรมใน Workspace นี้ เมื่อมีคนสร้างหรือแก้งาน กิจกรรมจะขึ้นที่นี่</span>
        </div>
      ) : (
        <div className={s.panel}>
          {groups.map((g) => (
            <section key={g.key} className={s.day}>
              <h2 className={s.dayH}>{g.label}</h2>
              <ul className={s.list}>
                {g.list.map((a) => (
                  <li key={a.id} className={s.row}>
                    <span className={s.icon} aria-hidden="true">{ICON[a.entity_type] || '•'}</span>
                    <span className={s.text}>{sentence(a)}</span>
                    <time className={s.time} dateTime={a.created_at}>{timeText(a.created_at)}</time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {moreErr && <div className="err" role="alert">{moreErr}</div>}
          {hasMore
            ? <button className={s.more} onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}</button>
            : <div className={s.end}>แสดงครบทุกรายการแล้ว</div>}
        </div>
      )}
    </div>
  );
}

// useSearchParams ต้องห่อด้วย Suspense ไม่งั้น next build จะ error
export default function ActivityPage() {
  return (
    <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
      <ActivityInner />
    </Suspense>
  );
}
