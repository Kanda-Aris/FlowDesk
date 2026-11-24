# FlowDesk (Next.js + Supabase)

## วิธีรัน
1. ติดตั้ง Node.js 18 ขึ้นไป
2. เปิดเทอร์มินัลในโฟลเดอร์นี้ แล้วพิมพ์:
   npm install
   npm run dev
3. เปิด http://localhost:3000

ไฟล์ .env.local มีค่า URL และ anon key ของโปรเจกต์ Supabase ใส่ไว้แล้ว (anon key เป็นค่าสาธารณะ)
ห้ามเอา service_role key มาใส่ในโปรเจกต์ฝั่งหน้าเว็บ

## โครงสร้าง
- lib/api.js        ฟังก์ชันเรียกฐานข้อมูลทั้งหมด (งาน แชท Workspace ฯลฯ)
- app/login         หน้าเข้าสู่ระบบและสมัครสมาชิก
- app/app           หน้าหลัก: Workspace, โปรเจกต์, งาน, งานของฉัน
- app/globals.css   สีและสไตล์ (ธีมมืด สีหลัก #E31C5F)

## ขั้นต่อไป
แชท Realtime (subscribeMessages ใน lib/api.js), คอมเมนต์, Board/Gantt/Calendar, แชทบอท AI ผ่าน API route
