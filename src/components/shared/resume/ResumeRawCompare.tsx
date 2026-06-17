'use client';

import { Briefcase, FolderGit2, GraduationCap, User, Wrench } from 'lucide-react';
import type { ResumeDocument } from '@/features/resume/types';

interface Props {
  rawText: string;
  resume: ResumeDocument;
}

export function ResumeRawCompare({ rawText, resume }: Props) {
  return (
    <div className="grid grid-cols-2 gap-0 min-h-0">
      {/* Left: Raw Text */}
      <div className="border-r border-border overflow-hidden flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            原始文本
          </p>
        </div>
        <div className="overflow-auto p-4 flex-1 min-h-0">
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground font-mono">
            {rawText}
          </pre>
        </div>
      </div>

      {/* Right: Structured Cards */}
      <div className="overflow-auto flex-1 min-h-0">
        <div className="p-4 space-y-4">
          <BasicSection resume={resume} />
          <ExperienceSection resume={resume} />
          <ProjectsSection resume={resume} />
          <SkillsSection resume={resume} />
          <EducationSection resume={resume} />
        </div>
      </div>
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

function BasicSection({ resume }: { resume: ResumeDocument }) {
  const { basic } = resume;
  const contactEntries = basic.contact ? Object.entries(basic.contact) : [];
  const hasContent =
    Boolean(basic.name) || Boolean(basic.title) ||
    typeof basic.yearsOfExperience === 'number' || contactEntries.length > 0;

  if (!hasContent) return null;

  return (
    <div>
      <SectionLabel icon={<User className="w-3 h-3" />} title="个人信息" />
      <div className="grid grid-cols-2 gap-1.5">
        {basic.name && <InfoItem label="姓名" value={basic.name} />}
        {basic.title && <InfoItem label="求职意向" value={basic.title} />}
        {basic.city && <InfoItem label="城市" value={basic.city} />}
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
  return (
    <div>
      <SectionLabel icon={<Briefcase className="w-3 h-3" />} title={`工作经历 (${resume.experience.length})`} />
      {resume.experience.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">未解析到工作经历</p>
      ) : (
        <div className="space-y-2">
          {resume.experience.map((exp, idx) => (
            <div key={`${exp.company}-${idx}`} className="pl-3 py-2.5 pr-3 border-l-2 border-primary bg-muted/40 rounded-r-lg">
              <p className="text-[12px] font-semibold text-foreground">{exp.company}</p>
              <p className="text-[11px] text-muted-foreground">{exp.role}</p>
              {exp.period && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{exp.period}</p>}
              {exp.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {exp.bullets.map((b, i) => (
                    <li key={i} className="text-[11px] text-foreground leading-relaxed pl-2.5 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsSection({ resume }: { resume: ResumeDocument }) {
  return (
    <div>
      <SectionLabel icon={<FolderGit2 className="w-3 h-3" />} title={`项目经历 (${resume.projects.length})`} />
      {resume.projects.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">未解析到项目经历</p>
      ) : (
        <div className="space-y-2">
          {resume.projects.map((proj, idx) => (
            <div key={`${proj.name}-${idx}`} className="pl-3 py-2.5 pr-3 border-l-2 border-primary/40 bg-muted/40 rounded-r-lg">
              <p className="text-[12px] font-semibold text-foreground">{proj.name}</p>
              {proj.period && proj.period !== 'undefined' && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{proj.period}</p>
              )}
              {proj.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {proj.bullets.map((b, i) => (
                    <li key={i} className="text-[11px] text-foreground leading-relaxed pl-2.5 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsSection({ resume }: { resume: ResumeDocument }) {
  return (
    <div>
      <SectionLabel icon={<Wrench className="w-3 h-3" />} title={`技能 (${resume.skills.length})`} />
      {resume.skills.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">未解析到技能</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {resume.skills.map((s) => (
            <span key={s} className="px-2 py-0.5 bg-primary-container text-accent-foreground rounded text-[10px] font-medium">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EducationSection({ resume }: { resume: ResumeDocument }) {
  return (
    <div>
      <SectionLabel icon={<GraduationCap className="w-3 h-3" />} title={`教育经历 (${resume.education.length})`} />
      {resume.education.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">未解析到教育经历</p>
      ) : (
        <ul className="space-y-1.5">
          {resume.education.map((edu, idx) => (
            <li key={`${edu.school}-${idx}`} className="text-[11px] text-foreground">
              <span className="font-medium">{edu.school}</span>
              {edu.degree && <span className="text-muted-foreground"> · {edu.degree}</span>}
              {edu.period && <span className="text-muted-foreground"> · {edu.period}</span>}
              {edu.notes && edu.notes.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {edu.notes.map((n, i) => (
                    <li key={i} className="text-[10px] text-muted-foreground leading-relaxed pl-2.5 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[6px]">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
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