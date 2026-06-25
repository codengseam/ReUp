# resume-eval — ATS Eval Set

Eval set for `src/lib/resume/ats.ts` (Phase 4 P1, I2). 12 fixtures (≥ 10 required) covering QA + non-QA personas.

## Layout

`data/resume-eval/<id>.json` — one fixture per file.

## Schema

```json
{
  "id": "fe-01-senior-sdet",
  "source": "synthesized from data/user-samples/resume/简历.md",
  "resume": "<full markdown resume text>",
  "jd": "<target job description text>",
  "expectedTopKeywords": ["python", "pytest", "mysql"],
  "expectedMinCoverage": 60
}
```

- `id`: unique fixture id (`fe-NN-<role>`)
- `resume`: full markdown resume, ≥ 200 chars
- `jd`: target job description, ≥ 100 chars
- `expectedTopKeywords`: 3-8 terms that should appear in the top-K TF extraction of the JD
- `expectedMinCoverage`: integer 0-100, min pass threshold for `computeAtsCoverage`

## Personas

- fe-01..07: 5-year QA / SDET (fully synthetic)
- fe-08..10: junior/mid QA (fully synthetic)
- fe-11..12: backend / full-stack (fully synthetic)
- fe-11: senior backend (fully synthetic)
- fe-12: full-stack (fully synthetic)

## Run

```bash
pnpm benchmark:ats
```

Benchmark lives at `src/lib/resume/ats.benchmark.test.ts` (vitest spec).
