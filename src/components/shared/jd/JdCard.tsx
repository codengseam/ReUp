'use client';

import { Building2, GraduationCap, MapPin, Target, Wallet, Briefcase, CheckCircle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { JDDocument } from '@/features/jd/types';

interface Props {
  jd: JDDocument;
}

export function JdCard({ jd }: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground">{jd.title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {jd.department && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {jd.department}
              </span>
            )}
            {jd.level && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <GraduationCap className="w-3 h-3" />
                {jd.level}
              </span>
            )}
            {jd.location && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {jd.location}
              </span>
            )}
          </div>
        </div>
        {jd.salary && (jd.salary.min || jd.salary.max) && (
          <div className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700">
              {jd.salary.currency ?? '¥'}
              {jd.salary.min ? `${jd.salary.min / 1000}k` : '?'}
              {' - '}
              {jd.salary.max ? `${jd.salary.max / 1000}k` : '?'}
            </span>
          </div>
        )}
      </div>

      {/* Hard Requirements */}
      {jd.hardRequirements.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Target className="w-3 h-3" />
            硬性要求
          </div>
          <div className="space-y-1.5">
            {jd.hardRequirements.map((req, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] text-muted-foreground font-medium uppercase">{req.category}</span>
                  <span className="text-[11px] text-foreground truncate">{req.description}</span>
                </div>
                <Badge variant={req.priority === 'must' ? 'destructive' : 'secondary'} className="text-[9px] px-1.5 py-0 shrink-0">
                  {req.priority === 'must' ? '必须' : '优先'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responsibilities */}
      {jd.responsibilities.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Briefcase className="w-3 h-3" />
            岗位职责
          </div>
          <ul className="space-y-1">
            {jd.responsibilities.map((r, idx) => (
              <li key={idx} className="text-[11px] text-foreground leading-relaxed pl-3 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills Table */}
      {jd.skills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <CheckCircle className="w-3 h-3" />
            技能要求
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left text-[9px] font-semibold text-muted-foreground uppercase px-2.5 py-1.5">技能</th>
                  <th className="text-left text-[9px] font-semibold text-muted-foreground uppercase px-2.5 py-1.5">水平</th>
                  <th className="text-left text-[9px] font-semibold text-muted-foreground uppercase px-2.5 py-1.5">要求</th>
                </tr>
              </thead>
              <tbody>
                {jd.skills.map((skill, idx) => (
                  <tr key={idx} className="border-b border-border last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[10px] font-medium text-foreground">{skill.name}</td>
                    <td className="px-2.5 py-1.5">
                      <span className="text-[10px] text-muted-foreground">{skill.level}</span>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <Badge variant={skill.required ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {skill.required ? '必须' : '加分'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Focus Points */}
      {jd.focusPoints && jd.focusPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Zap className="w-3 h-3" />
            面试关注点
          </div>
          <div className="space-y-1.5">
            {jd.focusPoints.map((fp, idx) => (
              <div key={idx} className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-border bg-muted/30">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  fp.weight === 'high' ? 'bg-red-500' : fp.weight === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-foreground">{fp.dimension}</span>
                    <Badge variant="secondary" className="text-[8px] px-1 py-0">
                      {fp.weight === 'high' ? '高' : fp.weight === 'medium' ? '中' : '低'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{fp.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}