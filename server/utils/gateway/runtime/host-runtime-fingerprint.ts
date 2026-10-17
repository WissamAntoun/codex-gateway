import type { HostWithSecret } from "../infra/ssh/ssh-types";

export function hostRuntimeFingerprint(host: HostWithSecret) {
  return JSON.stringify({
    sshHost: host.sshHost,
    username: host.username,
    port: host.port,
    authMode: host.authMode,
    hostKeyFingerprint: host.hostKeyFingerprint,
    privateKeyPath: host.privateKeyPath,
    privateKey: host.privateKey,
    password: host.password,
    proxyUrl: host.proxyUrl,
  });
}
