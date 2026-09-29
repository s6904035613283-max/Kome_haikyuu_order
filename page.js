import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Kome_haikyuu</h1>
      <p>ระบบสั่งอาหาร — deploy สำเร็จ</p>
      <ul>
        <li>
          <Link href="/generate-qr">/generate-qr</Link>
        </li>
        <li>
          <Link href="/kitchen">/kitchen</Link>
        </li>
      </ul>
    </main>
  );
}
