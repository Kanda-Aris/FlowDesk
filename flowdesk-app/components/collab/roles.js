// ค่าคงที่เรื่องอวตารและป้ายบทบาท ใช้ร่วมกันในหน้าตั้งค่า
// FR-33: ไม่มีการเทียบชื่อบทบาทอีกแล้ว ชื่อ/สี/ลำดับมาจากฐานข้อมูล (list_roles / my_permissions)
import { DEFAULT_ROLE_TH } from '../../lib/roles-th';

const COLORS = ['#E31C5F', '#3E8EF7', '#2FB675', '#E0A040', '#8A63D2', '#17A2B8'];
export const colorOf = (s = '?') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initial = (s = '?') => (s.trim()[0] || '?').toUpperCase();

// ชื่อบทบาทมาตรฐานตาม key (owner/admin/member/viewer) ใช้เป็นตัวสำรองเท่านั้น
export const ROLE = DEFAULT_ROLE_TH;

// สีที่ให้เลือกตอนสร้างบทบาท (เลือกจากปุ่มสี ไม่ต้องพิมพ์รหัส)
export const ROLE_COLORS = ['#6b7280', '#E31C5F', '#3E8EF7', '#2FB675', '#E0A040', '#8A63D2', '#17A2B8', '#FF6B8A'];
// สีที่ปลอดภัยสำหรับใส่ใน style (กันค่าแปลกจากฐานข้อมูล)
export const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#6b7280');
