// ─── THEME — KM Brand: Purple + Black + Gray on Light ───────────────────────
export const T = {
  bg:"#F8F7FA", card:"#FFFFFF", border:"#E4E0EA", borderAcc:"#9B45D4",
  // Purple brand palette
  accent:"#8B2FC9", accentLight:"#F3EAFA", accentMid:"#C58FE6", accentDark:"#6B1FA0",
  // Legacy aliases (so existing code doesn't break)
  gold:"#8B2FC9", goldLight:"#F3EAFA", goldMid:"#C58FE6", goldDark:"#6B1FA0",
  // Text
  text:"#1A1A1A", sub:"#555555", dim:"#888888",
  // Status
  green:"#2D7D4F", greenBg:"#EAF6EF",
  red:"#C0392B", redBg:"#FDECEA",
  // Shadows — purple-tinted
  shadow:"0 1px 2px rgba(80,30,120,0.03), 0 2px 8px rgba(80,30,120,0.05), 0 8px 24px rgba(80,30,120,0.05)",
  shadowLg:"0 1px 4px rgba(80,30,120,0.04), 0 4px 16px rgba(80,30,120,0.07), 0 16px 48px rgba(80,30,120,0.09)",
  shadowXl:"0 2px 8px rgba(80,30,120,0.04), 0 8px 24px rgba(80,30,120,0.07), 0 24px 64px rgba(80,30,120,0.12)",
  shadowInner:"inset 0 1px 2px rgba(80,30,120,0.04), inset 0 0 0 1px rgba(80,30,120,0.02)",
  shadowGold:"0 2px 8px rgba(139,47,201,0.15), 0 8px 24px rgba(139,47,201,0.18)",
  // Gradients
  cardGradient:"linear-gradient(180deg, #FFFFFF 0%, #FDFCFE 50%, #FAF8FC 100%)",
  goldGradient:"linear-gradient(135deg, #A040E0 0%, #8B2FC9 40%, #7025A8 100%)",
  goldGradientLight:"linear-gradient(135deg, #F8F0FE 0%, #F3EAFA 50%, #EDE2F6 100%)",
  headerGradient:"linear-gradient(180deg, #FFFFFF 0%, #FDFCFE 100%)",
  shimmer:"linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.5) 37%, transparent 63%)",
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
export const cardSt = (x={}) => ({background:T.cardGradient,border:`1px solid ${T.border}`,borderRadius:16,boxShadow:T.shadow,transition:"box-shadow 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1), border-color 0.3s ease",...x});
export const inputSt = (x={}) => ({background:"#FEFEFF",border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontFamily:"Georgia,serif",fontSize:16,padding:"12px 16px",outline:"none",width:"100%",boxSizing:"border-box",WebkitAppearance:"none",transition:"border-color 0.25s ease, box-shadow 0.25s ease",boxShadow:T.shadowInner,...x});
export const labelSt = {display:"block",fontSize:11,fontWeight:700,color:T.sub,marginBottom:7,letterSpacing:"0.6px",textTransform:"uppercase"};
export const btnPrimary = (x={}) => ({background:T.goldGradient,color:"#fff",border:"none",borderRadius:10,padding:"12px 22px",cursor:"pointer",fontSize:15,fontWeight:600,fontFamily:"Georgia,serif",transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",boxShadow:T.shadowGold,letterSpacing:"0.3px",...x});
export const btnGhost = (active=false,x={}) => ({background:active?T.goldGradientLight:"transparent",color:active?T.accent:T.dim,border:`1.5px solid ${active?T.borderAcc:T.border}`,borderRadius:10,padding:"9px 16px",cursor:"pointer",fontSize:14,fontFamily:"Georgia,serif",transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",boxShadow:active?"0 1px 6px rgba(139,47,201,0.1)":"none",...x});
export const tagSt = (c=T.accent,bg=T.accentLight) => ({display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:700,color:c,background:bg,border:`1px solid ${c}20`,borderRadius:20,padding:"3px 10px",gap:4,letterSpacing:"0.4px"});
