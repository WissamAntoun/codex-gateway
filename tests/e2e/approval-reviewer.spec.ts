import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { sendRealtimeRequest } from "./helpers/realtime";
import { waitForSelectedThreadId } from "./helpers/remote-codex";
import {
  installRealtimeSocketProbe,
  realtimeClientMessageCount,
  waitForRealtimeClientMessage,
} from "./helpers/realtime-socket-probe";

async function readSettings(page: Page, hostId: number, threadId: string) {
  const response = await sendRealtimeRequest(page, {
    type: "thread.settings.read",
    requestId: "approval-settings",
    hostId,
    threadId,
  });
  if (response.type !== "thread.settings.snapshot") throw new Error("Expected thread settings");
  return response.threadSettings;
}

async function selectApprovalMode(page: Page, name: string, existingThread = false) {
  await page.getByTestId("approval-policy-trigger").click();
  const saved = existingThread
    ? page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/threads/settings" &&
          response.request().method() === "POST",
      )
    : null;
  await page.getByRole("button", { name, exact: false }).click();
  if (saved !== null) expect((await saved).ok()).toBe(true);
  await page.keyboard.press("Escape");
}

test("Approve for me routes new threads and turns to the automatic reviewer", async ({
  page,
  context,
  remoteWorkspace,
}) => {
  await installRealtimeSocketProbe(page);
  await openApp(page, { interceptRealtime: false });
  const { host, project } = await remoteWorkspace.provision();
  await page.getByTestId(`project-button-${project.remotePath}`).click();
  await selectApprovalMode(page, "帮我审批");
  const offset = await realtimeClientMessageCount(page);
  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await page.getByTestId("slash-command-new").click();
  const threadId = await waitForSelectedThreadId(page);
  expect(await waitForRealtimeClientMessage(page, "thread.start", offset)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });
  await expect(page.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "帮我审批");

  // A separate model update must preserve the reviewer selected on thread/start.
  await authenticatedFetch(
    page,
    {
      url: "/api/threads/settings",
      method: "POST",
      body: { hostId: host.id, threadId, model: remoteWorkspace.remote.testModel },
    },
    () => undefined,
  );
  const marker = `approval-reviewer-${Date.now()}`;
  const turnOffset = await realtimeClientMessageCount(page);
  await page.getByPlaceholder("输入后续修改要求").fill(`不要调用工具，只回复 ${marker}`);
  await page.getByTestId("send-turn-button").click();
  expect(await waitForRealtimeClientMessage(page, "turn.start", turnOffset)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 180_000,
  });
  // Codex creates a durable rollout on the first turn. Only then may another browser or an
  // explicit settings read resume the thread; thread/start alone has no rollout to resume.
  const other = await context.newPage();
  await openApp(other, { resetConfig: false, interceptRealtime: false });
  await other.getByTestId(`thread-button-${threadId}`).click();
  await expect(other.getByTestId("chat-scroll-area")).toContainText(marker);
  await expect(other.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "帮我审批");
  await reloadApp(page);
  await expect(page.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "帮我审批");
  expect(await readSettings(page, host.id, threadId)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });

  await selectApprovalMode(other, "请求审批", true);
  expect(await readSettings(page, host.id, threadId)).toMatchObject({
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
  });
  await expect(page.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "请求审批");
  await selectApprovalMode(page, "帮我审批", true);
  await expect(other.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "帮我审批");
  expect(await readSettings(other, host.id, threadId)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });
});

test("manual on-request approval is not displayed as Approve for me", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const { host, project } = await remoteWorkspace.provision();
  const threadId = await remoteWorkspace.startThread(project.remotePath);
  await authenticatedFetch(
    page,
    {
      url: "/api/threads/settings",
      method: "POST",
      body: {
        hostId: host.id,
        threadId,
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
      },
    },
    () => undefined,
  );
  await page
    .getByPlaceholder("输入后续修改要求")
    .fill("不要调用工具，只回复 approval settings ready");
  await page.getByTestId("send-turn-button").click();
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 180_000,
  });
  await reloadApp(page);
  await expect(page.getByTestId("approval-policy-trigger")).toHaveAttribute("title", "自定义");
  expect(await readSettings(page, host.id, threadId)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
  });
  await selectApprovalMode(page, "帮我审批", true);
  expect(await readSettings(page, host.id, threadId)).toMatchObject({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });
});
