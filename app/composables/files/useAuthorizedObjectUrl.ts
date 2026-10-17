import { useAuthStore } from "@/stores/auth";
import { loadAuthorizedImage } from "@/utils/browser-runtime/authorized-image-cache";
import { gatewayImageUrl } from "@/utils/gateway-image-url";

export function useAuthorizedObjectUrl(source: Ref<string> | ComputedRef<string>) {
  const auth = useAuthStore();
  auth.hydrate();
  const objectUrl = ref("");
  const loading = ref(false);
  const error = ref<Error | null>(null);
  let activeUrl = "";
  let requestId = 0;

  function revokeActiveUrl() {
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = "";
    }
  }

  watch(
    [source, () => auth.sessionEpoch] as const,
    async ([nextSource, sessionEpoch]) => {
      const currentRequest = ++requestId;
      revokeActiveUrl();
      objectUrl.value = "";
      error.value = null;
      loading.value = false;

      if (!nextSource) {
        return;
      }
      if (!import.meta.client || gatewayImageUrl(nextSource, window.location.href) === null) {
        objectUrl.value = nextSource;
        return;
      }

      loading.value = true;
      try {
        const blob = await loadAuthorizedImage({
          source: nextSource,
          token: auth.token,
          sessionEpoch,
        });
        const url = URL.createObjectURL(blob);
        if (currentRequest !== requestId || !auth.isCurrentSession(sessionEpoch)) {
          URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        objectUrl.value = url;
      } catch (caught) {
        if (currentRequest === requestId) {
          error.value = caught instanceof Error ? caught : new Error(String(caught));
        }
      } finally {
        if (currentRequest === requestId) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(revokeActiveUrl);

  return {
    objectUrl,
    loading,
    error,
  };
}
