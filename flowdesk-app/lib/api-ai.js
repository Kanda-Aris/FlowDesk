// FlowDesk — ฝั่งหน้าเว็บของผู้ช่วย AI (เจ้าของไฟล์: A)
// หลายเซสชันต่อ workspace: ส่วนตัว (เห็นเฉพาะเจ้าของ) หรือสาธารณะ (ทุกคนใน workspace เห็น) เขียนผ่านเส้นทาง /api/ai และฟังก์ชันฐานข้อมูลเท่านั้น
import { sb } from './api';

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ---------- เซสชันแชท ----------
// visibility: 'private' = เห็นเฉพาะเจ้าของ, 'shared' = ทุกคนใน workspace เห็นและถามได้
// รายการเซสชันของ workspace นี้ที่ฉันเห็น (ของฉัน + แชทสาธารณะ) ใหม่สุดก่อน; ถ้ายังไม่มีเลยจะสร้างแชทส่วนตัวแรกให้
export async function listSessions(workspaceId) {
  const q = () => sb.from('ai_conversations').select('id, title, visibility, user_id, updated_at')
    .eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(100).then(ok);
  let rows = await q();
  if (!rows.length) { await sb.rpc('ai_open_conversation', { p_workspace: workspaceId }).then(ok); rows = await q(); }
  return rows;
}
export const createSession = (workspaceId, visibility, title) =>
  sb.rpc('ai_create_conversation', { p_workspace: workspaceId, p_visibility: visibility, p_title: title || null }).then(ok);
export const renameSession = (conversationId, title) => sb.rpc('ai_rename_conversation', { p_conversation: conversationId, p_title: title }).then(ok);
export const deleteSession = (conversationId) => sb.rpc('ai_delete_conversation', { p_conversation: conversationId }).then(ok);
export const clearAssistant = (conversationId) => sb.rpc('ai_clear_conversation', { p_conversation: conversationId }).then(ok);

// ข้อความของเซสชัน (เก่าสุดก่อน) พร้อมชื่อผู้ถาม (author) ไว้แสดงในแชทสาธารณะ
export async function loadMessages(conversationId) {
  const rows = await sb.from('ai_messages').select('id, role, content, created_at, user_id')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(100).then(ok);
  rows.reverse();
  const ids = [...new Set(rows.filter((m) => m.role === 'user' && m.user_id).map((m) => m.user_id))];
  const names = {};
  if (ids.length) {
    const { data } = await sb.from('profiles').select('id, name, email').in('id', ids);
    for (const p of data || []) names[p.id] = p.name || (p.email || '').split('@')[0] || 'ผู้ใช้';
  }
  return rows.map((m) => ({ ...m, author: m.role === 'user' ? names[m.user_id] || 'ผู้ใช้' : null }));
}

// ฟังการเปลี่ยนแปลงแบบเรียลไทม์ (ข้อความใหม่ในเซสชันนี้ + รายการเซสชันของ workspace) คืนฟังก์ชันยกเลิก
export function subscribeAssistant(workspaceId, conversationId, { onMessages, onSessions }) {
  const ch = sb.channel(`ai-${workspaceId}-${conversationId || 'none'}-${Math.random().toString(36).slice(2, 8)}`);
  if (conversationId) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'ai_messages', filter: `conversation_id=eq.${conversationId}` }, () => onMessages && onMessages());
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'ai_conversations', filter: `workspace_id=eq.${workspaceId}` }, () => onSessions && onSessions());
  ch.subscribe();
  return () => { sb.removeChannel(ch); };
}

const MESSAGES = {
  not_configured: 'ผู้ช่วย AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ (ยังไม่มี GEMINI_API_KEY)',
  not_authenticated: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'คุณไม่มีสิทธิ์ทำสิ่งนี้ในแชทนี้',
  too_many: 'สร้างแชทครบ 30 แชทแล้ว ลบแชทเก่าที่ไม่ใช้ก่อน',
  invalid_params: 'คำถามว่างหรือยาวเกินไป (ไม่เกิน 1,000 ตัวอักษร)',
  daily_limit: 'วันนี้ถามครบจำนวนที่กำหนดแล้ว ลองใหม่พรุ่งนี้',
  quota: 'โควตา Gemini เต็มชั่วคราว รอสักครู่แล้วลองใหม่',
  timeout: 'ผู้ช่วยตอบช้าเกินไป ลองถามให้สั้นหรือเจาะจงขึ้น',
  upstream: 'ผู้ช่วยมีปัญหาชั่วคราว ลองใหม่อีกครั้ง',
};

// คืน { answer, saved } หรือโยน Error ที่มีข้อความไทย
export async function askAssistant(workspaceId, message, conversationId) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(MESSAGES.not_authenticated);
  let res;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId, message, conversationId: conversationId || undefined }),
    });
  } catch { throw new Error('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(MESSAGES[body?.error] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
  return body;
}

// ข้อความไทยของรหัสผิดพลาดจากฟังก์ชันฐานข้อมูล (error.message เป็นรหัสคงที่)
export const sessionErr = (e) => MESSAGES[String(e?.message || '').trim()] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
