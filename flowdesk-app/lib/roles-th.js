// ข้อความไทยของระบบบทบาท (FR-33) เขียนที่เดียว ใช้ทุกหน้า
// สิทธิ์จริงฐานข้อมูลเป็นผู้ตัดสิน ที่นี่ใช้แค่ชื่อที่แสดงและจัดหมวด

// หมวดสิทธิ์ 27 ข้อ (ลำดับที่แสดงในหน้าตั้งค่าบทบาท)
export const PERM_GROUPS = [
  { id: 'workspace', title: 'Workspace', perms: [
    ['workspace.edit', 'เปลี่ยนชื่อ Workspace'],
    ['workspace.view_activity', 'ดูหน้ากิจกรรม'],
    ['workspace.use_ai', 'ใช้ผู้ช่วย AI'],
    ['workspace.create_sub', 'สร้าง Sub Workspace'],
    ['workspace.delete_sub', 'ลบ Sub Workspace'],
  ] },
  { id: 'project', title: 'โปรเจกต์', perms: [
    ['project.create', 'สร้างโปรเจกต์'],
    ['project.edit', 'เปลี่ยนชื่อโปรเจกต์'],
    ['project.delete', 'ลบโปรเจกต์'],
    ['project.manage_lists', 'จัดการลิสต์งาน'],
  ] },
  { id: 'task', title: 'งาน', perms: [
    ['task.create', 'สร้างงาน'],
    ['task.edit_content', 'แก้ชื่อและรายละเอียดงาน'],
    ['task.change_status', 'เปลี่ยนสถานะงาน'],
    ['task.set_dates_priority', 'ตั้งวันที่และความสำคัญ'],
    ['task.assign', 'มอบหมายงานให้คน'],
    ['task.delete', 'ลบงาน'],
    ['task.manage_others', 'จัดการงานของคนอื่น (ถ้าไม่ติ๊ก จัดการได้เฉพาะงานที่ตัวเองสร้างหรือได้รับมอบหมาย)'],
  ] },
  { id: 'chat', title: 'คอมเมนต์และแชท', perms: [
    ['comment.write', 'เขียนคอมเมนต์'],
    ['comment.delete_others', 'ลบคอมเมนต์ของคนอื่น'],
    ['chat.send', 'ส่งข้อความแชท'],
    ['chat.create_channel', 'สร้างช่องแชท'],
    ['chat.edit_channel', 'เปลี่ยนชื่อช่องแชท'],
    ['chat.delete_channel', 'ลบช่องแชท'],
    ['chat.delete_others', 'ลบข้อความของคนอื่น'],
  ] },
  { id: 'member', title: 'สมาชิกและบทบาท', perms: [
    ['member.invite', 'เชิญสมาชิก'],
    ['member.remove', 'ลบสมาชิก'],
    ['member.change_roles', 'เปลี่ยนบทบาทสมาชิก (เฉพาะบทบาทที่ต่ำกว่าตัวเอง)'],
    ['role.manage', 'จัดการบทบาท (สร้าง แก้ ลบ จัดลำดับ)'],
  ] },
];

export const ALL_PERM = 'all';
export const ALL_PERM_LABEL = 'ทำได้ทุกอย่างใน Workspace นี้';
export const PERM_LABEL = Object.fromEntries(PERM_GROUPS.flatMap((g) => g.perms));
export const PERM_KEYS = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p[0]));

// ชื่อบทบาทมาตรฐาน (ใช้เมื่อยังไม่มีชื่อจากฐานข้อมูล)
export const DEFAULT_ROLE_TH = { owner: 'เจ้าของ', admin: 'ผู้ดูแล', member: 'สมาชิก', viewer: 'ผู้ชม' };

// รหัส error จากฟังก์ชันในฐานข้อมูล -> ข้อความไทย
export const ERR_TH = {
  not_authenticated: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'คุณไม่มีสิทธิ์ทำรายการนี้',
  invalid_params: 'ข้อมูลไม่ถูกต้อง ตรวจสอบแล้วลองใหม่อีกครั้ง',
  rank_too_low: 'ทำไม่ได้ เพราะบทบาทของอีกฝ่ายสูงกว่าหรือเท่ากับของคุณ',
  cannot_grant: 'คุณให้สิทธิ์ที่ตัวเองไม่มีไม่ได้',
  protected_role: 'บทบาทมาตรฐานนี้ถูกป้องกันไว้ แก้หรือลบไม่ได้',
  role_in_use: 'ลบไม่ได้ เพราะยังมีสมาชิกใช้บทบาทนี้อยู่ ย้ายสมาชิกไปบทบาทอื่นก่อน',
  role_required: 'สมาชิกต้องมีอย่างน้อย 1 บทบาท',
  role_limit: 'สร้างบทบาทได้ไม่เกิน 30 บทบาทต่อ Workspace',
  name_taken: 'ชื่อบทบาทนี้ถูกใช้แล้ว ลองตั้งชื่ออื่น',
  role_not_found: 'ไม่พบบทบาทนี้ (อาจถูกลบไปแล้ว)',
  member_not_found: 'ไม่พบสมาชิกคนนี้ใน Workspace',
  already_member: 'คนนี้เป็นสมาชิกอยู่แล้ว',
  last_owner: 'ต้องมีเจ้าของอย่างน้อย 1 คน',
  invite_not_found: 'ไม่พบลิงก์เชิญนี้ (อาจถูกยกเลิกหรือถูกลบไปแล้ว)',
  invite_revoked: 'ลิงก์เชิญนี้ถูกยกเลิกแล้ว',
  invite_expired: 'ลิงก์เชิญนี้หมดอายุแล้ว',
  invite_used_up: 'ลิงก์เชิญนี้ถูกใช้ครบจำนวนครั้งแล้ว',
  too_deep: 'ซ้อน Sub ได้ไม่เกิน 5 ชั้น',
  invalid_parent: 'ตำแหน่งของ Workspace ไม่ถูกต้อง',
};

// แปลง error ใดๆ เป็นข้อความไทย (ลองหารหัสในข้อความก่อน)
export function roleErrText(e) {
  const m = String((e && e.message) || '');
  for (const code of Object.keys(ERR_TH)) if (m.includes(code)) return ERR_TH[code];
  if ((e && e.code === '42501') || /row-level security|permission denied/i.test(m)) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (e && e.code === '23505') return 'ชื่อนี้ถูกใช้แล้ว ลองตั้งชื่ออื่น';
  if (/JWT/i.test(m)) return ERR_TH.not_authenticated;
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง';
  return 'เกิดข้อผิดพลาด: ' + (m || 'ไม่ทราบสาเหตุ');
}
