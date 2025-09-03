/**
 * Validates a URL string
 * @param url The URL to validate
 * @returns True if the URL is valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a UUID v4 string
 * @returns A new UUID v4 string
 */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extracts domains from a URL
 * @param url The URL to extract domains from
 * @returns An array of domains
 */
export function extractDomainsFromUrl(url: string): string[] {
  try {
    const urlObj = new URL(url);
    const domains: string[] = [];

    // Add the full hostname
    domains.push(urlObj.hostname);

    // Add subdomains
    const parts = urlObj.hostname.split(".");
    for (let i = 1; i < parts.length; i++) {
      domains.push(parts.slice(i).join("."));
    }

    return domains;
  } catch {
    return [];
  }
}
