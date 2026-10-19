import { readValidatedBody } from "h3";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { userStore } from "../../../../../../server/utils/gateway/auth/users";
import { defineGatewayEventHandler } from "../../../../../../server/utils/gateway/http/errors";
import { gatewayDatabase } from "../../../../../../server/utils/gateway/storage/database";
import { decryptJson, encryptJson } from "../../../../../../server/utils/gateway/storage/crypto";
import { currentGatewayUserId } from "../../../../../../server/utils/gateway/state/memory";

const inputSchema = z.object({
  reader: z.enum(["user", "startup"]),
  variant: z.enum(["empty", "non-empty", "wrong-type", "other-field", "current", "v1"]),
});
const rowSchema = z.object({ encrypted_config_json: z.string(), updated_at: z.string() });

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => inputSchema.parse(body));
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("Expected an authenticated Gateway user");
  const db = gatewayDatabase();
  const readRow = () =>
    rowSchema.parse(
      db
        .prepare("SELECT encrypted_config_json, updated_at FROM user_configs WHERE user_id = ?")
        .get(userId),
    );
  const before = readRow();
  const original = z
    .record(z.string(), z.unknown())
    .parse(decryptJson(before.encrypted_config_json));
  const additions = {
    empty: { hiddenProjects: [] },
    "non-empty": { hiddenProjects: [{ hostId: 1, cwd: "/saved-project" }] },
    "wrong-type": { hiddenProjects: "[]" },
    "other-field": { hiddenProjects: [], unexpectedPreference: [] },
    current: {},
    v1: { version: 1, projects: [] },
  };
  const seeded = encryptJson({ ...original, ...additions[input.variant] });
  const readConfig = () => {
    if (input.reader === "user") return userStore.loadConfig(userId);
    const entry = userStore.listStoredConfigs().find((entry) => entry.user.id === userId);
    if (entry === undefined) throw new Error("Expected the active user's stored config");
    return entry.config;
  };
  try {
    db.prepare("UPDATE user_configs SET encrypted_config_json = ? WHERE user_id = ?").run(
      seeded,
      userId,
    );
    // Keep injection, both real SQLite load paths, and restoration synchronous. Other requests
    // cannot observe the temporary invalid config, and no credentials leave the test server.
    let rejected = false;
    let loaded: unknown;
    try {
      loaded = readConfig();
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      rejected = true;
    }
    const after = readRow();
    const persisted: unknown = decryptJson(after.encrypted_config_json);
    if (!rejected) readConfig();
    return {
      rejected,
      loadedConfigPreserved: isDeepStrictEqual(loaded, original),
      storedConfigPreserved: isDeepStrictEqual(persisted, original),
      storedCiphertextUnchanged: after.encrypted_config_json === seeded,
      secondReadDidNotRewrite: readRow().encrypted_config_json === after.encrypted_config_json,
    };
  } finally {
    db.prepare(
      "UPDATE user_configs SET encrypted_config_json = ?, updated_at = ? WHERE user_id = ?",
    ).run(before.encrypted_config_json, before.updated_at, userId);
  }
});
