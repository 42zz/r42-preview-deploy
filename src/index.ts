import * as fs from 'node:fs';
import * as core from '@actions/core';
import { R42ApiClient, pollUntilDone, putUpload, type DeploymentStatus } from './api';
import { readGithubMeta, type GithubMeta } from './meta';
import { assertIndexHtml, sha256Hex, zipDirectory } from './zip';

async function run(): Promise<void> {
  const projectId = core.getInput('project-id', { required: true }).trim();
  const directory = core.getInput('directory', { required: true }).trim();
  const token = core.getInput('deploy-token', { required: true }).trim();
  const apiBaseUrl = core.getInput('api-base-url').trim();
  if (!apiBaseUrl) {
    throw new Error('api-base-url is required');
  }
  const versionName = core.getInput('version-name').trim() || undefined;
  const activateRaw = (core.getInput('activate') || 'true').trim().toLowerCase();
  const activate = activateRaw !== 'false' && activateRaw !== '0';

  if (!projectId) throw new Error('project-id は必須です');
  if (!directory) throw new Error('directory は必須です');
  if (!token.startsWith('r42d_')) {
    throw new Error('deploy-token は r42d_ で始まる必要があります');
  }

  assertIndexHtml(directory);
  const github = readGithubMeta();
  // コミットメッセージは event payload から取れる場合があるが、簡易に SHA 短くてもよい
  // GITHUB_EVENT_PATH があれば message を補完
  enrichCommitMessage(github);

  const client = new R42ApiClient(apiBaseUrl, token);
  core.info(`init: project=${projectId} repo=${github.repository} run=${github.runId}`);

  const initBody: {
    github: GithubMeta;
    versionName?: string;
    activate?: boolean;
  } = { github, activate };
  if (versionName) initBody.versionName = versionName;

  const init = await client.init(projectId, initBody);
  core.setOutput('deployment-id', init.deploymentId);
  core.info(`deploymentId=${init.deploymentId} status=${init.status} duplicate=${Boolean(init.duplicate)}`);

  // 冪等: 同一 run の再実行で既に ready ならアップロードをスキップ(設計書 5.4 / 9.1)
  if (init.duplicate && init.status === 'ready') {
    const { deployment } = await client.getDeployment(init.deploymentId);
    writeSummary(deployment, activate);
    setResultOutputs(deployment);
    return;
  }

  if (init.status === 'ready' || init.status === 'processing') {
    const deployment = await pollUntilDone(client, init.deploymentId);
    if (deployment.status === 'failed') {
      throw new Error(deployment.failureReason || 'Deployment が失敗しました');
    }
    writeSummary(deployment, activate);
    setResultOutputs(deployment);
    return;
  }

  if (!init.uploadUrl) {
    throw new Error('uploadUrl が返りませんでした。Deployment 状態を確認してください。');
  }

  core.info(`zipping ${directory} ...`);
  const zip = zipDirectory(directory);
  const digest = sha256Hex(zip);
  core.info(`zip size=${zip.byteLength} sha256=${digest}`);

  core.info('uploading to R2 ...');
  await putUpload(init.uploadUrl, zip);

  core.info('complete ...');
  await client.complete(init.deploymentId, { sha256: digest, sizeBytes: zip.byteLength });

  const deployment = await pollUntilDone(client, init.deploymentId);
  if (deployment.status === 'failed') {
    throw new Error(deployment.failureReason || 'Deployment が失敗しました');
  }
  writeSummary(deployment, activate);
  setResultOutputs(deployment);
}

function enrichCommitMessage(github: ReturnType<typeof readGithubMeta>): void {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return;
  try {
    const raw = fs.readFileSync(eventPath, 'utf8');
    const event = JSON.parse(raw) as { head_commit?: { message?: string }; commits?: { message?: string }[] };
    const msg = event.head_commit?.message || event.commits?.[0]?.message;
    if (msg) github.commitMessage = msg.slice(0, 5000);
  } catch {
    /* keep default */
  }
}

function setResultOutputs(deployment: DeploymentStatus['deployment']): void {
  if (deployment.versionNumber != null) {
    core.setOutput('version-number', String(deployment.versionNumber));
  }
  if (deployment.urls) {
    core.setOutput('preview-url', deployment.urls.preview);
    core.setOutput('download-url', deployment.urls.download);
  }
}

function writeSummary(deployment: DeploymentStatus['deployment'], activateInput: boolean): void {
  const lines = [
    '## R42 Preview Deploy',
    '',
    `| 項目 | 値 |`,
    `| --- | --- |`,
    `| Deployment ID | \`${deployment.id}\` |`,
    `| ステータス | ${deployment.status} |`,
    `| バージョン | ${deployment.versionNumber ?? '—'} |`,
    `| 公開中 | ${deployment.isActive ? 'はい' : 'いいえ'} |`,
  ];
  if (deployment.urls) {
    lines.push(`| 確認URL | ${deployment.urls.preview} |`);
    lines.push(`| ダウンロードURL | ${deployment.urls.download} |`);
    lines.push(`| 確認URL(固定) | ${deployment.urls.previewPinned} |`);
  }
  if (!activateInput || deployment.activateRequested === false) {
    lines.push('');
    lines.push('検証のみ成功(activate: false)。公開するには管理画面からバージョンを公開してください。');
  } else if (deployment.status === 'ready' && !deployment.isActive) {
    lines.push('');
    lines.push(
      'ready になりましたが公開はスキップされました(より新しい Workflow Run が既に公開中の可能性)。',
    );
  }
  core.summary.addRaw(lines.join('\n'));
  void core.summary.write();
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
});
