import { useWebHaptics } from "web-haptics/react";

export default function useHaptics() {
  const { trigger } = useWebHaptics();

  return {
    haptic:        (p = "light")  => trigger(p),
    hapticSuccess: ()             => trigger("success"),
    hapticError:   ()             => trigger("error"),
    hapticHeavy:   ()             => trigger("heavy"),
    hapticSelect:  ()             => trigger("selection"),
    hapticSoft:    ()             => trigger("soft"),
  };
}
