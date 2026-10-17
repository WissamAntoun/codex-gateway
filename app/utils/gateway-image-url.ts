const GATEWAY_IMAGE_PATHS = new Set(["/api/remote/images", "/api/remote/files"]);

export function gatewayImageUrl(source: string, baseUrl: string): URL | null {
  try {
    const base = new URL(baseUrl);
    const url = new URL(source, base);
    if (
      url.origin !== base.origin ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      !GATEWAY_IMAGE_PATHS.has(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
