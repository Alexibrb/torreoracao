import type {Metadata} from 'next';
import {Inter, Dancing_Script} from 'next/font/google';
import './globals.css';
import {Toaster} from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Torre de Oração',
  description:
    'App para agendamento da torre de oração, onde os membros podem escolher horários para orar.',
  icons: {
    icon: 'https://www.ibrnobrasil.com.br/files/2018/10/logoigrejapng.png',
  },
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const dancingScript = Dancing_Script({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dancing-script',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${dancingScript.variable}`}>
      <body className="font-sans antialiased flex flex-col min-h-screen">
        <div className="flex-grow">{children}</div>
        <Toaster />
        <footer className="w-full p-4 text-center text-sm text-muted-foreground">
          Versão 2.0 - Desenvolvedor: Alex Alves
        </footer>
      </body>
    </html>
  );
}
