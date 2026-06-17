# AI Chat Scaffold — 示例：客服场景

本目录演示如何基于 AI Chat 脚手架框架快速搭建一个**客服知识库问答**应用。

## 场景描述

一个 SaaS 产品的客服机器人，基于产品文档知识库回答用户问题。

## 搭建步骤

### 1. 准备知识库文档

将产品文档（FAQ、使用指南、API 文档等）放入 `data/book-sources/customer-service-docs/` 目录，按 markdown 格式组织。

### 2. 配置 Skill

在 `data/skills.json` 中注册客服相关的 Skill：

```json
{
  "version": 2,
  "skills": [
    {
      "id": "faq-router",
      "name": "FAQ 路由",
      "category": "support",
      "trigger": "常见问题",
      "framework": "根据用户问题匹配 FAQ 分类，给出标准答案",
      "steps": ["识别问题分类", "匹配 FAQ 条目", "返回标准答案"]
    }
  ],
  "hotQueries": [
    { "id": 1, "text": "如何重置密码？", "category": "account" },
    { "id": 2, "text": "如何升级套餐？", "category": "billing" }
  ],
  "quickEntries": [],
  "suggestions": [
    "如何重置密码？",
    "如何升级套餐？",
    "如何导出数据？"
  ]
}
```

### 3. 自定义 System Prompt

在管理后台 → 提示词管理 → 系统主提示词 中配置：

```
你是 Acme SaaS 的客服助手。你的职责是基于产品文档知识库回答用户问题。

## 你的身份
- 角色：客服知识助手
- 专长：产品使用咨询、故障排查、账号管理

## 回答原则
1. 优先依据知识库内容回答
2. 引用文档时标注出处
3. 无法回答时引导用户联系人工客服
```

### 4. 构建向量索引

```bash
pnpm run build-index
```

### 5. 启动应用

```bash
pnpm dev
```

## 文件清单

```
examples/customer-service/
├── README.md           # 本文件
├── skills.json         # Skill 配置示例
└── system-prompt.txt   # System Prompt 示例
```
