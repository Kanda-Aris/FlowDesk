'use client';
// กระดิ่งแจ้งเตือน (AI B) — props: { currentUser, align? }
// currentUser = ผู้ใช้จาก currentUser() (ต้องมี .id); align = 'right' (ค่าเริ่มต้น, แผงขยายไปทางซ้าย) หรือ 'left'
// เบราว์เซอร์สร้างการแจ้งเตือนไม่ได้ trigger ในฐานข้อมูลสร้างให้ ที่นี่ทำได้แค่ อ่าน / ทำเครื่องหมายอ่านแล้ว / ลบ
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listMembers } from '../../lib/api';
import {
  listNotifications, countUnread, markRead, markAllRead, deleteNotification,
  subscribeNotifications, notificationTexts, taskProject, friendlyError,
} from '../../lib/api-collab';
import { mentionsToText } from './mentions';
import styles from './NotificationBell.module.css';

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// วันที่แบบไทย (due_on เป็นวันที่ 'YYYY-MM-DD')
const fmtDue = (d) => {
  const dt = new Date(String(d) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ข้อความบรรทัดแรกของแต่ละชนิด
// - mention_* / assigned ใช้ชื่อผู้กระทำ (actor)
// - due_today / due_soon มาจากงานประจำวันของระบบ actor_id เป็น null จึงไม่ใช้ชื่อผู้กระทำ ใช้ชื่องานจาก texts.tasks
// - ชนิดที่ไม่รู้จักแสดงข้อความทั่วไป
function labelFor(n, actorName, taskTitle) {
  const who = actorName || 'สมาชิก';
  const title = taskTitle ? taskTitle.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const task = title ? `งาน «${title}»` : 'งาน';
  switch (n.kind) {
    case 'mention_comment': return `${who} กล่าวถึงคุณในคอมเมนต์`;
    case 'mention_message': return `${who} กล่าวถึงคุณในแชท`;
    case 'assigned': return `${who} มอบหมายงานให้คุณ`;
    case 'due_today': return `${task} ครบกำหนดวันนี้`;
    case 'due_soon': return `${task} ใกล้ครบกำหนด${n.due_on ? ` (${fmtDue(n.due_on)})` : ''}`;
    default: return actorName ? `${actorName} มีการแจ้งเตือนใหม่` : 'มีการแจ้งเตือนใหม่';
  }
}

export default function NotificationBell({ currentUser, align = 'right' }) {
  const router = useRouter();
  const uid = currentUser?.id;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [names, setNames] = useState({});          // userId → ชื่อ
  const [texts, setTexts] = useState({ comments: {}, messages: {}, tasks: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [rows, count] = await Promise.all([listNotifications(50), countUnread()]);
      // ข้อความอ้างอิง + ชื่อผู้กระทำ (แปลง actor_id ด้วย listMembers ของแต่ละ workspace)
      const wsIds = [...new Set(rows.map((r) => r.workspace_id))];
      const [tx, lists] = await Promise.all([
        notificationTexts(rows),
        Promise.all(wsIds.map((id) => listMembers(id).catch(() => []))),
      ]);
      const nm = {};
      lists.flat().forEach((x) => { if (x.profiles) nm[x.profiles.id] = x.profiles.name || x.profiles.email; });
      setItems(rows); setUnread(count); setTexts(tx); setNames(nm); setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // โหลดตอนเริ่ม และโหลดใหม่เมื่อมีการแจ้งเตือนใหม่เข้ามา (realtime)
  useEffect(() => {
    if (!uid) return;
    load();
    return subscribeNotifications(uid, () => load());
  }, [uid, load]);

  // คลิกนอกแผงหรือกด Esc เพื่อปิด
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!uid) return null;

  const toggle = () => { if (!open) load(); setOpen(!open); };

  const snippet = (n) => {
    const raw = n.kind === 'mention_comment' ? texts.comments[n.comment_id]
      : n.kind === 'mention_message' ? texts.messages[n.message_id]
      : n.kind === 'assigned' ? texts.tasks[n.task_id] : '';
    const t = mentionsToText(raw || '', names).replace(/\s+/g, ' ').trim();
    return t.length > 100 ? t.slice(0, 100) + '…' : t; // ตัดหลังแปลงเป็นชื่อแล้ว จะได้ไม่ตัด token กลางคัน
  };

  // กดที่แจ้งเตือน: ทำเครื่องหมายว่าอ่านแล้ว แล้วไปยังปลายทาง
  const go = async (n) => {
    try {
      if (!n.read_at) {
        await markRead(n.id);
        setItems((a) => a.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
        setUnread((u) => Math.max(0, u - 1));
      }
      let url = null;
      if (n.kind === 'mention_message' && n.channel_id) {
        url = `/app/chat?ws=${encodeURIComponent(n.workspace_id)}&channel=${encodeURIComponent(n.channel_id)}`;
      } else if (n.task_id) {
        const pid = await taskProject(n.task_id);
        url = `/app?ws=${encodeURIComponent(n.workspace_id)}&project=${encodeURIComponent(pid)}&task=${encodeURIComponent(n.task_id)}`;
      }
      setErr('');
      if (url) { setOpen(false); router.push(url); }
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  const readAll = async () => {
    try {
      await markAllRead();
      const now = new Date().toISOString();
      setItems((a) => a.map((x) => ({ ...x, read_at: x.read_at || now })));
      setUnread(0);
      setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  const remove = async (n) => {
    try {
      await deleteNotification(n.id);
      setItems((a) => a.filter((x) => x.id !== n.id));
      if (!n.read_at) setUnread((u) => Math.max(0, u - 1));
      setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button type="button" className={styles.bell} onClick={toggle} aria-expanded={open} aria-haspopup="true"
        aria-label={unread > 0 ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : 'การแจ้งเตือน'}>
        🔔
        {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel + ' ' + styles[align === 'left' ? 'left' : 'right']}>
          <div className={styles.head}>
            <span className={styles.headTitle}>การแจ้งเตือน</span>
            <button type="button" className={styles.link} onClick={readAll} disabled={unread === 0}>อ่านทั้งหมดแล้ว</button>
          </div>

          {err && <div className={styles.errBox}><div className="err" role="alert">{err}</div></div>}

          {loading ? (
            <div className={styles.note}>กำลังโหลด…</div>
          ) : items.length === 0 ? (
            <div className={styles.note}>ยังไม่มีการแจ้งเตือน</div>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => {
                const label = labelFor(n, names[n.actor_id], texts.tasks[n.task_id]);
                // due_* แสดงชื่องานในบรรทัดแรกแล้ว ไม่ต้องมีข้อความรองซ้ำ
                const sn = snippet(n);
                return (
                  <li key={n.id} className={styles.item + (n.read_at ? '' : ' ' + styles.unread)}>
                    <button type="button" className={styles.main} onClick={() => go(n)}>
                      <span className={styles.label}>{label}</span>
                      {sn && <span className={styles.snip}>{sn}</span>}
                      <time className={styles.time} dateTime={n.created_at}>{fmtTime(n.created_at)}</time>
                    </button>
                    <button type="button" className={styles.del} onClick={() => remove(n)} aria-label="ลบการแจ้งเตือน">✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
