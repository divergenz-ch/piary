//! The attachment store: files the user handed the agent, kept beside the
//! conversation that references them, and the only code allowed to resolve an
//! attachment name into a path.
//!
//! The document holds a site-relative `/attachments/<name>` (the format's
//! §Attachments); the model needs bytes. A file is named and typed here, on the
//! way in, by the rules an earlier Piary used, so a document it
//! wrote reads the same here. The mime is sniffed from the
//! bytes, never taken from the page: it decides whether a file becomes vision
//! content, and a claim is the one thing a caller controls for free.
//!
//! **The name guard is the security surface,** as the id guard is in `docs.rs`:
//! every path reaching the filesystem comes from `path_of`, and each refusal
//! has a paired test asserting the legitimate case still works.
//!
//! No `tauri::` types (ADR 0014).

use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::docs::{self, DocPaths};
use crate::wire::Stored;

/// The largest file taken: 10 MiB.
pub const MAX_BYTES: usize = 10 * 1024 * 1024;

/// How much of a file the sniffer reads: pi's `IMAGE_TYPE_SNIFF_BYTES`.
const SNIFF_BYTES: usize = 4100;

/// The longest stem a stored name keeps.
const MAX_STEM: usize = 60;

/// The longest extension kept from an original name the mime gives none for.
const MAX_EXT: usize = 10;

const OCTET_STREAM: &str = "application/octet-stream";

/// Where one workspace's attachments live: beside its documents.
pub fn dir(paths: &DocPaths) -> PathBuf {
    paths.doc_dir.join("attachments")
}

/// The mime a file's bytes declare: an image type pi takes, a PDF, or
/// `application/octet-stream`.
///
/// The image rules are pi's own `detectSupportedImageMimeType`
/// (`utils/mime.js`), ported: an animated PNG and a `ff d8 ff f7` JPEG are not
/// images pi takes, so they are not images here either.
pub fn sniff(bytes: &[u8]) -> &'static str {
    let head = &bytes[..bytes.len().min(SNIFF_BYTES)];
    image_mime(head).unwrap_or(if head.starts_with(b"%PDF-") {
        "application/pdf"
    } else {
        OCTET_STREAM
    })
}

const PNG_SIGNATURE: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

/// pi's `detectSupportedImageMimeType`, rule for rule.
fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return (bytes.get(3) != Some(&0xf7)).then_some("image/jpeg");
    }
    if bytes.starts_with(PNG_SIGNATURE) {
        return (is_png(bytes) && !is_animated_png(bytes)).then_some("image/png");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return Some("image/webp");
    }
    if bytes.starts_with(b"BM") && is_bmp(bytes) {
        return Some("image/bmp");
    }
    None
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() >= 16 && u32_be(bytes, 8) == 13 && bytes.get(12..16) == Some(b"IHDR")
}

/// An `acTL` chunk before the first `IDAT` marks an APNG.
fn is_animated_png(bytes: &[u8]) -> bool {
    let mut offset = PNG_SIGNATURE.len();
    while offset + 8 <= bytes.len() {
        match bytes.get(offset + 4..offset + 8) {
            Some(b"acTL") => return true,
            Some(b"IDAT") => return false,
            _ => {}
        }
        let next = offset + 12 + u32_be(bytes, offset) as usize;
        if next > bytes.len() {
            return false;
        }
        offset = next;
    }
    false
}

fn is_bmp(bytes: &[u8]) -> bool {
    if bytes.len() < 26 {
        return false;
    }
    let declared_size = u32_le(bytes, 2);
    let pixel_offset = u32_le(bytes, 10);
    let dib_size = u32_le(bytes, 14);
    if declared_size != 0 && declared_size < 26 {
        return false;
    }
    if u64::from(pixel_offset) < 14 + u64::from(dib_size) {
        return false;
    }
    if declared_size != 0 && pixel_offset >= declared_size {
        return false;
    }
    let (planes, bits) = match dib_size {
        12 => (u16_le(bytes, 22), u16_le(bytes, 24)),
        40..=124 if bytes.len() >= 30 => (u16_le(bytes, 26), u16_le(bytes, 28)),
        _ => return false,
    };
    planes == 1 && matches!(bits, 1 | 4 | 8 | 16 | 24 | 32)
}

/// Reads past the end as zero, as pi's readers do.
fn byte(bytes: &[u8], at: usize) -> u32 {
    u32::from(bytes.get(at).copied().unwrap_or(0))
}

fn u16_le(bytes: &[u8], at: usize) -> u32 {
    byte(bytes, at) | byte(bytes, at + 1) << 8
}

fn u32_le(bytes: &[u8], at: usize) -> u32 {
    u16_le(bytes, at) | u16_le(bytes, at + 2) << 16
}

fn u32_be(bytes: &[u8], at: usize) -> u32 {
    byte(bytes, at) << 24
        | byte(bytes, at + 1) << 16
        | byte(bytes, at + 2) << 8
        | byte(bytes, at + 3)
}

/// The extension a sniffed mime is stored under.
fn ext_for_mime(mime: &str) -> Option<&'static str> {
    Some(match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/bmp" => ".bmp",
        "application/pdf" => ".pdf",
        _ => return None,
    })
}

/// `(stored name, display name)` for an upload called `filename`.
///
/// The stored name is `<stem>-<id><ext>`, so two uploads of `screenshot.png`
/// never collide; the display name, which the document's link shows, is
/// `<stem><ext>`. The stem is the original's last path segment without its
/// extension, every character but `[A-Za-z0-9_.-]` turned into a dash, cut to
/// 60, or `file`. The extension is the mime's, else the original's, cleaned.
pub fn stored_name(filename: &str, mime: &str, id: &str) -> (String, String) {
    let segment = filename.rsplit(['/', '\\']).next().unwrap_or_default();
    let bare = segment.rfind('.').map_or(segment, |dot| &segment[..dot]);
    let mut stem = String::new();
    for c in bare.chars() {
        if is_name_char(c) {
            stem.push(c);
        } else {
            // One dash per UTF-16 unit, so a name an earlier Piary stored cleans the same.
            stem.extend(std::iter::repeat_n('-', c.len_utf16()));
        }
    }
    stem.truncate(MAX_STEM);
    if stem.is_empty() {
        stem = "file".into();
    }
    let ext = match ext_for_mime(mime) {
        Some(ext) => ext.to_string(),
        None => original_ext(filename)
            .chars()
            .filter(|&c| c == '.' || c == '_' || c.is_ascii_alphanumeric())
            .take(MAX_EXT)
            .collect(),
    };
    (format!("{stem}-{id}{ext}"), format!("{stem}{ext}"))
}

fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-')
}

/// Node's posix `extname`: from the last dot of the last `/` segment, unless
/// that dot only follows dots (`.bashrc`, `..`).
fn original_ext(filename: &str) -> &str {
    let base = filename.rsplit('/').next().unwrap_or_default();
    match base.rfind('.') {
        Some(dot) if base[..dot].chars().any(|c| c != '.') => &base[dot..],
        _ => "",
    }
}

/// Stores `bytes`, uploaded as `filename`, and describes the result.
///
/// Over `MAX_BYTES` is refused and nothing is written. The write is the
/// documents' atomic one, so a crash mid-store leaves no half a file for the
/// document to reference.
pub fn store(dir: &Path, filename: &str, bytes: &[u8]) -> Result<Stored, String> {
    if bytes.len() > MAX_BYTES {
        return Err(format!(
            "{} bytes is over the {} MB an attachment may be",
            bytes.len(),
            MAX_BYTES / 1024 / 1024
        ));
    }
    let mime = sniff(bytes);
    fs::create_dir_all(dir).map_err(|e| format!("creating the attachment directory: {e}"))?;
    let (id, stored, display) = loop {
        let id = new_id();
        let (stored, display) = stored_name(filename, mime, &id);
        if !dir.join(&stored).exists() {
            break (id, stored, display);
        }
    };
    docs::write_atomically(&path_of(dir, &stored)?, bytes)?;
    Ok(Stored {
        id,
        mime: mime.into(),
        url: format!("/attachments/{stored}"),
        name: display,
        size: bytes.len() as u32,
    })
}

/// The file one stored name names, inside `dir`.
///
/// Refused: an empty name, any separator, a leading dot (which covers `..`),
/// a control character, and anything that does not then resolve inside the
/// store.
pub fn path_of(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.starts_with('.')
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return Err(format!("{name:?} is not an attachment name"));
    }
    let candidate = dir.join(name);
    // Whole components, as `docs::path_of` explains: a sibling that merely
    // prefixes the store's name is not inside it.
    if candidate.parent() != Some(dir) {
        return Err(format!("{name:?} is not inside the attachment store"));
    }
    Ok(candidate)
}

/// A stored attachment's bytes.
pub fn read(dir: &Path, name: &str) -> Result<Vec<u8>, String> {
    fs::read(path_of(dir, name)?).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => format!("no attachment {name}"),
        _ => format!("reading attachment {name}: {e}"),
    })
}

/// The only types served for the webview to render: images and PDFs. Anything
/// else came off someone's machine and is handed back as a download, never
/// interpreted, so an uploaded `.html` cannot run as the page — the browser
/// path's `INLINE_MIME`.
fn inline_mime(name: &str) -> Option<&'static str> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        _ => return None,
    })
}

/// What a file scheme (`piary-file`, `piary-workspace`) answers one request with.
#[derive(Debug, PartialEq, Eq)]
pub struct Served {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

/// Answers `piary-file://localhost/<name>`: the stored file, typed by
/// `inline_mime` or served as a download, and 404 for a name the guard refuses
/// or a file that is gone — which the canvas shows as a broken image.
pub fn serve(dir: &Path, uri_path: &str) -> Served {
    let name = decode_filename(uri_path.strip_prefix('/').unwrap_or(uri_path));
    let Ok(body) = read(dir, &name) else {
        return Served {
            status: 404,
            headers: Vec::new(),
            body: Vec::new(),
        };
    };
    let inline = inline_mime(&name);
    let mut headers = vec![
        ("Content-Type", inline.unwrap_or(OCTET_STREAM).to_string()),
        ("X-Content-Type-Options", "nosniff".to_string()),
        // A stored name carries a random id, so it is always the same bytes.
        (
            "Cache-Control",
            "public, max-age=31536000, immutable".to_string(),
        ),
    ];
    if inline.is_none() {
        headers.push((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", name.replace('"', "")),
        ));
    }
    Served {
        status: 200,
        headers,
        body,
    }
}

/// The filename the page sent, percent-decoded as `encodeURIComponent`
/// encoded it. Undecodable input is kept as it came: it
/// is only ever a name to clean, never a path.
pub fn decode_filename(encoded: &str) -> String {
    let raw = encoded.as_bytes();
    let mut bytes = Vec::with_capacity(raw.len());
    let mut at = 0;
    while at < raw.len() {
        if raw[at] == b'%' {
            let hex = encoded.get(at + 1..at + 3);
            match hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                Some(value) => bytes.push(value),
                None => return encoded.into(),
            }
            at += 3;
        } else {
            bytes.push(raw[at]);
            at += 1;
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| encoded.into())
}

/// Distinguishes this process's ids from one another when the random state
/// alone would not.
static ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Eight lowercase hex characters, the shape `randomUUID().slice(0, 8)` gives.
fn new_id() -> String {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u64(ID_SEQUENCE.fetch_add(1, Ordering::Relaxed));
    format!("{:08x}", hasher.finish() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A store directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("piary-attachments-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
        /// The store inside the scratch directory, not yet created.
        fn store(&self) -> PathBuf {
            self.0.join("attachments")
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// A PNG's signature and IHDR chunk header, which is all the sniffer reads.
    fn png() -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&[0; 13]);
        bytes.extend_from_slice(&[0; 4]);
        bytes
    }

    /// A PNG whose first chunk after IHDR is `acTL`: an animation.
    fn animated_png() -> Vec<u8> {
        let mut bytes = png();
        bytes.extend_from_slice(&8u32.to_be_bytes());
        bytes.extend_from_slice(b"acTL");
        bytes.extend_from_slice(&[0; 12]);
        bytes
    }

    // ---- typing a file

    #[test]
    fn the_mime_is_sniffed_from_the_bytes_not_taken_from_the_name() {
        let scratch = Scratch::new("sniffed");
        let stored = store(&scratch.store(), "x.txt", &png()).unwrap();
        assert_eq!(stored.mime, "image/png");
        assert!(stored.url.ends_with(".png"), "{}", stored.url);
        assert_eq!(stored.name, "x.png");
    }

    #[test]
    fn every_image_type_pi_takes_is_recognized() {
        assert_eq!(sniff(&png()), "image/png");
        assert_eq!(sniff(&[0xff, 0xd8, 0xff, 0xe0, 0]), "image/jpeg");
        assert_eq!(sniff(b"GIF89a...."), "image/gif");
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), "image/webp");
        let mut bmp = b"BM".to_vec();
        bmp.extend_from_slice(&0u32.to_le_bytes()); // file size: unknown
        bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&54u32.to_le_bytes()); // pixel data offset
        bmp.extend_from_slice(&40u32.to_le_bytes()); // BITMAPINFOHEADER
        bmp.extend_from_slice(&[0; 8]); // width, height
        bmp.extend_from_slice(&1u16.to_le_bytes()); // planes
        bmp.extend_from_slice(&24u16.to_le_bytes()); // bits per pixel
        assert_eq!(sniff(&bmp), "image/bmp");
    }

    #[test]
    fn a_jpeg_pi_refuses_is_not_an_image_here() {
        assert_eq!(sniff(&[0xff, 0xd8, 0xff, 0xf7, 0]), OCTET_STREAM);
    }

    #[test]
    fn an_unknown_type_is_octet_stream_and_keeps_a_cleaned_extension() {
        let scratch = Scratch::new("unknown");
        let stored = store(&scratch.store(), "notes.t$xt", b"plain words").unwrap();
        assert_eq!(stored.mime, OCTET_STREAM);
        assert_eq!(stored.name, "notes.txt");
        assert!(stored.url.ends_with(".txt"), "{}", stored.url);
    }

    #[test]
    fn a_pdf_is_a_pdf() {
        let scratch = Scratch::new("pdf");
        let stored = store(&scratch.store(), "paper.bin", b"%PDF-1.7\n...").unwrap();
        assert_eq!(stored.mime, "application/pdf");
        assert_eq!(stored.name, "paper.pdf");
    }

    #[test]
    fn an_animated_png_is_not_an_image_the_model_takes() {
        assert_eq!(sniff(&animated_png()), OCTET_STREAM);
        // The pair: the still PNG it was built from is one.
        assert_eq!(sniff(&png()), "image/png");
    }

    // ---- naming a file

    #[test]
    fn the_stored_name_carries_the_id_and_the_display_name_does_not() {
        assert_eq!(
            stored_name("shot.png", "image/png", "ab12cd34"),
            ("shot-ab12cd34.png".into(), "shot.png".into())
        );
    }

    #[test]
    fn the_stem_is_cleaned() {
        let (_, display) = stored_name("../../etc/pass wd.png", "image/png", "id");
        assert_eq!(
            display, "pass-wd.png",
            "directories stripped, unsafe dashed"
        );
        let (_, display) = stored_name("C:\\Users\\me\\a.png", "image/png", "id");
        assert_eq!(display, "a.png", "a Windows directory is a directory too");
        let long = format!("{}.png", "x".repeat(80));
        let (_, display) = stored_name(&long, "image/png", "id");
        assert_eq!(display, format!("{}.png", "x".repeat(MAX_STEM)));
        let (_, display) = stored_name(".png", "image/png", "id");
        assert_eq!(display, "file.png", "nothing left of the stem is `file`");
        // The pair: a name that is already clean is kept as it is.
        let (_, display) = stored_name("my_notes-v2.1.png", "image/png", "id");
        assert_eq!(display, "my_notes-v2.1.png");
    }

    #[test]
    fn a_stored_id_is_eight_hex_characters() {
        let scratch = Scratch::new("id");
        let stored = store(&scratch.store(), "a.png", &png()).unwrap();
        assert_eq!(stored.id.len(), 8);
        assert!(stored.id.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(stored.url, format!("/attachments/a-{}.png", stored.id));
        assert_eq!(stored.size, png().len() as u32);
    }

    #[test]
    fn two_uploads_of_one_name_never_collide() {
        let scratch = Scratch::new("collide");
        let first = store(&scratch.store(), "shot.png", &png()).unwrap();
        let mut other = png();
        other.push(1);
        let second = store(&scratch.store(), "shot.png", &other).unwrap();
        assert_ne!(first.url, second.url);
        assert_eq!(first.name, second.name);
        let name = |url: &str| url.trim_start_matches("/attachments/").to_string();
        assert_eq!(read(&scratch.store(), &name(&first.url)).unwrap(), png());
        assert_eq!(read(&scratch.store(), &name(&second.url)).unwrap(), other);
    }

    #[test]
    fn a_file_over_the_cap_is_refused_and_nothing_is_written() {
        let scratch = Scratch::new("cap");
        let huge = vec![0u8; MAX_BYTES + 1];
        assert!(store(&scratch.store(), "big.bin", &huge).is_err());
        assert!(!scratch.store().exists());
        // The pair: exactly the cap is taken.
        assert!(store(&scratch.store(), "edge.bin", &vec![0u8; MAX_BYTES]).is_ok());
    }

    #[test]
    fn a_store_leaves_no_temp_file_behind() {
        let scratch = Scratch::new("notemp");
        store(&scratch.store(), "a.png", &png()).unwrap();
        let names: Vec<String> = fs::read_dir(scratch.store())
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names.len(), 1, "{names:?}");
    }

    // ---- reading one back, behind the guard

    #[test]
    fn a_stored_file_reads_back_byte_for_byte() {
        let scratch = Scratch::new("roundtrip");
        let bytes: Vec<u8> = (0..=255).collect();
        let stored = store(&scratch.store(), "all.bin", &bytes).unwrap();
        let name = stored.url.trim_start_matches("/attachments/");
        assert_eq!(read(&scratch.store(), name).unwrap(), bytes);
    }

    #[test]
    fn a_separator_is_refused_but_a_dash_is_not() {
        let scratch = Scratch::new("separator");
        let store_dir = scratch.store();
        fs::create_dir_all(&store_dir).unwrap();
        fs::write(scratch.0.join("outside"), "secret").unwrap();
        assert!(read(&store_dir, "../outside").is_err());
        assert!(read(&store_dir, "a/b").is_err());
        assert!(read(&store_dir, "a\\b").is_err());
        assert!(read(&store_dir, "/etc/passwd").is_err());
        // The pair.
        fs::write(store_dir.join("a-b.png"), "x").unwrap();
        assert_eq!(read(&store_dir, "a-b.png").unwrap(), b"x");
    }

    #[test]
    fn a_leading_dot_is_refused_but_a_dotted_name_is_not() {
        let scratch = Scratch::new("dots");
        let store_dir = scratch.store();
        fs::create_dir_all(&store_dir).unwrap();
        fs::write(store_dir.join(".hidden"), "x").unwrap();
        assert!(read(&store_dir, ".hidden").is_err());
        assert!(read(&store_dir, "..").is_err());
        assert!(read(&store_dir, ".").is_err());
        assert!(read(&store_dir, "").is_err());
        assert!(read(&store_dir, "a\0b").is_err());
        // The pair.
        fs::write(store_dir.join("notes.v2.txt"), "y").unwrap();
        assert_eq!(read(&store_dir, "notes.v2.txt").unwrap(), b"y");
    }

    #[test]
    fn a_name_resolves_inside_the_store_and_not_a_sibling_that_prefixes_it() {
        let inside = path_of(Path::new("/tmp/attachments"), "a.png").unwrap();
        assert_eq!(inside, PathBuf::from("/tmp/attachments/a.png"));
        assert!(!inside.starts_with("/tmp/attachments-old"));
    }

    #[test]
    fn a_missing_file_is_an_error_not_empty_bytes() {
        let scratch = Scratch::new("missing");
        assert!(read(&scratch.store(), "never.png").is_err());
    }

    // ---- serving one to the webview

    #[test]
    fn a_stored_png_is_served_as_a_png() {
        let scratch = Scratch::new("serve-png");
        let stored = store(&scratch.store(), "a.png", &png()).unwrap();
        let path = stored.url.trim_start_matches("/attachments");
        let served = serve(&scratch.store(), path);
        assert_eq!(served.status, 200);
        assert_eq!(served.body, png());
        assert!(served
            .headers
            .contains(&("Content-Type", "image/png".to_string())));
        assert!(served
            .headers
            .contains(&("X-Content-Type-Options", "nosniff".to_string())));
        assert!(!served
            .headers
            .iter()
            .any(|(k, _)| *k == "Content-Disposition"));
    }

    #[test]
    fn a_refused_name_is_404_and_reads_nothing() {
        let scratch = Scratch::new("serve-refused");
        fs::create_dir_all(scratch.store()).unwrap();
        fs::write(scratch.0.join("outside.png"), png()).unwrap();
        for path in ["/../outside.png", "/%2E%2E%2Foutside.png", "/.hidden", "/"] {
            let served = serve(&scratch.store(), path);
            assert_eq!(served.status, 404, "{path}");
            assert!(served.body.is_empty(), "{path}");
        }
        // The pair: a missing but well-formed name is 404 too, and a present
        // one is served.
        assert_eq!(serve(&scratch.store(), "/gone.png").status, 404);
        fs::write(scratch.store().join("here.png"), png()).unwrap();
        assert_eq!(serve(&scratch.store(), "/here.png").status, 200);
    }

    #[test]
    fn an_unknown_type_is_served_for_download() {
        let scratch = Scratch::new("serve-download");
        let stored = store(&scratch.store(), "page.html", b"<script>1</script>").unwrap();
        let path = stored.url.trim_start_matches("/attachments");
        let served = serve(&scratch.store(), path);
        assert_eq!(served.status, 200);
        assert!(served
            .headers
            .contains(&("Content-Type", OCTET_STREAM.to_string())));
        let name = path.trim_start_matches('/');
        assert!(served.headers.contains(&(
            "Content-Disposition",
            format!("attachment; filename=\"{name}\"")
        )));
    }

    // ---- the filename header

    #[test]
    fn the_filename_is_percent_decoded_as_encode_uri_component_wrote_it() {
        assert_eq!(decode_filename("my%20shot%20%C3%A9.png"), "my shot é.png");
        assert_eq!(decode_filename("plain.png"), "plain.png");
        // Undecodable input is kept; it is only ever a name to clean.
        assert_eq!(decode_filename("100%.png"), "100%.png");
        assert_eq!(decode_filename("%FF.png"), "%FF.png");
    }

    #[test]
    fn the_store_directory_is_beside_the_documents() {
        let paths = DocPaths {
            doc_dir: PathBuf::from("/d"),
        };
        assert_eq!(dir(&paths), PathBuf::from("/d/attachments"));
    }
}
