import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI Chat | 通用 AI 对话框架',
    template: '%s | AI Chat',
  },
  description:
    '基于知识库的通用 AI 对话框架，支持 RAG 检索增强、多模型切换、管理后台配置。',
  keywords: [
    'AI Chat',
    '知识库问答',
    'RAG',
    'LLM',
    'AI 对话框架',
    '智能助手',
  ],
  authors: [{ name: 'AI Chat' }],
  generator: 'AI Chat',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'AI Chat | 通用 AI 对话框架',
    description:
      '基于知识库的通用 AI 对话框架，支持 RAG 检索增强、多模型切换与管理后台配置。',
    siteName: 'AI Chat',
    locale: 'zh_CN',
    type: 'website',
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'AI Chat | 通用 AI 对话框架',
  //   description:
  //     '基于知识库的通用 AI 对话框架，支持 RAG 检索增强、多模型切换与管理后台配置。',
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
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
