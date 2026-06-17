import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'net';

/**
 * Endpoint 安全校验：黑名单策略
 * - 强制 HTTPS 协议
 * - 禁止内网/私有/回环地址（防 SSRF）
 * - 允许所有合法公网 HTTPS 地址
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // 直接匹配常见内网主机名
  const blockedHostnames = [
    'localhost',
    '0.0.0.0',
    '::1',
    '[::1]',
    '127.0.0.1',
  ];
  if (blockedHostnames.includes(hostname)) return true;

  // 如果是 IP 地址，检查是否为私有/保留段
  const ip = isIP(hostname);
  if (ip) {
    const parts = hostname.split('.');
    if (ip === 4 && parts.length === 4) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      // 10.0.0.0/8
      if (first === 10) return true;
      // 172.16.0.0/12
      if (first === 172 && second >= 16 && second <= 31) return true;
      // 192.168.0.0/16
      if (first === 192 && second === 168) return true;
      // 127.0.0.0/8 (loopback)
      if (first === 127) return true;
      // 169.254.0.0/16 (link-local)
      if (first === 169 && second === 254) return true;
      // 0.0.0.0/8
      if (first === 0) return true;
    }
    // IPv6 回环 ::1 或链路本地 fe80::
    if (ip === 6) {
      const lower = hostname.toLowerCase();
      if (lower === '::1' || lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    }
  }

  // 域名中包含内网特征
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan')) return true;

  return false;
}

/**
 * 自动补全 endpoint 路径：如果用户填的是 base_url（不含 /chat/completions），自动追加。
 * 兼容 OpenAI 兼容格式：用户可填 base_url 或完整路径。
 */
function normalizeEndpoint(url: string): string {
  const trimmed = url.replace(/\/+$/, ''); // 去除末尾斜杠
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function validateEndpoint(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: '仅支持 HTTPS 协议' };
    }
    if (isPrivateOrReservedIP(parsed.hostname)) {
      return { valid: false, reason: '不允许使用内网地址' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: '无效的 URL 格式' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, apiKey, modelId, providerType } = body as {
      endpoint: string;
      apiKey: string;
      modelId: string;
      providerType: string;
    };

    // providerType 预留：未来可根据不同 provider 使用不同的认证方式
    void providerType;

    if (!endpoint || !apiKey || !modelId) {
      return NextResponse.json({ success: false, error: '缺少必要参数：endpoint, apiKey, modelId' }, { status: 400 });
    }

    const normalizedEndpoint = normalizeEndpoint(endpoint);

    const validation = validateEndpoint(normalizedEndpoint);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.reason || '不支持的 endpoint' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const startTime = Date.now();

    try {
      const response = await fetch(normalizedEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const modelName = data.model || modelId;
        return NextResponse.json({ success: true, latency, model: modelName });
      }

      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ success: false, error: `认证失败 (${response.status})，请检查 API Key` });
      }

      if (response.status === 404) {
        return NextResponse.json({ success: false, error: 'Endpoint 未找到 (404)，请检查地址' });
      }

      const errorText = await response.text().catch(() => '');
      return NextResponse.json({ success: false, error: `请求失败 (${response.status})${errorText ? ': ' + errorText.substring(0, 100) : ''}` });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        return NextResponse.json({ success: false, error: '连接超时（超过10秒），请检查 endpoint 地址' });
      }
      return NextResponse.json({ success: false, error: `连接失败: ${error instanceof Error ? error.message : '未知错误'}` });
    }
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
}
