//! Local advisory checks. Findings never contain the matched text.
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
#[derive(Clone, Debug, Serialize)]
pub struct Finding {
    pub rule: String,
    pub start: usize,
    pub end: usize,
    pub fingerprint: String,
}
#[derive(Deserialize)]
struct Rule {
    id: String,
    pattern: String,
}
fn rules() -> &'static Vec<(String, Regex)> {
    static RULES: OnceLock<Vec<(String, Regex)>> = OnceLock::new();
    RULES.get_or_init(|| {
        let mut rules: Vec<Rule> = serde_json::from_str(include_str!("../../content/advisory-rules.json")).expect("bundled rules");
        for (id, pattern) in [
            ("private-key", r"(?s)-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----.*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|$)"),
            ("env-secret", r#"(?im)\b(?:export\s+)?(?:[A-Z0-9_]*(?:SECRET|TOKEN)|PASSWORD)\s*=\s*[^\r\n]+"#),
            ("email", r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"),
            ("phone", r"(?:\+81[- ]?|\b0)[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{4}\b"),
            ("api-key", r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,})\b"),
            ("jwt", r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
            ("connection-password", r"[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/:@]+:[^\s/@]+@"),
            ("credit-card", r"\b[0-9](?:[ -]?[0-9]){12,18}\b"),
            ("mynumber", r"\b[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}\b"),
        ] { rules.push(Rule { id: id.into(), pattern: pattern.into() }); }
        rules.into_iter().map(|r| (r.id, Regex::new(&r.pattern).expect("bundled regex"))).collect()
    })
}
fn digits(s: &str) -> Vec<u32> {
    s.chars().filter_map(|c| c.to_digit(10)).collect()
}
fn valid(rule: &str, s: &str) -> bool {
    let d = digits(s);
    if rule == "credit-card" {
        return (13..=19).contains(&d.len())
            && d.iter().any(|v| *v != d[0])
            && d.iter()
                .rev()
                .enumerate()
                .map(|(i, v)| {
                    let n = if i % 2 == 1 { v * 2 } else { *v };
                    if n > 9 {
                        n - 9
                    } else {
                        n
                    }
                })
                .sum::<u32>()
                % 10
                == 0;
    }
    if rule == "mynumber" {
        if d.len() != 12 || d.iter().all(|v| *v == d[0]) {
            return false;
        }
        let sum: u32 = d[..11]
            .iter()
            .rev()
            .enumerate()
            .map(|(i, v)| v * (if i < 6 { i + 2 } else { i - 4 }) as u32)
            .sum();
        let rem = sum % 11;
        return d[11] == if rem <= 1 { 0 } else { 11 - rem };
    }
    true
}
// Bare numeric identifiers are ambiguous. Checksums alone do not establish their meaning.
fn numeric_context(rule: &str, text: &str, start: usize, end: usize) -> bool {
    let phone = rule == "phone" || rule.contains("phone");
    if !phone && rule != "credit-card" {
        return true;
    }
    let line_start = text[..start].rfind('\n').map_or(0, |i| i + 1);
    let line_end = text[end..].find('\n').map_or(text.len(), |i| end + i);
    let line = text[line_start..line_end].to_lowercase();
    if phone {
        let value = &text[start..end];
        let count = digits(value).len();
        if !(if value.starts_with("+81") {
            [11, 12].contains(&count)
        } else {
            [10, 11].contains(&count)
        }) {
            return false;
        }
        return value.contains('-')
            || value.contains(' ')
            || value.starts_with("+81")
            || ["電話", "携帯", "tel", "phone", "fax"]
                .iter()
                .any(|word| line.contains(word));
    }
    ["カード", "クレジット", "credit", "card", "pan", "cc_number"]
        .iter()
        .any(|word| line.contains(word))
}
pub fn inspect(text: &str) -> Vec<Finding> {
    let mut findings = Vec::new();
    for (id, regex) in rules() {
        for m in regex.find_iter(text) {
            if valid(id, m.as_str()) && numeric_context(id, text, m.start(), m.end()) {
                findings.push(Finding {
                    rule: id.clone(),
                    start: m.start(),
                    end: m.end(),
                    fingerprint: format!(
                        "{:x}",
                        Sha256::digest(format!("{}:{}", id, m.as_str()).as_bytes())
                    ),
                });
            }
        }
    }
    findings.sort_by_key(|f| (f.start, std::cmp::Reverse(f.end)));
    // Merge overlapping findings before masking; no byte-range shifts or partial key leaks.
    let mut merged: Vec<Finding> = Vec::new();
    for f in findings {
        if let Some(last) = merged.last_mut() {
            if f.start < last.end {
                last.end = last.end.max(f.end);
                continue;
            }
        }
        merged.push(f);
    }
    merged
}
pub fn mask(text: &str, findings: &[Finding]) -> String {
    let mut output = text.to_owned();
    for f in findings.iter().rev() {
        output.replace_range(f.start..f.end, "[MASKED]");
    }
    output
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn masking_covers_unicode_overlaps_and_full_private_key() {
        let input="日本語 alice@example.test\nAPI_SECRET=dummy-value\n-----BEGIN PRIVATE KEY-----\ndummy payload\n-----END PRIVATE KEY-----";
        let found = inspect(input);
        let output = mask(input, &found);
        assert_eq!(found.len(), 3);
        assert!(!output.contains("dummy"));
        assert!(!output.contains("alice"));
        assert!(output.contains("日本語"));
    }
    #[test]
    fn checksums_and_negatives() {
        assert!(valid("credit-card", "4111111111111111"));
        assert!(!valid("credit-card", "4111111111111112"));
        assert!(inspect("ordinary prose").is_empty());
    }
}

#[cfg(test)]
mod regression {
    use super::*;
    #[test]
    fn ambiguous_numeric_identifiers_need_context() {
        for text in [
            "0312345678",
            "4111111111111111",
            "注文番号: 4111111111111111",
        ] {
            assert!(inspect(text).is_empty(), "unexpected candidate: {text}");
        }
        for text in [
            "電話: 0312345678",
            "03-1234-5678",
            "+81-3-1234-5678",
            "カード番号: 4111111111111111",
        ] {
            assert!(!inspect(text).is_empty(), "missing candidate: {text}");
        }
        assert!(inspect("カード番号: 4111111111111112").is_empty());
    }
    #[test]
    fn all_bundled_rule_patterns_have_dummy_positive_and_negative_examples() {
        let samples = [
            ("creds.aws.access_key_id", format!("AKIA{}", "A".repeat(16))),
            (
                "creds.aws.secret_key_config",
                format!("aws_secret_access_key={}", "a".repeat(40)),
            ),
            ("creds.github.pat.ghp", format!("ghp_{}", "a".repeat(36))),
            (
                "creds.github.pat.long",
                format!("github_pat_{}", "a".repeat(80)),
            ),
            (
                "creds.slack.token.legacy",
                format!("xoxb-1234567890-1234567890-{}", "a".repeat(24)),
            ),
            (
                "creds.key.private_pem",
                "-----BEGIN PRIVATE KEY-----".into(),
            ),
            ("pii.jp.phone.mobile", "090-0000-0000".into()),
            ("pii.jp.phone.landline.keyword", "電話 03-0000-0000".into()),
            ("pii.net.email", "dummy@example.test".into()),
        ];
        for (id, sample) in samples {
            let (_, regex) = rules().iter().find(|(name, _)| name == id).expect("rule");
            assert!(regex.is_match(&sample), "{id}");
            assert!(!regex.is_match("ordinary dummy prose"), "{id}");
        }
        for text in [
            "確認 API_SECRET=dummy-value",
            "PASSWORD=dummy-value",
            "sk-abcdefghijklmnopqrstuvwx",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.dummySignature",
            "postgres://dummy:dummy-pass@localhost/db",
            "カード番号: 4111111111111111",
            "dummy@example.test",
            "090-0000-0000",
        ] {
            assert!(!inspect(text).is_empty());
        }
    }
    #[test]
    fn mynumber_check_digit_and_mask_snapshot() {
        let base = "12345678901";
        let d = digits(base);
        let sum: u32 = d
            .iter()
            .rev()
            .enumerate()
            .map(|(i, v)| v * (if i < 6 { i + 2 } else { i - 4 }) as u32)
            .sum();
        let rem = sum % 11;
        let check = if rem <= 1 { 0 } else { 11 - rem };
        let n = format!("{base}{check}");
        assert!(valid("mynumber", &n));
        assert!(!valid("mynumber", &format!("{base}{}", (check + 1) % 10)));
        let text = "確認 API_SECRET=dummy-value\ndummy@example.test";
        assert_eq!(mask(text, &inspect(text)), "確認 [MASKED]\n[MASKED]");
    }
    #[test]
    fn records_actual_ten_thousand_character_scan_time() {
        let text = format!("{}\ndummy@example.test", "文".repeat(9981));
        let started = std::time::Instant::now();
        let found = inspect(&text);
        eprintln!(
            "advisory input_chars={} elapsed_us={} findings={}",
            text.chars().count(),
            started.elapsed().as_micros(),
            found.len()
        );
        assert_eq!(found.len(), 1);
    }
}
