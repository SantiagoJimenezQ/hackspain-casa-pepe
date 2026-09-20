export const BROWSER_SESSION_COOKIE = "casa-pepe-session";
export const BROWSER_SESSION_HEADER = "x-casa-pepe-session";
export const validBrowserToken = (value: string | undefined): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
