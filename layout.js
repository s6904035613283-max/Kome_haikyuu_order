export const metadata = {
  title: 'Kome_haikyuu',
  description: 'ระบบสั่งอาหารร้าน Kome_haikyuu',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
