# `src/lib/resume/__fixtures__/` — Public Synthetic Test Fixtures

All files in this directory are **fully synthetic public data**. They are
checked into the public repo and contain no real personal information (no
real names, phone numbers, email addresses, employer names, or work
history).

This replaces the old `data/user-samples/` and `data/resume-eval/`
directories, which were git-ignored (see `.gitignore`) because they
contained the maintainer's real personal data.

## Layout

```
__fixtures__/
├── resume/
│   └── sample.md              # Generic resume fixture for parser/matcher/ats
│                              # unit + integration tests. Used by
│                              # parser-md.test.ts, parser-pdf.test.ts,
│                              # parser-text-fixtures.test.ts, ats.test.ts,
│                              # matcher.test.ts, and
│                              # ParsePreview.e2e.test.tsx.
└── ats-bench/
    ├── fake-01-sdet.json
    ├── fake-02-frontend.json
    ├── fake-03-backend.json
    ├── fake-04-fullstack.json
    ├── fake-05-mobile.json
    ├── fake-06-devops.json
    ├── fake-07-data.json
    ├── fake-08-ml.json
    ├── fake-09-product.json
    ├── fake-10-security.json
    └── fake-11-junior-sdet.json
                              # ATS benchmark fixtures. Loaded by
                              # ats.benchmark.test.ts via FIXTURE_DIR.
```

## Schema (ats-bench)

```json
{
  "id": "fake-NN-role",
  "source": "fully synthetic — public fixture, no real personal data",
  "resume": "<full markdown resume text>",
  "jd": "<target job description text>",
  "expectedTopKeywords": ["python", "pytest", "mysql"],
  "expectedMinCoverage": 60
}
```

- `id`: unique fixture id (`fake-NN-<role>`)
- `resume`: full markdown resume, no real personal data
- `jd`: target job description
- `expectedTopKeywords`: terms that should appear in the top-K TF extraction
- `expectedMinCoverage`: minimum pass threshold for `computeAtsCoverage`

## Naming

- The `fake-` prefix makes it visually obvious the data is synthetic.
- Persona names inside fixtures are clearly placeholder Chinese names
  (张辰 / 王林 / 李航 / 赵敏 / 陈昊 / 刘洋 / 黄静 / 周翔 / 吴婷 / 孙鹏 /
   示例候选人 K) plus obviously-fake phone numbers (`000-0000-0000`) and
  emails (`example@example.com`).

## Run

```bash
pnpm test src/lib/resume
pnpm benchmark:ats
```

## Maintenance rules

1. **Never** replace any file in this directory with real personal data.
2. If a new test needs a fixture, **add** a new `fake-NN-*.json` (or
   extend `sample.md`) rather than introducing a personal-data fixture.
3. The `source` field should always read
   `"fully synthetic — public fixture, no real personal data"`.
