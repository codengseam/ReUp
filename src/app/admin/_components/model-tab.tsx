'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ChevronUp } from 'lucide-react';
import type { CustomProvider } from '../_lib/types';
import { BUILTIN_MODELS, PROVIDER_TEMPLATES } from '../_lib/constants';

const CONFIG_API = '/api/admin/config';

export default function ModelTab() {
  const [defaultModelId, setDefaultModelId] = useState('');
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [testLoading, setTestLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState({
    providerType: 'openai',
    name: '',
    endpoint: '',
    apiKey: '',
    modelId: '',
  });
  const [addTestResult, setAddTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isAddTesting, setIsAddTesting] = useState(false);

  // 从服务端加载配置
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CONFIG_API}?key=model`);
        if (res.ok) {
          const data = await res.json();
          if (data.defaultModelId) setDefaultModelId(data.defaultModelId);
          if (data.customModels) setCustomProviders(data.customModels);
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  // 持久化到服务端
  const persistModelConfig = useCallback(async (models: CustomProvider[], defaultId: string) => {
    try {
      await fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'model',
          value: { defaultModelId: defaultId, customModels: models },
        }),
      });
    } catch { /* ignore */ }
  }, []);

  const saveDefaultModel = async (modelId: string) => {
    setDefaultModelId(modelId);
    await persistModelConfig(customProviders, modelId);
    toast.success('默认模型已保存到服务端');
  };

  const testProviderConnection = async (provider: CustomProvider) => {
    setTestLoading(provider.id);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: provider.endpoint,
          apiKey: provider.apiKey,
          modelId: provider.modelId,
          providerType: provider.providerType,
        }),
      });
      const data = await res.json();
      setTestResult({
        id: provider.id,
        success: data.success,
        message: data.success
          ? `连接成功，延迟 ${data.latency}ms`
          : data.error || '连接失败',
      });
    } catch {
      setTestResult({
        id: provider.id,
        success: false,
        message: '网络请求失败',
      });
    } finally {
      setTestLoading(null);
    }
  };

  const testNewModelConnection = async () => {
    if (!newModel.endpoint || !newModel.apiKey || !newModel.modelId) return;
    setIsAddTesting(true);
    setAddTestResult(null);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: newModel.endpoint,
          apiKey: newModel.apiKey,
          modelId: newModel.modelId,
          providerType: newModel.providerType,
        }),
      });
      const data = await res.json();
      setAddTestResult({
        success: data.success,
        message: data.success
          ? `连接成功，延迟 ${data.latency}ms`
          : data.error || '连接失败',
      });
    } catch {
      setAddTestResult({
        success: false,
        message: '网络请求失败，请检查 endpoint 地址',
      });
    } finally {
      setIsAddTesting(false);
    }
  };

  const addCustomModel = async () => {
    if (!newModel.name || !newModel.endpoint || !newModel.apiKey || !newModel.modelId) {
      toast.error('请填写所有必填字段');
      return;
    }

    const provider: CustomProvider = {
      id: `admin-custom-${Date.now()}`,
      name: newModel.name,
      providerType: newModel.providerType,
      endpoint: newModel.endpoint,
      apiKey: newModel.apiKey,
      modelId: newModel.modelId,
    };

    const updated = [...customProviders, provider];
    setCustomProviders(updated);
    await persistModelConfig(updated, defaultModelId);

    toast.success(`自定义模型 "${provider.name}" 已保存到服务端`);
    setNewModel({ providerType: 'openai', name: '', endpoint: '', apiKey: '', modelId: '' });
    setAddTestResult(null);
    setShowAddForm(false);
  };

  const deleteCustomModel = async (id: string) => {
    if (!confirm('确定要删除这个自定义模型吗？')) return;

    const updated = customProviders.filter(p => p.id !== id);
    setCustomProviders(updated);

    const newDefaultId = defaultModelId === id ? '' : defaultModelId;
    if (defaultModelId === id) setDefaultModelId('');
    await persistModelConfig(updated, newDefaultId);

    toast.success(defaultModelId === id ? '模型已删除，默认模型已清除' : '模型已删除');
  };

  const builtinModelOptions = BUILTIN_MODELS.map(m => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>默认模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>选择默认模型</Label>
            <Select value={defaultModelId} onValueChange={saveDefaultModel}>
              <SelectTrigger className="w-full md:w-96">
                <SelectValue placeholder="请选择默认模型" />
              </SelectTrigger>
              <SelectContent>
                {builtinModelOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
                {customProviders.length > 0 && (
                  <>
                    <SelectItem value="custom_sep" disabled>
                      ─── 自定义模型 ───
                    </SelectItem>
                    {customProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          {defaultModelId && (
            <div className="text-sm text-muted-foreground">
              当前默认模型：
              {builtinModelOptions.find((m) => m.id === defaultModelId)?.name ||
                customProviders.find((p) => p.id === defaultModelId)?.name ||
                defaultModelId}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            此配置存储在服务端，所有用户共享。
          </p>
        </CardContent>
      </Card>

      {/* 添加自定义模型 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>添加自定义模型</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-1.5"
          >
            {showAddForm ? (
              <><ChevronUp className="w-3.5 h-3.5" />收起</>
            ) : (
              <><Plus className="w-3.5 h-3.5" />添加</>
            )}
          </Button>
        </CardHeader>
        {showAddForm && (
          <CardContent className="space-y-4 border-t border-border pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>提供商类型</Label>
                <Select
                  value={newModel.providerType}
                  onValueChange={(v) => {
                    const tpl = PROVIDER_TEMPLATES.find(t => t.type === v);
                    setNewModel(prev => ({ ...prev, providerType: v, endpoint: tpl?.endpoint || '' }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TEMPLATES.map(t => (
                      <SelectItem key={t.type} value={t.type}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>模型名称 *</Label>
                <Input
                  value={newModel.name}
                  onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：我的智谱模型"
                />
              </div>
              <div>
                <Label>Endpoint *</Label>
                <Input
                  value={newModel.endpoint}
                  onChange={e => setNewModel(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  填写 Base URL 即可，系统自动补全路径。选择提供商类型会自动填充，也可手动修改。
                </p>
              </div>
              <div>
                <Label>API Key *</Label>
                <Input
                  type="password"
                  value={newModel.apiKey}
                  onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-..."
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  API Key 将加密存储在服务端，比浏览器 localStorage 更安全。
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>Model ID *</Label>
                <Input
                  value={newModel.modelId}
                  onChange={e => setNewModel(prev => ({ ...prev, modelId: e.target.value }))}
                  placeholder="glm-4-flash"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  模型 ID 需要与提供商支持的模型名称完全匹配。
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={testNewModelConnection}
                disabled={isAddTesting || !newModel.endpoint || !newModel.apiKey || !newModel.modelId}
                className="gap-1.5"
              >
                {isAddTesting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />测试中...</>
                ) : '测试连接'}
              </Button>
              <Button
                onClick={addCustomModel}
                disabled={!newModel.name || !newModel.endpoint || !newModel.apiKey || !newModel.modelId}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />保存模型
              </Button>
            </div>

            {addTestResult && (
              <div className={`text-sm px-3 py-2 rounded-lg border ${
                addTestResult.success
                  ? 'text-green-700 bg-green-50 border-green-200'
                  : 'text-red-600 bg-red-50 border-red-200'
              }`}>
                {addTestResult.message}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 自定义模型列表 */}
      <Card>
        <CardHeader>
          <CardTitle>自定义模型列表</CardTitle>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="text-sm text-muted-foreground py-4">加载中...</div>
          ) : customProviders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              暂无自定义模型，请使用上方表单添加。
            </div>
          ) : (
            <div className="space-y-4">
              {customProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {provider.name}
                      {defaultModelId === provider.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {provider.providerType} · {provider.modelId}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {provider.endpoint}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {testResult?.id === provider.id && (
                      <span
                        className={`text-xs whitespace-nowrap ${
                          testResult.success
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {testResult.message}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testProviderConnection(provider)}
                      disabled={testLoading === provider.id}
                    >
                      {testLoading === provider.id ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          测试中...
                        </>
                      ) : (
                        '测试连接'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCustomModel(provider.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
