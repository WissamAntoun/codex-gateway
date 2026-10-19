import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp } from "./helpers/app";

const resultSchema = z.object({
  rejected: z.boolean(),
  loadedConfigPreserved: z.boolean(),
  storedConfigPreserved: z.boolean(),
  storedCiphertextUnchanged: z.boolean(),
  secondReadDidNotRewrite: z.boolean(),
});

test("stored empty project preferences migrate once without losing SSH credentials", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const host = await remoteWorkspace.addHost();
  for (const reader of ["user", "startup"]) {
    for (const variant of ["empty", "current", "v1"]) {
      const result = await authenticatedFetch(
        page,
        { url: "/api/e2e/stored-config-migration", method: "POST", body: { reader, variant } },
        (value) => resultSchema.parse(value),
      );
      expect(result).toEqual({
        rejected: false,
        loadedConfigPreserved: true,
        storedConfigPreserved: true,
        storedCiphertextUnchanged: variant === "current",
        secondReadDidNotRewrite: true,
      });
    }
  }
  const models = await authenticatedFetch(page, { url: `/api/models?hostId=${host.id}` }, (value) =>
    z.object({ data: z.array(z.unknown()) }).parse(value),
  );
  expect(models.data.length).toBeGreaterThan(0);
});

test("stored migration rejects unsupported preferences and HTTP input stays strict", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  await remoteWorkspace.addHost();
  for (const reader of ["user", "startup"]) {
    for (const variant of ["non-empty", "wrong-type", "other-field"]) {
      const result = await authenticatedFetch(
        page,
        { url: "/api/e2e/stored-config-migration", method: "POST", body: { reader, variant } },
        (value) => resultSchema.parse(value),
      );
      expect(result.rejected).toBe(true);
      expect(result.storedCiphertextUnchanged).toBe(true);
    }
  }
  const config = await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
    z.record(z.string(), z.unknown()).parse(value),
  );
  const status = await page.evaluate(async (config) => {
    const token = localStorage.getItem("codex-gateway-auth-token");
    const response = await fetch("/api/config/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...config, hiddenProjects: [] }),
    });
    return response.status;
  }, config);
  expect(status).toBe(400);
  expect(
    await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
      z.record(z.string(), z.unknown()).parse(value),
    ),
  ).toEqual(config);
});
