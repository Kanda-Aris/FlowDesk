'use client';
// สร้างและจัดการลิงก์เชิญ (เห็นเฉพาะผู้มีติ๊ก member.invite)
// props: { wsId, perms, roleInfo }  perms จาก myPermissions, roleInfo จาก listRoles (ตัวเลือกบทบาท = roles ที่ can_assign)
// ทำงานกับฐานข้อมูลเมื่อ INVITES_LIVE = true ใน lib/api-collab.js (ตอนนี้เปิดแล้ว)
import { useCallback, useEffect, useState } from 'react';
import {
  INVITES_LIVE, listInvites, createInvite, revokeInvite, inviteLink, isInviteActive,
} from '../../lib/api-collab';
import { useDialogs } from '../ui/Dialogs';
import { hasPerm } from '../../lib/api';
import { roleErrText } from '../../lib/roles-th';
import styles from './Sections.module.css';

const fmtDate = (iso) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function InvitesSection({ wsId, perms, roleInfo }) {
  const { askConfirm } = useDialogs();
  const canManage = hasPerm(perms, 'member.invite');
  const allRoles = roleInfo?.roles || [];
  const roles = allRoles.filter((r) => r.can_assign); // เชิญได้เฉพาะบทบาทที่ต่ำกว่าบทบาทของตัวเอง (ฐานข้อมูลตรวจซ้ำ)
  const nameOfRole = (inv) => allRoles.find((r) => r.id === inv.role_id)?.name || 'บทบาทที่ถูกลบ';

  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(INVITES_LIVE);
  const [roleId, setRoleId] = useState('');
  const [days, setDays] = useState('7');
  const [maxUses, setMaxUses] = useState('10');
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState('');   // ลิงก์ที่แสดงในช่องให้เลือกคัดลอก
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!INVITES_LIVE) return;
    try {
      setInvites(await listInvites(wsId));
      setErr('');
    } catch (e) {
      setErr(roleErrText(e));
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  if (!canManage) return null;
  // ค่าเริ่มต้นของตัวเลือก: บทบาทที่ต่ำที่สุดที่ให้ได้ (ท้ายรายการ) เพื่อไม่ให้เชิญสิทธิ์สูงโดยไม่ตั้งใจ
  const chosen = roles.some((r) => r.id === roleId) ? roleId : (roles[roles.length - 1]?.id || '');

  // คัดลอกลิงก์ ถ้าเบราว์เซอร์ไม่ให้ใช้ clipboard จะโชว์ลิงก์ในช่องให้เลือกคัดลอกเอง
  const copy = async (link, id) => {
    setShown(link);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? '' : c)), 2000);
      setErr('');
    } catch {
      setErr('คัดลอกอัตโนมัติไม่ได้ กดค้างที่ช่องลิงก์เพื่อเลือกแล้วคัดลอกเอง');
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const d = Number(days);
    const u = Number(maxUses);
    if (!chosen) { setErr('ยังไม่มีบทบาทที่คุณเชิญได้'); return; }
    if (!Number.isInteger(d) || d < 1 || d > 30) { setErr('จำนวนวันต้องเป็นเลข 1 ถึง 30'); return; }
    if (!Number.isInteger(u) || u < 1 || u > 100) { setErr('จำนวนครั้งที่ใช้ได้ต้องเป็นเลข 1 ถึง 100'); return; }
    setCreating(true);
    try {
      const inv = await createInvite({ workspaceId: wsId, roleId: chosen, days: d, maxUses: u });
      setErr('');
      const link = inviteLink(inv.token);
      setShown(link);
      await load();
      try { await navigator.clipboard.writeText(link); setCopied('new'); setTimeout(() => setCopied(''), 2000); } catch { /* ใช้ช่องลิงก์แทน */ }
    } catch (e2) {
      setErr(roleErrText(e2));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (inv) => {
    const yes = await askConfirm({
      title: 'ยกเลิกลิงก์เชิญ',
      message: 'คนที่ยังไม่ได้เข้าร่วมจะใช้ลิงก์นี้ไม่ได้อีก ต้องการยกเลิกใช่ไหม?',
      okLabel: 'ยกเลิกลิงก์',
      danger: true,
    });
    if (!yes) return;
    try {
      await revokeInvite(inv.id);
      if (shown.endsWith(encodeURIComponent(inv.token))) setShown('');
      await load();
    } catch (e) {
      setErr(roleErrText(e));
      load(); // โหลดรายการใหม่ให้ตรงกับฐานข้อมูล (เช่น ลิงก์ถูกยกเลิกไปแล้ว)
    }
  };

  const active = invites.filter((i) => isInviteActive(i));

  return (
    <section className={styles.card} aria-label="ลิงก์เชิญ">
      <h2 className={styles.h2}>เชิญสมาชิกด้วยลิงก์</h2>

      {!INVITES_LIVE && <div className={styles.note}>ระบบลิงก์เชิญยังไม่เปิดใช้งาน</div>}
      {err && <div className="err" role="alert">{err}</div>}

      <form onSubmit={create} className={styles.row2}>
        <label className={styles.field + ' ' + styles.fieldWide}>
          <span className={styles.label}>บทบาทของผู้ที่เข้าร่วม</span>
          <select value={chosen} onChange={(e) => setRoleId(e.target.value)} disabled={!INVITES_LIVE || roles.length === 0}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ใช้ได้กี่วัน</span>
          <input type="number" inputMode="numeric" min="1" max="30" value={days} onChange={(e) => setDays(e.target.value)} disabled={!INVITES_LIVE} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ใช้ได้กี่ครั้ง</span>
          <input type="number" inputMode="numeric" min="1" max="100" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} disabled={!INVITES_LIVE} />
        </label>
        <button type="submit" className={'primary ' + styles.fieldWide} disabled={!INVITES_LIVE || creating || roles.length === 0}>
          {creating ? 'กำลังสร้าง…' : 'สร้างลิงก์เชิญ'}
        </button>
      </form>

      {shown && (
        <div className={styles.linkBox}>
          <input readOnly value={shown} onFocus={(e) => e.target.select()} aria-label="ลิงก์เชิญ" />
          <button type="button" onClick={() => copy(shown, 'new')}>{copied === 'new' ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}</button>
        </div>
      )}

      <h3 className={styles.h2}>ลิงก์ที่ยังใช้ได้</h3>
      {loading ? (
        <div className={styles.note}>กำลังโหลด…</div>
      ) : active.length === 0 ? (
        <div className={styles.note}>ยังไม่มีลิงก์ที่ใช้ได้</div>
      ) : (
        <div className={styles.invites}>
          {active.map((inv) => (
            <div key={inv.id} className={styles.invite}>
              <span className={styles.invInfo}>
                <b>{nameOfRole(inv)}</b>
                <span className={styles.invMeta}>หมดอายุ {fmtDate(inv.expires_at)} · ใช้แล้ว {inv.uses}/{inv.max_uses}</span>
              </span>
              <button type="button" onClick={() => copy(inviteLink(inv.token), inv.id)}>{copied === inv.id ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}</button>
              <button type="button" className={styles.danger} onClick={() => revoke(inv)}>ยกเลิก</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
