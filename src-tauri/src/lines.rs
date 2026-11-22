//! A child's stdout, read a line at a time with a bound on the line.
//!
//! `BufRead::lines` holds a line until its newline arrives, however long that
//! is, so a child writing without one grows a `String` until the app is killed;
//! and it fails the whole read on a line that is not UTF-8, which ends a relay
//! over one bad byte. Every relay from a child reads through this instead
//! (ADR 0013 rule 6): a line comes back as bytes for the caller to judge, and
//! one past the cap comes back as its length alone, never held.
//!
//! No `tauri::` types (ADR 0014).

use std::io::{self, BufRead};

/// One line, without its newline (or `\r\n`).
#[derive(Debug, PartialEq, Eq)]
pub enum Line {
    Whole(Vec<u8>),
    /// Longer than the cap: skipped to its newline, and this is how long it
    /// was.
    TooLong(usize),
}

/// The lines of `reader`, none held past `cap` bytes.
pub fn bounded<R: BufRead>(reader: R, cap: usize) -> Bounded<R> {
    Bounded { reader, cap }
}

pub struct Bounded<R> {
    reader: R,
    cap: usize,
}

impl<R: BufRead> Iterator for Bounded<R> {
    type Item = io::Result<Line>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut line = Vec::new();
        let mut len = 0;
        loop {
            let available = match self.reader.fill_buf() {
                Ok(available) => available,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => return Some(Err(e)),
            };
            if available.is_empty() {
                // End of the stream: a last line without a newline is still a
                // line.
                if len == 0 {
                    return None;
                }
                break;
            }
            let newline = available.iter().position(|&b| b == b'\n');
            let part = &available[..newline.unwrap_or(available.len())];
            len += part.len();
            if len <= self.cap {
                line.extend_from_slice(part);
            } else if !line.is_empty() {
                line = Vec::new();
            }
            let used = part.len() + usize::from(newline.is_some());
            self.reader.consume(used);
            if newline.is_some() {
                break;
            }
        }
        if len > self.cap {
            return Some(Ok(Line::TooLong(len)));
        }
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        Some(Ok(Line::Whole(line)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::BufReader;

    fn read(input: &[u8], cap: usize) -> Vec<Line> {
        bounded(input, cap).map(Result::unwrap).collect()
    }

    #[test]
    fn lines_come_back_without_their_newlines() {
        assert_eq!(
            read(b"one\r\ntwo\nlast", 16),
            vec![
                Line::Whole(b"one".to_vec()),
                Line::Whole(b"two".to_vec()),
                Line::Whole(b"last".to_vec()),
            ]
        );
    }

    #[test]
    fn a_line_past_the_cap_is_skipped_and_the_next_one_is_whole() {
        // The pair: a line at exactly the cap is kept, so the bound is the
        // cap and not one short of it.
        assert_eq!(
            read(b"abcd\nabcde\nok\n", 4),
            vec![
                Line::Whole(b"abcd".to_vec()),
                Line::TooLong(5),
                Line::Whole(b"ok".to_vec()),
            ]
        );
    }

    #[test]
    fn a_long_line_arriving_in_pieces_is_measured_whole() {
        // A pipe hands a long line over in buffer-sized reads; the cap is on
        // the line, not on one read of it.
        let input = [b"x".repeat(100), b"\nok\n".to_vec()].concat();
        let reader = BufReader::with_capacity(8, input.as_slice());
        let lines: Vec<Line> = bounded(reader, 50).map(Result::unwrap).collect();
        assert_eq!(lines, vec![Line::TooLong(100), Line::Whole(b"ok".to_vec())]);
    }

    #[test]
    fn a_line_that_is_not_utf8_is_a_line_not_an_error() {
        // `BufRead::lines` fails the read here, which ended a relay.
        assert_eq!(
            read(b"\xff\xfe\nok\n", 16),
            vec![Line::Whole(vec![0xff, 0xfe]), Line::Whole(b"ok".to_vec())]
        );
    }
}
