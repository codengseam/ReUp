import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'ReUp | 职场晋升与面试顾问',
    template: '%s | ReUp',
  },
  description:
    'ReUp — 以资深 HR + 总裁视角，帮你解决晋升困惑与面试难题。',
  keywords: [
    '职场晋升',
    '面试辅导',
    '晋升指南',
    '大厂晋升',
    '职业发展',
    '绩效管理',
    'ReUp',
    'AI 职场顾问',
    '简历优化',
    '面试准备',
  ],
  authors: [{ name: 'ReUp Team' }],
  generator: 'ReUp',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'ReUp | 职场晋升与面试顾问',
    description:
      '以资深 HR + 总裁视角，帮你解决晋升困惑与面试难题。基于《大厂晋升指南》与《面试现场》。',
    siteName: 'ReUp',
    locale: 'zh_CN',
    type: 'website',
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'ReUp | 职场晋升与面试顾问',
  //   description:
  //     '以资深 HR + 总裁视角，帮你解决晋升困惑与面试难题。基于《大厂晋升指南》与《面试现场》。',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <html lang="zh-CN">
      <body className={`${inter.variable} antialiased`}>
        {isDev && <Inspector />}
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
