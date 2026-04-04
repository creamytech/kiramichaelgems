import { useState, useRef } from "react";
import { CATS, UNITS } from "../data/catalog";
import { T, fmt, cardSt, inputSt, labelSt, btnPrimary, btnGhost } from "../theme";
import Icon from "./Icons";

const BLANK_ITEM = { name:"", cat:"Chains", metal:"14KGF", unit:"each", price:"", initialStock:"", image:"" };

export default function ItemModal({ item, onSave, onCancel, currentStock }) {
  const [form, setForm] = useState(item ? {...item, initialStock:"", image:item.image||""} : BLANK_ITEM);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const fileRef = useRef(null);

  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { alert("Image too large — please use under 500KB"); return; }
    const reader = new FileReader();
    reader.onload = () => set("image", reader.result);
    reader.readAsDataURL(file);
  }
  const valid = form.name.trim() && parseFloat(form.price) > 0;
  const isNew = !item?.id;

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"km-overlayIn 0.2s ease"}}
      onClick={onCancel}>
      <div style={{...cardSt(),width:"100%",maxWidth:560,borderBottomLeftRadius:0,borderBottomRightRadius:0,borderTopLeftRadius:20,borderTopRightRadius:20,padding:"28px 22px 36px",maxHeight:"92vh",overflowY:"auto",animation:"km-modalSlide 0.3s cubic-bezier(0.4,0,0.2,1)",boxShadow:T.shadowXl}}
        onClick={e=>e.stopPropagation()}>
        {/* Drag handle */}
        <div style={{width:36,height:4,borderRadius:2,background:T.border,margin:"0 auto 18px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div>
            <div style={{fontSize:19,fontWeight:700,color:T.text,letterSpacing:0.2}}>{isNew ? "Add New Item" : "Edit Item"}</div>
            <div style={{fontSize:13,color:T.dim,marginTop:2}}>{isNew ? "Create a custom catalog item" : "Update item details"}</div>
          </div>
          <button onClick={onCancel} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",color:T.dim,padding:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.goldLight;e.currentTarget.style.borderColor=T.borderAcc;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.border;}}>
            <Icon name="X" size={18}/>
          </button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <label style={labelSt}>Item Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. 14mm Rolo Chain" style={inputSt()}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={labelSt}>Category</label>
              <select value={form.cat} onChange={e=>set("cat",e.target.value)} style={inputSt()}>
                {CATS.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Metal / Material</label>
              <input value={form.metal} onChange={e=>set("metal",e.target.value)} placeholder="14KGF, 925AG..." style={inputSt()}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={labelSt}>Unit Type</label>
              <select value={form.unit} onChange={e=>set("unit",e.target.value)} style={inputSt()}>
                {UNITS.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>
                Price ({form.unit==="per foot" ? "per foot — auto-converts to per inch" : form.unit})
              </label>
              <input type="number" min="0" step="0.0001" value={form.price}
                onChange={e=>set("price",e.target.value)} placeholder="0.0000" style={inputSt()}/>
            </div>
          </div>
          {form.unit==="per foot" && parseFloat(form.price)>0 && (
            <div style={{fontSize:13,color:T.gold,background:T.goldLight,padding:"10px 14px",borderRadius:8,border:`1px solid ${T.borderAcc}20`}}>
              Stored as ${fmt(parseFloat(form.price)/12,4)} per inch
            </div>
          )}

          {/* Stock quantity */}
          <div>
            <label style={labelSt}>
              {isNew ? "Starting Stock" : "Current Stock"}
              {" "}({form.unit==="per foot"?"inches":form.unit==="per inch"?"inches":form.unit==="per gram"?"grams":"pieces"})
            </label>
            <input type="number" min="0" step={form.unit==="each"?1:0.1}
              value={isNew ? (form.initialStock||"") : (currentStock!=null ? currentStock : "")}
              onChange={e=>set("initialStock",e.target.value)}
              placeholder={isNew ? "How many do you have?" : String(currentStock||0)}
              style={inputSt()}/>
            {!isNew && currentStock!=null && (
              <div style={{fontSize:12,color:T.dim,marginTop:5}}>
                Leave blank to keep current stock ({currentStock})
              </div>
            )}
          </div>

          {/* Photo upload */}
          <div>
            <label style={labelSt}>Photo (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage}
              style={{display:"none"}}/>
            {form.image ? (
              <div style={{position:"relative",display:"inline-block"}}>
                <img src={form.image} alt="Item" style={{width:100,height:100,objectFit:"cover",borderRadius:10,border:`1px solid ${T.border}`}}/>
                <button onClick={()=>set("image","")} style={{
                  position:"absolute",top:-6,right:-6,width:22,height:22,borderRadius:"50%",
                  background:T.red,color:"#fff",border:"none",cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,
                }}>&times;</button>
              </div>
            ) : (
              <button onClick={()=>fileRef.current?.click()} style={{
                ...btnGhost(false,{padding:"14px 20px",fontSize:13,display:"flex",alignItems:"center",gap:8}),
                borderStyle:"dashed",
              }}>
                <Icon name="Plus" size={16}/> Add Photo
              </button>
            )}
            <div style={{fontSize:11,color:T.dim,marginTop:4}}>Max 500KB &middot; Stored in browser</div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onCancel} className="km-btn-press" style={btnGhost(false,{flex:1,padding:"13px"})}>Cancel</button>
          <button disabled={!valid} className="km-btn-press" onClick={()=>onSave(form)} style={{
            ...btnPrimary({flex:2,padding:"13px"}),
            background:valid?T.goldGradient:"#C8BBA8",cursor:valid?"pointer":"default",
            boxShadow:valid?T.shadowGold:"none",
          }}>
            {isNew ? "Add to Catalog" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
