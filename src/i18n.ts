export const ui = { prompt: "プロンプト", samples: "サンプル", personal: "自分のプロンプト", empty: "該当するプロンプトはありません。" } as const;

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
