'use client';
// หน้าจัดการบทบาท (FR-33): รายการ สร้าง แก้ติ๊กสิทธิ์ สี สวิตช์ \"ใช้ใน Sub\" จัดลำดับ ลบ
// props: { wsId, perms, roleInfo, onChanged }
//  - roleInfo จาก listRoles(ws): { my_rank, can_manage_roles, roles[], inherited[] }
//  - ฐานข้อมูลบังคับลำดับขั้นเสมอ (แก้บทบาทที่สูงกว่าหรือเท่ากับตัวเองไม่ได้ ให้ติ๊กที่ตัวเองไม่มีไม่ได้) ปุ่มที่ซ่อน/ปิดเป็นแค่ความสะดวก
import { useMemo, useState } from 'react';
import { createRole, updateRole, deleteRole, reorderRoles, hasPerm } from '../../lib/api';
import { PERM_GROUPS, ALL_PERM, ALL_PERM_LABEL, roleErrText } from '../../lib/roles-th';
import { useDialogs } from '../ui/Dialogs';
import { ROLE_COLORS, safeColor } from './roles';
import styles from './Sections.module.css';

const EMPTY = { id: null, name: '', color: ROLE_COLORS[0], perms: [], applies: false, isOwnerRole: false };

export default function RolesSection({ wsId, perms, roleInfo, onChanged }) {
  const { askConfirm } = useDialogs();
  const [edit, setEdit] = useState(null); // null = ไม่ได้แก้ไขอยู่
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const roles = useMemo(() => [...(roleInfo?.roles || [])].sort((a, b) => a.position - b.position), [roleInfo]);
  const inherited = roleInfo?.inherited || [];
  const canManage = !!roleInfo?.can_manage_roles || hasPerm(perms, 'role.manage');
  const movable = roles.filter((r) => r.key !== 'owner'); // ลำดับของบทบาทที่ไม่ใช่เจ้าของ (เจ้าของอยู่บนสุดเสมอ)

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); setErr(''); await onChanged(); return true; }
    catch (e) { setErr(roleErrText(e)); try { await onChanged(); } catch { /* แสดง error แรกแล้ว */ } return false; }
    finally { setBusy(false); }
  };

  const startNew = () => { setErr(''); setEdit({ ...EMPTY }); };
  const startEdit = (r) => { setErr(''); setEdit({ id: r.id, name: r.name, color: safeColor(r.color), perms: [...(r.permissions || [])], applies: !!r.applies_in_subs, isOwnerRole: r.key === 'owner' }); };

  const save = async (e) => {
    e.preventDefault();
    const name = edit.name.trim();
    if (!name) { setErr('กรุณาตั้งชื่อบทบาท'); return; }
    const ok = await run(() => (edit.id
      ? updateRole(edit.id, { name, color: edit.color, permissions: edit.perms, appliesInSubs: edit.applies })
      : createRole(wsId, { name, color: edit.color, permissions: edit.perms, appliesInSubs: edit.applies })));
    if (ok) setEdit(null);
  };

  const remove = async (r) => {
    const yes = await askConfirm({ title: 'ลบบทบาท', message: `ลบบทบาท «${r.name}» ใช่ไหม? (ลบได้เมื่อไม่มีสมาชิกใช้บทบาทนี้อยู่)`, okLabel: 'ลบ', danger: true });
    if (yes) run(() => deleteRole(r.id));
  };

  // ย้ายขึ้น/ลง: ส่งรายการ id ทั้งหมดที่ไม่ใช่เจ้าของ เรียงจากสูงไปต่ำ
  const move = (r, dir) => {
    const ids = movable.map((x) => x.id);
    const i = ids.indexOf(r.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => reorderRoles(wsId, ids));
  };

  const toggle = (key) => setEdit((d) => ({ ...d, perms: d.perms.includes(key) ? d.perms.filter((k) => k !== key) : [...d.perms, key] }));
  const hasAll = !!edit && edit.perms.includes(ALL_PERM);
  // ติ๊กที่ตัวเองไม่มี จะติ๊กเพิ่มให้คนอื่นไม่ได้ (ถ้ามีอยู่แล้วในบทบาทก็คงไว้ แต่ติ๊กออกได้)
  const canTick = (key) => hasPerm(perms, key);

  return (
    <section className={styles.card} aria-label="บทบาท">
      <h2 className={styles.h2}>บทบาทและสิทธิ์</h2>
      {err && <div className="err" role="alert">{err}</div>}
      <div className={styles.label}>บทบาทที่อยู่สูงกว่าจัดการบทบาทที่ต่ำกว่าได้ แต่แก้บทบาทที่สูงกว่าหรือเท่ากับของตัวเองไม่ได้ สมาชิกหนึ่งคนมีได้หลายบทบาท สิทธิ์จะรวมกัน</div>

      <div className={styles.members}>
        {roles.map((r) => {
          const mi = movable.findIndex((x) => x.id === r.id);
          return (
            <div key={r.id} className={styles.roleRow}>
              <span className={styles.dot} style={{ background: safeColor(r.color) }} aria-hidden="true" />
              <span className={styles.grow}>
                <span className={styles.nm}>{r.name}</span>
                <span className={styles.em}>
                  {r.is_default ? 'บทบาทมาตรฐาน · ' : ''}{r.applies_in_subs ? 'ใช้ใน Sub ด้วย · ' : 'ใช้เฉพาะที่นี่ · '}{r.member_count} คน
                </span>
              </span>
              <span className={styles.controls}>
                {canManage && r.can_edit && mi >= 0 && (<>
                  <button type="button" disabled={busy || mi === 0} onClick={() => move(r, -1)} aria-label={`เลื่อน ${r.name} ขึ้น`}>▲</button>
                  <button type="button" disabled={busy || mi === movable.length - 1} onClick={() => move(r, 1)} aria-label={`เลื่อน ${r.name} ลง`}>▼</button>
                </>)}
                {canManage && r.can_edit && <button type="button" disabled={busy} onClick={() => startEdit(r)}>แก้ไข</button>}
                {canManage && r.can_edit && !r.is_default && <button type="button" className={styles.danger} disabled={busy} onClick={() => remove(r)}>ลบ</button>}
              </span>
            </div>
          );
        })}
      </div>

      {inherited.length > 0 && (
        <div className={styles.permGroup}>
          <h4>บทบาทจาก Workspace หลักที่ใช้ที่นี่ (แก้ได้ที่ Workspace หลัก)</h4>
          <div className={styles.chips}>
            {inherited.map((r) => <span key={r.id} className={styles.chip} style={{ borderColor: safeColor(r.color), color: safeColor(r.color) }}>{r.name}</span>)}
          </div>
        </div>
      )}

      {canManage && !edit && <button type="button" className="primary" disabled={busy} onClick={startNew}>＋ สร้างบทบาทใหม่</button>}
      {!canManage && <div className={styles.label}>เฉพาะผู้ที่มีสิทธิ์จัดการบทบาทเท่านั้นที่สร้างหรือแก้บทบาทได้</div>}

      {edit && (
        <form className={styles.editor} onSubmit={save}>
          <h3 className={styles.h2}>{edit.id ? 'แก้ไขบทบาท' : 'สร้างบทบาทใหม่'}</h3>
          <label className={styles.field}>
            <span className={styles.label}>ชื่อบทบาท</span>
            <input value={edit.name} maxLength={30} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="ชื่อบทบาท" disabled={edit.isOwnerRole} />
          </label>

          <div className={styles.field}>
            <span className={styles.label}>สี</span>
            <div className={styles.swatches}>
              {ROLE_COLORS.map((c) => (
                <button key={c} type="button" className={styles.swatch + (edit.color === c ? ' ' + styles.on : '')} style={{ background: c }} aria-label={`เลือกสี ${c}`} aria-pressed={edit.color === c} onClick={() => setEdit({ ...edit, color: c })} />
              ))}
            </div>
          </div>

          <label className={styles.toggle}>
            <input type="checkbox" checked={edit.applies} onChange={(e) => setEdit({ ...edit, applies: e.target.checked })} />
            <span>ใช้สิทธิ์นี้ใน Sub Workspace ทุกชั้นด้านล่างด้วย</span>
          </label>

          <label className={styles.toggle}>
            <input type="checkbox" checked={hasAll} disabled={!canTick(ALL_PERM) && !hasAll} onChange={() => toggle(ALL_PERM)} />
            <span><b>{ALL_PERM_LABEL}</b></span>
          </label>

          {PERM_GROUPS.map((g) => (
            <div key={g.id} className={styles.permGroup}>
              <h4>{g.title}</h4>
              {g.perms.map(([key, label]) => {
                const on = hasAll || edit.perms.includes(key);
                const locked = hasAll || (!canTick(key) && !edit.perms.includes(key));
                return (
                  <label key={key} className={styles.toggle}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(key)} />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          ))}
          <div className={styles.label}>สิทธิ์ที่คุณไม่มีเอง จะติ๊กให้บทบาทอื่นไม่ได้</div>

          <div className={styles.btnRow}>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            <button type="button" disabled={busy} onClick={() => { setEdit(null); setErr(''); }}>ยกเลิก</button>
          </div>
        </form>
      )}
    </section>
  );
}
