import type { HostCreateInput, HostRecord, HostUpdateInput } from "~~/shared/types";
import { trimmedOrNull } from "~~/shared/utils/strings";
import { currentGatewayMemoryState, nextId, nowIso } from "./memory";
import type { StoredHostRecord } from "../storage/config-types";

function sanitizeHost(host: StoredHostRecord): HostRecord {
  return {
    id: host.id,
    name: host.name,
    sshHost: host.sshHost,
    username: host.username,
    port: host.port,
    authMode: host.authMode,
    hostKeyFingerprint: host.hostKeyFingerprint,
    privateKeyPath: host.privateKeyPath,
    proxyUrl: publicProxyUrl(host.proxyUrl),
    hasPassword: Boolean(host.password),
    hasPrivateKey: Boolean(host.privateKey),
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  };
}

function publicProxyUrl(value: string | null) {
  if (!value) return null;
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.href;
}

function normalizeHost(input: HostCreateInput, id = nextId(currentGatewayMemoryState().hosts)) {
  const timestamp = nowIso();
  const existing = currentGatewayMemoryState().hosts.find((host) => host.id === id);
  // Omitted credentials keep their server-side value; explicit null clears them. Exporting and
  // reimporting the public config must not erase write-only passwords, keys, or proxy credentials.
  const privateKey = input.privateKey === undefined ? existing?.privateKey : input.privateKey;
  const password = input.password === undefined ? existing?.password : input.password;
  const proxyUrl =
    existing && input.proxyUrl === publicProxyUrl(existing.proxyUrl)
      ? existing.proxyUrl
      : trimmedOrNull(input.proxyUrl);
  return {
    id,
    name: input.name.trim(),
    sshHost: input.sshHost.trim(),
    username: trimmedOrNull(input.username),
    port: input.port ?? null,
    authMode: input.authMode,
    hostKeyFingerprint:
      input.hostKeyFingerprint === undefined
        ? (existing?.hostKeyFingerprint ?? null)
        : input.hostKeyFingerprint,
    privateKeyPath: trimmedOrNull(input.privateKeyPath),
    privateKey: privateKey ?? null,
    password: password ?? null,
    proxyUrl,
    hasPassword: Boolean(password),
    hasPrivateKey: Boolean(privateKey),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export const hostStore = {
  replaceHosts(hosts: StoredHostRecord[]) {
    currentGatewayMemoryState().hosts = hosts.map((host) => ({
      ...normalizeHost(host, host.id),
      createdAt: host.createdAt,
      updatedAt: host.updatedAt,
    }));
  },

  list(): HostRecord[] {
    return currentGatewayMemoryState()
      .hosts.map(sanitizeHost)
      .sort((left, right) => left.name.localeCompare(right.name));
  },

  listWithSecret(): StoredHostRecord[] {
    return [...currentGatewayMemoryState().hosts];
  },

  get(id: number): HostRecord | null {
    const host = currentGatewayMemoryState().hosts.find((item) => item.id === id);
    return host ? sanitizeHost(host) : null;
  },

  getWithSecret(id: number): StoredHostRecord | null {
    return currentGatewayMemoryState().hosts.find((item) => item.id === id) ?? null;
  },

  create(input: HostCreateInput): HostRecord {
    const host = normalizeHost(input);
    currentGatewayMemoryState().hosts.push(host);
    return sanitizeHost(host);
  },

  update(id: number, input: HostUpdateInput): HostRecord | null {
    const existing = currentGatewayMemoryState().hosts.find((host) => host.id === id);
    if (!existing) {
      return null;
    }
    const host = normalizeHost(input, id);
    currentGatewayMemoryState().hosts = currentGatewayMemoryState().hosts.map((item) =>
      item.id === id ? host : item,
    );
    return sanitizeHost(host);
  },

  delete(id: number) {
    currentGatewayMemoryState().hosts = currentGatewayMemoryState().hosts.filter(
      (host) => host.id !== id,
    );
  },

  hostIds() {
    return new Set(currentGatewayMemoryState().hosts.map((host) => host.id));
  },

  count() {
    return currentGatewayMemoryState().hosts.length;
  },
};
