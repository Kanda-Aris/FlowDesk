'use client';
// แผงคอมเมนต์ของงาน — props: { taskId, currentUser, workspaceId? }
// currentUser คือผู้ใช้จาก currentUser() ใน lib/api.js (ต้องมี .id)
// workspaceId ไม่ใส่ก็ได้ (ถ้าไม่ใส่ จะหาจาก taskId เอง) ใช้สำหรับรายชื่อสมาชิกตอน @mention
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listComments, addComment, listMembers } from '../../lib/api';
import { deleteComment, subscribeComments, taskWorkspace, friendlyError } from '../../lib/api-collab';
import { DialogProvider, useDialogs } from '../ui/Dialogs';
import MentionInput from './MentionInput';
import { nameMap, renderMentions, toTokens } from './mentions';
import styles from './CommentsPanel.module.css';

const MAX_LEN = 2000;

// แสดงเวลาแบบไทย เช่น "24 พ.ย. 14:05"
const fmtTime = (iso) =>
  new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ครอบด้วย DialogProvider ในตัว (ถ้า A ติดตั้งไว้ใน layout แล้ว จะใช้ตัวนั้นต่อโดยอัตโนมัติ)
export default function CommentsPanel(props) {
  return (
    <DialogProvider>
      <CommentsPanelInner {...props} />
    </DialogProvider>
  );
}

function CommentsPanelInner({ taskId, currentUser, workspaceId }) {
  const { askConfirm } = useDialogs();
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const picked = useRef(new Map()); // ชื่อ → id ของคนที่เลือกจากรายการ @mention

  const nameOf = useMemo(() => nameMap(members), [members]);

  // โหลดรายการคอมเมนต์ (เก่า → ใหม่)
  const load = useCallback(async () => {
    try {
      setItems(await listComments(taskId));
      setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    setItems([]);
    load();
    // มีคอมเมนต์ใหม่จากคนอื่น (หรือจากเรา) → โหลดรายการใหม่ เพื่อให้ได้ชื่อผู้เขียนด้วย
    const unsubscribe = subscribeComments(taskId, () => load());
    return unsubscribe;
  }, [taskId, load]);

  // โหลดสมาชิกของ workspace สำหรับตัวเลือก @mention และแปลง @[uuid] เป็นชื่อ
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    (async () => {
      try {
        const ws = workspaceId || (await taskWorkspace(taskId));
        const mem = await listMembers(ws);
        if (!cancelled) setMembers(mem);
      } catch (e) {
        if (!cancelled) setErr(friendlyError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [taskId, workspaceId]);

  // เลื่อนลงล่างสุดเมื่อจำนวนคอมเมนต์เปลี่ยน
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [items.length]);

  const send = async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      // แปลง @ชื่อ ที่เลือกไว้เป็น @[uuid] ก่อนบันทึก
      const c = await addComment(taskId, toTokens(trimmed, picked.current));
      // ใส่ชื่อของเราเอง ไม่ต้องรอโหลดใหม่ และกันซ้ำด้วย id (realtime อาจส่งมาด้วย)
      const mine = { ...c, profiles: { name: currentUser?.user_metadata?.name || currentUser?.email } };
      setItems((a) => (a.some((x) => x.id === c.id) ? a : [...a, mine]));
      setText('');
      picked.current = new Map();
      setErr('');
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    const yes = await askConfirm({ title: 'ลบคอมเมนต์', message: 'ต้องการลบคอมเมนต์นี้ใช่ไหม? ลบแล้วกู้คืนไม่ได้', okLabel: 'ลบ', danger: true });
    if (!yes) return;
    try {
      await deleteComment(id);
      setItems((a) => a.filter((x) => x.id !== id));
      setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  // Ctrl/Cmd + Enter = ส่ง (Enter เฉยๆ = ขึ้นบรรทัดใหม่)
  const onKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
  };

  if (!taskId) return <div className={styles.note}>เลือกงานเพื่อดูคอมเมนต์</div>;

  return (
    <section className={styles.panel} aria-label="คอมเมนต์">
      <h3 className={styles.title}>คอมเมนต์{items.length > 0 && <span className={styles.count}>{items.length}</span>}</h3>

      {err && <div className="err" role="alert">{err}</div>}

      <div className={styles.list}>
        {loading && <div className={styles.note}>กำลังโหลด…</div>}
        {!loading && items.length === 0 && !err && <div className={styles.note}>ยังไม่มีคอมเมนต์ เริ่มพูดคุยได้เลย</div>}
        {items.map((c) => {
          const own = c.author_id === currentUser?.id;
          const name = c.profiles?.name || 'ไม่ระบุชื่อ';
          return (
            <article key={c.id} className={styles.item}>
              <div className={styles.meta}>
                <b className={styles.name}>{name}{own && ' (คุณ)'}</b>
                <time className={styles.time} dateTime={c.created_at}>{fmtTime(c.created_at)}</time>
                {own && (
                  <button type="button" className={styles.del} onClick={() => remove(c.id)} aria-label="ลบคอมเมนต์">🗑</button>
                )}
              </div>
              {/* แสดงเป็นข้อความธรรมดาเท่านั้น (@[uuid] ถูกแปลงเป็นป้ายชื่อ ไม่ใช่ HTML) */}
              <p className={styles.body}>{renderMentions(c.body, nameOf)}</p>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className={styles.form} onSubmit={send}>
        <MentionInput
          className={styles.input}
          value={text}
          onChange={setText}
          members={members}
          meId={currentUser?.id}
          picked={picked}
          onKeyDown={onKey}
          maxLength={MAX_LEN}
          rows={2}
          placeholder="เขียนคอมเมนต์… พิมพ์ @ เพื่อกล่าวถึงเพื่อนร่วมทีม (Ctrl+Enter เพื่อส่ง)"
          aria-label="เขียนคอมเมนต์"
        />
        <button type="submit" className="primary" disabled={sending || !text.trim()}>
          {sending ? 'กำลังส่ง…' : 'ส่ง'}
        </button>
      </form>
    </section>
  );
}
