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
export const signUp = (email, password, name) =>
  sb.auth.signUp({ email, password, options: { data: { name } } }).then(ok);
export const signIn = (email, password) =>
  sb.auth.signInWithPassword({ email, password }).then(ok);
export const signOut = () => sb.auth.signOut();
export const currentUser = async () => (await sb.auth.getUser()).data.user;

// ---------- workspaces / projects / members ----------
// Creating a workspace also makes you owner, adds #general and the AI conversation (DB trigger).
export const listWorkspaces = () => sb.from('workspaces').select('*').order('created_at').then(ok);
export const createWorkspace = (name, parentId = null) =>
  sb.from('workspaces').insert({ name, parent_id: parentId }).select().single().then(ok);
export const listProjects = (workspaceId) =>
  sb.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at').then(ok);
export const createProject = (workspaceId, name) =>
  sb.from('projects').insert({ workspace_id: workspaceId, name }).select().single().then(ok);
export const listMembers = (workspaceId) =>
  sb.from('workspace_members').select('role, profiles(id, name, email)').eq('workspace_id', workspaceId).then(ok);
export const addMember = (workspaceId, userId, role = 'member') =>
  sb.from('workspace_members').insert({ workspace_id: workspaceId, user_id: userId, role }).then(ok);

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
    .select('id, title, status, priority, start_date, end_date, projects(name, workspace_id)')
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
