// ─── THEME ──────────────────────────────────────────────────────────────────
export const T = {
  bg:"#FAF8F4", card:"#FFFFFF", border:"#E5DDD2", borderAcc:"#C9A84C",
  gold:"#A8872A", goldLight:"#F5EDDA", goldMid:"#E8D49A",
  text:"#2A2118", sub:"#6B5845", dim:"#9C8B78",
  green:"#2D7D4F", greenBg:"#EAF6EF",
  red:"#C0392B", redBg:"#FDECEA",
  shadow:"0 2px 12px rgba(100,80,40,0.09)",
  shadowLg:"0 6px 28px rgba(100,80,40,0.14)",
};

export const fmt = (n,d=2) => Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
export const todayStr = () => new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
export const uid = () => "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);

// ─── STORAGE ────────────────────────────────────────────────────────────────
export const store = {
  get(k)    { try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;} },
  set(k,v)  { try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};

// ─── STYLE HELPERS ──────────────────────────────────────────────────────────
export const cardSt = (x={}) => ({background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:T.shadow,...x});
export const inputSt = (x={}) => ({background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontFamily:"Georgia,serif",fontSize:16,padding:"11px 14px",outline:"none",width:"100%",boxSizing:"border-box",WebkitAppearance:"none",...x});
export const labelSt = {display:"block",fontSize:13,fontWeight:600,color:T.sub,marginBottom:6};
export const btnPrimary = (x={}) => ({background:T.gold,color:"#fff",border:"none",borderRadius:8,padding:"12px 20px",cursor:"pointer",fontSize:15,fontWeight:600,fontFamily:"Georgia,serif",transition:"opacity 0.15s",...x});
export const btnGhost = (active=false,x={}) => ({background:active?T.goldLight:"transparent",color:active?T.gold:T.dim,border:`1.5px solid ${active?T.borderAcc:T.border}`,borderRadius:8,padding:"9px 16px",cursor:"pointer",fontSize:14,fontFamily:"Georgia,serif",transition:"all 0.14s",...x});
export const tagSt = (c=T.gold,bg=T.goldLight) => ({display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:700,color:c,background:bg,border:`1px solid ${c}30`,borderRadius:20,padding:"2px 9px",gap:4});
