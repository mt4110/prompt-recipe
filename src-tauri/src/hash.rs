//! Stable lowercase SHA-256 representation, independent of digest buffer traits.
use sha2::{Digest, Sha256};
pub fn sha256(input: impl AsRef<[u8]>) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    Sha256::digest(input.as_ref())
        .iter()
        .flat_map(|byte| {
            [
                HEX[(byte >> 4) as usize] as char,
                HEX[(byte & 15) as usize] as char,
            ]
        })
        .collect()
}
#[cfg(test)]
mod tests {
    #[test]
    fn known_vectors_preserve_existing_hash_encoding() {
        assert_eq!(
            super::sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            super::sha256(b"hello world"),
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }
}
