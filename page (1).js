'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// โทนสีอุ่น สบายตา เหมาะกับร้านราเมง
const C = {
  bg: '#FAF3E8', // ครีมอุ่น
  card: '#FFFCF6',
  border: '#E6D8C3',
  text: '#3A2B21', // น้ำตาลเข้ม (ไม่ดำสนิท)
  muted: '#7B6656',
  primary: '#B9673B', // ส้มอิฐ (สีน้ำซุป)
  primaryDark: '#9C5430',
  green: '#5E7F5B', // เขียวหอมต้น
  warnBg: '#FFF0D9',
  warnBorder: '#E2A54F',
  warnText: '#7A4211',
  danger: '#B04A3A', // แดงอิฐ
  dangerDark: '#933B2D',
  overlay: 'rgba(58, 43, 33, 0.55)',
};

const s = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    fontFamily: 'system-ui, -apple-system, "Noto Sans Thai", sans-serif',
    padding: '24px 16px',
  },
  wrap: { maxWidth: 520, margin: '0 auto' },
  title: { fontSize: 34, margin: '0 0 20px', fontWeight: 700 },
  card: {
    background: C.card,
    border: `2px solid ${C.border}`,
    borderRadius: 16,
    padding: 24,
  },
  label: { display: 'block', fontSize: 22, fontWeight: 600, marginBottom: 6 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 28,
    padding: '12px 14px',
    border: `2px solid ${C.border}`,
    borderRadius: 12,
    background: '#fff',
    color: C.text,
    marginBottom: 18,
  },
  btn: {
    width: '100%',
    fontSize: 26,
    fontWeight: 700,
    padding: '16px 20px',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    color: '#fff',
  },
  error: { color: C.danger, fontSize: 20, margin: '0 0 14px', fontWeight: 600 },
  warnBox: {
    background: C.warnBg,
    border: `3px solid ${C.warnBorder}`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    color: C.warnText,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: C.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 50,
  },
  dialog: {
    background: C.card,
    border: `4px solid ${C.danger}`,
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 440,
  },
};

function minutesSince(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function GenerateQrPage() {
  const [table, setTable] = useState('');
  const [adult, setAdult] = useState('');
  const [child, setChild] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [existing, setExisting] = useState(null); // session เก่าที่ยังเปิดค้าง
  const [showConfirm, setShowConfirm] = useState(false);
  const [minutesOpen, setMinutesOpen] = useState(0);
  const [closing, setClosing] = useState(false);

  const [result, setResult] = useState(null); // { table, adult, child, url }
  const [copied, setCopied] = useState(false);

  function validate() {
    const t = Number(table);
    const a = adult === '' ? 0 : Number(adult);
    const c = child === '' ? 0 : Number(child);
    if (!Number.isInteger(t) || t <= 0) return 'กรุณากรอกเลขโต๊ะให้ถูกต้อง';
    if (!Number.isInteger(a) || a < 0 || !Number.isInteger(c) || c < 0)
      return 'จำนวนคนต้องเป็นตัวเลข 0 ขึ้นไป';
    if (a + c < 1) return 'กรุณากรอกจำนวนลูกค้าอย่างน้อย 1 คน';
    return { t, a, c };
  }

  async function handleOpenTable() {
    setError('');
    const v = validate();
    if (typeof v === 'string') {
      setError(v);
      return;
    }

    setLoading(true);
    try {
      // 1) เช็คว่าโต๊ะนี้มี session ที่ยังเปิดอยู่หรือไม่
      const { data: found, error: findErr } = await supabase
        .from('sessions')
        .select('id, adult_count, child_count, created_at')
        .eq('table_number', v.t)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      if (findErr) throw findErr;

      if (found && found.length > 0) {
        setExisting(found[0]);
        return;
      }

      // 2) ไม่มี -> สร้าง session ใหม่ (ไม่จำกัดเวลา)
      const { error: insErr } = await supabase.from('sessions').insert({
        table_number: v.t,
        adult_count: v.a,
        child_count: v.c,
        status: 'open',
      });
      if (insErr) throw insErr;

      setResult({
        table: v.t,
        adult: v.a,
        child: v.c,
        url: `${window.location.origin}/order/${v.t}`,
      });
      setCopied(false);
    } catch (e) {
      setError('เกิดข้อผิดพลาด: ' + (e?.message || 'ลองใหม่อีกครั้ง'));
    } finally {
      setLoading(false);
    }
  }

  function openConfirm() {
    setMinutesOpen(minutesSince(existing.created_at));
    setShowConfirm(true);
  }

  async function confirmCloseOld() {
    setClosing(true);
    setError('');
    try {
      // เช็คซ้ำว่ายังเป็น 'open' ตอน update เพื่อกันการกดซ้ำซ้อน
      const { error: updErr } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existing.id)
        .eq('status', 'open');
      if (updErr) throw updErr;

      setShowConfirm(false);
      setExisting(null); // กลับไปฟอร์มเดิม ค่าที่กรอกยังอยู่
    } catch (e) {
      setShowConfirm(false);
      setError('ปิดโต๊ะเดิมไม่สำเร็จ: ' + (e?.message || 'ลองใหม่อีกครั้ง'));
    } finally {
      setClosing(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = result.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetAll() {
    setTable('');
    setAdult('');
    setChild('');
    setError('');
    setExisting(null);
    setShowConfirm(false);
    setResult(null);
    setCopied(false);
  }

  // ---------- หน้าผลลัพธ์ QR ----------
  if (result) {
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      result.url
    )}`;
    return (
      <main style={s.page}>
        <div style={s.wrap}>
          <h1 style={s.title}>เปิดโต๊ะสำเร็จ</h1>
          <div style={{ ...s.card, textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={`QR Code โต๊ะ ${result.table}`}
              width={300}
              height={300}
              style={{ maxWidth: '100%', height: 'auto', background: '#fff', padding: 8, borderRadius: 12 }}
            />
            <p style={{ fontSize: 26, fontWeight: 700, margin: '16px 0 8px' }}>
              โต๊ะ {result.table} · ผู้ใหญ่ {result.adult} · เด็ก {result.child}
            </p>
            <p style={{ fontSize: 18, wordBreak: 'break-all', margin: '0 0 12px', color: C.muted }}>
              {result.url}
            </p>
            <button
              onClick={copyLink}
              style={{
                ...s.btn,
                width: 'auto',
                fontSize: 18,
                padding: '10px 18px',
                background: copied ? C.green : C.primary,
                marginBottom: 20,
              }}
            >
              {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
            </button>
            <button onClick={resetAll} style={{ ...s.btn, background: C.primary }}>
              เปิดโต๊ะใหม่
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---------- ฟอร์ม + กล่องเตือน ----------
  return (
    <main style={s.page}>
      <div style={s.wrap}>
        <h1 style={s.title}>เปิดโต๊ะ</h1>

        {existing && (
          <div style={s.warnBox} role="alert">
            <p style={{ fontSize: 24, fontWeight: 700, margin: '0 0 14px' }}>
              ⚠️ โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน
            </p>
            <button onClick={openConfirm} style={{ ...s.btn, background: C.danger }}>
              ปิดออเดอร์เดิม
            </button>
          </div>
        )}

        <div style={s.card}>
          <label style={s.label} htmlFor="table">เลขโต๊ะ</label>
          <input
            id="table"
            type="number"
            inputMode="numeric"
            min="1"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            style={s.input}
          />

          <label style={s.label} htmlFor="adult">จำนวนผู้ใหญ่</label>
          <input
            id="adult"
            type="number"
            inputMode="numeric"
            min="0"
            value={adult}
            onChange={(e) => setAdult(e.target.value)}
            style={s.input}
          />

          <label style={s.label} htmlFor="child">จำนวนเด็ก</label>
          <input
            id="child"
            type="number"
            inputMode="numeric"
            min="0"
            value={child}
            onChange={(e) => setChild(e.target.value)}
            style={s.input}
          />

          {error && <p style={s.error}>{error}</p>}

          <button
            onClick={handleOpenTable}
            disabled={loading}
            style={{ ...s.btn, background: loading ? C.muted : C.primary }}
          >
            {loading ? 'กำลังเปิดโต๊ะ...' : 'เปิดโต๊ะ'}
          </button>
        </div>
      </div>

      {/* กล่องยืนยันปิดโต๊ะเดิม */}
      {showConfirm && existing && (
        <div style={s.overlay} role="dialog" aria-modal="true">
          <div style={s.dialog}>
            <h2 style={{ fontSize: 28, margin: '0 0 14px', color: C.danger }}>
              ยืนยันปิดโต๊ะเดิม?
            </h2>
            <p style={{ fontSize: 22, margin: '0 0 6px', fontWeight: 600 }}>
              โต๊ะ {table}
            </p>
            <p style={{ fontSize: 22, margin: '0 0 6px' }}>
              ผู้ใหญ่ {existing.adult_count} · เด็ก {existing.child_count}
            </p>
            <p style={{ fontSize: 22, margin: '0 0 20px', color: C.muted }}>
              เปิดมาแล้ว {minutesOpen} นาที
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={closing}
                style={{ ...s.btn, background: C.muted, fontSize: 22 }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmCloseOld}
                disabled={closing}
                style={{ ...s.btn, background: closing ? C.muted : C.danger, fontSize: 22 }}
              >
                {closing ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
