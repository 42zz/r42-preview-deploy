# R42 Preview Deploy Action

静的サイトの成果物ディレクトリを R42 Preview へデプロイする GitHub Action。

## Inputs

| 名前 | 必須 | 説明 |
| --- | --- | --- |
| `project-id` | yes | R42 プロジェクト ID |
| `directory` | yes | `index.html` を含む成果物ディレクトリ |
| `deploy-token` | yes | 管理画面で発行した `r42d_...` トークン(Secret 推奨) |
| `api-base-url` | yes | R42 API のベース URL(末尾スラッシュなし) |
| `version-name` | no | バージョン表示名(省略時はコミットメッセージ先頭行) |
| `activate` | no | `false` で検証のみ(公開しない)。既定 `true` |

## Outputs

| 名前 | 説明 |
| --- | --- |
| `deployment-id` | 作成された Deployment ID |
| `version-number` | 採番されたバージョン番号(ready 時) |
| `preview-url` | 確認 URL |
| `download-url` | ダウンロード URL |

## 使い方

管理画面の「GitHub連携」タブが、この Action を SHA 固定で参照する Workflow YAML を生成します。
そちらをコピーして使ってください。

```yaml
- uses: 42zz/r42-preview-deploy@<commit-sha> # v1
  with:
    project-id: 01H...
    directory: dist
    deploy-token: ${{ secrets.R42_DEPLOY_TOKEN }}
    api-base-url: https://example.invalid
```
