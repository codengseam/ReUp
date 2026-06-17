'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, KeyRound, Save, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const CONFIG_API = '/api/admin/runtime-config';

const MASK = '***MASKED***';

type ProviderId = 'dashscope' | 'zhipu';

interface ProviderEntry {
  endpoint: string;
  apiKey: string;
  provider?: string;
}

interface RuntimeConfigResponse {
  apiKeys: Partial<Record<ProviderId, ProviderEntry>>;
  updatedAt?: string;
}

const PROVIDER_META: Record<ProviderId, { label: string; envVar: string; helpUrl: string; defaultEndpoint: string }> = {
  dashscope: {
    label: '阿里云 DashScope (Qwen 3.6 Plus)',
    envVar: 'DASHSCOPE_API_KEY',
    helpUrl: 'https://dashscope.console.aliyun.com/apiKey',
    defaultEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  zhipu: {
    label: '智谱 GLM (GLM-4.7-Flash)',
    envVar: 'ZHIPU_API_KEY',
    helpUrl: 'https://bigmodel.cn/usercenter/proj-key',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
  },
};

export default function RuntimeConfigTab() {
  const [config, setConfig] = useState<RuntimeConfigResponse>({ apiKeys: {} });
  const [editing, setEditing] = useState<Record<ProviderId, { endpoint: string; apiKey: string } | null>>({
    dashscope: null,
    zhipu: null,
  });
  const [showKey, setShowKey] = useState<Record<ProviderId, boolean>>({ dashscope: false, zhipu: false });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<ProviderId | null>(null);
  const [envFallback, setEnvFallback] = useState<Record<ProviderId, boolean>>({ dashscope: false, zhipu: false });

  // 加载当前配置
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(CONFIG_API);
        if (res.ok) {
          const data = (await res.json()) as RuntimeConfigResponse;
          setConfig({ apiKeys: data.apiKeys ?? {}, updatedAt: data.updatedAt });
        }
      } catch { /* ignore */ }

      // 检测 env-var 兜底（前端通过 env 在 build 阶段注入，未注入则用 NEXTAUTH_URL 类比 fallback）
      // 仅做最佳努力提示：env 设置了也可能在服务端生效而文件中为空
      setEnvFallback({
        dashscope: false,
        zhipu: false,
      });

      setLoaded(true);
    })();
  }, []);

  const startEdit = useCallback((provider: ProviderId) => {
    const existing = config.apiKeys[provider];
    const meta = PROVIDER_META[provider];
    setEditing(prev => ({
      ...prev,
      [provider]: {
        endpoint: existing?.endpoint ?? meta.defaultEndpoint,
        // 显示空（不预填 masked），用户需要重新输入
        apiKey: '',
      },
    }));
  }, [config]);

  const cancelEdit = useCallback((provider: ProviderId) => {
    setEditing(prev => ({ ...prev, [provider]: null }));
    setShowKey(prev => ({ ...prev, [provider]: false }));
  }, []);

  const saveProvider = useCallback(async (provider: ProviderId) => {
    const draft = editing[provider];
    if (!draft) return;
    if (!draft.endpoint.trim()) {
      toast.error('Endpoint 不能为空');
      return;
    }

    setSaving(provider);
    try {
      // 只提交当前 provider 的更新（其他 provider 保留）
      const body: { apiKeys: Record<string, { endpoint: string; apiKey: string; provider: string }> } = {
        apiKeys: {
          [provider]: {
            endpoint: draft.endpoint.trim(),
            apiKey: draft.apiKey, // 空字符串 = 清除
            provider,
          },
        },
      };
      const res = await fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? `保存失败 (${res.status})`);
      }
      const data = (await res.json()) as { updatedAt?: string };
      setConfig(prev => ({
        apiKeys: {
          ...prev.apiKeys,
          [provider]: {
            endpoint: draft.endpoint.trim(),
            // 服务端会返回掩码，存进 config 给用户看
            apiKey: draft.apiKey ? MASK : '',
            provider,
          },
        },
        updatedAt: data.updatedAt ?? prev.updatedAt,
      }));
      setEditing(prev => ({ ...prev, [provider]: null }));
      setShowKey(prev => ({ ...prev, [provider]: false }));
      toast.success(`${PROVIDER_META[provider].label} 已保存`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      toast.error(msg);
    } finally {
      setSaving(null);
    }
  }, [editing]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            LLM API Keys
          </CardTitle>
          <CardDescription>
            管理 ReUp 使用的 LLM 提供商 API 密钥。密钥以掩码形式展示，更改立即生效（下一个 LLM 请求会读新值）。
            <br />
            <span className="text-muted-foreground/80">
              优先级：env-var（{`DASHSCOPE_API_KEY`} / {`ZHIPU_API_KEY`}）&gt; 本地配置文件
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold mb-1">存储位置</div>
              密钥持久化到 <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-[11px]">data/.runtime-config.json</code>（已在 .gitignore 中），请勿手动提交此文件或在任何文档中粘贴明文。
            </div>
          </div>

          {(['dashscope', 'zhipu'] as const).map(provider => {
            const meta = PROVIDER_META[provider];
            const existing = config.apiKeys[provider];
            const draft = editing[provider];
            const isSaving = saving === provider;
            const isKeyMasked = existing?.apiKey === MASK;
            const isKeyEmpty = !existing?.apiKey;

            return (
              <div key={provider} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      env-var: <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">{meta.envVar}</code>
                      {' · '}
                      <a
                        href={meta.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        获取 API Key
                      </a>
                    </div>
                  </div>
                  {!draft && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(provider)}>
                      {isKeyEmpty ? '设置' : '更新'}
                    </Button>
                  )}
                </div>

                {/* Endpoint 展示 / 编辑 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Endpoint</Label>
                  {draft ? (
                    <Input
                      value={draft.endpoint}
                      onChange={e => setEditing(prev => ({ ...prev, [provider]: { ...prev[provider]!, endpoint: e.target.value } }))}
                      placeholder={meta.defaultEndpoint}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs font-mono text-muted-foreground break-all">
                      {existing?.endpoint || <span className="italic">未设置（将使用默认值）</span>}
                    </div>
                  )}
                </div>

                {/* API Key 展示 / 编辑 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  {draft ? (
                    <div className="relative">
                      <Input
                        type={showKey[provider] ? 'text' : 'password'}
                        value={draft.apiKey}
                        onChange={e => setEditing(prev => ({ ...prev, [provider]: { ...prev[provider]!, apiKey: e.target.value } }))}
                        placeholder={isKeyEmpty ? '输入新的 API Key' : '留空保留当前密钥（不更新）'}
                        className="font-mono text-xs pr-10"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [provider]: !prev[provider] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        title={showKey[provider] ? '隐藏' : '显示'}
                      >
                        {showKey[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs font-mono text-muted-foreground flex items-center justify-between">
                      <span>
                        {isKeyEmpty
                          ? <span className="italic">未设置</span>
                          : isKeyMasked
                            ? MASK
                            : '••••••••'}
                      </span>
                      {isKeyMasked && (
                        <span className="text-[10px] text-muted-foreground/70">已存储</span>
                      )}
                    </div>
                  )}
                </div>

                {/* 编辑模式的操作 */}
                {draft && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => saveProvider(provider)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      保存
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelEdit(provider)}
                      disabled={isSaving}
                    >
                      取消
                    </Button>
                    {existing?.apiKey && draft.apiKey === '' && (
                      <span className="text-[11px] text-muted-foreground">
                        留空将清空当前密钥
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {config.updatedAt && (
            <div className="text-[11px] text-muted-foreground/70 pt-2 border-t border-border">
              最后更新：{new Date(config.updatedAt).toLocaleString('zh-CN')}
            </div>
          )}

          {loaded && Object.keys(config.apiKeys).length === 0 && (
            <div className="text-xs text-muted-foreground/80 italic">
              尚未配置任何 API Key，聊天接口将返回错误。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
