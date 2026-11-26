'use client';
// โปรไฟล์ของฉัน: ชื่อที่แสดง + เปิด/ปิดการแจ้งเตือน (อีเมลอ่านอย่างเดียว) (AI B)
// props: { me }  — me คือผู้ใช้จาก currentUser()
// ส่งไปฐานข้อมูลเฉพาะ name และ notify_enabled เท่านั้น
import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile, friendlyError } from '../../lib/api-collab';
import styles from './Sections.module.css';

export default function ProfileSection({ me }) {
  const [saved, setSaved] = useState(null); // ค่าล่าสุดในฐานข้อมูล
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    getMyProfile(me.id)
      .then((p) => { if (!cancelled) { setSaved(p); setName(p.name || ''); setNotify(p.notify_enabled !== false); } })
      .catch((e) => { if (!cancelled) setErr(friendlyError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [me?.id]);

  const trimmed = name.trim();
  const dirty = saved && (trimmed !== (saved.name || '') || notify !== (saved.notify_enabled !== false));

  const save = async (e) => {
    e.preventDefault();
    if (!trimmed) { setErr('กรุณากรอกชื่อที่แสดง'); return; }
    if (trimmed.length > 60) { setErr('ชื่อต้องไม่เกิน 60 ตัวอักษร'); return; }
    setSaving(true); setOk(false);
    try {
      const p = await updateMyProfile(me.id, { name: trimmed, notify_enabled: notify });
      setSaved((s) => ({ ...s, ...p }));
      setName(p.name || trimmed);
      setErr(''); setOk(true);
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.card} aria-label="โปรไฟล์ของฉัน">
      <h2 className={styles.h2}>โปรไฟล์ของฉัน</h2>
      {err && <div className="err" role="alert">{err}</div>}

      {loading ? (
        <div className={styles.note}>กำลังโหลด…</div>
      ) : !saved ? null : (
        <form onSubmit={save} className={styles.plain}>
          <label className={styles.field}>
            <span className={styles.label}>ชื่อที่แสดง</span>
            <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setOk(false); }} />
          </label>
          <div className={styles.field}>
            <span className={styles.label}>อีเมล (แก้ไขไม่ได้)</span>
            <div className={styles.readonly}>{saved.email || me?.email || '-'}</div>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={notify} onChange={(e) => { setNotify(e.target.checked); setOk(false); }} />
            <span>รับการแจ้งเตือน</span>
          </label>
          <button type="submit" className="primary" disabled={saving || !dirty || !trimmed}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          {ok && <div className={styles.ok}>บันทึกแล้ว ✓</div>}
        </form>
      )}
    </section>
  );
}
