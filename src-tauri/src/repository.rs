use crate::{
    application::{project, storage_error},
    domain::*,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub fn verify(path: &Path) -> Result<PathBuf> {
    let root = path
        .canonicalize()
        .map_err(|_| Error::new("repository", "フォルダを確認できません。"))?;
    if !root.is_dir() || !root.join(".git").exists() {
        return Err(Error::new(
            "repository",
            ".gitのある作業ツリーのルートを選んでください。",
        ));
    }
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(&root)
        .args(["rev-parse", "--is-inside-work-tree", "--show-toplevel"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            cmd.env_remove(key);
        }
    }
    cmd.env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0");
    let mut child = cmd.spawn().map_err(|_| {
        Error::new(
            "git",
            "Gitを起動できません。インストールを確認してください。",
        )
    })?;
    let start = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|_| Error::new("git", "Gitの確認に失敗しました。"))?
            .is_some()
        {
            break;
        }
        if start.elapsed() > Duration::from_secs(3) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::new("git", "Gitの確認が時間切れになりました。"));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child
        .wait_with_output()
        .map_err(|_| Error::new("git", "Gitの確認に失敗しました。"))?;
    let text = std::str::from_utf8(&output.stdout)
        .map_err(|_| Error::new("repository", "UTF-8のパスを選んでください。"))?;
    let mut lines = text.lines();
    let reported = lines.next() == Some("true");
    let top = lines.next().and_then(|s| Path::new(s).canonicalize().ok());
    if !output.status.success() || !reported || top.as_ref() != Some(&root) {
        return Err(Error::new(
            "repository",
            "有効なGit作業ツリーのルートではありません。",
        ));
    }
    Ok(root)
}
pub fn open(conn: &mut Connection, root: &Path) -> Result<Project> {
    let path = root
        .to_str()
        .ok_or_else(|| Error::new("repository", "UTF-8のパスを選んでください。"))?;
    let tx = conn.transaction().map_err(storage_error)?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT key FROM settings WHERE key LIKE 'repository:%' AND value=?1",
            [path],
            |r| r.get(0),
        )
        .optional()
        .map_err(storage_error)?;
    let p = if let Some(key) = existing {
        project(&tx, key.trim_start_matches("repository:"))?
    } else {
        let p = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: root
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Gitプロジェクト")
                .chars()
                .take(60)
                .collect(),
            environment: "code".into(),
            reference: "".into(),
            assignment: vec!["builtin-01-v2".into()],
            version: 1,
        };
        tx.execute(
            "INSERT INTO projects(id,data) VALUES(?1,?2)",
            params![
                p.id,
                serde_json::to_string(&p).map_err(|_| Error::new("data", "保存できません。"))?
            ],
        )
        .map_err(storage_error)?;
        tx.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2)",
            params![format!("repository:{}", p.id), path],
        )
        .map_err(storage_error)?;
        p
    };
    tx.execute(
        "UPDATE settings SET value=?1 WHERE key='active_project'",
        [&p.id],
    )
    .map_err(storage_error)?;
    tx.commit().map_err(storage_error)?;
    Ok(p)
}
pub fn paths(conn: &Connection) -> Result<serde_json::Value> {
    let mut statement = conn
        .prepare("SELECT key,value FROM settings WHERE key LIKE 'repository:%'")
        .map_err(storage_error)?;
    let pairs = statement
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(storage_error)?;
    let mut map = serde_json::Map::new();
    for pair in pairs {
        let (key, value) = pair.map_err(storage_error)?;
        map.insert(
            key.trim_start_matches("repository:").to_string(),
            value.into(),
        );
    }
    Ok(map.into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn existing_root_reopens_without_replacing_settings() {
        let mut c = Connection::open_in_memory().expect("db");
        crate::application::initialize(&mut c).expect("init");
        let path = Path::new("/example/repo");
        let p = open(&mut c, path).expect("open");
        let again = open(&mut c, path).expect("reopen");
        assert_eq!(p.id, again.id);
        assert_eq!(paths(&c).expect("paths")[p.id], "/example/repo");
    }
    #[test]
    fn rejects_non_git_and_fake_git_roots() {
        assert!(verify(Path::new("/tmp")).is_err());
    }
}

#[cfg(test)]
mod git_tests {
    use super::*;
    fn command(root: &Path, args: &[&str]) -> bool {
        let mut c = Command::new("git");
        c.arg("-C")
            .arg(root)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        for (key, _) in std::env::vars_os() {
            if key.to_string_lossy().starts_with("GIT_") {
                c.env_remove(key);
            }
        }
        c.status().expect("git available").success()
    }
    #[test]
    fn normal_and_file_based_worktrees_are_valid_but_fake_git_is_not() {
        let base = std::env::temp_dir().join(format!(
            "prompt-recipe-git-fixture-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&base).expect("fixture");
        let fake = base.join("fake");
        std::fs::create_dir(&fake).expect("fake");
        std::fs::create_dir(fake.join(".git")).expect("fake metadata");
        assert!(verify(&fake).is_err());
        let root = base.join("root");
        std::fs::create_dir(&root).expect("root");
        assert!(command(&root, &["-c", "init.defaultBranch=main", "init"]));
        assert_eq!(
            verify(&root).expect("normal"),
            root.canonicalize().expect("canonical")
        );
        assert!(command(
            &root,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "core.hooksPath=/dev/null",
                "commit",
                "--allow-empty",
                "-m",
                "fixture"
            ]
        ));
        let worktree = base.join("worktree");
        assert!(command(
            &root,
            &[
                "worktree",
                "add",
                "-b",
                "fixture",
                worktree.to_str().expect("path")
            ]
        ));
        assert!(worktree.join(".git").is_file());
        assert_eq!(
            verify(&worktree).expect("worktree"),
            worktree.canonicalize().expect("canonical")
        );
        // Keep this isolated fixture: deleting files requires an explicit user approval in this workspace.
    }
}
