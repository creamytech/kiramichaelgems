// ─── THEME ──────────────────────────────────────────────────────────────────
export const T = {
  bg:"#FAF8F4", card:"#FFFFFF", border:"#E8E0D4", borderAcc:"#C9A84C",
  gold:"#A8872A", goldLight:"#F5EDDA", goldMid:"#E8D49A", goldDark:"#8A6F1E",
  text:"#2A2118", sub:"#6B5845", dim:"#9C8B78",
  green:"#2D7D4F", greenBg:"#EAF6EF",
  red:"#C0392B", redBg:"#FDECEA",
  shadow:"0 1px 3px rgba(100,80,40,0.06), 0 4px 16px rgba(100,80,40,0.08)",
  shadowLg:"0 2px 8px rgba(100,80,40,0.08), 0 12px 36px rgba(100,80,40,0.13)",
  shadowXl:"0 4px 12px rgba(100,80,40,0.06), 0 20px 48px rgba(100,80,40,0.16)",
  shadowInner:"inset 0 1px 3px rgba(100,80,40,0.06)",
  cardGradient:"linear-gradient(180deg, #FFFFFF 0%, #FDFBF8 100%)",
  goldGradient:"linear-gradient(135deg, #B8952E 0%, #A8872A 50%, #967525 100%)",
  goldGradientLight:"linear-gradient(135deg, #F9F2E0 0%, #F5EDDA 50%, #F0E5CC 100%)",
  headerGradient:"linear-gradient(180deg, #FFFFFF 0%, #FEFDFB 100%)",
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
export const cardSt = (x={}) => ({background:T.cardGradient,border:`1px solid ${T.border}`,borderRadius:14,boxShadow:T.shadow,transition:"box-shadow 0.25s ease, transform 0.25s ease",...x});
export const inputSt = (x={}) => ({background:"#FEFDFB",border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontFamily:"Georgia,serif",fontSize:16,padding:"12px 16px",outline:"none",width:"100%",boxSizing:"border-box",WebkitAppearance:"none",transition:"border-color 0.2s ease, box-shadow 0.2s ease",boxShadow:T.shadowInner,...x});
export const labelSt = {display:"block",fontSize:12,fontWeight:700,color:T.sub,marginBottom:7,letterSpacing:"0.4px",textTransform:"uppercase"};
export const btnPrimary = (x={}) => ({background:T.goldGradient,color:"#fff",border:"none",borderRadius:10,padding:"12px 22px",cursor:"pointer",fontSize:15,fontWeight:600,fontFamily:"Georgia,serif",transition:"all 0.2s ease",boxShadow:"0 2px 8px rgba(168,135,42,0.25)",letterSpacing:"0.2px",...x});
export const btnGhost = (active=false,x={}) => ({background:active?T.goldGradientLight:"transparent",color:active?T.gold:T.dim,border:`1.5px solid ${active?T.borderAcc:T.border}`,borderRadius:10,padding:"9px 16px",cursor:"pointer",fontSize:14,fontFamily:"Georgia,serif",transition:"all 0.2s ease",boxShadow:active?"0 1px 4px rgba(168,135,42,0.1)":"none",...x});
export const tagSt = (c=T.gold,bg=T.goldLight) => ({display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:700,color:c,background:bg,border:`1px solid ${c}25`,borderRadius:20,padding:"3px 10px",gap:4,letterSpacing:"0.3px"});
