# Spec Infra: 日志 + 埋点 + 后台统计

## 目标

贯穿所有子项目的基础设施，为开发调试和产品优化提供数据支撑：
1. 后端统一日志：traceId + 耗时 + 错误栈，方便定位问题
2. 前端埋点 SDK：统一事件上报，统计用户行为
3. 后台统计面板：可视化展示关键指标

## 现状

| 能力 | 现状 |
|------|------|
| 后端日志 | 仅有 `console.log/error`，无结构化、无 traceId |
| 前端埋点 | 无 |
| 后台统计 | 仅 `admin/stats` 基础统计（知识库条目数等） |

## 技术方案

### 1. 后端日志 (`server/logger.ts`)

```typescript
// 统一日志接口
interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: Error, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}

interface LogContext {
  traceId?: string;    // 请求链路追踪 ID
  duration?: number;   // 耗时 (ms)
  userId?: string;     // 用户标识
  module?: string;     // 模块名
  [key: string]: unknown;
}
```

日志格式（JSON Lines）：
```json
{"level":"info","ts":"2026-06-17T10:00:00.000Z","traceId":"abc123","module":"resume:parse","msg":"resume parsed","duration":234,"userId":"user1"}
```

### 2. 前端埋点 (`shared/utils/analytics.ts`)

```typescript
// 埋点事件定义
type AnalyticsEvent =
  | { type: 'page_view'; page: string }
  | { type: 'resume_upload'; format: string; fileSize: number }
  | { type: 'jd_parse'; source: 'paste' | 'upload' }
  | { type: 'match_analysis'; score: number }
  | { type: 'star_rewrite'; sectionCount: number }
  | { type: 'interview_coach_start'; hasJd: boolean }
  | { type: 'interview_coach_end'; messageCount: number }
  | { type: 'transcript_upload'; source: 'text' | 'voice' }
  | { type: 'export'; format: 'pdf' | 'docx' | 'md' }
  | { type: 'error'; message: string; stack?: string };

// 上报 API
function track(event: AnalyticsEvent): void;
```

上报方式：`POST /api/analytics/track` (fire-and-forget, `navigator.sendBeacon`)

### 3. 后台统计 (`app/admin/` + `server/analytics/`)

```
GET /api/admin/analytics/overview    # 核心指标概览
GET /api/admin/analytics/events      # 事件明细（支持时间范围、类型筛选）
GET /api/admin/analytics/funnel      # 转化漏斗（上传→分析→改写→导出）
```

核心指标：
- DAU（日活跃用户）
- 简历上传量
- JD 解析量
- 匹配分析完成量
- STAR 改写完成量
- 面试模拟会话量
- 面经上传量
- 导出量（按格式）
- 错误率
- 功能转化漏斗

### 新增/修改文件

```
server/logger.ts                     # 新增：统一日志
server/analytics/store.ts            # 新增：埋点事件存储
server/analytics/queries.ts          # 新增：统计查询
shared/utils/analytics.ts            # 新增：前端埋点 SDK
app/api/analytics/track/route.ts     # 新增：埋点上报 API
app/api/admin/analytics/route.ts     # 新增：统计查询 API
```

### Prisma Schema 变更

```
model AnalyticsEvent {
  id        String   @id @default(cuid())
  type      String
  userId    String?
  sessionId String?
  page      String?
  data      String   // JSON
  createdAt DateTime @default(now())
  
  @@index([type])
  @@index([createdAt])
  @@index([userId])
}
```

## 测试要求

| 类型 | 覆盖目标 | 关键用例 |
|------|----------|----------|
| 单元测试 | logger / analytics 模块 ≥80% | 日志格式化、事件上报、统计查询 |
| 集成测试 | analytics track API | 上报→存储→查询 |
| 性能测试 | 日志写入 | 1000次写入 ≤100ms，不影响主流程 |

## 验收检查清单

- [ ] 后端所有 API 调用有 traceId
- [ ] 错误日志包含完整错误栈
- [ ] 前端关键操作有埋点上报
- [ ] 后台统计面板展示核心指标
- [ ] 日志不影响正常请求性能
- [ ] `pnpm ts-check && pnpm lint && pnpm test` 全绿