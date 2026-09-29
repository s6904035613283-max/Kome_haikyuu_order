# Kome_haikyuu — ระบบสั่งอาหาร

Next.js (App Router, **JavaScript ไม่ใช่ TypeScript**) deploy บน Vercel และใช้ Supabase เป็นฐานข้อมูล

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

ตั้งใน `.env.local` (ตอนพัฒนา) และใน Vercel Project Settings → Environment Variables

## กฎสำคัญ: Dynamic Route params
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` ของ Dynamic Route เป็น **Promise**
ต้อง unwrap ด้วย `use()` จาก React เสมอ เช่น

```js
'use client';
import { use } from 'react';

export default function Page({ params }) {
  const { tableId } = use(params);
  // ...
}
```

## โครงสร้างตารางใน Supabase (มีอยู่แล้ว ไม่ต้องสร้างใหม่)
- `sessions` (id, table_number, adult_count, child_count, status, created_at)
- `menu_categories` (id, name, sort_order)
- `menu_items` (id, category_id, name)
- `orders` (id, session_id, table_number, items jsonb, status, created_at)

ใช้โครงสร้างนี้อ้างอิงตลอดทั้งโปรเจกต์ และ import client จาก `lib/supabaseClient.js`

## หน้าที่วางแผน
- `/` หน้าแรก (ทดสอบ deploy)
- `/generate-qr`
- `/kitchen`
- หน้าสั่งอาหาร (Dynamic Route — ขั้นตอนถัดไป)
