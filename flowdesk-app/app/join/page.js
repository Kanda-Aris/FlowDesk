'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';

import { DEFAULT_ROLE_TH } from '../../lib/roles-th';
const TOKEN_RE = /^[0-9a-f]{48}$/;

const STATUS_MSG = {
  not_found: 'ไม่พบลิงก์เชิญนี้ ลองขอลิงก์ใหม่จากคนที่เชิญคุณ',
  revoked: 'ลิงก์เชิญนี้ถูกยกเลิกแล้ว ลองขอลิงก์ใหม่จากคนที่เชิญคุณ',
  expired: 'ลิงก์เชิญนี้หมดอายุแล้ว ลองขอลิงก์ใหม่จากคนที่เชิญคุณ',
  used_up: 'ลิงก์เชิญนี้ถูกใช้ครบจำนวนครั้งแล้ว ลองขอลิงก์ใหม่จากคนที่เชิญคุณ',
};

function joinError(e) {
  const m = String(e?.message || '');
  if (/invite_not_found/.test(m)) return STATUS_MSG.not_found;
  if (/invite_revoked/.test(m)) return STATUS_MSG.revoked;
  if (/invite_expired/.test(m)) return STATUS_MSG.expired;
  if (/invite_used_up/.test(m)) return STATUS_MSG.used_up;
  if (/not_authenticated|JWT/i.test(m)) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
  if (/fetch|network/i.test(m)) return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

export default function Join() {
  const router = useRouter();
  const [state, setState] = useState('loading'); // loading | bad | login | ready | member | blocked
  const [token, setToken] = useState('');
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = (new URLSearchParams(window.location.search).get('token') || '').trim();
      if (!TOKEN_RE.test(t)) { setState('bad'); return; }
      setToken(t);
      try {
        const u = await api.currentUser();
        if (!alive) return;
        if (!u) { setState('login'); return; }
        setEmail(u.email || '');
        const p = await api.previewInvite(t);
        if (!alive) return;
        setInfo(p);
        if (p.status === 'ok') setState(p.already_member ? 'member' : 'ready');
        else if (p.already_member) setState('member');
        else { setMsg(STATUS_MSG[p.status] || STATUS_MSG.not_found); setState('blocked'); }
      } catch (e) { if (alive) { setMsg(joinError(e)); setState('blocked'); } }
    })();
    return () => { alive = false; };
  }, []);

  const loginHref = `/login?next=${encodeURIComponent('/join?token=' + token)}`;

  async function accept() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.acceptInvite(token);
      router.replace(`/app?ws=${r.workspace_id}`);
    } catch (e) { setMsg(joinError(e)); setBusy(false); }
  }

  async function otherAccount() {
    await api.signOut();
    router.replace(loginHref);
  }

  let body;
  if (state === 'loading') body = <div className="muted">กำลังตรวจสอบลิงก์เชิญ…</div>;
  else if (state === 'bad') body = (<>
    <div className="err">ลิงก์เชิญไม่ถูกต้อง ลองคัดลอกลิงก์มาใหม่ให้ครบ</div>
    <button className="primary" onClick={() => router.replace('/app')}>ไปหน้าแรก</button>
  </>);
  else if (state === 'login') body = (<>
    <div>คุณได้รับเชิญให้เข้าร่วม Workspace ใน FlowDesk</div>
    <div className="muted">เข้าสู่ระบบหรือสมัครสมาชิกก่อน แล้วระบบจะพากลับมาที่นี่</div>
    <button className="primary" onClick={() => router.push(loginHref)}>เข้าสู่ระบบ / สมัครสมาชิก</button>
  </>);
  else if (state === 'ready') body = (<>
    <div>คุณได้รับเชิญให้เข้าร่วม</div>
    <div style={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{info?.workspace_name}</div>
    <div className="muted">ในบทบาท {info?.role_name || DEFAULT_ROLE_TH[info?.role] || 'สมาชิก'}</div>
    {msg && <div className="err">{msg}</div>}
    <button className="primary" onClick={accept} disabled={busy}>{busy ? 'รอสักครู่…' : 'เข้าร่วม'}</button>
    <div className="muted" style={{ fontSize: 13 }}>เข้าสู่ระบบด้วย {email}</div>
    <button type="button" onClick={otherAccount} disabled={busy}>ใช้บัญชีอื่น</button>
  </>);
  else if (state === 'member') body = (<>
    <div>คุณเป็นสมาชิกของ</div>
    <div style={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{info?.workspace_name}</div>
    <div className="muted">อยู่แล้ว ไม่ต้องเข้าร่วมซ้ำ</div>
    <button className="primary" onClick={accept} disabled={busy}>{busy ? 'รอสักครู่…' : 'ไปที่ Workspace'}</button>
    {msg && <div className="err">{msg}</div>}
  </>);
  else body = (<>
    <div className="err">{msg}</div>
    <div className="muted" style={{ fontSize: 13 }}>เข้าสู่ระบบด้วย {email || 'ยังไม่ได้เข้าสู่ระบบ'}</div>
    <button className="primary" onClick={() => router.replace('/app')}>ไปหน้าแรก</button>
  </>);

  return (
    <div className="center">
      <div className="card">
        <div className="logo"><b>Fd</b> FlowDesk</div>
        {body}
      </div>
    </div>
  );
}
