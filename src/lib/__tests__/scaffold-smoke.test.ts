import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

describe('scaffold 基础文件存在性', () => {
  const requiredFiles = [
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.override.yml',
    'Makefile',
    'scripts/docker-entrypoint.sh',
    'scripts/loop-install.sh',
    'scripts/loop-start.sh',
    'src/app/api/health/route.ts',
    'docs/scaffold.md',
  ];

  for (const f of requiredFiles) {
    it(`${f} exists`, () => {
      expect(existsSync(join(ROOT, f))).toBe(true);
    });
  }
});

describe('Dockerfile 关键元素', () => {
  const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');

  it('has multi-stage build', () => {
    expect(dockerfile).toMatch(/FROM .* AS deps/);
    expect(dockerfile).toMatch(/FROM .* AS builder/);
    expect(dockerfile).toMatch(/FROM .* AS runner/);
  });

  it('parameterizes APP_PORT', () => {
    expect(dockerfile).toMatch(/ARG APP_PORT=/);
  });

  it('runs as non-root user', () => {
    expect(dockerfile).toMatch(/appuser/);
  });

  it('has HEALTHCHECK', () => {
    expect(dockerfile).toMatch(/HEALTHCHECK/);
  });
});

describe('docker-compose 服务定义', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');

  it('declares a service', () => {
    expect(compose).toMatch(/^services:/m);
  });

  it('maps REUP_PORT', () => {
    expect(compose).toMatch(/\$\{REUP_PORT:-5000\}:5000/);
  });

  it('has healthcheck', () => {
    expect(compose).toMatch(/healthcheck:/);
  });
});
