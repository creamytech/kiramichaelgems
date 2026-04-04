import { useState } from "react";
import { CATS, UNITS } from "../data/catalog";
import { T, fmt, cardSt, inputSt, labelSt, btnPrimary, btnGhost } from "../theme";
import Icon from "./Icons";

const BLANK_ITEM = { name:"", cat:"Chains", metal:"14KGF", unit:"each", price:"" };

export default function ItemModal({ item, onSave, onCancel }) {
  const [form, setForm] = useState(item || BLANK_ITEM);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const valid = form.name.trim() && parseFloat(form.price) > 0;

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCancel}>
      <div style={{...cardSt(),width:"100%",maxWidth:560,borderBottomLeftRadius:0,borderBottomRightRadius:0,padding:"24px 20px 36px",maxHeight:"92vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:18,fontWeight:700,color:T.text}}>{item?.id ? "Edit Item" : "Add New Item"}</div>
          <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,padding:4}}>
            <Icon name="X" size={22}/>
          </button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
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
            <div style={{fontSize:13,color:T.gold,background:T.goldLight,padding:"8px 12px",borderRadius:6}}>
              Stored as ${fmt(parseFloat(form.price)/12,4)} per inch
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={onCancel} style={btnGhost(false,{flex:1,padding:"12px"})}>Cancel</button>
          <button disabled={!valid} onClick={()=>onSave(form)} style={{
            ...btnPrimary({flex:2,padding:"12px"}),
            background:valid?T.gold:"#C8BBA8",cursor:valid?"pointer":"default",
          }}>
            {item?.id ? "Save Changes" : "Add to Catalog"}
          </button>
        </div>
      </div>
    </div>
  );
}
