'use client';
// หน้าตั้งค่า — เปิดด้วย /app/settings?ws=<workspace_id>
// ส่วนต่างๆ: ชื่อ Workspace, สมาชิก, บทบาทและสิทธิ์, ลิงก์เชิญ, โปรไฟล์ของฉัน (ทุกส่วนตัดสินจากติ๊กสิทธิ์ ไม่ใช่ชื่อบทบาท)
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { currentUser, listWorkspaces, listMembers, myPermissions, listRoles, listMemberRoles, hasPerm } from '../../../lib/api';
import { renameWorkspace, friendlyError } from '../../../lib/api-collab';
import { DialogProvider } from '../../../components/ui/Dialogs';
import MembersSection from '../../../components/collab/MembersSection';
import InvitesSection from '../../../components/collab/InvitesSection';
import RolesSection from '../../../components/collab/RolesSection';
import ProfileSection from '../../../components/collab/ProfileSection';
import styles from './settings.module.css';

function SettingsInner() {
  const router = useRouter();
  const wsId = useSearchParams().get('ws');

  const [me, setMe] = useState(null);
  const [ws, setWs] = useState(null);
  const [members, setMembers] = useState([]);
  const [perms, setPerms] = useState(null);       // my_permissions (รวมสิทธิ์จาก Head ที่ "ใช้ใน Sub")
  const [roleInfo, setRoleInfo] = useState(null);  // list_roles
  const [memberRoles, setMemberRoles] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await currentUser();
        if (!u) { router.replace('/login'); return; }
        if (cancelled) return;
        setMe(u);
        if (wsId) {
          const [all, mem, pm, ri, mr] = await Promise.all([
            listWorkspaces(), listMembers(wsId),
            myPermissions(wsId).catch(() => ({ perms: [] })),
            listRoles(wsId).catch(() => null),
            listMemberRoles(wsId).catch(() => []),
          ]);
          if (cancelled) return;
          const w = all.find((x) => x.id === wsId) || null;
          setWs(w); setName(w?.name || ''); setMembers(mem); setPerms(pm); setRoleInfo(ri); setMemberRoles(mr);
        }
      } catch (e) {
        if (!cancelled) setErr(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wsId, router]);

  // โหลดสมาชิก บทบาท และสิทธิ์ใหม่ (ให้ส่วนย่อยเรียกหลังแก้ไข; สิทธิ์ของฉันอาจเปลี่ยนด้วย)
  const reload = useCallback(async () => {
    const [mem, pm, ri, mr] = await Promise.all([
      listMembers(wsId), myPermissions(wsId), listRoles(wsId), listMemberRoles(wsId),
    ]);
    setMembers(mem); setPerms(pm); setRoleInfo(ri); setMemberRoles(mr);
  }, [wsId]);

  // ปุ่มเป็นแค่ความสะดวก สิทธิ์จริงอยู่ที่ฐานข้อมูล
  const canEdit = hasPerm(perms, 'workspace.edit');

  const save = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || n === ws.name || saving) return;
    setSaving(true); setSaved(false);
    try {
      const w = await renameWorkspace(wsId, n);
      setWs(w); setName(w.name); setErr(''); setSaved(true);
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.pad}>กำลังโหลด…</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>ตั้งค่า</h1>
      {err && <div className="err" role="alert">{err}</div>}

      {!wsId ? (
        <div className={styles.pad}>กรุณาเลือก Workspace ก่อน (เปิดจากเมนูด้านข้าง) ส่วนโปรไฟล์ของคุณแก้ได้ด้านล่าง</div>
      ) : !ws ? (
        <div className={styles.pad}>ไม่พบ Workspace นี้ หรือคุณไม่มีสิทธิ์เข้าถึง</div>
      ) : (
        <>
          <section className={styles.card}>
            <h2 className={styles.h2}>ชื่อ Workspace</h2>
            {canEdit ? (
              <form className={styles.form} onSubmit={save}>
                <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setSaved(false); }} aria-label="ชื่อ Workspace" />
                <button type="submit" className="primary" disabled={saving || !name.trim() || name.trim() === ws.name}>
                  {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </form>
            ) : (
              <>
                <div className={styles.readonly}>{ws.name}</div>
                <div className={styles.label}>เฉพาะผู้ที่มีสิทธิ์เปลี่ยนชื่อ Workspace เท่านั้นที่เปลี่ยนชื่อได้</div>
              </>
            )}
            {saved && <div className={styles.ok}>บันทึกแล้ว ✓</div>}
          </section>

          <MembersSection wsId={wsId} me={me} members={members} memberRoles={memberRoles} roleInfo={roleInfo} perms={perms} onChanged={reload} />
          <RolesSection wsId={wsId} perms={perms} roleInfo={roleInfo} onChanged={reload} />
          <InvitesSection wsId={wsId} perms={perms} roleInfo={roleInfo} />
        </>
      )}

      <ProfileSection me={me} />
    </div>
  );
}

// useSearchParams ต้องอยู่ใน Suspense ไม่เช่นนั้น next build จะ error
export default function SettingsPage() {
  return (
    <DialogProvider>
      <Suspense fallback={<div className={styles.pad}>กำลังโหลด…</div>}>
        <SettingsInner />
      </Suspense>
    </DialogProvider>
  );
}
