/**
 * Asset Processor for UserCSS Styles
 *
 * Handles extraction, fetching, and inlining of external assets (images, fonts)
 * to work around CSP restrictions in browser extensions.
 */

export interface ExternalAsset {
  url: string;
  type: 'image' | 'font' | 'other';
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
  const urlRegex = /url\(["']?([^"'\)]+)["']?\)/g;
  let match;

  while ((match = urlRegex.exec(css)) !== null) {
    const url = match[1];

    // Skip data URLs and extension URLs
    if (url.startsWith('data:') || url.startsWith('chrome-extension:') || url.startsWith('moz-extension:')) {
      continue;
    }

    // Determine asset type based on URL or context
    let type: ExternalAsset['type'] = 'other';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
      type = 'image';
    } else if (url.match(/\.(woff|woff2|ttf|otf|eot)$/i) || url.includes('fonts.googleapis.com')) {
      type = 'font';
    }

    assets.push({
      url,
      type,
      originalUrl: url,
    });
  }

  return assets;
}

/**
 * Fetch an external asset and convert to data URL
 */
export async function fetchAssetAsDataUrl(asset: ExternalAsset, retries = 1): Promise<ExternalAsset> {
  // Check cache first
  const cachedDataUrl = assetCache.get(asset.url);
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
          reject(new Error('Request timeout'));
        }, 10000); // 10 second overall timeout
      });

      // Use fetch API to get the asset
      const fetchPromise = fetch(asset.url, {
        method: 'GET',
        mode: 'cors',
        cache: 'default',
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
      assetCache.set(asset.url, dataUrl);

      return {
        ...asset,
        dataUrl,
      };
    } catch (error) {
      let errorMessage = 'Unknown error';
      let errorType = 'network';
      let shouldRetry = false;

      if (error instanceof Error) {
        errorMessage = error.message;

        // Categorize error types
        if (errorMessage.includes('CORS')) {
          errorType = 'cors';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
          errorType = 'timeout';
          shouldRetry = attempt < retries; // Retry on timeout/abort
        } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
          errorType = 'network';
          shouldRetry = attempt < retries; // Retry on network errors
        } else if (errorMessage.includes('HTTP')) {
          errorType = 'http';
        }
      }

      if (shouldRetry && attempt < retries) {
        console.warn(`Failed to fetch asset ${asset.url} (${errorType}), retrying (${attempt + 1}/${retries + 1}):`, errorMessage);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      console.warn(`Failed to fetch asset ${asset.url} (${errorType}) after ${attempt + 1} attempts:`, errorMessage);

      return {
        ...asset,
        error: errorMessage,
      };
    }
  }

  // This should never be reached, but TypeScript needs it
  return {
    ...asset,
    error: 'Max retries exceeded',
  };
}

/**
 * Convert blob to data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Process CSS content by extracting and inlining external assets
 */
export async function processAssetsInCss(css: string): Promise<AssetProcessingResult> {
  const assets = extractExternalUrls(css);

  if (assets.length === 0) {
    return {
      css,
      assets: [],
      processed: false,
    };
  }

  console.log(`[AssetProcessor] Found ${assets.length} external assets to process`);

  // Fetch all assets in parallel with retry support
  const fetchPromises = assets.map(asset => fetchAssetAsDataUrl(asset, 2)); // 2 retries
  const processedAssets = await Promise.all(fetchPromises);

  // Replace URLs in CSS with data URLs
  let processedCss = css;
  const successfulAssets: ExternalAsset[] = [];

  for (const asset of processedAssets) {
    if (asset.dataUrl) {
      // Escape special regex characters in URL
      const escapedUrl = asset.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Replace the URL in CSS
      const urlRegex = new RegExp(`url\\(["']?${escapedUrl}["']?\\)`, 'g');
      processedCss = processedCss.replace(urlRegex, `url("${asset.dataUrl}")`);

      successfulAssets.push(asset);
    } else {
      console.warn(`[AssetProcessor] Failed to process asset: ${asset.url}`, asset.error);
    }
  }

  console.log(`[AssetProcessor] Successfully processed ${successfulAssets.length}/${assets.length} assets`);

  return {
    css: processedCss,
    assets: processedAssets,
    processed: true,
  };
}

/**
 * Check if a URL is accessible (for validation)
 */
export async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Cache for processed assets to avoid refetching
 */
class AssetCache {
  private cache = new Map<string, { dataUrl: string; timestamp: number }>();
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 hours

  get(url: string): string | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(url);
      return null;
    }

    return entry.dataUrl;
  }

  set(url: string, dataUrl: string): void {
    this.cache.set(url, {
      dataUrl,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const assetCache = new AssetCache();