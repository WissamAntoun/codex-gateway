import type { HostRecord } from "~~/shared/types";

export interface HostConnectionFormValue {
  name: string;
  sshHost: string;
  username: string;
  port: string;
  authMode: HostRecord["authMode"];
  hostKeyFingerprint: string;
  privateKeyPath: string;
  privateKey: string;
  password: string;
  proxyUrl: string;
}

export function emptyHostConnectionForm(): HostConnectionFormValue {
  return {
    name: "",
    sshHost: "",
    username: "",
    port: "",
    authMode: "agent",
    hostKeyFingerprint: "",
    privateKeyPath: "",
    privateKey: "",
    password: "",
    proxyUrl: "socks5h://127.0.0.1:7890",
  };
}

export function hostConnectionFormFromRecord(host: HostRecord): HostConnectionFormValue {
  return {
    name: host.name,
    sshHost: host.sshHost,
    username: host.username ?? "",
    port: host.port == null ? "" : String(host.port),
    authMode: host.authMode,
    hostKeyFingerprint: host.hostKeyFingerprint ?? "",
    privateKeyPath: host.privateKeyPath ?? "",
    privateKey: "",
    password: "",
    proxyUrl: host.proxyUrl ?? "",
  };
}

export function hostConnectionPayload(form: HostConnectionFormValue) {
  return {
    ...form,
    username: form.username || null,
    port: form.port ? Number(form.port) : null,
    hostKeyFingerprint: form.hostKeyFingerprint.trim() || null,
    privateKeyPath: form.privateKeyPath || null,
    privateKey: form.privateKey || undefined,
    password: form.password || undefined,
    proxyUrl: form.proxyUrl || null,
  };
}
