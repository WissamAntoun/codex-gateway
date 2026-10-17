import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import ssh2 from "ssh2";
import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { hostRecordSchema } from "./helpers/http-schemas";
import { execRemoteSsh, openSettingsTab, closeSettings } from "./helpers/remote-codex";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";

const publicHostSchema = hostRecordSchema.strict();
const configSchema = z
  .object({ version: z.literal(2), hosts: z.array(publicHostSchema) })
  .passthrough();

test("keeps SSH credentials write-only through edits, config round trips, and reconnects", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page);
  const host = await remoteWorkspace.addHost(`credential-boundary-${Date.now()}`);
  const remote = remoteWorkspace.remote;
  const hostUrl = `/api/hosts/${host.id}`;
  const publicHosts = await authenticatedFetch(page, { url: "/api/hosts" }, (value) =>
    z.array(publicHostSchema).parse(value),
  );
  expect(publicHosts.find((candidate) => candidate.id === host.id)?.hasPassword).toBe(true);

  await openSettingsTab(page, "主机");
  await page.getByTestId(`host-edit-toggle-${host.id}`).click();
  const form = page.getByTestId(`host-edit-form-${host.id}`);
  await expect(form.getByLabel("密码", { exact: true })).toHaveValue("");
  await form.getByLabel("名称", { exact: true }).fill(`${host.name}-edited`);
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().endsWith(hostUrl),
  );
  await form.getByRole("button", { name: "保存主机" }).click();
  publicHostSchema.parse(await (await saved).json());
  await closeSettings(page);

  // Verify that a redacted export can be imported without losing the password kept in SQLite.
  const config = await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
    configSchema.parse(value),
  );
  await authenticatedFetch(
    page,
    { url: "/api/config/sync", method: "POST", body: config },
    (value) => configSchema.parse(value),
  );
  const connection = {
    name: `${host.name}-edited`,
    sshHost: remote.host,
    username: remote.username,
    port: Number(remote.port),
    authMode: "password",
    privateKeyPath: null,
    proxyUrl: remote.proxyUrl ?? null,
  };
  const changePin = async (hostKeyFingerprint: string | null) =>
    await authenticatedFetch(
      page,
      { url: hostUrl, method: "PATCH", body: { ...connection, hostKeyFingerprint } },
      (value) => publicHostSchema.parse(value),
    );
  const readModels = async () =>
    await page.evaluate(async (hostId) => {
      const token = localStorage.getItem("codex-gateway-auth-token");
      const response = await fetch(`/api/models?hostId=${hostId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return await response.json();
    }, host.id);

  await changePin(null);
  const missingPin = await readModels();
  expect(
    z.object({ error: z.literal(true), message: z.string() }).parse(missingPin).message,
  ).toContain("trusted SSH SHA256 host-key fingerprint");
  await changePin(`SHA256:${randomBytes(32).toString("base64").replace(/=+$/, "")}`);
  const mismatch = await readModels();
  expect(z.object({ error: z.literal(true), message: z.string() }).parse(mismatch).message).toMatch(
    /verification failed|host key/i,
  );
  await changePin(remote.hostKeyFingerprint);
  expect(
    z.object({ data: z.array(z.unknown()) }).parse(await readModels()).data.length,
  ).toBeGreaterThan(0);

  // Replace password authentication with a real ephemeral key and reconnect through Gateway.
  const key = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const parsedKey = ssh2.utils.parseKey(key.privateKey);
  if (parsedKey instanceof Error || Array.isArray(parsedKey)) throw new Error("Invalid test key");
  const publicKey = `${parsedKey.type} ${parsedKey.getPublicSSH().toString("base64")}`;
  await execRemoteSsh(
    remote,
    `printf '%s\\n' ${shellQuote(publicKey)} >> "$HOME/.ssh/authorized_keys"`,
  );
  await authenticatedFetch(
    page,
    {
      url: hostUrl,
      method: "PATCH",
      body: {
        ...connection,
        authMode: "privateKey",
        hostKeyFingerprint: remote.hostKeyFingerprint,
        privateKey: key.privateKey,
        password: null,
      },
    },
    (value) => {
      const result = publicHostSchema.parse(value);
      expect(result.hasPrivateKey).toBe(true);
      expect(result.hasPassword).toBe(false);
    },
  );
  expect(
    z.object({ data: z.array(z.unknown()) }).parse(await readModels()).data.length,
  ).toBeGreaterThan(0);
  await reloadApp(page);
  const restored = await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
    configSchema.parse(value),
  );
  expect(restored.hosts.find((candidate) => candidate.id === host.id)?.hasPrivateKey).toBe(true);
  await authenticatedFetch(
    page,
    { url: "/api/config/sync", method: "POST", body: restored },
    (value) => configSchema.parse(value),
  );
  connection.authMode = "privateKey";
  await changePin(null);
  await changePin(remote.hostKeyFingerprint);
  expect(
    z.object({ data: z.array(z.unknown()) }).parse(await readModels()).data.length,
  ).toBeGreaterThan(0);
  await authenticatedFetch(
    page,
    {
      url: hostUrl,
      method: "PATCH",
      body: { ...connection, hostKeyFingerprint: remote.hostKeyFingerprint, privateKey: null },
    },
    (value) => expect(publicHostSchema.parse(value).hasPrivateKey).toBe(false),
  );
  await execRemoteSsh(
    remote,
    `sed -i ${shellQuote(`\\|^${publicKey}$|d`)} "$HOME/.ssh/authorized_keys"`,
  );
});

test("never sends Gateway authorization to external image origins", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page);
  const host = await remoteWorkspace.addHost();
  let externalRequests = 0;
  const receiver = createServer((request, response) => {
    externalRequests += 1;
    response.setHeader("access-control-allow-origin", new URL(page.url()).origin);
    response.setHeader("access-control-allow-headers", "authorization");
    response.writeHead(request.method === "OPTIONS" ? 204 : 200);
    response.end();
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const port = (receiver.address() as AddressInfo).port;
  try {
    const urls = [
      `//127.0.0.1:${port}/api/remote/images`,
      ` http://127.0.0.1:${port}/api/remote/images`,
      `/\\127.0.0.1:${port}/api/remote/images`,
      `http://127.0.0.1:${port}/pixel.png`,
    ];
    const rejected = await page.evaluate(async (sources) => {
      const driver = window.__codexGatewayE2e!;
      return await Promise.all(
        sources.map(async (source) => {
          try {
            await driver.loadAuthorizedImage(source);
            return false;
          } catch {
            return true;
          }
        }),
      );
    }, urls);
    expect(rejected.every(Boolean)).toBe(true);
    expect(externalRequests).toBe(0);

    const query = new URLSearchParams({
      hostId: String(host.id),
      path: remoteWorkspace.remote.imagePath,
    });
    await page.evaluate(async (source) => {
      await window.__codexGatewayE2e!.loadAuthorizedImage(source);
      await window.__codexGatewayE2e!.loadAuthorizedImage(new URL(source, location.href).href);
    }, `/api/remote/images?${query}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      receiver.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
