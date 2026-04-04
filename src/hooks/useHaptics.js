import { useWebHaptics } from "web-haptics/react";
import { useCallback } from "react";

export default function useHaptics() {
  const { trigger, isSupported } = useWebHaptics();

  const haptic        = useCallback((p = "medium") => { try { trigger(p); } catch {} }, [trigger]);
  const hapticSuccess = useCallback(() => { try { trigger("success"); } catch {} }, [trigger]);
  const hapticError   = useCallback(() => { try { trigger("error"); } catch {} }, [trigger]);
  const hapticHeavy   = useCallback(() => { try { trigger("heavy"); } catch {} }, [trigger]);
  const hapticSelect  = useCallback(() => { try { trigger("selection"); } catch {} }, [trigger]);
  const hapticSoft    = useCallback(() => { try { trigger("soft"); } catch {} }, [trigger]);

  return { haptic, hapticSuccess, hapticError, hapticHeavy, hapticSelect, hapticSoft, isSupported };
}
