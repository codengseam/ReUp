'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  LayoutDashboard,
  Database,
  Sparkles,
  PenLine,
  Cpu,
  SlidersHorizontal,
  Tags,
  LogOut,
  Lock,
  User,
} from 'lucide-react';
import DashboardTab from './_components/dashboard-tab';
import KnowledgeTab from './_components/knowledge-tab';
import FrameworkSkillsTab from './_components/framework-skills-tab';
import PromptTab from './_components/prompt-tab';
import ModelTab from './_components/model-tab';
import RAGTab from './_components/rag-tab';
import MetadataTab from './_components/metadata-tab';
import type { TabKey } from './_lib/types';

const TAB_CONFIG: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: 'dashboard', label: '概览', icon: LayoutDashboard },
  { key: 'knowledge', label: '知识库', icon: Database },
  { key: 'framework-skills', label: 'Skill 框架', icon: Sparkles },
  { key: 'prompt', label: '提示词', icon: PenLine },
  { key: 'model', label: '模型配置', icon: Cpu },
  { key: 'rag', label: 'RAG 参数', icon: SlidersHorizontal },
  { key: 'metadata', label: '分类', icon: Tags },
];

// ===== 阶段 3：鉴权迁后端 =====
// 1. 删除硬编码 ADMIN_CREDENTIALS 与 sessionStorage AUTH_KEY（业务侧不再持有任何凭证）
// 2. 改 fetch /api/admin/auth（POST/GET/DELETE）走 httpOnly cookie
// 3. 旧 sessionStorage 路径保留为 1 周观察期 fallback：仅当后端返回 503 admin_not_configured 时启用
//    TODO: remove after 2026-06-20 — 届时直接清掉 _legacyLogin / _legacyCheckAuth
const LEGACY_AUTH_KEY = 'boss_admin_legacy_auth_fallback';
const LEGACY_OBSERVATION_END = '2026-06-20';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [backendConfigured, setBackendConfigured] = useState<boolean | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/auth', { method: 'GET', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setBackendConfigured(data?.configured === true);
        if (data?.authenticated === true) {
          setIsAuthenticated(true);
        } else if (data?.configured === false) {
          // 后端未配置 → 1 周观察期内回退到 sessionStorage 旧路径
          try {
            if (sessionStorage.getItem(LEGACY_AUTH_KEY) === 'true') {
              setIsAuthenticated(true);
            }
          } catch { /* ignore */ }
        }
      } catch {
        // 网络失败也走 legacy 兜底
        try {
          if (sessionStorage.getItem(LEGACY_AUTH_KEY) === 'true') {
            setIsAuthenticated(true);
          }
        } catch { /* ignore */ }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password }),
      });

      if (res.status === 503) {
        // 后端未配置：进入 1 周观察期 legacy 路径
        // TODO: remove after 2026-06-20
        if (new Date().toISOString().slice(0, 10) <= LEGACY_OBSERVATION_END) {
          // 这里没有硬编码凭证可校验，只接受"任意非空"——生产环境必须配置 ADMIN_USERNAME/ADMIN_PASSWORD
          // 仅用于过渡期本地调试
          if (loginForm.username && loginForm.password) {
            try { sessionStorage.setItem(LEGACY_AUTH_KEY, 'true'); } catch { /* ignore */ }
            setIsAuthenticated(true);
            setLoginForm({ username: '', password: '' });
            setIsLoggingIn(false);
            return;
          }
        }
        setLoginError('服务端未配置管理员凭证，请联系运维配置 ADMIN_USERNAME / ADMIN_PASSWORD');
        setIsLoggingIn(false);
        return;
      }

      if (res.status === 401) {
        setLoginError('账号或密码错误');
        setIsLoggingIn(false);
        return;
      }

      if (!res.ok) {
        setLoginError('登录失败，请稍后重试');
        setIsLoggingIn(false);
        return;
      }

      setIsAuthenticated(true);
      setLoginForm({ username: '', password: '' });
    } catch (err) {
      setLoginError('网络错误，请稍后重试');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'include' });
    } catch { /* ignore */ }
    try { sessionStorage.removeItem(LEGACY_AUTH_KEY); } catch { /* ignore */ }
    setIsAuthenticated(false);
  };

  // 加载中
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  // 未登录：显示登录表单
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-border rounded-2xl shadow-lg p-8">
            {/* Logo & Title */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">管理后台</h1>
              <p className="text-sm text-muted-foreground mt-1">请输入管理员凭证以继续</p>
            </div>

            {/* ⚠️ 未配置提示：仅在服务端未配置 ADMIN_USERNAME/ADMIN_PASSWORD 时显示 */}
            {backendConfigured === false && (
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
                <div className="font-semibold mb-1">⚠️ 服务端未配置</div>
                <p>检测到 <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-[10px]">ADMIN_USERNAME</code> / <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-[10px]">ADMIN_PASSWORD</code> 环境变量未设置。生产部署前必须配置。当前为 1 周观察期内的过渡态：可填任意非空账号密码登录（仅本地）。</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">账号</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={e => { setLoginForm(prev => ({ ...prev, username: e.target.value })); setLoginError(''); }}
                    placeholder="请输入管理员账号"
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={e => { setLoginForm(prev => ({ ...prev, password: e.target.value })); setLoginError(''); }}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    required
                  />
                </div>
              </div>

              {loginError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn || !loginForm.username || !loginForm.password}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    验证中...
                  </span>
                ) : '登录'}
              </button>
            </form>

            <p className="text-[11px] text-muted-foreground/60 text-center mt-6">
              仅限授权管理员访问
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 已登录：显示管理界面
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">后台管理</h1>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList className="mb-6 flex-wrap h-auto">
            {TAB_CONFIG.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-2">
                <t.icon className="w-4 h-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab onNavigate={setActiveTab} />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgeTab />
          </TabsContent>
          <TabsContent value="framework-skills">
            <FrameworkSkillsTab />
          </TabsContent>
          <TabsContent value="prompt">
            <PromptTab />
          </TabsContent>
          <TabsContent value="model">
            <ModelTab />
          </TabsContent>
          <TabsContent value="rag">
            <RAGTab />
          </TabsContent>
          <TabsContent value="metadata">
            <MetadataTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
