/**
 * GITHUB_* 環境変数から Deployment init 用メタデータを組み立てる(設計書 9.4)。
 * ブランチは refs/heads/ を剥がした短い名前にする。
 */
export interface GithubMeta {
  repository: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  actor: string;
  workflow: string;
  runId: string;
  runNumber: number;
  runAttempt: number;
  eventName: string;
}

export function readGithubMeta(env: NodeJS.ProcessEnv = process.env): GithubMeta {
  const repository = required(env, 'GITHUB_REPOSITORY');
  const ref = env.GITHUB_REF ?? '';
  const branch =
    env.GITHUB_REF_NAME ||
    (ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref) ||
    'unknown';
  const commitSha = required(env, 'GITHUB_SHA');
  const commitMessage = (env.R42_COMMIT_MESSAGE || env.GITHUB_COMMIT_MESSAGE || 'deploy').trim();
  const actor = env.GITHUB_ACTOR || 'unknown';
  const workflow = env.GITHUB_WORKFLOW || 'unknown';
  const runId = required(env, 'GITHUB_RUN_ID');
  const runNumber = positiveInt(required(env, 'GITHUB_RUN_NUMBER'), 'GITHUB_RUN_NUMBER');
  const runAttempt = positiveInt(env.GITHUB_RUN_ATTEMPT || '1', 'GITHUB_RUN_ATTEMPT');
  const eventName = env.GITHUB_EVENT_NAME || 'unknown';

  return {
    repository,
    branch,
    commitSha,
    commitMessage: commitMessage.slice(0, 5000),
    actor,
    workflow,
    runId,
    runNumber,
    runAttempt,
    eventName,
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`${key} 環境変数がありません(GitHub Actions 上で実行してください)`);
  return v;
}

function positiveInt(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${label} が不正です: ${raw}`);
  return n;
}
