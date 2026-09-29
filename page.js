'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const MAX_QTY = 5; // จำนวนต่อรายการ
const MAX_LINES = 10; // จำนวนรายการต่อการส่ง 1 ครั้ง

const C = {
  bg: '#FAF3E8',
  card: '#FFFCF6',
  border: '#E6D8C3',
  text: '#3A2B21',
  muted: '#7B6656',
  primary: '#B9673B',
  primaryDark: '#9C5430',
  green: '#5E7F5B',
  danger: '#B04A3A',
  overlay: 'rgba(58, 43, 33, 0.55)',
};

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`;

const fullScreen = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 24,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: 'system-ui, -apple-system, "Noto Sans Thai", sans-serif',
};

export default function OrderPage({ params }) {
  // params เป็น Promise ใน Next.js เวอร์ชันล่าสุด ต้อง unwrap ด้วย use() เสมอ
  const { tableNumber } = use(params);

  const [status, setStatus] = useState('loading'); // loading | inactive | ready | closed | error
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);

  const [cart, setCart] = useState([]); // [{id, name, price, quantity}]
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const [billOpen, setBillOpen] = useState(false);
  const [billLines, setBillLines] = useState([]);
  const [billTotal, setBillTotal] = useState(0);
  const [billLoading, setBillLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }

  // 1) เช็ค session ที่เปิดอยู่ แล้วโหลดเมนู
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const num = Number(tableNumber);
      if (!Number.isInteger(num) || num <= 0) {
        setStatus('inactive');
        return;
      }
      try {
        const { data: found, error: sErr } = await supabase
          .from('sessions')
          .select('id')
          .eq('table_number', num)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);
        if (sErr) throw sErr;
        if (!found || found.length === 0) {
          if (!cancelled) setStatus('inactive');
          return;
        }

        const [catRes, itemRes] = await Promise.all([
          supabase.from('menu_categories').select('id, name, sort_order').order('sort_order'),
          supabase.from('menu_items').select('id, category_id, name, price').order('id'),
        ]);
        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;

        if (cancelled) return;
        setSession(found[0]);
        setCategories(catRes.data || []);
        setItems(itemRes.data || []);
        setActiveCat(catRes.data?.[0]?.id ?? null);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  // ---------- ตะกร้า ----------
  function addToCart(item) {
    const existing = cart.find((l) => l.id === item.id);
    if (existing) {
      if (existing.quantity >= MAX_QTY) {
        flash(`สั่งได้สูงสุด ${MAX_QTY} ต่อรายการ`);
        return;
      }
      setCart(cart.map((l) => (l.id === item.id ? { ...l, quantity: l.quantity + 1 } : l)));
      return;
    }
    if (cart.length >= MAX_LINES) {
      flash(`ส่งได้สูงสุด ${MAX_LINES} รายการต่อครั้ง`);
      return;
    }
    setCart([...cart, { id: item.id, name: item.name, price: Number(item.price) || 0, quantity: 1 }]);
  }

  function decFromCart(id) {
    setCart(
      cart
        .map((l) => (l.id === id ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function submitOrder() {
    if (cart.length === 0 || sending) return;
    setSending(true);
    try {
      // กันสั่งเข้า session ที่ถูกปิดไปแล้ว
      const { data: still, error: chkErr } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', session.id)
        .eq('status', 'open')
        .limit(1);
      if (chkErr) throw chkErr;
      if (!still || still.length === 0) {
        setStatus('closed');
        return;
      }

      const { error } = await supabase.from('orders').insert({
        session_id: session.id,
        table_number: Number(tableNumber),
        items: cart.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
        status: 'received',
      });
      if (error) throw error;

      setCart([]);
      setCartOpen(false);
      flash('ส่งออเดอร์แล้ว ✓');
    } catch (e) {
      flash('ส่งออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  // ---------- เรียกเก็บเงิน ----------
  async function openBill() {
    setBillOpen(true);
    setBillLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', session.id);
      if (error) throw error;

      const map = new Map();
      let total = 0;
      for (const row of data || []) {
        for (const it of row.items || []) {
          const price = Number(it.price) || 0;
          const qty = Number(it.quantity) || 0;
          const key = `${it.name}|${price}`;
          const cur = map.get(key) || { name: it.name, price, quantity: 0 };
          cur.quantity += qty;
          map.set(key, cur);
          total += price * qty;
        }
      }
      setBillLines([...map.values()]);
      setBillTotal(total);
    } catch (e) {
      setBillOpen(false);
      flash('โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBillLoading(false);
    }
  }

  async function confirmBill() {
    setClosing(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id);
      if (error) throw error;
      setBillOpen(false);
      setStatus('closed');
    } catch (e) {
      flash('ปิดโต๊ะไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setClosing(false);
    }
  }

  // ---------- หน้าเต็มจอ ----------
  if (status === 'loading') return <main style={fullScreen}>กำลังโหลด...</main>;
  if (status === 'inactive')
    return <main style={fullScreen}>โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน</main>;
  if (status === 'error')
    return <main style={fullScreen}>โหลดข้อมูลไม่สำเร็จ กรุณาแจ้งพนักงาน</main>;
  if (status === 'closed') return <main style={fullScreen}>ขอบคุณที่ใช้บริการ 🙏</main>;

  // ---------- หน้าสั่งอาหาร ----------
  const visibleItems = items.filter((i) => i.category_id === activeCat);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: 'system-ui, -apple-system, "Noto Sans Thai", sans-serif',
        paddingBottom: 150,
      }}
    >
      {/* แถบบน */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: C.bg,
          borderBottom: `2px solid ${C.border}`,
          padding: '12px 14px 0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>โต๊ะ {tableNumber}</h1>
          <button
            onClick={openBill}
            style={{
              fontSize: 18,
              fontWeight: 700,
              padding: '10px 16px',
              border: `2px solid ${C.primary}`,
              borderRadius: 12,
              background: 'transparent',
              color: C.primary,
              cursor: 'pointer',
            }}
          >
            เรียกเก็บเงิน
          </button>
        </div>

        {/* แท็บหมวดหมู่ */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0' }}>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              style={{
                flex: '0 0 auto',
                fontSize: 20,
                fontWeight: 600,
                padding: '10px 18px',
                borderRadius: 999,
                border: `2px solid ${activeCat === c.id ? C.primary : C.border}`,
                background: activeCat === c.id ? C.primary : C.card,
                color: activeCat === c.id ? '#fff' : C.text,
                cursor: 'pointer',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </header>

      {/* รายการเมนู */}
      <section style={{ padding: 14, display: 'grid', gap: 10 }}>
        {visibleItems.length === 0 && (
          <p style={{ fontSize: 20, color: C.muted, textAlign: 'center' }}>ยังไม่มีเมนูในหมวดนี้</p>
        )}
        {visibleItems.map((item) => {
          const line = cart.find((l) => l.id === item.id);
          return (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: C.card,
                border: `2px solid ${C.border}`,
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 20, color: C.primary, fontWeight: 700 }}>
                  {baht(item.price)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {line && (
                  <>
                    <button onClick={() => decFromCart(item.id)} style={roundBtn(C.muted)} aria-label="ลด">
                      −
                    </button>
                    <span style={{ fontSize: 24, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                      {line.quantity}
                    </span>
                  </>
                )}
                <button onClick={() => addToCart(item)} style={roundBtn(C.primary)} aria-label="เพิ่ม">
                  +
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* ข้อความแจ้งเตือนสั้นๆ */}
      {notice && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 130,
            zIndex: 40,
            background: C.text,
            color: '#fff',
            fontSize: 20,
            fontWeight: 600,
            textAlign: 'center',
            padding: '14px 16px',
            borderRadius: 12,
          }}
        >
          {notice}
        </div>
      )}

      {/* ตะกร้าลอยด้านล่าง */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          background: C.card,
          borderTop: `3px solid ${C.border}`,
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {cartOpen && cart.length > 0 && (
          <div style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: 10 }}>
            {cart.map((l) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  fontSize: 20,
                }}
              >
                <span>
                  {l.name} × {l.quantity}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b>{baht(l.price * l.quantity)}</b>
                  <button onClick={() => decFromCart(l.id)} style={{ ...roundBtn(C.muted), width: 40, height: 40, fontSize: 24 }}>
                    −
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setCartOpen(!cartOpen)}
            disabled={cart.length === 0}
            style={{
              flex: 1,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              color: C.text,
              cursor: cart.length ? 'pointer' : 'default',
              padding: 0,
            }}
          >
            <div style={{ fontSize: 18, color: C.muted }}>
              ตะกร้า {cart.length}/{MAX_LINES} รายการ {cart.length > 0 && (cartOpen ? '▾' : '▴')}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{baht(cartTotal)}</div>
          </button>
          <button
            onClick={submitOrder}
            disabled={cart.length === 0 || sending}
            style={{
              fontSize: 22,
              fontWeight: 700,
              padding: '16px 24px',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              background: cart.length === 0 || sending ? C.muted : C.primary,
              cursor: cart.length === 0 || sending ? 'default' : 'pointer',
            }}
          >
            {sending ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
          </button>
        </div>
      </div>

      {/* หน้าต่างยืนยันเรียกเก็บเงิน */}
      {billOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: C.overlay,
            zIndex: 60,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: C.card,
              width: '100%',
              maxWidth: 520,
              borderRadius: '20px 20px 0 0',
              padding: 20,
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ fontSize: 26, margin: '0 0 12px' }}>เรียกเก็บเงิน</h2>
            {billLoading ? (
              <p style={{ fontSize: 20 }}>กำลังโหลดรายการ...</p>
            ) : (
              <>
                {billLines.length === 0 ? (
                  <p style={{ fontSize: 20, color: C.muted }}>ยังไม่มีรายการที่สั่ง</p>
                ) : (
                  billLines.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 20,
                        padding: '8px 0',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      <b>{baht(l.price * l.quantity)}</b>
                    </div>
                  ))
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 26,
                    fontWeight: 700,
                    margin: '16px 0',
                  }}
                >
                  <span>ยอดที่ต้องจ่าย</span>
                  <span style={{ color: C.primary }}>{baht(billTotal)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setBillOpen(false)}
                disabled={closing}
                style={{ ...bigBtn, background: C.muted }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmBill}
                disabled={closing || billLoading}
                style={{ ...bigBtn, background: closing || billLoading ? C.muted : C.primary }}
              >
                {closing ? 'กำลังปิด...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function roundBtn(bg) {
  return {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: 'none',
    background: bg,
    color: '#fff',
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
  };
}

const bigBtn = {
  flex: 1,
  fontSize: 22,
  fontWeight: 700,
  padding: '16px 12px',
  border: 'none',
  borderRadius: 12,
  color: '#fff',
  cursor: 'pointer',
};
