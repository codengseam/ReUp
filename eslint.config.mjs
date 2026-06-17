import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

// ============================================================================
// 项目结构约定 (Project Structure Convention)
// 详见: .trae/rules/project_rules.md
// ============================================================================

// --- R1: 禁止客户端代码导入 server/ 目录 ---
// server/ 中的代码只能在 Node.js 运行时使用（LLM、DB、RAG 等）。
// 页面组件、客户端组件、hooks 不得直接导入 server/。
const serverImportRestriction = {
  patterns: [
    {
      group: ['@/server/*', '@/server'],
      message:
        '❌ 禁止从客户端代码导入 @/server/。server/ 模块仅限 API Route 使用。如需共享类型，请使用 @/shared/types/。',
    },
  ],
};

// --- R2: 禁止从旧 lib/ 路径导入（已迁移到新结构） ---
const legacyLibWarning = {
  patterns: [
    {
      group: [
        '@/lib/llm-client',
        '@/lib/db',
        '@/lib/rag',
        '@/lib/rag/*',
        '@/lib/embedder',
        '@/lib/reranker',
        '@/lib/vector-store',
        '@/lib/intent-classifier',
        '@/lib/error-classifier',
        '@/lib/knowledge-base',
        '@/lib/rag-init',
        '@/lib/category-rules',
        '@/lib/skills-loader',
        '@/lib/admin-auth',
        '@/lib/admin-knowledge',
        '@/lib/admin-stats',
        '@/lib/conversation-store',
        '@/lib/feedback-store',
        '@/lib/server-config',
        '@/lib/runtime-config',
        '@/lib/sse-client',
        '@/lib/url-safety',
        '@/lib/typo-correction',
        '@/lib/models',
        '@/lib/utils',
        '@/lib/prompts/blocks',
        '@/lib/chat/resume-context',
        '@/lib/resume/*',
        '@/lib/resume',
        '@/lib/jd/*',
        '@/lib/jd',
        '@/lib/review/*',
        '@/lib/review',
        '@/lib/offer/*',
        '@/lib/offer',
      ],
      message:
        '⚠️ 此模块已迁移。请使用新路径：server/ → @/server/、features/ → @/features/、shared/ → @/shared/。详见 .trae/rules/project_rules.md。',
    },
  ],
};

// --- 通用 AST 限制 ---
const syntaxRules = [
  {
    selector: 'JSXOpeningElement[name.name="head"]',
    message:
      '禁止使用 head 标签，优先使用 metadata。三方 CSS、字体等资源可以在 globals.css 中顶部通过 @import 引入或者使用 next/font；preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入；json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld',
  },
];

const nextConfigRestrictedSyntaxRules = [
  {
    selector:
      'Property[key.name=/^(root|outputFileTracingRoot)$/] > Literal[value=/^\\//]',
    message:
      '禁止在 next.config 中写死绝对路径，请改用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。',
  },
];

// ============================================================================
// 最终配置
// ============================================================================

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-syntax': ['error', ...syntaxRules],
      // R3: 单文件不超过 300 行（warn，不阻塞开发）
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // R1: 客户端代码禁止导入 server/
  // 页面组件 (app/ 非 api/)、UI 组件、hooks 是客户端代码，不能导入 server/
  {
    files: [
      'src/app/**/page.tsx',
      'src/app/**/layout.tsx',
      'src/app/**/_components/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', serverImportRestriction],
    },
  },
  // R2: 禁止使用旧 lib/ 路径
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['warn', legacyLibWarning],
    },
  },
  // R4: API Route 不超过 80 行
  {
    files: ['src/app/api/**/route.ts'],
    rules: {
      'max-lines': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['next.config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...nextConfigRestrictedSyntaxRules],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'server.js',
    'dist/**',
    'scripts/**/*.js',
    '.trae/**',
    '.cozeproj/**',
    'agent-skills/**',
  ]),
]);

export default eslintConfig;
