// src/lib/url-safety.ts
// 阶段 3：SSRF 防护
// 阻断用户可控 endpoint 对内网/元数据端点的访问：
// - 协议白名单（http/https）
// - 主机黑名单：localhost / 127.0.0.1 / 0.0.0.0 / 169.254.169.254 / metadata.google.internal
// - 私有 CIDR：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16
// - IPv6 loopback ::1 / link-local fe80: / ULA fc00:
//
// 注意：纯字符串检查只防"显式 IP/主机名"的 SSRF。要彻底防 DNS rebinding 还得在 fetch 后
// 再次校验 socket 实际连接的远端 IP（在 Node 18+ 可以用 undici Agent），本阶段先做"显式 SSRF"层。

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS / Azure / GCP metadata
  'metadata.google.internal', // GCP metadata
  'metadata.azure.com', // Azure metadata
  '100.100.100.200', // Alibaba metadata
]);

// 私有 IP 段（字符串层面检查；不解析为数字精度稍低但足够防常见注入）
// - 10.0.0.0/8
// - 172.16.0.0/12
// - 192.168.0.0/16
const PRIVATE_IPV4_RE =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

// IPv6 特殊段
const PRIVATE_IPV6_RE =
  /^(\[)?(::1|fc[0-9a-f]{2}:|fe80:|fd[0-9a-f]{2}:)/i;

export type UrlSafetyReason =
  | 'unsupported_protocol'
  | 'private_or_loopback'
  | 'invalid_url';

export interface UrlSafetyResult {
  safe: boolean;
  reason?: UrlSafetyReason;
}

export function isSafeEndpoint(url: string): UrlSafetyResult {
  if (typeof url !== 'string' || url.length === 0) {
    return { safe: false, reason: 'invalid_url' };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { safe: false, reason: 'invalid_url' };
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { safe: false, reason: 'unsupported_protocol' };
  }

  const hostname = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { safe: false, reason: 'private_or_loopback' };
  }
  if (PRIVATE_IPV4_RE.test(hostname)) {
    return { safe: false, reason: 'private_or_loopback' };
  }
  if (PRIVATE_IPV6_RE.test(hostname)) {
    return { safe: false, reason: 'private_or_loopback' };
  }
  return { safe: true };
}
