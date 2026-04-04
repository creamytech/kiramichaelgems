import { WebHaptics } from "web-haptics";

let wh = null;
try {
  wh = new WebHaptics();
} catch {}

export function haptic(pattern = "light") {
  try {
    if (wh) wh.trigger(pattern);
  } catch {}
}

export function hapticSuccess() { haptic("success"); }
export function hapticError()   { haptic("error"); }
export function hapticHeavy()   { haptic("heavy"); }
export function hapticSelect()  { haptic("selection"); }
