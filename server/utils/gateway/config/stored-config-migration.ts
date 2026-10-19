import { z } from "zod";
import { parseGatewayConfig } from "../http/validation/config";

const storedConfigWithEmptyHiddenProjects = z
  .object({ version: z.literal(2), hiddenProjects: z.tuple([]) })
  .loose();

const previousConfig = z
  .object({
    version: z.literal(1),
    projects: z.array(z.unknown()).optional(),
    pinnedThreads: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();

// Migration is confined to the encrypted storage boundary. HTTP/WS and all runtime code accept
// only the current schema; keeping old numeric identities there would recreate parallel models.
export function migrateStoredConfig(value: unknown) {
  // A sidebar build saved this unsupported preference in v2. Only an exact empty array can be
  // removed without losing user settings. The current parser still rejects every other unknown
  // field, and HTTP/WS input never passes through this storage-only normalization.
  const emptyPreference = storedConfigWithEmptyHiddenProjects.safeParse(value);
  if (emptyPreference.success) {
    const { hiddenProjects: _hiddenProjects, ...retained } = emptyPreference.data;
    return { config: parseGatewayConfig(retained), migrated: true };
  }
  const old = previousConfig.safeParse(value);
  if (!old.success) return { config: parseGatewayConfig(value), migrated: false };
  const { projects: _projects, ...retained } = old.data;
  const pinnedThreads = (old.data.pinnedThreads ?? []).map((pin) => {
    const { projectId: _projectId, ...thread } = pin;
    return thread;
  });
  return {
    config: parseGatewayConfig({ ...retained, version: 2, pinnedThreads }),
    migrated: true,
  };
}
