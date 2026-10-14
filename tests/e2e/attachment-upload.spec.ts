import { createHash } from "node:crypto";
import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";

const uploadResultSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      size: z.number(),
      isImage: z.boolean(),
    }),
  ),
});

test("uploads a ZIP from the attachment picker to the remote host", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const { project } = await remoteWorkspace.provision();
  await remoteWorkspace.startThread(project.id);

  // A real ZIP containing a short text file; use the browser picker and real SFTP transport.
  const zip = Buffer.from(
    "UEsDBC0ACAAIAJ1FTF0AAAAA//////////8BABQALQEAEAAAAAAAAAAAAAAAAAAAAAAAi/IMUEgsKUlMzshNzStRKC3IyU9MUShKTS9KLS7OzM/jAgBQSwcI462zHyMAAAAAAAAAIQAAAAAAAABQSwECHgMtAAgACACdRUxd462zHyMAAAAhAAAAAQAAAAAAAAABAAAAgBEAAAAALVBLBQYAAAAAAQABAC8AAABuAAAAAAA=",
    "base64",
  );
  await page.getByRole("button", { name: "附加文件或图片" }).click();
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/uploads" && response.request().method() === "POST",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "attachment.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  const response = await uploaded;
  expect(response.ok(), await response.text()).toBe(true);
  const result = uploadResultSchema.parse(await response.json());
  expect(result.files).toHaveLength(1);
  const file = result.files[0]!;
  expect(file).toMatchObject({ name: "attachment.zip", size: zip.length, isImage: false });
  await expect(page.getByText("attachment.zip", { exact: true })).toBeVisible();

  try {
    const remoteFile = await execRemoteSsh(
      remoteWorkspace.remote,
      `sha256sum -- ${shellQuote(file.path)}`,
    );
    expect(remoteFile.stdout.trim().split(/\s+/)[0]).toBe(
      createHash("sha256").update(zip).digest("hex"),
    );
    await page.getByRole("button", { name: "移除附件" }).click();
    await expect(page.getByText("attachment.zip", { exact: true })).toBeHidden();
  } finally {
    await execRemoteSsh(remoteWorkspace.remote, `rm -- ${shellQuote(file.path)}`);
  }
});
