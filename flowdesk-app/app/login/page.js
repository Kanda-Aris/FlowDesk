'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signUp } from '../../lib/api';

function thaiError(m = '') {
  if (/Invalid login/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/already registered/i.test(m)) return 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ';
  if (/at least 6|weak/i.test(m)) return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร';
  if (/not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลก่อน';
  return m || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

export default function Login() {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setMsg(''); setBusy(true);
    try {
      const r = signup ? await signUp(email.trim(), pw, name.trim()) : await signIn(email.trim(), pw);
      if (!r.session) { setMsg('สมัครแล้ว กรุณากดลิงก์ยืนยันในอีเมล แล้วกลับมาเข้าสู่ระบบ'); return; }
      router.replace('/app');
    } catch (er) { setMsg(thaiError(er.message)); } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <div className="logo"><b>Fd</b> FlowDesk</div>
        <div className="muted">{signup ? 'สร้างบัญชีใหม่' : 'เข้าสู่ระบบ'}</div>
        {signup && <input placeholder="ชื่อที่แสดง" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input type="email" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="รหัสผ่าน" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {msg && <div className="err">{msg}</div>}
        <button className="primary" disabled={busy}>{busy ? 'รอสักครู่…' : signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
        <button type="button" onClick={() => { setSignup(!signup); setMsg(''); }}>{signup ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}</button>
      </form>
    </div>
  );
}
