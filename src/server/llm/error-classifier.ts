/**
 * 根据错误对象推断类型，给出对应的友好提示。
 * 设计原则：用户不需要懂后端，只要告诉他们发生了什么 + 该做什么。
 */
export interface MessageError {
  title: string;
  message: string;
  hint?: string;
}

export function classifyError(error: unknown): MessageError {
  // 网络层失败：fetch 直接 reject（离线 / DNS / 服务进程没启动）
  if (error instanceof TypeError && /fetch|network|failed/i.test(error.message)) {
    return {
      title: 'AI 服务暂不可用',
      message: '无法连接到 ReUp 服务端。',
      hint: '请检查：① 后端服务是否启动（默认 5001 端口）② 浏览器网络是否正常。',
    };
  }
  if (error instanceof Error) {
    const msg = error.message;
    // 注意：401/403 必须先于 400 匹配，否则 "401 invalid api key" 会被 "API key" 吃掉
    if (/401|403|unauthor|forbidden|invalid.*key|authentication/i.test(msg)) {
      return {
        title: 'API 密钥无效',
        message: '服务端配置的密钥被拒绝。',
        hint: '请检查 .env 中的 OPENAI_API_KEY / ARK_API_KEY 是否过期或被吊销。',
      };
    }
    if (/Missing credentials|未配置|凭证缺失|api[_\s-]?key.*not.*set/i.test(msg)) {
      return {
        title: 'AI 服务未配置',
        message: '服务端缺少必要的 API 密钥。',
        hint: '请联系管理员在 .env 中配置 OPENAI_API_KEY / ARK_API_KEY。',
      };
    }
    if (/400[\s-]?Bad Request|400[\s-]?错误请求/i.test(msg)) {
      return {
        title: '请求格式错误',
        message: '发送到服务端的数据有问题。',
        hint: '请刷新页面重试，问题持续请联系管理员。',
      };
    }
    if (/429|rate.?limit|quota|exhausted/i.test(msg)) {
      return {
        title: '调用额度已用完',
        message: 'API 调用频率或余额受限。',
        hint: '稍后重试，或联系管理员检查 API 配额。',
      };
    }
    if (/500|502|503|504|upstream|server error/i.test(msg)) {
      return {
        title: '上游模型服务异常',
        message: 'AI 模型返回了错误。',
        hint: '请稍后重试，问题持续请联系管理员。',
      };
    }
    if (/timeout|aborted/i.test(msg)) {
      return {
        title: '请求超时',
        message: 'AI 响应时间过长被中断。',
        hint: '请重试，或换更短的问题。',
      };
    }
    return {
      title: '出错了',
      message: msg || '请稍后重试。',
    };
  }
  return {
    title: '出错了',
    message: '请稍后重试。',
  };
}
