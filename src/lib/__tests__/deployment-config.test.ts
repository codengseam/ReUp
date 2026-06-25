// src/lib/__tests__/deployment-config.test.ts
// Deployment config consistency test.
//
// Root cause of the ModelScope hang (2026-06-25): ModelScope Spaces build from
// the file named `Dockerfile` and probe port 7860. The Dockerfile defaulted to
// port 5000, so the health check never connected and the deployment hung
// indefinitely. ms_deploy.json environment_variables were not applied at runtime
// (ModelScope Docker Studio beta limitation), so the Dockerfile ENV defaults
// are the only reliable configuration source for ModelScope.
//
// This test guards against regression by asserting:
//   1. Dockerfile defaults to port 7860 (ModelScope requirement)
//   2. Dockerfile defaults data paths to /mnt/workspace (ModelScope persistence)
//   3. fly.toml and docker-compose.yml override port to 5000 (runtime env)
//   4. ms_deploy.json declares port 7860
//   5. No separate Dockerfile.modelscope exists (single Dockerfile)
//   6. All health checks use /api/health

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// vitest runs from the project root, so process.cwd() is /workspace
const ROOT = process.cwd();

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

/** Extract the default value from `ARG NAME=default` lines. */
function argDefault(dockerfile: string, name: string): string | null {
  const re = new RegExp(`^ARG\\s+${name}=(\\S+)`, 'm');
  const m = dockerfile.match(re);
  return m ? m[1] : null;
}

/** Extract all `ENV KEY=value` lines (last write wins, like Docker). */
function envValue(dockerfile: string, key: string): string | null {
  const re = new RegExp(`^ENV\\s+${key}=(\\S+)`, 'gm');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(dockerfile)) !== null) {
    last = m[1];
  }
  return last;
}

describe('deployment config consistency', () => {
  const dockerfile = readFile('Dockerfile');

  describe('Dockerfile — ModelScope-compatible defaults', () => {
    it('sets ENV PORT to 7860', () => {
      const port = envValue(dockerfile, 'PORT');
      expect(port).toBe('7860');
    });

    it('EXPOSE is 7860', () => {
      expect(dockerfile).toMatch(/^EXPOSE\s+7860\s*$/m);
    });

    it('HEALTHCHECK probes port 7860', () => {
      // HEALTHCHECK CMD uses ${PORT} (resolves to 7860 at runtime) or hardcodes 7860
      expect(dockerfile).toMatch(
        /curl.*(?:7860|\$\{PORT\}).*\/api\/health/
      );
    });

    it('defaults LOOP_ENGINEERING_DB to /mnt/workspace (ModelScope persistence)', () => {
      const db = envValue(dockerfile, 'LOOP_ENGINEERING_DB');
      expect(db).toBe('/mnt/workspace/loop-engineering.sqlite');
    });

    it('defaults HF_HOME to /mnt/workspace (ModelScope persistence)', () => {
      const hf = envValue(dockerfile, 'HF_HOME');
      expect(hf).toBe('/mnt/workspace/.cache/hub');
    });

    it('defaults TMPDIR to /mnt/workspace (ModelScope persistence)', () => {
      const tmp = envValue(dockerfile, 'TMPDIR');
      expect(tmp).toBe('/mnt/workspace/.cache/tmp');
    });

    it('does NOT set USER reup (root required for /mnt/workspace writes)', () => {
      // ModelScope mounts /mnt/workspace as root-owned; a non-root USER
      // cannot mkdir inside it, causing entrypoint failure.
      expect(dockerfile).not.toMatch(/^USER\s+reup\s*$/m);
    });
  });

  describe('fly.toml — runtime override to port 5000', () => {
    const fly = readFile('fly.toml');

    it("sets PORT = '5000'", () => {
      expect(fly).toMatch(/PORT\s*=\s*['"]5000['"]/);
    });

    it('sets internal_port = 5000', () => {
      expect(fly).toMatch(/internal_port\s*=\s*5000/);
    });

    it("overrides LOOP_ENGINEERING_DB to /app/data", () => {
      expect(fly).toMatch(
        /LOOP_ENGINEERING_DB\s*=\s*['"]\/app\/data\/loop-engineering\.sqlite['"]/
      );
    });

    it("overrides HF_HOME to /app/.cache", () => {
      expect(fly).toMatch(/HF_HOME\s*=\s*['"]\/app\/\.cache\/hub['"]/);
    });

    it('health check path is /api/health', () => {
      expect(fly).toMatch(/path\s*=\s*['"]\/api\/health['"]/);
    });
  });

  describe('docker-compose.yml — runtime override to port 5000', () => {
    const compose = readFile('docker-compose.yml');

    it('sets PORT: "5000"', () => {
      expect(compose).toMatch(/PORT:\s*["']?5000["']?/);
    });

    it('maps container port 5000', () => {
      expect(compose).toMatch(/:\s*5000/);
    });

    it('sets LOOP_ENGINEERING_DB to /app/data', () => {
      expect(compose).toMatch(
        /LOOP_ENGINEERING_DB:\s*\/app\/data\/loop-engineering\.sqlite/
      );
    });

    it('sets HF_HOME to /app/.cache', () => {
      expect(compose).toMatch(/HF_HOME:\s*\/app\/\.cache\/hub/);
    });

    it('health check uses /api/health', () => {
      expect(compose).toMatch(/\/api\/health/);
    });
  });

  describe('ms_deploy.json — ModelScope Space config', () => {
    const ms = JSON.parse(readFile('ms_deploy.json')) as {
      port: number;
      environment_variables: Array<{ name: string; value: string }>;
    };

    it('declares port 7860', () => {
      expect(ms.port).toBe(7860);
    });

    it('declares PORT=7860 in environment_variables', () => {
      const portEnv = ms.environment_variables.find(e => e.name === 'PORT');
      expect(portEnv?.value).toBe('7860');
    });

    it('declares LOOP_ENGINEERING_DB at /mnt/workspace', () => {
      const dbEnv = ms.environment_variables.find(
        e => e.name === 'LOOP_ENGINEERING_DB'
      );
      expect(dbEnv?.value).toBe('/mnt/workspace/loop-engineering.sqlite');
    });
  });

  describe('single Dockerfile (no Dockerfile.modelscope)', () => {
    it('Dockerfile.modelscope does not exist (consolidated)', () => {
      // ModelScope only reads `Dockerfile`. A separate Dockerfile.modelscope
      // is never used and causes confusion. The single Dockerfile must handle
      // all deployment targets via runtime env var overrides.
      expect(existsSync(resolve(ROOT, 'Dockerfile.modelscope'))).toBe(false);
    });
  });
});
