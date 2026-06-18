#!/usr/bin/env node
/**
 * scripts/fix-categories.mjs
 *
 * 修正向量库的 category 分类:
 * 1. 文件级别统一 category (同一文件的所有 chunk 用同一个 category)
 * 2. 修正明显错误的归类 (源素材/职级详解/考察标准等)
 * 3. 精简 category 体系, 让每个分类见名知义
 *
 * 用法: node scripts/fix-categories.mjs
 * 输出: 原地覆盖 data/skill-vectors.json, 先备份 .bak
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VECTORS_FILE = path.join(ROOT, 'data', 'skill-vectors.json');

// ============================================================================
// 文件 → category 映射 (人工审核, 见名知义)
// ============================================================================
const FILE_TO_CATEGORY = {
  // === 大厂晋升指南 ===
  '晋升认知（重新理解+课程设计）.md': '晋升认知',
  '晋升入门（职级体系+晋升流程+晋升原则）.md': '晋升入门',
  '晋升逻辑（下一级别+晋升步骤）.md': '晋升逻辑',
  '职级对标（硬通货+天梯式职级）.md': '职级体系',
  '职级档次（工匠+指挥+导演）.md': '职级体系',
  '职级详解（职场新手+基础技术）.md': '职级体系',
  '职级详解（技术套路+子任务推进）.md': '职级体系',
  '职级详解（业务整体+小团队）.md': '职级体系',
  '职级详解（领域专家+多个团队）.md': '职级体系',
  '职级详解（跨领域整合+亲自导演）.md': '职级体系',
  '能力模型（4种复杂度+3个维度）.md': '能力模型',
  '晋升材料（常见误区+标准框架）.md': '晋升材料',
  '晋升陈述（演讲者+模拟面评）.md': '晋升陈述',
  '晋升答辩（问题类型+关键内容）.md': '晋升答辩',
  '提名词写作（易错点+写作要点）.md': '提名词写作',
  '积累方法（10000小时+海绵学习法）.md': '学习方法',
  '基础学习（工作相关）.md': '学习方法',
  '技术提升（深度+宽度+广度）.md': '学习方法',
  '成长规律（发展史+互联网落地）.md': '学习方法',
  '成长拆解（等级+技能+行动）.md': '学习方法',
  '学习闭环（Play+Teach学习法）.md': '学习方法',
  '源素材（书籍简介+章节目录）.md': '源素材',

  // === 面试现场 ===
  '全书总览（简介入口）.md': '面试概览',
  '内容简介（六大模块）.md': '面试概览',
  '目录总览（快速导航）.md': '面试概览',
  '面试方法论（真诚表达+能力价值）.md': '面试概览',
  '面试流程（招聘全流程）.md': '面试流程',
  '面试准备（STAR法则+BEI）.md': '面试准备',
  '面试禁忌（准备进入结束）.md': '面试准备',
  '面试答疑（问题答疑）.md': '面试答疑',
  '面试答疑（问答思考）.md': '面试答疑',
  '用人标准（好员工+素质模型）.md': '考察标准',
  '考察标准（编程能力+软性能力）.md': '考察标准',
  '考察标准（能力模型+面试地图）.md': '考察标准',
  '考核逻辑（问题意图+逻辑关系）.md': '考察标准',
  '换位思考（人才甄选+招聘过程）.md': '考察标准',
  '卡壳应对（归类问题+应对方法）.md': '考察标准',
  '隐性评估（兴趣爱好怎么讲）.md': '考察标准',
  '自我认知（提问意图+回答原则）.md': '自我认知',
  '项目价值（项目结果+推进作用）.md': '项目表达',
  '经历包装（找亮点+详历）.md': '简历经历',
  '简历优化（价值匹配+简历亮点）.md': '简历经历',
  '开场表达（自我介绍特效）.md': '自我介绍',
  '技术表达（表达方法+面试官视角）.md': '表达技巧',
  '回答策略（问题意图+简洁表达）.md': '表达技巧',
  '紧张应对（调整期待+提高能力）.md': '心态调整',
  '反向提问（安全范围+加分提问）.md': '反向提问',
  '职业选择（兴趣金字塔+选择原则）.md': '职业规划',
  '职业规划（当下愿景+发展模型）.md': '职业规划',
  '职业去向（角色划分+角色融合）.md': '职业规划',
  '跳槽判断（工作满意度）.md': '职业规划',
  '择业困惑（外企民企+管理技术线）.md': '职业规划',
  '薪资谈判（谈薪原则+薪水构成）.md': '薪资谈判',
};

function main() {
  console.log('=== fix-categories.mjs ===\n');
  const raw = fs.readFileSync(VECTORS_FILE, 'utf8');
  const data = JSON.parse(raw);

  // 备份
  fs.writeFileSync(VECTORS_FILE + '.bak', raw);

  let updated = 0;
  let skipped = 0;
  const errors = [];
  const oldCats = {};
  const newCats = {};

  for (const v of data.vectors) {
    try {
      const oldCat = JSON.parse(v.metadata).category || 'NONE';
      oldCats[oldCat] = (oldCats[oldCat] || 0) + 1;

      const newCat = FILE_TO_CATEGORY[v.filename];
      if (!newCat) {
        errors.push(`no category mapping for ${v.filename}`);
        skipped++;
        continue;
      }

      // 更新 metadata
      const meta = JSON.parse(v.metadata);
      meta.category = newCat;
      v.metadata = JSON.stringify(meta);

      newCats[newCat] = (newCats[newCat] || 0) + 1;
      updated++;
    } catch (err) {
      errors.push(`${v.filename}: ${err.message}`);
      skipped++;
    }
  }

  // 写回
  fs.writeFileSync(VECTORS_FILE, JSON.stringify(data));

  console.log('=== 修正结果 ===');
  console.log(`总 chunk: ${data.vectors.length}`);
  console.log(`成功更新: ${updated}`);
  console.log(`跳过: ${skipped}`);
  console.log(`\n旧 category 分布:`);
  Object.entries(oldCats).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}  ${k}`));
  console.log(`\n新 category 分布:`);
  Object.entries(newCats).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}  ${k}`));
  if (errors.length) {
    console.log(`\n错误 (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`  ${e}`));
  }
}

main();
