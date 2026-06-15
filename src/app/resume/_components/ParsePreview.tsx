'use client';

import { Briefcase, FolderGit2, GraduationCap, Pencil, User, Wrench } from 'lucide-react';
import type { ResumeDocument } from '@/lib/resume/types';

interface ParsePreviewProps {
  resume: ResumeDocument;
}

export function ParsePreview({ resume }: ParsePreviewProps) {
  return (
    <div className="space-y-4">
      <div className="text-[12px] font-semibold text-foreground">已解析的简历</div>
      <BasicSection resume={resume} />
      <ExperienceSection resume={resume} />
      <ProjectsSection resume={resume} />
      <SkillsSection resume={resume} />
      <EducationSection resume={resume} />
    </div>
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

  if (!hasContent) return null;

  return (
    <div>
      <SectionLabel icon={<User className="w-3 h-3" />} title="个人信息" />
      <div className="grid grid-cols-3 gap-1.5">
        {basic.name && <InfoItem label="姓名" value={basic.name} />}
        {basic.title && <InfoItem label="求职意向" value={basic.title} />}
        {typeof basic.yearsOfExperience === 'number' && (
          <InfoItem label="工作年限" value={`${basic.yearsOfExperience} 年`} />
        )}
        {contactEntries.map(([k, v]) => (
          <InfoItem key={k} label={k} value={v} />
        ))}
      </div>
    </div>
  );
}

function ExperienceSection({ resume }: { resume: ResumeDocument }) {
  if (resume.experience.length === 0) return null;

  return (
    <div>
      <SectionLabel
        icon={<Briefcase className="w-3 h-3" />}
        title={`工作经历 (${resume.experience.length})`}
      />
      <div className="space-y-2">
        {resume.experience.map((e, idx) => (
          <div
            key={`${e.company}-${idx}`}
            className="pl-3 py-2.5 pr-3 border-l-2 border-primary bg-muted/40 rounded-r-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{e.company}</p>
                <p className="text-[11px] text-muted-foreground">{e.role}</p>
                {e.period && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{e.period}</p>
                )}
              </div>
              <EditStub />
            </div>
            {e.bullets.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {e.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-foreground leading-relaxed pl-2.5 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsSection({ resume }: { resume: ResumeDocument }) {
  if (resume.projects.length === 0) return null;

  return (
    <div>
      <SectionLabel
        icon={<FolderGit2 className="w-3 h-3" />}
        title={`项目经历 (${resume.projects.length})`}
      />
      <div className="space-y-2">
        {resume.projects.map((p, idx) => (
          <div
            key={`${p.name}-${idx}`}
            className="pl-3 py-2.5 pr-3 border-l-2 border-primary/40 bg-muted/40 rounded-r-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{p.name}</p>
                {p.period && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{p.period}</p>
                )}
              </div>
              <EditStub />
            </div>
            {p.bullets.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {p.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-foreground leading-relaxed pl-2.5 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillsSection({ resume }: { resume: ResumeDocument }) {
  if (resume.skills.length === 0) return null;

  return (
    <div>
      <SectionLabel icon={<Wrench className="w-3 h-3" />} title={`技能 (${resume.skills.length})`} />
      <div className="flex flex-wrap gap-1">
        {resume.skills.map((s) => (
          <span
            key={s}
            className="px-2 py-0.5 bg-primary-container text-accent-foreground rounded text-[10px] font-medium"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function EducationSection({ resume }: { resume: ResumeDocument }) {
  if (resume.education.length === 0) return null;

  return (
    <div>
      <SectionLabel
        icon={<GraduationCap className="w-3 h-3" />}
        title={`教育经历 (${resume.education.length})`}
      />
      <ul className="space-y-1">
        {resume.education.map((e, idx) => (
          <li key={`${e.school}-${idx}`} className="text-[11px] text-foreground">
            <span className="font-medium">{e.school}</span>
            {e.degree && <span className="text-muted-foreground"> · {e.degree}</span>}
            {e.period && <span className="text-muted-foreground"> · {e.period}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {icon}
      {title}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-2 border border-border/60 rounded-lg bg-muted/30">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-[12px] font-medium text-foreground mt-0.5 truncate">{value}</p>
    </div>
  );
}

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
