import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Re-runs `refetch` each time the screen regains focus (e.g. coming back after booking or
 * cancelling), skipping the first focus because the initial load already covers it.
 */
export function useRefreshOnFocus(refetch: () => void): void {
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
