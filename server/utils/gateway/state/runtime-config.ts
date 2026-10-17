import type { GatewayConfig } from "~~/shared/types";
import type { StoredGatewayConfig } from "../storage/config-types";
import { normalizeNotificationSettings } from "~~/shared/config";
import { gatewayEventStore } from "./gateway-events";
import { currentGatewayMemoryState } from "./memory";
import { normalizePinnedThreads } from "./memory";
import { hostStore } from "./hosts";
import { projectStore } from "./projects";
import { subAgentThreadStore } from "./sub-agent-threads";
import { threadMetadataStore } from "./thread-metadata";
import { threadSnapshotStore } from "./thread-snapshots";

export const runtimeConfigStore = {
  replace(config: StoredGatewayConfig) {
    hostStore.replaceHosts(config.hosts);
    const hostIds = hostStore.hostIds();
    projectStore.pruneToHosts(hostIds);
    threadMetadataStore.pruneToHosts(hostIds);
    threadSnapshotStore.pruneToHosts(hostIds);
    subAgentThreadStore.pruneToHosts(hostIds);
    gatewayEventStore.pruneToHosts(hostIds);
    currentGatewayMemoryState().pinnedThreads = normalizePinnedThreads(
      config.pinnedThreads ?? [],
    ).filter((thread) => hostIds.has(thread.hostId));
    currentGatewayMemoryState().notifications = normalizeNotificationSettings(config.notifications);
  },

  replacePinnedThreads(pinnedThreads: GatewayConfig["pinnedThreads"]) {
    const hostIds = hostStore.hostIds();
    currentGatewayMemoryState().pinnedThreads = normalizePinnedThreads(pinnedThreads).filter(
      (thread) => hostIds.has(thread.hostId),
    );
  },

  replaceNotifications(notifications: GatewayConfig["notifications"]) {
    currentGatewayMemoryState().notifications = normalizeNotificationSettings(notifications);
  },

  export(): GatewayConfig {
    return {
      version: 2,
      hosts: hostStore.list(),
      pinnedThreads: currentGatewayMemoryState().pinnedThreads,
      notifications: normalizeNotificationSettings(currentGatewayMemoryState().notifications),
    };
  },

  counts() {
    return {
      hosts: hostStore.count(),
      projects: projectStore.count(),
    };
  },
};
