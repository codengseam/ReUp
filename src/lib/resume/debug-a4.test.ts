import { describe, it, expect } from 'vitest';
import { parseTextResume } from './parser-text';

describe('debug A4', () => {
  it('A4 debug', () => {
    const input = [
      '## 专业技能',
      '- **数据库**：MySQL、SQL优化、一致性对账',
      '- **编程语言**：Java（了解）、Python（熟悉）',
    ].join('\n');
    const doc = parseTextResume(input);
    console.log('DEBUG A4 skills:', JSON.stringify(doc.skills));
    console.log('DEBUG A4 experience:', JSON.stringify(doc.experience));
    console.log('DEBUG A4 basic:', JSON.stringify(doc.basic));
    expect(doc.skills.length).toBeGreaterThan(0);
  });
});
