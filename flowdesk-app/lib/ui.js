// ค่าและฟังก์ชันหน้าตาที่หน้าหลัก/เมนู (ของ A) ใช้ร่วมกัน
export const STATUS = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', complete: 'เสร็จแล้ว' };
export const PRIO = { urgent: 'ด่วน', high: 'สูง', normal: 'ปกติ', low: 'ต่ำ' };
const COLORS = ['#E31C5F', '#3E8EF7', '#2FB675', '#E0A040', '#8A63D2', '#17A2B8'];
export const colorOf = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initial = (s = '?') => (s.trim()[0] || '?').toUpperCase();
export const todayStr = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '');
// ข้อความผิดพลาดภาษาไทยสำหรับ error จากฐานข้อมูลที่พบบ่อย
export const errText = (e) => {
  const m = String((e && e.message) || '');
  if (m.includes('too_deep')) return 'ซ้อน Sub ได้ไม่เกิน 5 ชั้น';
  if (m.includes('invalid_parent')) return 'ตำแหน่งของ Workspace ไม่ถูกต้อง';
  if (/row-level security|42501|forbidden|permission denied/i.test(m)) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  return m || 'เกิดข้อผิดพลาด';
};
