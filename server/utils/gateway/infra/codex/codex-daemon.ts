import { z } from "zod";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret } from "../ssh/ssh-types";
import { codexRemotePayload, remoteLoginShellCommand } from "../ssh/remote-command";
import { firstNonEmptyString } from "~~/shared/utils/strings";

const restartResponseSchema = z.object({ status: z.literal("restarted") });

export async function restartCodexDaemon(ssh: SshConnectionPool, host: HostWithSecret) {
  // The official lifecycle command owns process identity, graceful shutdown and thread/Goal
  // recovery. Never replace it with killall or reuse the upgrade-only unmanaged termination path:
  // those can stop unrelated Codex processes and disconnect an already authenticated MFA SSH.
  const result = await ssh.exec(
    host,
    remoteLoginShellCommand(
      codexRemotePayload('set -eu; cd "$HOME"; exec "$CODEX_BIN" app-server daemon restart'),
    ),
    { timeoutMs: 7 * 60_000, maxOutputBytes: 64 * 1024 },
  );
  if (result.code !== 0) {
    throw new Error(
      firstNonEmptyString([result.stderr, result.stdout]) ?? "Codex daemon restart failed",
    );
  }
  restartResponseSchema.parse(JSON.parse(result.stdout));
}
