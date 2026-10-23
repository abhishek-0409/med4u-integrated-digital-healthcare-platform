const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (rawApiUrl && !__DEV__ && !rawApiUrl.startsWith("https://")) {
  throw new Error("EXPO_PUBLIC_API_URL must use https:// in production builds.");
}

export const env = {
  // Keep the app renderable when a deployment omitted its API URL. App.tsx shows a
  // configuration screen instead of letting this module-level check blank the page.
  apiUrl: rawApiUrl?.replace(/\/+$/, "") ?? "",
} as const;
