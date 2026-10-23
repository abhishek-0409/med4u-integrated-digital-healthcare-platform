import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { AuthTokens } from "../types/auth";

const ACCESS_KEY = "med4u.doctor.accessToken";
const REFRESH_KEY = "med4u.doctor.refreshToken";

// expo-secure-store has no web implementation. Rather than fall back to
// localStorage (readable by any script), tokens live in memory only on web.
const isSecureStoreAvailable = Platform.OS !== "web";

let cache: AuthTokens | null = null;

export const tokenStorage = {
  /** Loads tokens from the device keystore into memory. Call once at startup. */
  async load(): Promise<AuthTokens | null> {
    if (!isSecureStoreAvailable) {
      return cache;
    }
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
    cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
    return cache;
  },

  get(): AuthTokens | null {
    return cache;
  },

  async save(tokens: AuthTokens): Promise<void> {
    if (isSecureStoreAvailable) {
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
      ]);
    }
    cache = tokens;
  },

  async clear(): Promise<void> {
    cache = null;
    if (isSecureStoreAvailable) {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
      ]);
    }
  },
};
