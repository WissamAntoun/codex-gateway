import { z } from "zod";
import type { ApprovalPolicy, ThreadSettingsState } from "./types/thread";

export const approvalsReviewerSchema = z.enum(["user", "auto_review", "guardian_subagent"]);

export function approvalSettingsForMode(
  mode: ApprovalPolicy | "custom",
): Pick<ThreadSettingsState, "approvalPolicy" | "approvalsReviewer"> {
  return {
    approvalPolicy: mode === "custom" ? null : mode,
    approvalsReviewer: mode === "custom" ? null : mode === "on-request" ? "auto_review" : "user",
  };
}

export function approvalModeFromSettings(settings: ThreadSettingsState): ApprovalPolicy | "custom" {
  // on-request only describes when to ask. A manual reviewer must never be labelled auto-review.
  if (settings.approvalPolicy === "on-request" && settings.approvalsReviewer !== "auto_review") {
    return "custom";
  }
  return settings.approvalPolicy ?? "custom";
}
