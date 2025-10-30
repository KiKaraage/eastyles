/**
 * Asset Processor for UserCSS Styles
 *
 * Handles extraction, fetching, and inlining of external assets (images, fonts)
 * to work around CSP restrictions in browser extensions.
 */

import { regex } from "arkregex";
import { browser } from "wxt/browser";

export interface ExternalAsset {
  url: string;
  type: "image" | "font" | "other";
  originalUrl: string;
  dataUrl?: string;
  error?: string;
}

export interface AssetProcessingResult {
  css: string;
  assets: ExternalAsset[];
  processed: boolean;
}

/**
 * Extract external URLs from CSS content
 */
export function extractExternalUrls(css: string): ExternalAsset[] {
  const assets: ExternalAsset[] = [];

  // Regex to match url() references in CSS
  const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
  let match = urlRegex.exec(css);

  while (match !== null) {
    const url = match[1];

    // Skip data URLs and extension URLs
    if (
      url.startsWith("data:") ||
      url.startsWith("chrome-extension:") ||
      url.startsWith("moz-extension:")
    ) {
      continue;
    }

    // Determine asset type based on URL or context
    let type: ExternalAsset["type"] = "other";
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
      type = "image";
    } else if (
      url.match(/\.(woff|woff2|ttf|otf|eot)$/i) ||
      url.includes("fonts.googleapis.com")
    ) {
      type = "font";
    }

    assets.push({
      url,
      type,
      originalUrl: url,
    });
    match = urlRegex.exec(css);
  }

  return assets;
}

/**
 * Fetch an external asset and convert to data URL
 */
export async function fetchAssetAsDataUrl(
  asset: ExternalAsset,
  retries = 1,
): Promise<ExternalAsset> {
  // Check cache first
  const cachedDataUrl = await assetCache.get(asset.url);
  if (cachedDataUrl) {
    console.log(`[AssetProcessor] Using cached asset for ${asset.url}`);
    return {
      ...asset,
      dataUrl: cachedDataUrl,
    };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create abort controller for this attempt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error("Request timeout"));
        }, 10000); // 10 second overall timeout
      });

      // Use fetch API to get the asset
      const fetchPromise = fetch(asset.url, {
        method: "GET",
        mode: "cors",
        cache: "default",
        signal: controller.signal,
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      // Clear the timeout since we got a response
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Convert response to blob
      const blob = await response.blob();

      // Convert blob to data URL
      const dataUrl = await blobToDataUrl(blob);

      // Cache the result
      await assetCache.set(asset.url, dataUrl);

      return {
        ...asset,
        dataUrl,
      };
    } catch (error) {
      let errorMessage = "Unknown error";
      let errorType = "network";
      let shouldRetry = false;

      if (error instanceof Error) {
        errorMessage = error.message;

        // Categorize error types
        if (errorMessage.includes("CORS")) {
          errorType = "cors";
        } else if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("aborted")
        ) {
          errorType = "timeout";
          shouldRetry = attempt < retries; // Retry on timeout/abort
        } else if (
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("Failed to fetch")
        ) {
          errorType = "network";
          shouldRetry = attempt < retries; // Retry on network errors
        } else if (errorMessage.includes("HTTP")) {
          errorType = "http";
        }
      }

      if (shouldRetry && attempt < retries) {
        console.warn(
          `[ea-AssetProcessor] Failed to fetch asset ${asset.url} (${errorType}), retrying (${attempt + 1}/${retries + 1}):`,
          errorMessage,
        );
        // Wait a bit before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
        continue;
      }

      console.warn(
        `[ea-AssetProcessor] Failed to fetch asset ${asset.url} (${errorType}) after ${attempt + 1} attempts:`,
        errorMessage,
      );

      return {
        ...asset,
        error: errorMessage,
      };
    }
  }

  // This should never be reached, but TypeScript needs it
  return {
    ...asset,
    error: "Max retries exceeded",
  };
}

/**
 * Convert blob to data URL
 * Works in both browser and service worker contexts
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  // Try FileReader first (works in browser contexts with DOM)
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert blob to data URL"));
        }
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  }

  // Fallback for service worker context: manually construct data URL
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
}

const MAX_ASSETS_TO_PROCESS = 15;
const MAX_ASSET_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB safety limit per asset

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldProcessAsset(
  asset: ExternalAsset,
  index: number,
): { allowed: boolean; reason?: string } {
  if (index >= MAX_ASSETS_TO_PROCESS) {
    return {
      allowed: false,
      reason: `Exceeded processing limit of ${MAX_ASSETS_TO_PROCESS} assets`,
    };
  }

  // Only inline images and fonts for now; other types can stay as-is
  if (asset.type === "other") {
    return {
      allowed: false,
      reason: "Unsupported asset type",
    };
  }

  return { allowed: true };
}

/**
 * Process CSS content by extracting external assets and inlining them as data URLs.
 */
export async function processAssetsInCss(
  css: string,
): Promise<AssetProcessingResult> {
  const assets = extractExternalUrls(css);

  if (assets.length === 0) {
    return {
      css,
      assets: [],
      processed: false,
    };
  }

  console.log(`[AssetProcessor] Found ${assets.length} external assets`);

  let processedCss = css;
  let anyProcessed = false;
  const processedAssets: ExternalAsset[] = [];

  for (const [index, asset] of assets.entries()) {
    const validation = shouldProcessAsset(asset, index);
    if (!validation.allowed) {
      processedAssets.push({
        ...asset,
        error: validation.reason,
      });
      continue;
    }

    const result = await fetchAssetAsDataUrl(asset, 2);

    if (result.dataUrl) {
      try {
        const base64Length = result.dataUrl.length;
        const approxBytes = (base64Length * 3) / 4;
        if (approxBytes > MAX_ASSET_SIZE_BYTES) {
          const approxKb = Math.round((approxBytes / 1024) * 10) / 10;
          processedAssets.push({
            ...result,
            dataUrl: undefined,
            error: `Asset exceeds size limit (${approxKb} KB)`,
          });
          continue;
        }

        const urlPattern = regex.as<string>(
          `url\\((['"]?)${escapeRegExp(result.originalUrl)}\\1\\)`,
          "g",
        );
        processedCss = processedCss.replace(urlPattern, (_match, quote) => {
          const q = quote || '"';
          return `url(${q}${result.dataUrl}${q})`;
        });

        processedAssets.push(result);
        anyProcessed = true;
        const approxKb = Math.round((approxBytes / 1024) * 10) / 10;
        console.log(
          `[AssetProcessor] Inlined asset ${result.originalUrl} (${approxKb} KB)`,
        );
      } catch (replaceError) {
        console.warn(
          `[AssetProcessor] Failed to inline asset ${result.originalUrl}:`,
          replaceError,
        );
        processedAssets.push({
          ...result,
          dataUrl: undefined,
          error: "Failed to inline asset",
        });
      }
    } else {
      processedAssets.push(result);
    }
  }

  return {
    css: processedCss,
    assets: processedAssets,
    processed: anyProcessed,
  };
}

/**
 * Check if a URL is accessible (for validation)
 */
export async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      mode: "cors",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Persistent cache for processed assets to avoid refetching
 */
class AssetCache {
  private readonly maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly cacheKey = "assetCache";

  async get(url: string): Promise<string | null> {
    try {
      const cache = await this.getCache();
      const entry = cache[url];

      if (!entry) return null;

      // Check if cache entry is expired
      if (Date.now() - entry.timestamp > this.maxAge) {
        await this.remove(url);
        return null;
      }

      return entry.dataUrl;
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to get cached asset:", error);
      return null;
    }
  }

  async set(url: string, dataUrl: string): Promise<void> {
    try {
      const cache = await this.getCache();
      cache[url] = {
        dataUrl,
        timestamp: Date.now(),
      };
      await this.saveCache(cache);
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to cache asset:", error);
    }
  }

  async remove(url: string): Promise<void> {
    try {
      const cache = await this.getCache();
      delete cache[url];
      await this.saveCache(cache);
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to remove cached asset:", error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.saveCache({});
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to clear cache:", error);
    }
  }

  async size(): Promise<number> {
    try {
      const cache = await this.getCache();
      return Object.keys(cache).length;
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to get cache size:", error);
      return 0;
    }
  }

  private async getCache(): Promise<
    Record<string, { dataUrl: string; timestamp: number }>
  > {
    try {
      // Use browser storage if available, fallback to localStorage
      if (typeof browser !== "undefined" && browser.storage) {
        const result = await browser.storage.local.get(this.cacheKey);
        return result[this.cacheKey] || {};
      } else if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(this.cacheKey);
        return stored ? JSON.parse(stored) : {};
      }
      return {};
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to load cache:", error);
      return {};
    }
  }

  private async saveCache(
    cache: Record<string, { dataUrl: string; timestamp: number }>,
  ): Promise<void> {
    try {
      // Use browser storage if available, fallback to localStorage
      if (typeof browser !== "undefined" && browser.storage) {
        await browser.storage.local.set({ [this.cacheKey]: cache });
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.cacheKey, JSON.stringify(cache));
      }
    } catch (error) {
      console.warn("[ea-AssetCache] Failed to save cache:", error);
    }
  }
}

export const assetCache = new AssetCache();
