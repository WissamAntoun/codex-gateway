import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { execRemoteSsh, sendTextTurn } from "./helpers/remote-codex";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";

test("pinned conversations retain their Codex working directory when a project is repointed", async ({
  page,
  context,
  remoteWorkspace,
}) => {
  test.setTimeout(6 * 60_000);
  await openApp(page, { interceptRealtime: false });
  const suffix = Date.now();
  const originalPath = `/home/codex/thread-root-${suffix}`;
  const newPath = `/home/codex/project-root-${suffix}`;
  await execRemoteSsh(remoteWorkspace.remote, `mkdir -p '${originalPath}' '${newPath}'`);
  try {
    const { host, project } = await remoteWorkspace.provision({ remotePath: originalPath });
    const threadId = await remoteWorkspace.startThread(project.id);
    const ready = `root-ready-${suffix}`;
    await sendTextTurn(page, ready);
    await expect(
      page.getByTestId("chat-scroll-area").getByText(ready, { exact: true }),
    ).toBeVisible({
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    await page.getByTestId(`thread-button-${threadId}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: /置顶/ }).click();

    // Repoint the project through the actual edit dialog. Existing conversations are independent
    // app-server resources; changing this grouping must not redirect their next turn's directory.
    if (!(await page.getByTestId(`project-button-${project.id}`).isVisible())) {
      await page.getByTestId(`host-button-${host.id}`).click();
    }
    await page.getByTestId(`project-button-${project.id}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: /编辑项目/ }).click();
    await page.getByTestId("project-path-input").fill(newPath);
    const edited = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/projects/${project.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.getByTestId("add-project-button").click();
    expect((await edited).ok()).toBe(true);

    await page.getByTestId(`pinned-thread-button-${threadId}`).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("projectId"))
      .not.toBe(String(project.id));
    const resolvedProjectId = Number(new URL(page.url()).searchParams.get("projectId"));
    const configSchema = z
      .object({
        projects: z.array(
          z.object({ id: z.number(), hostId: z.number(), remotePath: z.string() }).loose(),
        ),
        pinnedThreads: z.array(
          z.object({ threadId: z.string(), projectId: z.number().nullable() }).loose(),
        ),
      })
      .loose();
    await expect
      .poll(async () => {
        const config = await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
          configSchema.parse(value),
        );
        return {
          project: config.projects.find((candidate) => candidate.id === resolvedProjectId),
          pin: config.pinnedThreads.find((candidate) => candidate.threadId === threadId)?.projectId,
        };
      })
      .toMatchObject({
        project: { id: resolvedProjectId, hostId: host.id, remotePath: originalPath },
        pin: resolvedProjectId,
      });

    await reloadApp(page);
    await page.getByTestId(`pinned-thread-button-${threadId}`).click();
    await page.getByPlaceholder("输入后续修改要求").fill("执行 pwd 命令，只回复实际工作目录。");
    await page.getByTestId("send-turn-button").click();
    await expect(page.getByTestId("chat-scroll-area")).toContainText(originalPath, {
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("chat-scroll-area")).toContainText(originalPath);

    // Delete that project in another browser tab while this one remains open. A real rejected send
    // must show the backend's reason, not only the generic action label.
    const other = await context.newPage();
    try {
      await openApp(other, { resetConfig: false, interceptRealtime: false });
      await other.getByTestId(`host-button-${host.id}`).click();
      await other.getByTestId(`project-button-${resolvedProjectId}`).click({ button: "right" });
      const deleted = other.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/projects/${resolvedProjectId}`) &&
          response.request().method() === "DELETE",
      );
      await other.getByRole("menuitem", { name: /删除项目/ }).click();
      expect((await deleted).ok()).toBe(true);
      await sendTextTurn(page, "只回复 ok");
      await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: "Project not found" }),
      ).toBeVisible();
    } finally {
      await other.close();
    }
  } finally {
    await execRemoteSsh(remoteWorkspace.remote, `rm -rf '${originalPath}' '${newPath}'`);
  }
});
