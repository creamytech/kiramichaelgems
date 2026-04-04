import { useWebHaptics } from "web-haptics/react";
import { useCallback } from "react";

export default function useHaptics() {
  // web-haptics uses Vibration API (Android only)
  // On iOS, vibration API is not available — haptics are silent
  const { trigger } = useWebHaptics();

  // Wrapper that also tries native vibrate as fallback
  const fire = useCallback((pattern = "light") => {
    try {
      trigger(pattern);
    } catch {}
    // Fallback for Android browsers where web-haptics might not init
    try {
      if (navigator.vibrate) {
        const ms = pattern === "heavy" ? [30] :
                   pattern === "success" ? [10, 30, 10] :
                   pattern === "error" ? [10, 20, 10, 20, 10] :
                   pattern === "selection" ? [5] : [10];
        navigator.vibrate(ms);
      }
    } catch {}
  }, [trigger]);

  return {
    haptic:        (p = "light")  => fire(p),
    hapticSuccess: ()             => fire("success"),
    hapticError:   ()             => fire("error"),
    hapticHeavy:   ()             => fire("heavy"),
    hapticSelect:  ()             => fire("selection"),
    hapticSoft:    ()             => fire("soft"),
  };
}
