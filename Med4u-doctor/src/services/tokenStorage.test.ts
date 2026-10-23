jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";
import { tokenStorage } from "./tokenStorage";

const pair = { accessToken: "access-token", refreshToken: "refresh-token" };

describe("secure token storage", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    await tokenStorage.clear();
  });

  it("persists and restores both tokens through Expo SecureStore", async () => {
    await tokenStorage.save(pair);
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(1, "med4u.doctor.accessToken", pair.accessToken);
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(2, "med4u.doctor.refreshToken", pair.refreshToken);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => key.endsWith("accessToken") ? pair.accessToken : pair.refreshToken);
    await expect(tokenStorage.load()).resolves.toEqual(pair);
  });

  it("clears both stored values on logout", async () => {
    await tokenStorage.save(pair);
    await tokenStorage.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("med4u.doctor.accessToken");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("med4u.doctor.refreshToken");
    expect(tokenStorage.get()).toBeNull();
  });
});
