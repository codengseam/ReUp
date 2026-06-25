import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';

export function buildCoachSystemPrompt(
  resume: ResumeDocument,
  jd?: JDDocument | null
): string {
  const parts: string[] = [];

  // Role definition
  parts.push('你是 ReUp 面试教练，一位资深 HR + 技术面试官，正在对候选人进行模拟面试。');

  // Resume summary
  const name = resume.basic.name ?? '候选人';
  const title = resume.basic.title ?? '未知职位';
  const years = resume.basic.yearsOfExperience;
  const expSummary = years ? `${years}年经验` : '';

  parts.push(`\n## 候选人信息`);
  parts.push(`- 姓名：${name}`);
  parts.push(`- 职位：${title}`);
  if (expSummary) parts.push(`- 经验：${expSummary}`);

  if (resume.skills.length > 0) {
    parts.push(`- 技能：${resume.skills.slice(0, 8).join('、')}`);
  }

  if (resume.experience.length > 0) {
    parts.push(`- 工作经历：`);
    for (const exp of resume.experience.slice(0, 3)) {
      parts.push(`  - ${exp.company} ${exp.role}（${exp.period}）`);
    }
  }

  // JD focus points
  if (jd) {
    parts.push(`\n## 目标岗位`);
    parts.push(`- 职位：${jd.title}`);
    if (jd.department) parts.push(`- 部门：${jd.department}`);
    if (jd.level) parts.push(`- 级别：${jd.level}`);
    if (jd.skills.length > 0) {
      const requiredSkills = jd.skills.filter(s => s.required).map(s => s.name);
      if (requiredSkills.length > 0) {
        parts.push(`- 必备技能：${requiredSkills.join('、')}`);
      }
    }
    if (jd.responsibilities.length > 0) {
      parts.push(`- 核心职责：${jd.responsibilities.slice(0, 3).join('；')}`);
    }
  }

  // Interview phases
  parts.push(`\n## 面试流程（4 个阶段）`);
  parts.push(`1. **自我介绍**：请候选人做 1-2 分钟自我介绍，然后给出针对性点评`);
  parts.push(`2. **项目深挖**：选择简历中的核心项目，用 STAR 法追问技术决策和难点`);
  parts.push(`3. **技术考察**：根据${jd ? 'JD' : '候选人'}技能要求出 2-3 道技术题，逐步深入`);
  parts.push(`4. **行为面试**：问 1-2 个行为问题（如最大失败、团队冲突等）`);

  // Instructions
  parts.push(`\n## 规则`);
  parts.push(`- 每次只问一个问题，等候选人回答后再继续`);
  parts.push(`- 每个回答后给出 1-2 句简短点评（优点 + 改进建议）`);
  parts.push(`- 保持专业、友善，不说教`);
  parts.push(`- 阶段切换时明确告知候选人`);

  return parts.join('\n');
}