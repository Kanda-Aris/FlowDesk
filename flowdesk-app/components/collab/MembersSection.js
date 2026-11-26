'use client';
// รายชื่อสมาชิก + ตั้งบทบาท (หลายบทบาทต่อคนได้) + ลบสมาชิก + ออกจาก workspace
// props: { wsId, me, members, memberRoles, roleInfo, perms, onChanged }
//  - members     จาก listMembers(ws) = [{ profiles: { id, name, email } }]  (คอลัมน์ role เดิมเป็นแค่ของเก่า ไม่ใช้ตัดสินอะไร)
//  - memberRoles จาก listMemberRoles(ws) = [{ user_id, role_id }]
//  - roleInfo    จาก listRoles(ws)  (roles[].can_assign = บทบาทที่ฉันให้คนอื่นได้ -> ใช้เป็นตัวเลือก)
//  - perms       จาก myPermissions(ws)
//  - onChanged() โหลดข้อมูลสมาชิกและบทบาทใหม่ (คืน Promise)
// ปุ่มที่ซ่อนไว้เป็นแค่ความสะดวก ฐานข้อมูลบังคับลำดับขั้นและสิทธิ์จริงทุกครั้ง
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignMemberRole, removeMemberRole, removeMember, hasPerm } from '../../lib/api';
import { roleErrText } from '../../lib/roles-th';
import { useDialogs } from '../ui/Dialogs';
import { colorOf, initial, safeColor } from './roles';
import styles from './Sections.module.css';

export default function MembersSection({ wsId, me, members, memberRoles = [], roleInfo, perms, onChanged }) {
  const router = useRouter();
  const { askConfirm } = useDialogs();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(''); // user id ที่เปิดแผงเลือกบทบาทอยู่

  const roles = roleInfo?.roles || [];
  const byId = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const rolesOf = useMemo(() => {
    const m = {};
    for (const x of memberRoles) (m[x.user_id] = m[x.user_id] || []).push(x.role_id);
    return m;
  }, [memberRoles]);
  const bestRank = (uid) => Math.min(...(rolesOf[uid] || []).map((id) => byId[id]?.rank ?? 99), 99);
  const sorted = useMemo(() => [...members].sort((a, b) => bestRank(a.profiles?.id) - bestRank(b.profiles?.id)), [members, rolesOf, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canChange = !!roleInfo?.can_change_member_roles || hasPerm(perms, 'member.change_roles');
  const canRemove = hasPerm(perms, 'member.remove');
  const assignable = roles.filter((r) => r.can_assign);

  // ทำงานแล้วโหลดใหม่เสมอ (ถ้าล้มเหลวหน้าจอจะกลับไปเป็นค่าจริงในฐานข้อมูล)
  const run = async (userId, fn) => {
    setBusy(userId);
    try {
      await fn();
      setErr('');
      await onChanged();
    } catch (e) {
      setErr(roleErrText(e));
      try { await onChanged(); } catch { /* แสดง error แรกไว้แล้ว */ }
    } finally {
      setBusy('');
    }
  };

  const toggleRole = async (m, role, has) => {
    const p = m.profiles || {};
    const nm = p.name || p.email || 'สมาชิก';
    if (role.key === 'owner') {
      const yes = await askConfirm({
        title: 'เปลี่ยนบทบาทเจ้าของ',
        message: has ? `ถอดบทบาทเจ้าของของ ${nm} ใช่ไหม?` : `ให้ ${nm} เป็นเจ้าของ Workspace นี้ใช่ไหม?`,
        okLabel: 'เปลี่ยน',
        danger: true,
      });
      if (!yes) return;
    }
    run(p.id, () => (has ? removeMemberRole(wsId, p.id, role.id) : assignMemberRole(wsId, p.id, role.id)));
  };

  const remove = async (m) => {
    const p = m.profiles || {};
    const yes = await askConfirm({
      title: 'ลบสมาชิก',
      message: `ลบ ${p.name || p.email || 'สมาชิก'} ออกจาก Workspace นี้ใช่ไหม?`,
      okLabel: 'ลบ',
      danger: true,
    });
    if (yes) run(p.id, () => removeMember(wsId, p.id));
  };

  const leave = async () => {
    const yes = await askConfirm({
      title: 'ออกจาก Workspace',
      message: 'คุณจะเข้าถึงงานและแชทของ Workspace นี้ไม่ได้อีก ต้องได้รับเชิญใหม่จึงจะกลับเข้ามาได้ ต้องการออกใช่ไหม?',
      okLabel: 'ออก',
      danger: true,
    });
    if (!yes) return;
    setBusy(me.id);
    try {
      await removeMember(wsId, me.id);
      router.replace('/app');
    } catch (e) {
      setErr(roleErrText(e)); // เช่น last_owner = ต้องมีเจ้าของอย่างน้อย 1 คน
      setBusy('');
    }
  };

  const iAmDirect = members.some((m) => m.profiles?.id === me?.id);

  return (
    <section className={styles.card} aria-label="สมาชิก">
      <h2 className={styles.h2}>สมาชิก ({members.length})</h2>
      {err && <div className="err" role="alert">{err}</div>}

      <div className={styles.members}>
        {sorted.map((m) => {
          const p = m.profiles || {};
          const nm = p.name || p.email || 'ไม่ระบุชื่อ';
          const isMe = p.id === me?.id;
          const mine = (rolesOf[p.id] || []).map((id) => byId[id]).filter(Boolean);
          const disabled = busy === p.id;
          const isOpen = open === p.id;
          return (
            <div key={p.id || nm} className={styles.member}>
              <span className={styles.av} style={{ background: colorOf(p.id || nm) }}>{initial(nm)}</span>
              <span className={styles.info}>
                <span className={styles.nm}>{nm}{isMe && ' (คุณ)'}</span>
                {p.name && p.email && <span className={styles.em}>{p.email}</span>}
                <span className={styles.chips}>
                  {mine.length === 0 && <span className={styles.em}>ยังไม่มีบทบาท</span>}
                  {mine.map((r) => (
                    <span key={r.id} className={styles.chip} style={{ borderColor: safeColor(r.color), color: safeColor(r.color) }}>{r.name}</span>
                  ))}
                </span>
              </span>
              <span className={styles.controls}>
                {canChange && assignable.length > 0 && !isMe && (
                  <button type="button" disabled={disabled} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : p.id)} aria-label={`จัดการบทบาทของ ${nm}`}>{isOpen ? 'ปิด' : 'บทบาท'}</button>
                )}
                {canRemove && !isMe && (
                  <button type="button" className={styles.danger} disabled={disabled} onClick={() => remove(m)} aria-label={`ลบ ${nm} ออกจาก Workspace`}>ลบ</button>
                )}
                {isMe && (
                  <button type="button" className={styles.danger} disabled={disabled} onClick={leave}>ออกจาก Workspace</button>
                )}
              </span>
              {isOpen && (
                <div className={styles.rolePanel}>
                  <div className={styles.label}>ติ๊กเพื่อให้หรือถอดบทบาท (ให้ได้หลายบทบาท สิทธิ์จะรวมกัน)</div>
                  {assignable.map((r) => {
                    const has = mine.some((x) => x.id === r.id);
                    return (
                      <label key={r.id} className={styles.toggle}>
                        <input type="checkbox" checked={has} disabled={disabled} onChange={() => toggleRole(m, r, has)} />
                        <span className={styles.chip} style={{ borderColor: safeColor(r.color), color: safeColor(r.color) }}>{r.name}</span>
                      </label>
                    );
                  })}
                  {mine.some((x) => !x.can_assign) && <div className={styles.label}>บทบาทที่ไม่แสดงเป็นตัวเลือก คือบทบาทที่สูงกว่าหรือเท่ากับของคุณ จึงแก้ไม่ได้</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!iAmDirect && <div className={styles.label}>คุณเข้าถึง Workspace นี้ได้ผ่านบทบาทใน Workspace หลัก รายชื่อนี้แสดงเฉพาะสมาชิกโดยตรง</div>}
      {!canChange && !canRemove && <div className={styles.label}>เฉพาะผู้ที่มีสิทธิ์จัดการสมาชิกเท่านั้นที่เปลี่ยนบทบาทหรือลบสมาชิกได้</div>}
    </section>
  );
}
