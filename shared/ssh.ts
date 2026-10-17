// OpenSSH SHA-256 fingerprints contain the unpadded base64 digest of the host key.
export const SSH_HOST_KEY_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]$/;
