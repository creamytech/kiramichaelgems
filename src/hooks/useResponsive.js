import { useState, useEffect } from "react";

export default function useResponsive() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return {
    isMobile:  w < 768,
    isTablet:  w >= 768 && w < 1100,
    isDesktop: w >= 1100,
    w,
  };
}
