'use client';
// หน้าแชทเรียลไทม์ — เปิดด้วย /app/chat?ws=<workspace_id>&channel=<channel_id> (channel ไม่ใส่ก็ได้)
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { currentUser, listChannels, listMembers, listMessages, sendMessage, subscribeMessages, myPermissions, hasPerm } from '../../../lib/api';
import { createChannel, friendlyError } from '../../../lib/api-collab';
import { DialogProvider, useDialogs } from '../../../components/ui/Dialogs';
import MentionInput from '../../../components/collab/MentionInput';
import { nameMap, renderMentions, toTokens } from '../../../components/collab/mentions';
import styles from './chat.module.css';

const MAX_LEN = 2000;
const fmtTime = (iso) =>
  new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// รวมข้อความใหม่เข้ารายการเดิม: กันซ้ำด้วย id แล้วเรียงเก่า → ใหม่
// (ข้อความที่เราส่งเองจะมาซ้ำผ่าน realtime จึงต้องกันซ้ำ)
const merge = (prev, incoming) => {
  const map = new Map(prev.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, { ...map.get(m.id), ...m }));
  return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
};

function ChatInner() {
  const router = useRouter();
  const { askText } = useDialogs();
  const params = useSearchParams();
  const wsId = params.get('ws');
  const channelParam = params.get('channel');

  const [me, setMe] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]);
  const [perms, setPerms] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const listRef = useRef(null);
  const stick = useRef(true); // true = ผู้ใช้อยู่ล่างสุด ให้เลื่อนตามข้อความใหม่
  const picked = useRef(new Map()); // ชื่อ → id ของคนที่เลือกจากรายการ @mention

  // ชื่อผู้เขียน: payload ของ realtime ไม่มี profile จึงแปลง author_id เป็นชื่อจากรายชื่อสมาชิก
  const nameOf = useMemo(() => nameMap(members), [members]);

  // ส่งข้อความได้เมื่อมีติ๊ก chat.send; สร้างช่องได้เมื่อมีติ๊ก chat.create_channel (ปุ่มเป็นแค่ความสะดวก ฐานข้อมูลตรวจซ้ำ)
  const canWrite = hasPerm(perms, 'chat.send');
  const canCreate = hasPerm(perms, 'chat.create_channel');

  // โหลดข้อมูลตั้งต้น: ผู้ใช้, ช่องแชท, สมาชิก
  useEffect(() => {
    if (!wsId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const u = await currentUser();
        if (!u) { router.replace('/login'); return; }
        const [chs, mem, pm] = await Promise.all([listChannels(wsId), listMembers(wsId), myPermissions(wsId).catch(() => ({ perms: [] }))]);
        if (cancelled) return;
        setMe(u); setMembers(mem); setChannels(chs); setPerms(pm);
        setChannel(chs.find((c) => c.id === channelParam) || chs[0] || null); // เปิดช่องจากลิงก์แจ้งเตือนได้
      } catch (e) {
        if (!cancelled) setErr(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wsId, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // กดแจ้งเตือนขณะอยู่หน้านี้แล้ว: พารามิเตอร์ channel เปลี่ยน → สลับไปช่องนั้น
  useEffect(() => {
    if (!channelParam) return;
    const c = channels.find((x) => x.id === channelParam);
    if (c) setChannel(c);
  }, [channelParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // เมื่อเปลี่ยนช่อง: สมัครรับข้อความสดก่อน แล้วค่อยโหลดประวัติ (กันข้อความตกหล่นระหว่างโหลด)
  useEffect(() => {
    if (!channel) { setMsgs([]); return; }
    let cancelled = false;
    setMsgs([]);
    stick.current = true;
    const unsubscribe = subscribeMessages(channel.id, (m) => {
      if (!cancelled) setMsgs((a) => merge(a, [m]));
    });
    listMessages(channel.id, 100)
      .then((rows) => { if (!cancelled) { setMsgs((a) => merge(a, rows)); setErr(''); } })
      .catch((e) => { if (!cancelled) setErr(friendlyError(e)); });
    return () => { cancelled = true; unsubscribe(); };
  }, [channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ (เฉพาะตอนที่ผู้ใช้อยู่ล่างสุดอยู่แล้ว)
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending || !channel) return;
    setSending(true);
    try {
      // แปลง @ชื่อ ที่เลือกไว้เป็น @[uuid] ก่อนบันทึก
      const m = await sendMessage(channel.id, toTokens(body, picked.current));
      stick.current = true;
      setMsgs((a) => merge(a, [m]));
      setText('');
      picked.current = new Map();
      setErr('');
    } catch (e) {
      setErr(friendlyError(e)); // เก็บข้อความที่พิมพ์ไว้ ไม่ให้หาย
    } finally {
      setSending(false);
    }
  }, [text, sending, channel]);

  // Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่ (ไม่ส่งตอนกำลังเลือกคำภาษาไทยจาก IME)
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const addChannel = async () => {
    const name = await askText({ title: 'สร้างช่องแชทใหม่', label: 'ชื่อช่องแชท', okLabel: 'สร้าง', maxLength: 40 });
    if (!name) return; // ยกเลิก
    try {
      const c = await createChannel(wsId, name);
      setChannels((a) => [...a, c]);
      setChannel(c);
      setErr('');
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  if (!wsId) return <div className={styles.pad}>กรุณาเลือก Workspace ก่อน (เปิดจากเมนูด้านข้าง)</div>;
  if (loading) return <div className={styles.pad}>กำลังโหลด…</div>;

  return (
    <div className={styles.wrap}>
      {/* รายการช่อง (จอกว้าง) */}
      <nav className={styles.side} aria-label="ช่องแชท">
        <div className={styles.sideTitle}>ช่องแชท</div>
        {channels.map((c) => (
          <button key={c.id} className={styles.ch + (channel?.id === c.id ? ' ' + styles.on : '')} onClick={() => setChannel(c)}>
            # {c.name}
          </button>
        ))}
        {canCreate && <button className={styles.ch + ' ' + styles.add} onClick={addChannel}>＋ ช่องใหม่</button>}
      </nav>

      <section className={styles.main}>
        <div className={styles.top}>
          {/* ตัวเลือกช่อง (จอแคบ) */}
          <select className={styles.select} value={channel?.id || ''} onChange={(e) => setChannel(channels.find((c) => c.id === e.target.value) || null)} aria-label="เลือกช่องแชท">
            {channels.map((c) => <option key={c.id} value={c.id}>{'# ' + c.name}</option>)}
          </select>
          <span className={styles.topName}>{channel ? '# ' + channel.name : 'แชท'}</span>
          {canCreate && <button className={styles.add} onClick={addChannel} aria-label="สร้างช่องแชทใหม่">＋</button>}
        </div>

        {err && <div className={styles.errBox}><div className="err" role="alert">{err}</div></div>}

        {!channel ? (
          <div className={styles.note}>ยังไม่มีช่องแชทใน Workspace นี้{canCreate ? ' กด ＋ เพื่อสร้าง' : ''}</div>
        ) : (<>
          <div className={styles.list} ref={listRef} onScroll={onScroll}>
            {msgs.length === 0 && <div className={styles.note}>ยังไม่มีข้อความ เริ่มพูดคุยได้เลย</div>}
            {msgs.map((m) => {
              const own = m.author_id === me?.id;
              const name = nameOf[m.author_id] || m.profiles?.name || 'ไม่ระบุชื่อ';
              return (
                <div key={m.id} className={styles.msg + (own ? ' ' + styles.own : '')}>
                  <div className={styles.meta}>{!own && <b>{name}</b>}<time dateTime={m.created_at}>{fmtTime(m.created_at)}</time></div>
                  {/* แสดงเป็นข้อความธรรมดาเท่านั้น (@[uuid] ถูกแปลงเป็นป้ายชื่อ ไม่ใช่ HTML) */}
                  <div className={styles.bubble}>{renderMentions(m.body, nameOf)}</div>
                </div>
              );
            })}
          </div>

          {canWrite ? (
            <form className={styles.form} onSubmit={(e) => { e.preventDefault(); send(); }}>
              <MentionInput className={styles.input} rows={1} value={text} maxLength={MAX_LEN}
                onChange={setText} onKeyDown={onKey} members={members} meId={me?.id} picked={picked}
                placeholder="พิมพ์ข้อความ (พิมพ์ @ เพื่อกล่าวถึงเพื่อน) แล้วกด Enter เพื่อส่ง" aria-label="พิมพ์ข้อความ" />
              <button type="submit" className="primary" disabled={sending || !text.trim()}>{sending ? 'กำลังส่ง…' : 'ส่ง'}</button>
            </form>
          ) : (
            <div className={styles.readonly}>บทบาทของคุณไม่มีสิทธิ์ส่งข้อความ อ่านได้อย่างเดียว</div>
          )}
        </>)}
      </section>
    </div>
  );
}

// useSearchParams ต้องอยู่ใน Suspense ไม่เช่นนั้น next build จะ error
export default function ChatPage() {
  return (
    <DialogProvider>
      <Suspense fallback={<div className={styles.pad}>กำลังโหลด…</div>}>
        <ChatInner />
      </Suspense>
    </DialogProvider>
  );
}
