// FlowDesk — ฝั่งหน้าเว็บของผู้ช่วย AI (เจ้าของไฟล์: A)
// ประวัติแชตเป็นของแต่ละคน (คนอื่นมองไม่เห็น) เขียนผ่านเส้นทาง /api/ai เท่านั้น
import { sb } from './api';

const ok = ({ data, error }) => { if (error) throw error; return data; };

// เปิด (หรือสร้าง) บทสนทนาส่วนตัวของฉันใน workspace นี้ แล้วคืนประวัติ (เก่าสุดก่อน) + id บทสนทนา
export async function loadAssistant(workspaceId) {
  const conversationId = await sb.rpc('ai_open_conversation', { p_workspace: workspaceId }).then(ok);
  const rows = await sb.from('ai_messages').select('id, role, content, created_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(100).then(ok);
  return { conversationId, messages: rows.reverse() };
}

export const clearAssistant = (conversationId) => sb.rpc('ai_clear_conversation', { p_conversation: conversationId }).then(ok);

const MESSAGES = {
  not_configured: 'ผู้ช่วย AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ (ยังไม่มี GEMINI_API_KEY)',
  not_authenticated: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'คุณไม่มีสิทธิ์ใช้ผู้ช่วยใน workspace นี้',
  invalid_params: 'คำถามว่างหรือยาวเกินไป (ไม่เกิน 1,000 ตัวอักษร)',
  daily_limit: 'วันนี้ถามครบจำนวนที่กำหนดแล้ว ลองใหม่พรุ่งนี้',
  quota: 'โควตา Gemini เต็มชั่วคราว รอสักครู่แล้วลองใหม่',
  timeout: 'ผู้ช่วยตอบช้าเกินไป ลองถามให้สั้นหรือเจาะจงขึ้น',
  upstream: 'ผู้ช่วยมีปัญหาชั่วคราว ลองใหม่อีกครั้ง',
};

// คืน { answer, saved } หรือโยน Error ที่มีข้อความไทย
export async function askAssistant(workspaceId, message) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(MESSAGES.not_authenticated);
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 58000); // เซิร์ฟเวอร์ตัดที่ ~52 วินาที
  try {
    res = await fetch('/api/ai', {
      signal: ctl.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId, message }),
    });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'ผู้ช่วยใช้เวลานานเกินไป ลองถามให้สั้นหรือเจาะจงขึ้น แล้วกดส่งใหม่' : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  } finally { clearTimeout(timer); }
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(MESSAGES[body?.error] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
  return body;
}
