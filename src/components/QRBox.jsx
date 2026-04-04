import { useRef, useEffect } from "react";

export default function QRBox({ url, size=220 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!url || !ref.current) return;
    ref.current.innerHTML = "";
    const render = () => {
      if (!ref.current) return;
      ref.current.innerHTML = "";
      new window.QRCode(ref.current, {
        text:url, width:size, height:size,
        colorDark:"#000000", colorLight:"#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    };
    if (window.QRCode) render();
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [url, size]);
  return <div ref={ref} style={{display:"inline-block",lineHeight:0,borderRadius:8,overflow:"hidden"}}/>;
}
