<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2Icon, CircleIcon, LoaderCircleIcon, AlertCircleIcon } from "@lucide/vue";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import {
  hostConnectionClass,
  hostConnectionIsBusy,
  hostConnectionLabelKey,
} from "@/components/sidebar/sidebar-utils";

const props = defineProps<{ hostId: number }>();
const catalog = useGatewayCatalogStore();
const { t } = useI18n();
// The WS-driven catalog is also used by the sidebar. No polling, inferred upload progress, or
// separate management state: a reconnect/upgrade changes every view from the same event.
const connection = computed(() => catalog.hostConnectionStatuses[props.hostId]);
const status = computed(() => connection.value?.status ?? "idle");
const icon = computed(() => {
  if (hostConnectionIsBusy(status.value)) return LoaderCircleIcon;
  if (status.value === "connected") return CheckCircle2Icon;
  if (status.value === "failed" || status.value === "mfaRequired") return AlertCircleIcon;
  return CircleIcon;
});
</script>

<template>
  <div :data-testid="`host-management-status-${hostId}`" :data-status="status" class="space-y-1">
    <div class="flex items-center gap-1.5 text-xs font-medium" :class="hostConnectionClass(status)">
      <component
        :is="icon"
        class="size-3.5 shrink-0"
        :class="{ 'animate-spin': hostConnectionIsBusy(status) }"
      />
      {{ t(hostConnectionLabelKey(status)) }}
    </div>
    <p v-if="connection?.message" class="break-words text-xs text-ink-secondary">
      {{ connection.message }}
    </p>
  </div>
</template>
