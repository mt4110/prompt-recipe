use crate::domain::*;
use quick_xml::{events::Event, Reader};
use serde::Serialize;
#[derive(Serialize)]
pub struct Issue {
    pub line: usize,
    pub severity: &'static str,
    pub message: String,
}
pub fn check(text: &str, format: &str) -> Result<Vec<Issue>> {
    text_limit(text)?;
    let mut issues = Vec::new();
    if format == "xml" {
        let mut reader = Reader::from_str(text);
        let mut depth = 0usize;
        let mut roots = 0usize;
        let mut cursor = 0usize;
        let mut current_line = 1usize;
        loop {
            let position = (reader.buffer_position() as usize).min(text.len());
            current_line += text.as_bytes()[cursor..position]
                .iter()
                .filter(|b| **b == b'\n')
                .count();
            cursor = position;
            let line = current_line;
            let message = match reader.read_event() {
                Ok(Event::Start(e)) => {
                    if depth == 0 {
                        roots += 1;
                    }
                    depth += 1;
                    if depth > 128 {
                        Some("XMLの入れ子は128段までです。".into())
                    } else {
                        e.attributes().find_map(|a| {
                            a.map_err(quick_xml::Error::from)
                                .and_then(|a| a.normalized_value(quick_xml::XmlVersion::default()))
                                .err()
                                .map(|_| "属性が不正か重複しています。".into())
                        })
                    }
                }
                Ok(Event::Empty(e)) => {
                    if depth == 0 {
                        roots += 1;
                    }
                    e.attributes().find_map(|a| {
                        a.map_err(quick_xml::Error::from)
                            .and_then(|a| a.normalized_value(quick_xml::XmlVersion::default()))
                            .err()
                            .map(|_| "属性が不正か重複しています。".into())
                    })
                }
                Ok(Event::End(_)) => {
                    depth = depth.saturating_sub(1);
                    None
                }
                Ok(Event::DocType(_)) => Some("DOCTYPE・外部実体は受け付けません。".into()),
                Ok(Event::Text(e)) => {
                    if depth == 0 && !e.as_ref().bytes().all(|b| b.is_ascii_whitespace()) {
                        Some("ルート要素の外にテキストがあります。".into())
                    } else {
                        None
                    }
                }
                Ok(Event::GeneralRef(e)) => {
                    let valid = ["amp", "lt", "gt", "quot", "apos"].contains(&e.as_ref()) || e.resolve_char_ref().ok().flatten().is_some_and(|c| matches!(c as u32, 9|10|13|0x20..=0xD7FF|0xE000..=0xFFFD|0x10000..=0x10FFFF));
                    if depth == 0 || !valid {
                        Some("未定義または不正な実体参照があります。".into())
                    } else {
                        None
                    }
                }
                Ok(Event::CData(_)) if depth == 0 => {
                    Some("CDATAはルート要素内に置いてください。".into())
                }
                Ok(Event::Eof) => {
                    if depth != 0 || roots != 1 {
                        issues.push(Issue { line, severity:"error", message:"XML文書は閉じたルート要素が一つ必要です。断片はMarkdown／テキストとして扱ってください。".into() });
                    }
                    break;
                }
                Err(_) => Some("XMLのタグ、属性、文字の構文を確認してください。".into()),
                _ => None,
            };
            if let Some(message) = message {
                issues.push(Issue {
                    line,
                    severity: "error",
                    message,
                });
                break;
            }
        }
    } else if format == "markdown" {
        let mut fence: Option<(u8, usize, usize)> = None;
        let mut level = 0;
        for (index, line) in text.lines().enumerate() {
            let trimmed = line.trim_start();
            let marker = trimmed.as_bytes().first().copied().unwrap_or(0);
            let count = trimmed.bytes().take_while(|b| *b == marker).count();
            if [b'`', b'~'].contains(&marker) && count >= 3 {
                if let Some((m, n, _)) = fence {
                    if marker == m && count >= n && trimmed[count..].trim().is_empty() {
                        fence = None;
                    }
                } else {
                    fence = Some((marker, count, index + 1));
                }
                continue;
            }
            if fence.is_some() {
                continue;
            }
            if line.ends_with(' ') && !line.ends_with("  ") || line.ends_with('\t') {
                issues.push(Issue {
                    line: index + 1,
                    severity: "warning",
                    message: "行末の余分な空白があります。".into(),
                });
            }
            if marker == b'#' && count <= 6 && trimmed.as_bytes().get(count) == Some(&b' ') {
                if level > 0 && count > level + 1 {
                    issues.push(Issue {
                        line: index + 1,
                        severity: "warning",
                        message: "見出しの階層が飛んでいます。".into(),
                    });
                }
                level = count;
            }
            if issues.len() >= 100 {
                break;
            }
        }
        if let Some((_, _, line)) = fence {
            issues.push(Issue {
                line,
                severity: "warning",
                message: "閉じられていないコードフェンスがあります。".into(),
            });
        }
    } else {
        return Err(Error::new(
            "lint",
            "XML文書またはMarkdownを指定してください。",
        ));
    }
    Ok(issues)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_broken_or_external_xml() {
        for text in [
            "<a><b></a>",
            "<a>",
            "<a/><b/>",
            "<!DOCTYPE a SYSTEM 'file:///private'><a/>",
            "<a x='1' x='2'/>",
            "<a>&unknown;</a>",
            "<a x='&unknown;'/>",
        ] {
            assert!(!check(text, "xml").expect("lint").is_empty(), "{text}");
        }
        assert!(check("<a><b>&amp;本文</b></a>", "xml")
            .expect("lint")
            .is_empty());
    }
    #[test]
    fn markdown_preserves_fences_and_intentional_line_breaks() {
        assert!(check("# A\n## B\ntext  \n```xml\n<a>\n```", "markdown")
            .expect("lint")
            .is_empty());
        assert_eq!(
            check("# A\n### B\n```rust", "markdown")
                .expect("lint")
                .len(),
            2
        );
    }
}
