import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { zipSync, strToU8, type Zippable } from 'fflate';

/** directory 配下を再帰走査して ZIP(バイト列)を返す。除外は行わない(サーバー側が正)。 */
export function zipDirectory(directory: string): Uint8Array {
  const root = path.resolve(directory);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`directory が見つかりません: ${directory}`);
  }
  const files: Zippable = {};
  walk(root, root, files);
  if (Object.keys(files).length === 0) {
    throw new Error(`directory が空です: ${directory}`);
  }
  return zipSync(files, { level: 6 });
}

function walk(absDir: string, root: string, out: Zippable): void {
  for (const name of fs.readdirSync(absDir)) {
    const abs = path.join(absDir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      walk(abs, root, out);
      continue;
    }
    if (!st.isFile()) continue;
    const rel = path.relative(root, abs).split(path.sep).join('/');
    out[rel] = new Uint8Array(fs.readFileSync(abs));
  }
}

/** 公開ルート直下に index.html があるか(設計書 9.1 の早期チェック)。 */
export function assertIndexHtml(directory: string): void {
  const indexPath = path.join(path.resolve(directory), 'index.html');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
    throw new Error(
      `directory 直下に index.html がありません: ${directory}。ビルド成果物のパスを確認してください。`,
    );
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** テスト用: メモリ上のファイルマップから ZIP を作る */
export function zipFromMap(files: Record<string, string>): Uint8Array {
  const zippable: Zippable = {};
  for (const [k, v] of Object.entries(files)) {
    zippable[k] = strToU8(v);
  }
  return zipSync(zippable);
}
