// FlowDesk — helper สำหรับหน้ามุมมองงาน (Board / Calendar / Gantt / Dashboard) — เจ้าของไฟล์: AI C
// ไม่แก้ lib/api.js ถ้าต้องการ query เพิ่ม ให้เขียนไว้ในไฟล์นี้โดยใช้ sb จาก api.js
import { useEffect, useRef } from 'react';
import { sb, listMembers, listTasks, listProjects } from './api';

export { sb };

// ---------- ค่าคงที่ที่ใช้ร่วมกัน ----------
export const STATUS = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', complete: 'เสร็จแล้ว' };
export const STATUS_ORDER = ['todo', 'in_progress', 'complete'];
export const PRIO = { urgent: 'ด่วน', high: 'สูง', normal: 'ปกติ', low: 'ต่ำ' };

// ---------- วันที่ ----------
// วันนี้ตามเวลาเครื่องผู้ใช้ (รูปแบบ YYYY-MM-DD)
// หมายเหตุ: ไม่ใช้ toISOString() เพราะเป็นเวลา UTC ทำให้ในไทยช่วง 00:00-07:00 ได้วันที่เมื่อวาน
export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

// ---------- หน้าตา ----------
const COLORS = ['#E31C5F', '#3E8EF7', '#2FB675', '#E0A040', '#8A63D2', '#17A2B8'];
export const colorOf = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initial = (s = '?') => (s.trim()[0] || '?').toUpperCase();

// ---------- ข้อความ error ภาษาไทย ----------
// ฐานข้อมูลเป็นคนตัดสินสิทธิ์ ที่นี่แค่แปลข้อความให้เข้าใจง่าย (ไม่พยายามหลบสิทธิ์)
export function friendlyError(e) {
  const msg = (e && e.message) || '';
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg))
    return 'คุณไม่มีสิทธิ์ทำรายการนี้ (ผู้ดูอ่านได้อย่างเดียว)';
  if (e?.code === 'PGRST116')
    return 'ไม่สามารถแก้ไขได้ อาจเพราะไม่มีสิทธิ์ หรืองานนี้ถูกลบไปแล้ว ลองกดรีเฟรช';
  if (/failed to fetch|networkerror/i.test(msg))
    return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return 'เกิดข้อผิดพลาด' + (msg ? ': ' + msg : '');
}

// ---------- โหลดข้อมูลโปรเจกต์ ----------
// คืน { members, tasks, project } ใช้ร่วมกันทุกมุมมอง
export async function loadProjectData(wsId, projectId) {
  const [members, tasks, projects] = await Promise.all([
    listMembers(wsId),
    listTasks(projectId),
    listProjects(wsId),
  ]);
  // ตัดสมาชิกที่อ่านโปรไฟล์ไม่ได้ออก กันหน้าพังเมื่อ profiles เป็น null
  return { members: members.filter((m) => m && m.profiles), tasks, project: projects.find((p) => p.id === projectId) || null };
}

// เลขวันจาก 'YYYY-MM-DD' (ใช้ UTC กันเขตเวลา/เวลาออมแสง) ใช้ลบกันเพื่อหาจำนวนวัน
export function dayNum(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// ---------- อัปเดตสดของงาน (Realtime) ----------
// ฟังการเปลี่ยนแปลงตาราง tasks ของโปรเจกต์ คืนฟังก์ชันยกเลิกการฟัง
// onEvent({ type: 'insert' | 'update' | 'delete', task })  เมื่อ delete จะมีแค่ task.id
// หมายเหตุ: ตัวกรอง project_id ใช้กับ DELETE ไม่ได้ จึงฟัง DELETE ทุกโปรเจกต์แล้วลบเฉพาะ id ที่มีอยู่ใน state
export function subscribeTasks(projectId, onEvent) {
  const filter = `project_id=eq.${projectId}`;
  // ใส่ชื่อสุ่มต่อท้ายกันชื่อช่องซ้ำ (เช่น React StrictMode ที่เมานต์สองครั้งตอน dev)
  const ch = sb.channel('tasks:' + projectId + ':' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter },
      (p) => onEvent({ type: 'insert', task: p.new }))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter },
      (p) => onEvent({ type: 'update', task: p.new }))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' },
      (p) => onEvent({ type: 'delete', task: { id: p.old && p.old.id } }))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ใส่เหตุการณ์ลงรายการงานโดยอิง id (การแก้ของเราเองที่อัปเดตหน้าจอไปแล้ว จะกลับมาทาง realtime อีกครั้ง
// ต้องไม่ซ้ำ) ถ้าข้อมูลในเครื่องใหม่กว่าเหตุการณ์ (updated_at) จะไม่ทับ
export function applyTaskEvent(list, ev) {
  const id = ev && ev.task && ev.task.id;
  if (!id) return list;
  if (ev.type === 'delete') return list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list;
  const old = list.find((x) => x.id === id);
  if (old) {
    if (old.updated_at && ev.task.updated_at && old.updated_at > ev.task.updated_at) return list;
    return list.map((x) => (x.id === id ? { ...x, ...ev.task } : x));
  }
  return [...list, ev.task].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// hook สำหรับหน้ามุมมอง: useLiveTasks(projectId, setTasks) ส่ง projectId เป็น null ถ้ายังไม่พร้อม
// onEvent (ไม่บังคับ) ถูกเรียกหลังอัปเดตรายการแล้ว
export function useLiveTasks(projectId, setTasks, onEvent) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    if (!projectId) return undefined;
    return subscribeTasks(projectId, (ev) => {
      setTasks((list) => applyTaskEvent(list, ev));
      if (cb.current) cb.current(ev);
    });
  }, [projectId, setTasks]);
}

// ---------- ประวัติกิจกรรมของ Workspace (activity_log) ----------
// เบราว์เซอร์อ่านได้อย่างเดียว แถวถูกเขียนโดย trigger ในฐานข้อมูล (งานของ A)
// before = created_at ของแถวสุดท้ายที่โหลดแล้ว ใช้ lte (ไม่ใช่ lt) แล้วให้ฝั่งหน้าจอตัดแถวซ้ำด้วย id
// เพราะ trigger ที่เขียนหลายแถวในคำสั่งเดียวจะได้ created_at เท่ากัน ถ้าใช้ lt อาจข้ามแถวที่ขอบหน้า
export async function listActivity(wsId, { before, limit = 50 } = {}) {
  let q = sb
    .from('activity_log')
    .select('id, workspace_id, actor_id, action, entity_type, entity_id, summary, created_at')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (before) q = q.lte('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
