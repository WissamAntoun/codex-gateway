import { createHash, timingSafeEqual } from "node:crypto";
import { SSH_HOST_KEY_FINGERPRINT_PATTERN } from "~~/shared/ssh";

export function sshHostKeyVerifier(fingerprint: string | null) {
  if (!fingerprint || !SSH_HOST_KEY_FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new Error("Configure a trusted SSH SHA256 host-key fingerprint before connecting");
  }
  const expected = Buffer.from(fingerprint.slice("SHA256:".length), "base64");
  return (key: Buffer) => {
    const actual = createHash("sha256").update(key).digest();
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  };
}
