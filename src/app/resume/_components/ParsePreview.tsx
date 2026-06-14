'use client';

import { Briefcase, FolderGit2, GraduationCap, Pencil, User, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ResumeDocument } from '@/lib/resume/types';

interface ParsePreviewProps {
  resume: ResumeDocument;
}

// H3: section-by-section preview of a parsed ResumeDocument.
// Each sub-section has a "edit" stub button (per spec, full edit UI is deferred).
export function ParsePreview({ resume }: ParsePreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>4. 已解析的简历</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <BasicSection resume={resume} />
        <ExperienceSection resume={resume} />
        <ProjectsSection resume={resume} />
        <SkillsSection resume={resume} />
        <EducationSection resume={resume} />
      </CardContent>
    </Card>
  );
}

function BasicSection({ resume }: { resume: ResumeDocument }) {
  const { basic } = resume;
  const contactEntries = basic.contact ? Object.entries(basic.contact) : [];
  const hasContent =
    Boolean(basic.name) ||
    Boolean(basic.title) ||
    typeof basic.yearsOfExperience === 'number' ||
    contactEntries.length > 0;

  return (
    <SubSection icon={<User className="w-3.5 h-3.5" />} title="个人信息">
      {!hasContent ? (
        <Empty text="未识别到个人信息字段。" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {basic.name && <Field label="姓名" value={basic.name} />}
          {basic.title && <Field label="求职意向" value={basic.title} />}
          {typeof basic.yearsOfExperience === 'number' && (
            <Field label="工作经验" value={`${basic.yearsOfExperience} 年`} />
          )}
          {contactEntries.map(([k, v]) => (
            <Field key={k} label={k} value={v} />
          ))}
        </div>
      )}
    </SubSection>
  );
}

function ExperienceSection({ resume }: { resume: ResumeDocument }) {
  return (
    <SubSection icon={<Briefcase className="w-3.5 h-3.5" />} title={`工作经历 (${resume.experience.length})`}>
      {resume.experience.length === 0 ? (
        <Empty text="未识别到工作经历。" />
      ) : (
        <ul className="space-y-2.5">
          {resume.experience.map((e, idx) => (
            <li
              key={`${e.company}-${idx}`}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {e.company} · {e.role}
                  </p>
                  {e.period && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{e.period}</p>
                  )}
                </div>
                <EditStub />
              </div>
              {e.bullets.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs text-foreground space-y-1 marker:text-muted-foreground">
                  {e.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </SubSection>
  );
}

function ProjectsSection({ resume }: { resume: ResumeDocument }) {
  return (
    <SubSection icon={<FolderGit2 className="w-3.5 h-3.5" />} title={`项目经历 (${resume.projects.length})`}>
      {resume.projects.length === 0 ? (
        <Empty text="未识别到项目经历。" />
      ) : (
        <ul className="space-y-2.5">
          {resume.projects.map((p, idx) => (
            <li
              key={`${p.name}-${idx}`}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.period && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.period}</p>
                  )}
                </div>
                <EditStub />
              </div>
              {p.bullets.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs text-foreground space-y-1 marker:text-muted-foreground">
                  {p.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </SubSection>
  );
}

function SkillsSection({ resume }: { resume: ResumeDocument }) {
  return (
    <SubSection icon={<Wrench className="w-3.5 h-3.5" />} title={`技能 (${resume.skills.length})`}>
      {resume.skills.length === 0 ? (
        <Empty text="未识别到技能标签。" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
        </div>
      )}
    </SubSection>
  );
}

function EducationSection({ resume }: { resume: ResumeDocument }) {
  return (
    <SubSection icon={<GraduationCap className="w-3.5 h-3.5" />} title={`教育经历 (${resume.education.length})`}>
      {resume.education.length === 0 ? (
        <Empty text="未识别到教育经历。" />
      ) : (
        <ul className="space-y-1.5">
          {resume.education.map((e, idx) => (
            <li key={`${e.school}-${idx}`} className="text-xs text-foreground">
              <span className="font-medium">{e.school}</span>
              {e.degree && <span className="text-muted-foreground"> · {e.degree}</span>}
              {e.period && <span className="text-muted-foreground"> · {e.period}</span>}
            </li>
          ))}
        </ul>
      )}
    </SubSection>
  );
}

function SubSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xs text-foreground mt-0.5 break-all">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

// Edit affordance stub. Spec calls for an "edit affordance" without
// mandating full inline editing in P0.
function EditStub() {
  return (
    <button
      type="button"
      aria-label="编辑（占位）"
      title="编辑（占位，后续迭代实现）"
      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors shrink-0"
    >
      <Pencil className="w-3 h-3" />
    </button>
  );
}
