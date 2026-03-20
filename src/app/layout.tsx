import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Talon API',
  description: 'Talon Gaming Platform API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
