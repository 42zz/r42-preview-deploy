import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertIndexHtml, sha256Hex, zipDirectory } from '../src/zip';
import { readGithubMeta } from '../src/meta';
import { pollUntilDone } from '../src/api';

describe('zipDirectory / assertIndexHtml', () => {
  it('index.html が無いと失敗する', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r42-action-'));
    try {
      writeFileSync(join(dir, 'about.html'), '<p>x</p>');
      expect(() => assertIndexHtml(dir)).toThrow(/index\.html/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ディレクトリを ZIP 化し SHA-256 を計算できる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r42-action-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<html></html>');
      mkdirSync(join(dir, 'css'));
      writeFileSync(join(dir, 'css', 'a.css'), 'body{}');
      assertIndexHtml(dir);
      const zip = zipDirectory(dir);
      expect(zip.byteLength).toBeGreaterThan(20);
      expect(sha256Hex(zip)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('readGithubMeta', () => {
  it('GITHUB_* からメタデータを組み立て、refs/heads を剥がす', () => {
    const meta = readGithubMeta({
      GITHUB_REPOSITORY: 'acme/site',
      GITHUB_REF: 'refs/heads/develop',
      GITHUB_SHA: 'abcdef0123456789',
      GITHUB_ACTOR: 'alice',
      GITHUB_WORKFLOW: 'Deploy',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_NUMBER: '7',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_EVENT_NAME: 'push',
      R42_COMMIT_MESSAGE: 'Fix header\n\nbody',
    });
    expect(meta).toEqual({
      repository: 'acme/site',
      branch: 'develop',
      commitSha: 'abcdef0123456789',
      commitMessage: 'Fix header\n\nbody',
      actor: 'alice',
      workflow: 'Deploy',
      runId: '12345',
      runNumber: 7,
      runAttempt: 2,
      eventName: 'push',
    });
  });
});

describe('pollUntilDone', () => {
  it('ready になるまでポーリングする', async () => {
    let calls = 0;
    const client = {
      getDeployment: async () => {
        calls += 1;
        return {
          deployment: {
            id: 'd1',
            status: calls < 3 ? 'processing' : 'ready',
            failureReason: null,
            versionNumber: calls < 3 ? null : 1,
            isActive: true,
            urls: null,
          },
        };
      },
    };
    const sleeps: number[] = [];
    const result = await pollUntilDone(client as never, 'd1', {
      intervalMs: 1,
      timeoutMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.status).toBe('ready');
    expect(calls).toBe(3);
    expect(sleeps.length).toBe(2);
  });
});
