// FlowDesk — ฟังก์ชันฐานข้อมูลของงานส่วน "ทำงานร่วมกัน" (AI B)
// ไฟล์นี้ import sb จาก lib/api.js ห้ามแก้ lib/api.js
import { sb, setMemberRole, removeMember as rpcRemoveMember } from './api';
import { roleErrText } from './roles-th';

const ok = ({ data, error }) => { if (error) throw error; return data; };
const rand = () => Math.random().toString(36).slice(2, 8); // กันชื่อ realtime channel ซ้ำ

// ---------- คอมเมนต์ ----------
// ลบคอมเมนต์ (ฐานข้อมูลอนุญาตเฉพาะเจ้าของคอมเมนต์ และ admin)
export const deleteComment = (id) =>
  sb.from('comments').delete().eq('id', id).then(ok);

// ฟังเมื่อมีคอมเมนต์ใหม่ของงานนี้ (realtime) คืนฟังก์ชันสำหรับเลิกฟัง
// หมายเหตุ: payload ไม่มีชื่อผู้เขียน ดังนั้นฝั่งหน้าจอควรโหลดรายการใหม่เมื่อได้รับ event
export function subscribeComments(taskId, onInsert) {
  const ch = sb.channel('comments:' + taskId + ':' + rand())
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `task_id=eq.${taskId}` },
      (p) => onInsert(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ---------- งาน → project / workspace (ใช้หาปลายทางของลิงก์และรายชื่อสมาชิก) ----------
export const taskProject = async (taskId) =>
  (await sb.from('tasks').select('project_id').eq('id', taskId).single().then(ok)).project_id;

export const taskWorkspace = async (taskId) => {
  const pid = await taskProject(taskId);
  return (await sb.from('projects').select('workspace_id').eq('id', pid).single().then(ok)).workspace_id;
};

// ---------- แชท ----------
// สร้างช่องแชทใหม่ (สมาชิกระดับ member ขึ้นไปทำได้ ชื่อห้ามซ้ำใน workspace เดียวกัน)
export const createChannel = (workspaceId, name) =>
  sb.from('channels').insert({ workspace_id: workspaceId, name }).select().single().then(ok);

// ---------- ตั้งค่า Workspace ----------
// เปลี่ยนชื่อ workspace ถ้าสิทธิ์ไม่พอ ฐานข้อมูล (RLS) จะไม่แก้อะไรและคืนแถวว่าง จึงโยน error สิทธิ์เอง
export const renameWorkspace = async (id, name) => {
  const rows = await sb.from('workspaces').update({ name }).eq('id', id).select().then(ok);
  if (!rows || rows.length === 0) {
    const e = new Error('permission denied');
    e.code = '42501';
    throw e;
  }
  return rows[0];
};

// ---------- การแจ้งเตือน ----------
// หมายเหตุ: เบราว์เซอร์สร้างการแจ้งเตือนไม่ได้ (trigger ในฐานข้อมูลสร้างให้) จึงไม่มีฟังก์ชัน create
// kind = mention_comment | mention_message | assigned | due_soon | due_today
// (due_* มาจากงานประจำวันของระบบ: actor_id เป็น null, มี task_id และ due_on)

// การแจ้งเตือนของฉัน ใหม่สุดก่อน
export const listNotifications = (limit = 50) =>
  sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit).then(ok);

// จำนวนที่ยังไม่อ่าน
export const countUnread = async () => {
  const { count, error } = await sb.from('notifications')
    .select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count || 0;
};

// ทำเครื่องหมายว่าอ่านแล้ว (แก้ได้เฉพาะคอลัมน์ read_at)
export const markRead = (id) =>
  sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).then(ok);

export const markAllRead = () =>
  sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).then(ok);

export const deleteNotification = (id) =>
  sb.from('notifications').delete().eq('id', id).then(ok);

// ฟังการแจ้งเตือนใหม่ของฉัน (realtime) คืนฟังก์ชันสำหรับเลิกฟัง
export function subscribeNotifications(userId, onInsert) {
  const ch = sb.channel('notifications:' + userId + ':' + rand())
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (p) => onInsert(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ดึงข้อความของการแจ้งเตือนเป็นชุดเดียว (ตารางไม่มีคอลัมน์ snippet)
// คืน { comments: {id: body}, messages: {id: body}, tasks: {id: title} }
export async function notificationTexts(rows) {
  const ids = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  const pull = async (table, col, list) => {
    const out = {};
    if (!list.length) return out;
    const data = await sb.from(table).select(`id, ${col}`).in('id', list).then(ok);
    (data || []).forEach((x) => { out[x.id] = x[col]; });
    return out;
  };
  const [comments, messages, tasks] = await Promise.all([
    pull('comments', 'body', ids('comment_id')),
    pull('messages', 'body', ids('message_id')),
    pull('tasks', 'title', ids('task_id')),
  ]);
  return { comments, messages, tasks };
}

// ---------- สมาชิก / ลิงก์เชิญ / โปรไฟล์ (รอบ 2) ----------
// RLS ที่ปฏิเสธการ update/delete จะไม่ error แต่คืนแถวว่าง จึงตรวจเองแล้วโยน error สิทธิ์
const needRows = (rows) => {
  if (!rows || rows.length === 0) {
    const e = new Error('permission denied');
    e.code = '42501';
    throw e;
  }
  return rows;
};

// เปลี่ยนบทบาทสมาชิก: ทำให้ roleId เป็นบทบาทเดียวของคนนั้น (ฐานข้อมูลบังคับลำดับขั้น: ต้องต่ำกว่าบทบาทตัวเอง)
// ถ้าให้หลายบทบาท ใช้ assignMemberRole / removeMemberRole ใน lib/api.js
export const changeMemberRole = (wsId, userId, roleId) => setMemberRole(wsId, userId, roleId);

// ลบสมาชิก หรือออกจาก workspace เอง (userId ของตัวเอง) ผ่านฟังก์ชัน remove_member
export const removeMember = (wsId, userId) => rpcRemoveMember(wsId, userId);

// ลิงก์เชิญ: A ยืนยันแล้วว่า "invites are live" จึงเปิดใช้งาน (ตั้งเป็น false เพื่อปิดทั้งส่วนได้)
export const INVITES_LIVE = true;

export const listInvites = (wsId) =>
  sb.from('workspace_invites').select('*').eq('workspace_id', wsId)
    .order('created_at', { ascending: false }).then(ok);

export const createInvite = async ({ workspaceId, roleId, days, maxUses }) => {
  const r = await sb.rpc('create_invite', {
    p_workspace: workspaceId, p_role: 'member', p_days: days, p_max_uses: maxUses, p_role_id: roleId,
  }).then(ok);
  return Array.isArray(r) ? r[0] : r; // คืนแถวคำเชิญที่สร้างใหม่
};

export const revokeInvite = (inviteId) =>
  sb.rpc('revoke_invite', { p_invite: inviteId }).then(ok);

export const inviteLink = (token) =>
  `${window.location.origin}/join?token=${encodeURIComponent(token)}`;

// คำเชิญที่ยังใช้ได้: ยังไม่ถูกยกเลิก ยังไม่หมดอายุ และยังใช้ไม่ครบจำนวน
export const isInviteActive = (inv, now = Date.now()) =>
  !inv.revoked_at && new Date(inv.expires_at).getTime() > now && inv.uses < inv.max_uses;

// โปรไฟล์ของฉัน (ส่งได้เฉพาะ name กับ notify_enabled ตามที่ A จำกัดสิทธิ์ไว้)
export const getMyProfile = (userId) =>
  sb.from('profiles').select('id, name, email, notify_enabled').eq('id', userId).single().then(ok);

export const updateMyProfile = async (userId, { name, notify_enabled }) =>
  (await sb.from('profiles').update({ name, notify_enabled }).eq('id', userId).select().then(ok).then(needRows))[0];

// ---------- แปลงข้อผิดพลาดเป็นข้อความไทยที่เข้าใจง่าย ----------
// ใช้ตารางกลางใน lib/roles-th.js (รหัส error ของระบบบทบาททุกตัว)
export function friendlyError(e) {
  return roleErrText(e);
}
