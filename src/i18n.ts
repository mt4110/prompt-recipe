export const ui = {
  aiFormatExplanation: "短い見出しで環境・目的・プロンプトを区分します。必要な指示だけを渡します。",
  tryAiPrompt: "このAIでプロンプトを試す →",
  filterPrompts: "プロンプトを絞る",
  feedbackRevisionHelp: "修正はプロンプト台帳で新版を作り、プロジェクトで採用します。追加だけでなく短縮・条件付け・分割も検討してください。",
  promptBodyConstraints: "プロンプト本文・構造化制約",
  noSamples: "該当するサンプルはありません。",
  promptExported: "プロンプトをExportしました。",
  importLocalHelp: "ローカルのJSONだけを読みます。プロジェクトの割当は現在の版に固定したままです。サンプルの根拠は各プロンプトで確認できます。",
  personalUnverified: "個人プロンプト・効果未検証",
  paletteLabel: "プロンプトの小窓",
  noPrompts: "該当するプロンプトはありません。",
  loadingPrompts: "プロンプトを読み込んでいます…",
  noProjectPrompts: "該当するプロンプトはありません。条件を戻して探せます。",
  noProject: "プロジェクトなし",
  previewCopyNotice: "開発用ブラウザでは利用履歴を記録しません。",
 prompt: "プロンプト", samples: "サンプル", personal: "自分のプロンプト", empty: "該当するプロンプトはありません。" } as const;

export function advisoryRuleLabel(rule: string): string {
  if (rule.includes("email")) return "メールアドレス";
  if (rule.includes("phone")) return "電話番号";
  if (rule === "credit-card") return "カード番号";
  if (rule === "mynumber") return "マイナンバー";
  if (rule === "env-secret") return "環境変数の秘密情報";
  if (rule.includes("private") || rule.includes("private_pem")) return "秘密鍵";
  if (rule === "jwt") return "認証トークン";
  if (rule === "connection-password") return "接続情報のパスワード";
  if (rule === "api-key" || rule.startsWith("creds.")) return "アクセスキー・トークン";
  return "秘密情報・個人情報の候補";
}
