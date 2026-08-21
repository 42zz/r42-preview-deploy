import type { GithubMeta } from './meta';

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

export interface InitResponse {
  deploymentId: string;
  status: string;
  uploadUrl: string | null;
  duplicate?: boolean;
  maxCompressedBytes?: number;
}

export interface DeploymentStatus {
  deployment: {
    id: string;
    status: string;
    failureReason: string | null;
    versionNumber: number | null;
    isActive: boolean;
    activateRequested?: boolean;
    urls: {
      preview: string;
      download: string;
      previewPinned: string;
      downloadPinned: string;
    } | null;
  };
}

export class R42ApiClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly token: string,
  ) {}

  async init(
    projectId: string,
    body: {
      github: GithubMeta;
      versionName?: string;
      activate?: boolean;
    },
  ): Promise<InitResponse> {
    return this.request<InitResponse>(`/api/projects/${projectId}/deployments/init`, {
      method: 'POST',
      body,
    });
  }

  async complete(
    deploymentId: string,
    body: { sha256: string; sizeBytes: number },
  ): Promise<{ deploymentId: string; status: string }> {
    return this.request(`/api/deployments/${deploymentId}/complete`, {
      method: 'POST',
      body,
    });
  }

  async getDeployment(deploymentId: string): Promise<DeploymentStatus> {
    return this.request<DeploymentStatus>(`/api/deployments/${deploymentId}`, {
      method: 'GET',
    });
  }

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const url = `${this.apiBaseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-json */
    }
    if (!res.ok) {
      const err = (json ?? {}) as ApiErrorBody;
      throw new Error(err.message || `API error ${res.status}: ${text.slice(0, 200)}`);
    }
    return json as T;
  }
}

export async function putUpload(uploadUrl: string, zip: Uint8Array): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(zip.byteLength),
    },
    body: Buffer.from(zip),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 アップロードに失敗しました (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function pollUntilDone(
  client: R42ApiClient,
  deploymentId: string,
  options: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DeploymentStatus['deployment']> {
  const intervalMs = options.intervalMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { deployment } = await client.getDeployment(deploymentId);
    if (deployment.status === 'ready' || deployment.status === 'failed') {
      return deployment;
    }
    await sleep(intervalMs);
  }
  throw new Error('Deployment の完了待ちがタイムアウトしました(最大10分)');
}
