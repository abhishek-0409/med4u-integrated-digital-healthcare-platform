import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useUserStore } from "../store/userStore";

/**
 * Restores the signed-in user's saved cart (from this device) once the user is known, and refreshes it
 * from the server. Mount once inside the authenticated navigator.
 */
export function useCartRestore(): void {
  const userId = useAuthStore((state) => state.user?.id);
  const hydrateCart = useUserStore((state) => state.hydrateCart);

  useEffect(() => {
    if (userId) {
      void hydrateCart(userId);
    }
  }, [userId, hydrateCart]);
}
