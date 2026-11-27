//! The `PATH` the user's own shell has (ADR 0068).
//!
//! An app the Finder launched inherits launchd's environment, whose `PATH` is
//! the system's four directories. The user's pi is rarely in one of them, and
//! neither is the Node it runs on: both are put on `PATH` by the shell's own
//! startup files, which launchd never reads. So the shell is asked, once, and
//! its answer is searched after the process's own `PATH` and handed to what
//! the app starts.
//!
//! The shell is asked as an interactive login shell, because a version manager
//! is as a rule set up in the interactive startup file alone. Such a shell may
//! print anything on the way, so the value is read between two marks; and it
//! may never come back, so the wait is bounded.
//!
//! No `tauri::` types (ADR 0014).

use std::io::Read;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use crate::pty;

/// What stands on either side of the value in the shell's output.
const MARK: &str = "__PIARY_PATH__";

/// How long the shell may take to answer. A shell's startup is well under a
/// second; one that waits on a prompt or a network mount is not waited for,
/// and the app goes on with the `PATH` it has.
pub const BOUND: Duration = Duration::from_secs(5);

/// What the shell is started with: a login shell (`-l`) that is interactive
/// (`-i`), running one command. `printenv` rather than `$PATH`, which is a
/// list in fish and would be printed with spaces. Each mark is printed from
/// two halves, so the command's own text holds none: a shell that echoes
/// what it runs cannot be taken for the answer.
fn probe_args() -> [String; 2] {
    let (head, tail) = MARK.split_at(MARK.len() / 2);
    let mark = format!("printf '%s%s' {head} {tail}");
    [
        "-lic".into(),
        format!("{mark}; /usr/bin/printenv PATH; {mark}"),
    ]
}

/// The value between the last two marks of what the shell printed, or nothing
/// when there is none. The last two, because a startup file may echo the
/// command it was given.
pub fn parse(output: &str) -> Option<String> {
    let end = output.rfind(MARK)?;
    let start = output[..end].rfind(MARK)? + MARK.len();
    let value = output[start..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// The `PATH` for what the app starts, from its own and the login shell's.
///
/// When the shell's names every directory the process has, it is the shell's,
/// in the shell's order: that is an app the Finder launched, whose own `PATH`
/// is the system's directories, and the user's tools are meant to come before
/// those. Otherwise the process's own come first, with the shell's
/// directories it lacks after them: a launch from a terminal or a package
/// script already says which tools are meant.
pub fn merged(process: &str, login: Option<&str>) -> String {
    let dirs = |path: &'_ str| -> Vec<String> {
        path.split(':')
            .filter(|dir| !dir.is_empty())
            .map(String::from)
            .collect()
    };
    let mut own = dirs(process);
    let shells = dirs(login.unwrap_or_default());
    if !shells.is_empty() && own.iter().all(|dir| shells.contains(dir)) {
        return shells.join(":");
    }
    for dir in shells {
        if !own.contains(&dir) {
            own.push(dir);
        }
    }
    own.join(":")
}

/// Asks `shell` for its `PATH`, waiting at most `bound`.
///
/// The shell gets a session of its own: an interactive shell takes the
/// terminal it finds, and one started by an app that was itself launched from
/// a terminal would be stopped for trying. It also makes the shell and
/// everything its startup files started one group, which is what is killed
/// when the wait runs out.
///
/// The answer is taken as soon as its closing mark arrives, not when the
/// shell's output closes: a startup file that leaves something running in the
/// background leaves it holding that output open.
pub fn read(shell: &str, bound: Duration) -> Option<String> {
    let mut command = Command::new(shell);
    command
        .args(probe_args())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // SAFETY: `setsid` is async-signal-safe and touches nothing of this
    // process's memory; it runs in the child, between fork and exec.
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut child = command.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let (chunks, arriving) = mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        while let Ok(read) = stdout.read(&mut chunk) {
            if read == 0 || chunks.send(chunk[..read].to_vec()).is_err() {
                break;
            }
        }
    });
    let deadline = Instant::now() + bound;
    let mut printed = Vec::new();
    let answer = loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match arriving.recv_timeout(left) {
            Ok(chunk) => {
                printed.extend(chunk);
                if let Some(path) = parse(&String::from_utf8_lossy(&printed)) {
                    break Some(path);
                }
            }
            // The output closed with no answer in it, or the wait ran out.
            Err(_) => break None,
        }
    };
    if answer.is_none() {
        // The session's leader is the shell, so its id names the group.
        // SAFETY: a signal to a group id; no memory is involved.
        unsafe {
            libc::killpg(child.id() as libc::pid_t, libc::SIGKILL);
        }
    }
    // Reaped whenever it ends, which for a shell that answered is its own
    // business: nothing here waits for it.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    answer
}

/// The `PATH` of the user's login shell, asked once for the life of the app:
/// `$SHELL`'s, else the account's (`pty::account_shell`). Nothing when the
/// shell gave no answer, and in a driven run, which is not to depend on the
/// startup files of the Mac it runs on.
///
/// The first call waits for the shell; every caller meanwhile waits with it.
pub fn login_path(driven: bool) -> Option<&'static str> {
    static ASKED: OnceLock<Option<String>> = OnceLock::new();
    if driven {
        return None;
    }
    ASKED
        .get_or_init(|| {
            let shell = std::env::var("SHELL")
                .ok()
                .filter(|shell| !shell.is_empty())
                .or_else(pty::account_shell)?;
            read(&shell, BOUND)
        })
        .as_deref()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    /// A script standing in for a shell: it ignores what it is started with
    /// and runs `body`.
    fn shell(name: &str, body: &str) -> PathBuf {
        let file = std::env::temp_dir().join(format!("piary-shell-{}-{name}", std::process::id()));
        fs::write(&file, format!("#!/bin/sh\n{body}\n")).expect("script");
        fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).expect("mode");
        file
    }

    #[test]
    fn the_value_is_read_between_the_marks_whatever_else_is_printed() {
        let noisy = format!("Welcome back!\n\u{1b}[0m{MARK}/a:/b\n{MARK}\nbye\n");
        assert_eq!(parse(&noisy).as_deref(), Some("/a:/b"));
    }

    #[test]
    fn a_startup_file_that_echoes_the_command_does_not_hide_the_value() {
        // `set -x`, or a shell that prints what it runs: the marks appear
        // once more, before the real ones.
        let echoed = format!("+ printf %s {MARK}\n{MARK}/a:/b\n{MARK}");
        assert_eq!(parse(&echoed).as_deref(), Some("/a:/b"));
    }

    #[test]
    fn output_without_a_value_is_no_answer() {
        assert_eq!(parse(""), None);
        assert_eq!(parse("command not found"), None);
        assert_eq!(parse(&format!("{MARK}/a:/b")), None);
        assert_eq!(parse(&format!("{MARK}\n{MARK}")), None);
    }

    #[test]
    fn a_finder_launch_gets_the_shells_path_in_the_shells_order() {
        // launchd's four directories are all on the shell's PATH, further
        // down: the user's tools are meant to shadow the system's.
        assert_eq!(
            merged(
                "/usr/bin:/bin:/usr/sbin:/sbin",
                Some("/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
            ),
            "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        );
    }

    #[test]
    fn a_path_that_names_more_than_the_shells_keeps_its_own_order() {
        // A launch from a terminal, or through a package script: what it put
        // first stays first, and the shell only adds what is missing.
        assert_eq!(
            merged("/repo/bin:/usr/bin", Some("/home/bin:/usr/bin:/opt/bin")),
            "/repo/bin:/usr/bin:/home/bin:/opt/bin"
        );
        // No answer from the shell leaves what there was.
        assert_eq!(merged("/usr/bin:/bin", None), "/usr/bin:/bin");
        // An empty entry means the current directory, which is nowhere to
        // look for a tool.
        assert_eq!(merged("/x::", Some(":/opt/bin")), "/x:/opt/bin");
    }

    #[test]
    fn a_shell_is_asked_and_its_noise_is_dropped() {
        let fake = shell(
            "noisy",
            &format!("echo 'Last login: today'\nprintf '%s' {MARK}; printf '/from/the/shell:/usr/bin\\n'; printf '%s' {MARK}"),
        );
        let path = read(&fake.to_string_lossy(), BOUND);
        let _ = fs::remove_file(&fake);
        assert_eq!(path.as_deref(), Some("/from/the/shell:/usr/bin"));
    }

    #[test]
    fn an_answer_is_taken_though_a_startup_file_left_something_running() {
        // A startup file that starts an agent in the background: the child
        // holds the shell's output open long after the answer was printed.
        let fake = shell(
            "lingering",
            &format!(
                "printf '%s' {MARK}; printf '/from/the/shell'; printf '%s' {MARK}
sleep 30 &"
            ),
        );
        let began = Instant::now();
        let path = read(&fake.to_string_lossy(), Duration::from_secs(3));
        let _ = fs::remove_file(&fake);
        assert_eq!(path.as_deref(), Some("/from/the/shell"));
        assert!(
            began.elapsed() < Duration::from_secs(2),
            "the answer was taken when it came, not when the output closed"
        );
    }

    #[test]
    fn a_shell_that_does_not_answer_is_not_waited_for() {
        let fake = shell("stuck", "sleep 30");
        let began = Instant::now();
        let path = read(&fake.to_string_lossy(), Duration::from_millis(300));
        let _ = fs::remove_file(&fake);
        assert_eq!(path, None);
        assert!(
            began.elapsed() < Duration::from_secs(5),
            "the wait was bounded, and the shell was not waited out"
        );
    }

    #[test]
    fn a_shell_that_is_not_there_is_no_answer() {
        assert_eq!(read("/no/such/shell", BOUND), None);
    }

    #[test]
    fn a_driven_run_asks_no_shell() {
        assert_eq!(login_path(true), None);
    }
}
