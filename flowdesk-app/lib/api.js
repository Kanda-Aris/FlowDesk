// FlowDesk data layer (Supabase). Use in the browser with the public anon key.
// RLS in the database enforces permissions, so these calls only return what the signed-in user may see.
// npm i @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ---------- auth ----------
export const signUp = (email, password, name, redirectTo) =>
  sb.auth.signUp({ email, password, options: { data: { name }, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) } }).then(ok);
export const signIn = (email, password) =>
  sb.auth.signInWithPassword({ email, password }).then(ok);
export const signOut = () => sb.auth.signOut();
export const currentUser = async () => (await sb.auth.getUser()).data.user;

// ---------- workspaces / projects / members ----------
// Creating a workspace also makes you owner and adds #general (DB trigger). AI conversations are private per user (see lib/api-ai.js).
export const listWorkspaces = () => sb.from('workspaces').select('*').order('created_at').then(ok);
export const createWorkspace = (name, parentId = null) =>
  sb.from('workspaces').insert({ name, parent_id: parentId }).select().single().then(ok);
// ---- Head/Sub ----
// parent_id อยู่ใน listWorkspaces อยู่แล้ว (ใช้ lib/workspace-tree.js สร้างต้นไม้)
// admin ขึ้นไปของ workspace แม่เท่านั้นที่สร้าง Sub ได้ (ฐานข้อมูลบังคับ); ซ้อนได้ไม่เกิน 5 ชั้น (error: too_deep)
// admin ขึ้นไปของ Head เข้าถึง Sub ทุกชั้นโดยอัตโนมัติ ส่วนสมาชิกทั่วไปต้องอยู่ใน Sub นั้นเอง
export const createSubWorkspace = (name, parentId) => createWorkspace(name, parentId);
// ---------- สิทธิ์และบทบาท (FR-33) ----------
// ฐานข้อมูลตัดสินสิทธิ์จริงจากติ๊ก (perms) ไม่ใช่ชื่อบทบาท หน้าจอห้ามเทียบชื่อบทบาท ให้ใช้ hasPerm เสมอ
// -> { workspace_id, is_member, role_id, role_name, rank, perms[], is_owner, roles[{ id, name, color, key, workspace_id, rank }] }
// perms ขยายแล้ว (เจ้าของได้ครบทุกข้อ + 'all') ใช้ได้ทั้งสิทธิ์ที่ได้จาก Head ที่ "ใช้ใน Sub"
export const myPermissions = (workspaceId) => sb.rpc('my_permissions', { p_workspace: workspaceId }).then(ok);
export const hasPerm = (p, key) => !!p && Array.isArray(p.perms) && (p.perms.includes('all') || p.perms.includes(key));
export const hasAnyPerm = (p, keys) => keys.some((k) => hasPerm(p, k));
// ผู้ใช้แก้งานอะไรได้บ้างหรือไม่ (ใช้เปิด/ปิดหน้าจอแบบอ่านอย่างเดียว; ปุ่มเป็นแค่ความสะดวก ฐานข้อมูลตรวจซ้ำ)
export const canEditAnyTask = (p) => hasAnyPerm(p, ['task.create', 'task.edit_content', 'task.change_status', 'task.set_dates_priority', 'task.assign', 'task.delete']);

// -> { my_rank, can_manage_roles, can_change_member_roles, roles[{ id, key, name, color, position, rank, permissions, applies_in_subs, is_default, member_count, can_edit, can_assign }], inherited[{ id, key, name, color, rank }] }
export const listRoles = (workspaceId) => sb.rpc('list_roles', { p_workspace: workspaceId }).then(ok);
export const createRole = (workspaceId, { name, color = '#6b7280', permissions = [], appliesInSubs = false, position = null }) =>
  sb.rpc('create_role', { p_workspace: workspaceId, p_name: name, p_color: color, p_permissions: permissions, p_applies_in_subs: appliesInSubs, p_position: position }).then(ok);
// ส่งเฉพาะฟิลด์ที่จะแก้ (ที่เหลือคงเดิม)
export const updateRole = (roleId, { name, color, permissions, appliesInSubs } = {}) =>
  sb.rpc('update_role', {
    p_role: roleId,
    ...(name !== undefined ? { p_name: name } : {}),
    ...(color !== undefined ? { p_color: color } : {}),
    ...(permissions !== undefined ? { p_permissions: permissions } : {}),
    ...(appliesInSubs !== undefined ? { p_applies_in_subs: appliesInSubs } : {}),
  }).then(ok);
export const deleteRole = (roleId) => sb.rpc('delete_role', { p_role: roleId }).then(ok);
// roleIds = id บทบาท "ทั้งหมดที่ไม่ใช่เจ้าของ" เรียงจากสูงไปต่ำ
export const reorderRoles = (workspaceId, roleIds) => sb.rpc('reorder_roles', { p_workspace: workspaceId, p_role_ids: roleIds }).then(ok);

// อ่านได้เฉพาะสมาชิก ห้ามเขียนตรง ให้ใช้ฟังก์ชันด้านล่าง
export const listWorkspaceRoles = (workspaceId) => sb.from('workspace_roles').select('*').eq('workspace_id', workspaceId).then(ok);
// -> [{ user_id, workspace_id, role_id }] ของสมาชิกทุกคนใน workspace (สมาชิกหนึ่งคนมีได้หลายบทบาท)
export const listMemberRoles = (workspaceId) =>
  sb.from('member_roles').select('user_id, workspace_id, role_id').eq('workspace_id', workspaceId).then(ok);

export const assignMemberRole = (workspaceId, userId, roleId) =>
  sb.rpc('assign_member_role', { p_workspace: workspaceId, p_user: userId, p_role: roleId }).then(ok);
export const removeMemberRole = (workspaceId, userId, roleId) =>
  sb.rpc('remove_member_role', { p_workspace: workspaceId, p_user: userId, p_role: roleId }).then(ok);
// ทำให้บทบาทนี้เป็นบทบาทเดียวของสมาชิก
export const setMemberRole = (workspaceId, userId, roleId) =>
  sb.rpc('set_member_role', { p_workspace: workspaceId, p_user: userId, p_role: roleId }).then(ok);
// ออกจาก workspace เอง: removeMember(ws, userId ของตัวเอง)
export const removeMember = (workspaceId, userId) =>
  sb.rpc('remove_member', { p_workspace: workspaceId, p_user: userId }).then(ok);
// งานทุกโปรเจกต์ใน workspace ที่ระบุ (ฐานข้อมูลคืนเฉพาะที่ผู้ใช้มีสิทธิ์เห็น)
export const listTasksInWorkspaces = (workspaceIds) =>
  sb.from('tasks')
    .select('id, title, status, priority, assignee_id, start_date, end_date, project_id, projects!inner(id, name, workspace_id)')
    .in('projects.workspace_id', workspaceIds)
    .order('end_date', { ascending: true, nullsFirst: false }).limit(1000).then(ok);
export const listProjects = (workspaceId) =>
  sb.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at').then(ok);
export const createProject = (workspaceId, name) =>
  sb.from('projects').insert({ workspace_id: workspaceId, name }).select().single().then(ok);
export const listMembers = (workspaceId) =>
  sb.from('workspace_members').select('role, profiles(id, name, email)').eq('workspace_id', workspaceId).then(ok);
export const addMember = (workspaceId, userId, roleId) =>
  sb.rpc('add_member', { p_workspace: workspaceId, p_user: userId, p_role: roleId }).then(ok);

// ---------- invite links ----------
// Database functions check permissions themselves (owner/admin create + revoke; any signed-in user can preview/accept).
// Errors: not_authenticated | forbidden | invalid_params | rank_too_low | cannot_grant | invite_not_found | invite_revoked | invite_expired | invite_used_up
export const createInvite = (workspaceId, roleId = null, days = 7, maxUses = 10) =>
  sb.rpc('create_invite', { p_workspace: workspaceId, p_role: 'member', p_days: days, p_max_uses: maxUses, p_role_id: roleId }).then(ok);
export const revokeInvite = (inviteId) => sb.rpc('revoke_invite', { p_invite: inviteId }).then(ok);
// -> { status: 'ok'|'not_found'|'revoked'|'expired'|'used_up', workspace_name?, role? (legacy), role_id?, role_name?, already_member? }
export const previewInvite = (token) => sb.rpc('preview_invite', { p_token: token }).then(ok);
// -> { workspace_id, role (legacy), role_id, role_name }
export const acceptInvite = (token) => sb.rpc('accept_invite', { p_token: token }).then(ok);

// ---------- tasks ----------
// fields: { title, description, status: 'todo'|'in_progress'|'complete',
//           priority: 'urgent'|'high'|'normal'|'low', assignee_id, start_date, end_date }
export const listTasks = (projectId) =>
  sb.from('tasks').select('*').eq('project_id', projectId).order('created_at').then(ok);
export const createTask = (projectId, fields) =>
  sb.from('tasks').insert({ project_id: projectId, ...fields }).select().single().then(ok);
export const updateTask = (id, patch) =>
  sb.from('tasks').update(patch).eq('id', id).select().single().then(ok);
export const deleteTask = (id) => sb.from('tasks').delete().eq('id', id).then(ok);

// Tasks assigned to a user that are not complete. This is what the AI tool get_my_tasks should call
// (run it with the signed-in user's session so RLS applies).
export const myTasks = (userId) =>
  sb.from('tasks')
    .select('id, title, status, priority, start_date, end_date, project_id, projects(name, workspace_id)')
    .eq('assignee_id', userId).neq('status', 'complete')
    .order('end_date', { ascending: true, nullsFirst: false }).then(ok);

// ---------- comments ----------
export const listComments = (taskId) =>
  sb.from('comments').select('*, profiles(name)').eq('task_id', taskId).order('created_at').then(ok);
export const addComment = (taskId, body) =>
  sb.from('comments').insert({ task_id: taskId, body }).select().single().then(ok);

// ---------- chat (realtime) ----------
export const listChannels = (workspaceId) =>
  sb.from('channels').select('*').eq('workspace_id', workspaceId).order('created_at').then(ok);
export const listMessages = (channelId, limit = 100) =>
  sb.from('messages').select('*, profiles(name)').eq('channel_id', channelId)
    .order('created_at', { ascending: false }).limit(limit).then(ok);
export const sendMessage = (channelId, body) =>
  sb.from('messages').insert({ channel_id: channelId, body }).select().single().then(ok);
// returns an unsubscribe function
export function subscribeMessages(channelId, onInsert) {
  const ch = sb.channel('messages:' + channelId)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (p) => onInsert(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}
