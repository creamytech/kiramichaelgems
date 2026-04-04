import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { DEFAULT_ITEMS, CATS, INITIAL_STOCK } from "./data/catalog";
import { T, fmt, todayStr, uid, store, cardSt, inputSt, labelSt, btnPrimary, btnGhost, tagSt } from "./theme";
import Icon from "./components/Icons";
import useResponsive from "./hooks/useResponsive";
import QRBox from "./components/QRBox";
import ItemModal from "./components/ItemModal";

const UNITS = ["each","per inch","per gram","per foot"];

export default function App() {
  const R = useResponsive();

  const [records,    setRecords]    = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [customItems,setCustomItems]= useState([]);
  const [settings,   setSettings]   = useState({paypal:"",venmo:"",cashapp:"",bizName:"Kiramichael Gems",taxRate:0,taxEnabled:false,priceRounding:"none",lowStockThreshold:5});
  const [inventory,  setInventory]  = useState({});

  const [tab,         setTab]         = useState("catalog");
  const [flash,       setFlash]       = useState("");
  const [tmplFlash,   setTmplFlash]   = useState("");
  const [checkoutRec, setCheckoutRec] = useState(null);
  const [qrMethod,    setQrMethod]    = useState(null);
  const [qrFull,      setQrFull]      = useState(false);
  const [itemModal,   setItemModal]   = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);

  const [catFilter, setCatFilter] = useState("All");
  const [search,    setSearch]    = useState("");
  const [sortDir,   setSortDir]   = useState("asc");

  const [buildItems,    setBuildItems]    = useState([]);
  const [buildSearch,   setBuildSearch]   = useState("");
  const [buildCat,      setBuildCat]      = useState("All");
  const [markup,        setMarkup]        = useState(2.5);
  const [labor,         setLabor]         = useState(0);
  const [pieces,        setPieces]        = useState(1);
  const [buildName,     setBuildName]     = useState("");
  const [customerName,  setCustomerName]  = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderDate,     setOrderDate]     = useState(todayStr());
  const [buildNotes,    setBuildNotes]    = useState("");
  const [discount,      setDiscount]      = useState(0);
  const [discountType,  setDiscountType]  = useState("%");

  useEffect(() => {
    const r = store.get("km-builds");    if (r) setRecords(r);
    const t = store.get("km-templates"); if (t) setTemplates(t);
    const c = store.get("km-custom");    if (c) setCustomItems(c);
    const s = store.get("km-settings");  if (s) setSettings(s);
    const inv = store.get("km-inventory");
    if (inv) setInventory(inv);
    else { setInventory({...INITIAL_STOCK}); store.set("km-inventory",{...INITIAL_STOCK}); }
  }, []);

  const saveSettings = s => { setSettings(s); store.set("km-settings",s); };

  const ALL_ITEMS = useMemo(() => [...DEFAULT_ITEMS, ...customItems], [customItems]);

  const catalogItems = useMemo(() => {
    let list = ALL_ITEMS.filter(i =>
      (catFilter==="All" || i.cat===catFilter) &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase()))
    );
    return list.sort((a,b) => sortDir==="asc" ? a.price-b.price : b.price-a.price);
  }, [ALL_ITEMS, catFilter, search, sortDir]);

  const sidebarItems = useMemo(() =>
    ALL_ITEMS.filter(i =>
      (buildCat==="All" || i.cat===buildCat) &&
      (!buildSearch || i.name.toLowerCase().includes(buildSearch.toLowerCase()))
    ), [ALL_ITEMS, buildCat, buildSearch]);

  const totals = useMemo(() => {
    const lines = buildItems.map(bi => {
      const item = ALL_ITEMS.find(i=>i.id===bi.itemId);
      if (!item) return null;
      return {...item, qty:bi.qty, lineCost:item.price*bi.qty};
    }).filter(Boolean);
    const materialCost = lines.reduce((s,l)=>s+l.lineCost,0);
    const totalLabor   = labor*pieces;
    const totalMat     = materialCost*pieces;
    const subtotal     = totalMat+totalLabor;
    const retailBefore = subtotal*markup;
    const discAmt      = discountType==="%"
      ? retailBefore*(Math.min(discount,100)/100)
      : Math.min(discount, retailBefore);
    let totalRetail  = Math.max(0, retailBefore-discAmt);
    let rpp          = Math.max(0,(materialCost+labor)*markup - (discountType==="%"?(materialCost+labor)*markup*(Math.min(discount,100)/100):Math.min(discount/pieces,(materialCost+labor)*markup)));

    // Price rounding
    const roundPrice = (p) => {
      if (settings.priceRounding==="whole") return Math.round(p);
      if (settings.priceRounding==="99") return Math.floor(p) + 0.99;
      if (settings.priceRounding==="95") return Math.floor(p) + 0.95;
      return p;
    };
    if (settings.priceRounding!=="none") {
      totalRetail = roundPrice(totalRetail);
      rpp = pieces>0 ? totalRetail/pieces : rpp;
    }

    // Tax
    const taxRate = settings.taxEnabled ? (settings.taxRate||0)/100 : 0;
    const taxAmt = totalRetail * taxRate;
    const totalWithTax = totalRetail + taxAmt;

    const profit       = totalRetail-subtotal;
    const margin       = totalRetail>0?(profit/totalRetail)*100:0;
    return {lines, materialCost, totalMat, totalLabor, subtotal, retailBefore, discAmt, totalRetail, profit, margin, rpp, taxAmt, totalWithTax};
  }, [buildItems, labor, markup, pieces, discount, discountType, ALL_ITEMS, settings.taxEnabled, settings.taxRate, settings.priceRounding]);

  function addToBuild(itemId) {
    setBuildItems(prev => {
      if (prev.find(b=>b.itemId===itemId)) return prev.map(b=>b.itemId===itemId?{...b,qty:b.qty+1}:b);
      const item = ALL_ITEMS.find(i=>i.id===itemId);
      return [...prev, {itemId, qty:item?.unit==="per inch"?18:1}];
    });
  }
  function updateQty(itemId, val) {
    const q = parseFloat(val);
    if (isNaN(q)||q<=0) { setBuildItems(p=>p.filter(b=>b.itemId!==itemId)); return; }
    setBuildItems(p=>p.map(b=>b.itemId===itemId?{...b,qty:q}:b));
  }

  function saveBuild() {
    if (!buildItems.length || !customerName.trim()) return;
    const rec = {
      id:Date.now(), date:orderDate,
      buildName:buildName.trim()||"Custom Build",
      customer:customerName.trim(), email:customerEmail.trim(),
      markup, labor, pieces, discount, discountType,
      notes:buildNotes.trim(),
      lines:totals.lines.map(l=>({name:l.name,metal:l.metal,unit:l.unit,price:l.price,qty:l.qty,lineCost:l.lineCost})),
      materialCost:totals.materialCost, totalMaterial:totals.totalMat,
      totalLabor:totals.totalLabor, retailBefore:totals.retailBefore,
      discountAmt:totals.discAmt, totalRetail:totals.totalRetail,
      taxAmt:totals.taxAmt, totalWithTax:totals.totalWithTax,
      profit:totals.profit, margin:totals.margin, rpp:totals.rpp, paid:false,
    };
    // Decrement inventory
    const inv = {...inventory};
    totals.lines.forEach(l => {
      if (inv[l.id] !== undefined) {
        inv[l.id] = Math.max(0, inv[l.id] - (l.qty * pieces));
      }
    });
    updateInventory(inv);

    const updated = [rec,...records];
    setRecords(updated); store.set("km-builds",updated);
    setFlash("saved"); setTimeout(()=>setFlash(""),2500);
    setCheckoutRec(rec);
    setBuildItems([]); setCustomerName(""); setCustomerEmail("");
    setBuildName(""); setBuildNotes(""); setPieces(1); setDiscount(0);
    setTab("checkout");
  }

  function saveAsTemplate() {
    if (!buildItems.length || !buildName.trim()) return;
    const t = {
      id:Date.now(), name:buildName.trim(),
      items:buildItems.map(b=>({itemId:b.itemId,qty:b.qty})),
      markup, labor, discountType, notes:buildNotes.trim(), createdAt:todayStr(),
    };
    const updated = [t,...templates];
    setTemplates(updated); store.set("km-templates",updated);
    setTmplFlash(t.id); setTimeout(()=>setTmplFlash(""),2200);
  }

  function loadTemplate(t) {
    setBuildItems(t.items);
    setBuildName(t.name); setMarkup(t.markup??2.5); setLabor(t.labor??0);
    setDiscountType(t.discountType??"%"); setDiscount(0); setBuildNotes(t.notes??"");
    setCustomerName(""); setCustomerEmail(""); setOrderDate(todayStr());
    if (R.isMobile) setShowBrowser(false);
  }

  function markPaid(id) {
    const u = records.map(r=>r.id===id?{...r,paid:true}:r);
    setRecords(u); store.set("km-builds",u);
  }

  function deleteRecord(id) {
    const u = records.filter(r=>r.id!==id);
    setRecords(u); store.set("km-builds",u);
    if (checkoutRec?.id===id) setCheckoutRec(null);
  }

  function deleteTemplate(id) {
    const u = templates.filter(t=>t.id!==id);
    setTemplates(u); store.set("km-templates",u);
  }

  function saveCustomItem(form, existingId=null) {
    const price = form.unit==="per foot" ? parseFloat(form.price)/12 : parseFloat(form.price);
    const unit  = form.unit==="per foot" ? "per inch" : form.unit;
    if (existingId) {
      const u = customItems.map(i=>i.id===existingId?{...i,...form,price,unit,isCustom:true}:i);
      setCustomItems(u); store.set("km-custom",u);
    } else {
      const newItem = {...form, price, unit, id:uid(), isCustom:true};
      const u = [...customItems, newItem];
      setCustomItems(u); store.set("km-custom",u);
    }
    setItemModal(null);
  }

  function deleteCustomItem(id) {
    const u = customItems.filter(i=>i.id!==id);
    setCustomItems(u); store.set("km-custom",u);
    setBuildItems(p=>p.filter(b=>b.itemId!==id));
  }

  // ── Inventory helpers ─────────────────────────────────────────────────────
  function updateInventory(newInv) {
    setInventory(newInv); store.set("km-inventory",newInv);
  }
  function adjustStock(itemId, delta) {
    const inv = {...inventory, [itemId]: Math.max(0, (inventory[itemId]||0) + delta)};
    updateInventory(inv);
  }
  function setStock(itemId, qty) {
    const inv = {...inventory, [itemId]: Math.max(0, qty)};
    updateInventory(inv);
  }
  function resetInventory() {
    if (window.confirm("Reset all stock to the original JK Findings invoice quantities? This cannot be undone.")) {
      updateInventory({...INITIAL_STOCK});
    }
  }
  function getStock(itemId) { return inventory[itemId] ?? 0; }
  function isLowStock(itemId) {
    const item = ALL_ITEMS.find(i=>i.id===itemId);
    if (!item) return false;
    const stock = getStock(itemId);
    const threshold = settings.lowStockThreshold || 5;
    // For chains (per inch), low if under 18" (one necklace)
    if (item.unit==="per inch") return stock < 18;
    // For per gram, low if under 5g
    if (item.unit==="per gram") return stock < 5;
    return stock <= threshold;
  }

  const displayRec = checkoutRec || records[0];
  const paypalLink = (amt,note) => settings.paypal ? `https://www.paypal.me/${settings.paypal}/${amt.toFixed(2)}` : null;
  const venmoLink  = (amt,note) => settings.venmo  ? `https://venmo.com/?txn=pay&audience=private&recipients=${settings.venmo}&amount=${amt.toFixed(2)}&note=${encodeURIComponent(note)}` : null;
  const cashLink   = amt        => settings.cashapp ? `https://cash.app/${settings.cashapp.startsWith("$")?settings.cashapp:"$"+settings.cashapp}/${amt.toFixed(2)}` : null;

  const payAmt = displayRec ? (displayRec.totalWithTax || displayRec.totalRetail) : 0;
  const PAY_METHODS = [
    settings.paypal  && {key:"paypal",  label:"PayPal",   icon:"PayPal",  bg:"#0070BA", link:displayRec?paypalLink(payAmt,`${displayRec.buildName} - ${settings.bizName}`):null},
    settings.venmo   && {key:"venmo",   label:"Venmo",    icon:"Venmo",   bg:"#3D95CE", link:displayRec?venmoLink(payAmt,`${displayRec.buildName} - ${settings.bizName}`):null},
    settings.cashapp && {key:"cashapp", label:"Cash App", icon:"CashApp", bg:"#00A63E", link:displayRec?cashLink(payAmt):null},
  ].filter(Boolean);

  // Email invoice generator
  function emailInvoice(rec) {
    const amt = rec.totalWithTax || rec.totalRetail;
    const lines = rec.lines.map(l => `  ${l.name} (${l.metal}) x${l.qty} — $${fmt(l.lineCost)}`).join("\n");
    const subject = encodeURIComponent(`Invoice: ${rec.buildName} — ${settings.bizName}`);
    const body = encodeURIComponent(
      `${settings.bizName}\nInvoice — ${rec.date}\n\nCustomer: ${rec.customer}\nBuild: ${rec.buildName}\n\nItems:\n${lines}\n\nSubtotal: $${fmt(rec.totalRetail)}${rec.taxAmt>0?`\nTax: $${fmt(rec.taxAmt)}`:""}${rec.discountAmt>0?`\nDiscount: -$${fmt(rec.discountAmt)}`:""}\n\nTotal Due: $${fmt(amt)}\n${rec.notes?`\nNote: ${rec.notes}\n`:""}\nThank you for your purchase!`
    );
    window.location.href = `mailto:${rec.email||""}?subject=${subject}&body=${body}`;
  }

  // Reorder calculator
  const reorderData = useMemo(() => {
    const usage = {};
    records.forEach(r => {
      r.lines.forEach(l => {
        const key = l.name + "|" + l.metal;
        if (!usage[key]) usage[key] = {name:l.name, metal:l.metal, unit:l.unit, price:l.price, totalQty:0, orderCount:0};
        usage[key].totalQty += l.qty * (r.pieces||1);
        usage[key].orderCount++;
      });
    });
    return Object.values(usage).sort((a,b) => b.totalQty - a.totalQty);
  }, [records]);

  function exportExcel() {
    const rows = [];
    records.forEach(r => {
      r.lines.forEach((l,i) => {
        rows.push({
          "Date":i===0?r.date:"","Build":i===0?r.buildName:"","Customer":i===0?r.customer:"",
          "Item":l.name,"Metal":l.metal,"Unit":l.unit,"Unit Cost ($)":+l.price.toFixed(4),
          "Qty":l.qty,"Line Cost ($)":+l.lineCost.toFixed(2),
          "Pieces":i===0?r.pieces:"","Markup":i===0?r.markup:"","Labor/Ea ($)":i===0?r.labor:"",
          "Discount":i===0&&r.discountAmt>0?`${r.discountType==="%"?r.discount+"%":"$"+fmt(r.discount)} (-$${fmt(r.discountAmt)})`:"",
          "Total Retail ($)":i===0?+r.totalRetail.toFixed(2):"",
          "Profit ($)":i===0?+r.profit.toFixed(2):"",
          "Margin %":i===0?+r.margin.toFixed(1):"",
          "Paid":i===0?(r.paid?"Yes":"No"):"",
        });
      });
      rows.push({});
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [10,22,18,36,8,10,12,6,12,8,8,12,20,14,12,10,6].map(w=>({wch:w}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Orders");
    XLSX.writeFile(wb,`KiramiGems_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const NAV = [
    {id:"catalog",  label:"Catalog",   icon:"Grid"},
    {id:"build",    label:"Build",     icon:"Cart",   badge:buildItems.length||null},
    {id:"checkout", label:"Checkout",  icon:"QR"},
    {id:"records",  label:"Records",   icon:"List",   badge:records.length||null},
    {id:"settings", label:"Settings",  icon:"Gear"},
  ];

  const mainPad = R.isMobile ? "16px 14px" : "24px 24px";
  const mainPB  = R.isMobile ? "90px" : "32px";

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"Georgia,'Times New Roman',serif",color:T.text,fontSize:15}}>

      {/* HEADER */}
      <header style={{
        background:T.card, borderBottom:`1px solid ${T.border}`,
        boxShadow:"0 1px 6px rgba(100,80,40,0.07)",
        padding: R.isMobile ? "14px 16px" : "16px 28px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Icon name="Gem" size={24} color={T.gold}/>
          <div>
            <div style={{fontSize:R.isMobile?17:20,fontWeight:700,color:T.text,letterSpacing:0.3}}>Kiramichael Gems</div>
            {!R.isMobile && <div style={{fontSize:11,color:T.dim,letterSpacing:1}}>Build Cost & Checkout Calculator</div>}
          </div>
        </div>
        {!R.isMobile && (
          <nav style={{display:"flex",gap:6}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>setTab(n.id)} style={{
                ...btnGhost(tab===n.id),
                display:"flex",alignItems:"center",gap:7,padding:"9px 16px",
                position:"relative",
              }}>
                <Icon name={n.icon} size={16}/>
                {n.label}
                {n.badge>0 && <span style={{position:"absolute",top:-5,right:-5,background:n.id==="records"?T.green:T.gold,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</span>}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:mainPad,paddingBottom:mainPB}}>

        {/* ══════════════ CATALOG TAB ══════════════ */}
        {tab==="catalog" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <h2 style={{margin:0,fontSize:R.isMobile?20:24,fontWeight:700}}>Item Catalog</h2>
              <p style={{margin:"3px 0 0",color:T.sub,fontSize:14}}>{catalogItems.length} of {ALL_ITEMS.length} items</p>
            </div>
            <button onClick={()=>setItemModal("new")} style={{...btnPrimary({padding:"10px 18px",fontSize:14}),display:"flex",alignItems:"center",gap:8}}>
              <Icon name="Plus" size={16}/> Add Item
            </button>
          </div>
          {/* Low stock alerts */}
          {(()=>{
            const lowItems = ALL_ITEMS.filter(i=>isLowStock(i.id));
            const outItems = lowItems.filter(i=>getStock(i.id)<=0);
            const warnItems = lowItems.filter(i=>getStock(i.id)>0);
            if (lowItems.length===0) return null;
            return (
              <div style={{...cardSt({padding:"14px 18px",marginBottom:14,border:`1.5px solid ${outItems.length>0?T.red+"60":"#B8860B60"}`})}}>
                <div style={{fontSize:14,fontWeight:700,color:outItems.length>0?T.red:"#B8860B",marginBottom:8}}>
                  {outItems.length>0 && `${outItems.length} out of stock`}
                  {outItems.length>0 && warnItems.length>0 && " · "}
                  {warnItems.length>0 && `${warnItems.length} running low`}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {lowItems.map(i=>(
                    <span key={i.id} style={{
                      fontSize:12,padding:"3px 10px",borderRadius:20,
                      background:getStock(i.id)<=0?T.redBg:"#FFF8E1",
                      color:getStock(i.id)<=0?T.red:"#B8860B",
                      border:`1px solid ${getStock(i.id)<=0?T.red+"30":"#B8860B30"}`,
                    }}>
                      {i.name} — {getStock(i.id)<=0?"OUT":`${i.unit==="each"?getStock(i.id):fmt(getStock(i.id),1)}${i.unit==="per inch"?'"':i.unit==="per gram"?"g":""}`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items..." style={{...inputSt(),flex:"1 1 180px",fontSize:15}}/>
            <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} style={{...btnGhost(false),padding:"10px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
              <Icon name="ChevronDown" size={14}/>{sortDir==="asc"?"Price: Low to High":"Price: High to Low"}
            </button>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:16,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>setCatFilter(c)} style={{
                ...btnGhost(catFilter===c),
                padding:"7px 14px",fontSize:13,whiteSpace:"nowrap",flexShrink:0,
              }}>{c}{c!=="All" && <span style={{...tagSt(T.dim,"#F0EBE4"),marginLeft:6,fontSize:10}}>{ALL_ITEMS.filter(i=>i.cat===c).length}</span>}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${R.isMobile?"160px":"260px"},1fr))`,gap:10}}>
            {catalogItems.map(item=>(
              <div key={item.id} style={{...cardSt({padding:"14px 16px"}),position:"relative"}}>
                {item.isCustom && (
                  <div style={{position:"absolute",top:10,right:10,display:"flex",gap:4}}>
                    <button onClick={()=>setItemModal(item)} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,padding:2}}><Icon name="Edit" size={15}/></button>
                    <button onClick={()=>deleteCustomItem(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,padding:2}}><Icon name="Trash" size={15}/></button>
                  </div>
                )}
                <div style={{fontSize:13,color:T.text,lineHeight:1.4,marginBottom:6,paddingRight:item.isCustom?40:0}}>{item.name}</div>
                <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                  <span style={tagSt()}>{item.cat}</span>
                  {item.isCustom && <span style={tagSt(T.green,T.greenBg)}>Custom</span>}
                  <span style={{fontSize:11,color:T.dim,alignSelf:"center"}}>{item.metal}</span>
                </div>
                {/* Stock indicator */}
                {(()=>{
                  const stock = getStock(item.id);
                  const low = isLowStock(item.id);
                  const unitLabel = item.unit==="per inch"?'"':item.unit==="per gram"?"g":"";
                  const out = stock <= 0;
                  return (
                    <div style={{fontSize:12,fontWeight:600,marginBottom:8,padding:"4px 8px",borderRadius:6,
                      background:out?T.redBg:low?"#FFF8E1":T.greenBg,
                      color:out?T.red:low?"#B8860B":T.green,
                      border:`1px solid ${out?T.red+"30":low?"#B8860B30":T.green+"30"}`,
                    }}>
                      {out ? "Out of stock" : `${item.unit==="each"?stock:fmt(stock,1)}${unitLabel} in stock`}
                      {low && !out && " — Low"}
                    </div>
                  );
                })()}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div>
                    <span style={{fontSize:R.isMobile?17:19,fontWeight:700,color:T.gold}}>${fmt(item.price,4)}</span>
                    <span style={{fontSize:11,color:T.dim,marginLeft:4}}>{item.unit}</span>
                  </div>
                  <button onClick={()=>{addToBuild(item.id);setTab("build");}} style={{
                    background:getStock(item.id)<=0?"#F0EBE4":T.goldLight,
                    color:getStock(item.id)<=0?T.dim:T.gold,
                    border:`1px solid ${getStock(item.id)<=0?T.border:T.borderAcc}`,
                    borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:13,fontWeight:600,
                    display:"flex",alignItems:"center",gap:5,
                  }}>
                    <Icon name="Plus" size={13}/> Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ══════════════ BUILD TAB ══════════════ */}
        {tab==="build" && (<>
          <div style={{marginBottom:16}}>
            <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>New Order</h2>
            <p style={{margin:0,color:T.sub,fontSize:14}}>Build a piece, price it, and send to checkout</p>
          </div>

          {templates.length>0 && (
            <div style={{...cardSt({padding:"16px 18px",border:`1px solid ${T.borderAcc}`,marginBottom:16})}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <Icon name="Save" size={17} color={T.gold}/> Saved Builds
                <span style={tagSt()}>{templates.length}</span>
              </div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
                {templates.map(t=>{
                  const matCost = t.items.reduce((s,b)=>{
                    const item=ALL_ITEMS.find(i=>i.id===b.itemId);
                    return s+(item?item.price*b.qty:0);
                  },0);
                  return (
                    <div key={t.id} style={{minWidth:180,flexShrink:0,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:3}}>{t.name}</div>
                      <div style={{fontSize:11,color:T.dim,marginBottom:10}}>
                        {t.items.length} items &middot; ${fmt(matCost)} material &middot; {t.markup}x
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>loadTemplate(t)} style={{...btnPrimary({flex:1,padding:"7px 0",fontSize:12})}}>Load</button>
                        <button onClick={()=>deleteTemplate(t.id)} style={{padding:"7px 9px",background:"none",border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer",color:T.dim,display:"flex",alignItems:"center"}}>
                          <Icon name="Trash" size={13}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {R.isMobile && (
            <button onClick={()=>setShowBrowser(b=>!b)} style={{
              ...btnGhost(showBrowser),width:"100%",marginBottom:12,
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px",
            }}>
              <Icon name="Plus" size={16}/>{showBrowser?"Hide Item Browser":"Browse Items to Add"}
            </button>
          )}

          {R.isMobile && showBrowser && (
            <div style={{...cardSt({padding:"16px",marginBottom:12})}}>
              <input value={buildSearch} onChange={e=>setBuildSearch(e.target.value)} placeholder="Search items..." style={inputSt({fontSize:15})}/>
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch",marginTop:10}}>
                {CATS.map(c=>(<button key={c} onClick={()=>setBuildCat(c)} style={{...btnGhost(buildCat===c),padding:"5px 10px",fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>{c}</button>))}
              </div>
              <div style={{overflowY:"auto",maxHeight:300,display:"flex",flexDirection:"column",gap:5,marginTop:10}}>
                {sidebarItems.map(item=>(
                  <div key={item.id} onClick={()=>{addToBuild(item.id);setShowBrowser(false);}} style={{
                    padding:"10px 12px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,
                    cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",
                  }}>
                    <div>
                      <div style={{fontSize:13,color:T.text,lineHeight:1.3}}>{item.name}</div>
                      <div style={{fontSize:11,color:T.dim,marginTop:1}}>{item.metal} &middot; {item.cat} &middot; <span style={{color:isLowStock(item.id)?getStock(item.id)<=0?T.red:"#B8860B":T.green,fontWeight:600}}>{item.unit==="each"?getStock(item.id):fmt(getStock(item.id),1)}{item.unit==="per inch"?'"':item.unit==="per gram"?"g":""}</span></div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.gold}}>${fmt(item.price,4)}</div>
                      <div style={{fontSize:10,color:T.dim}}>{item.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":R.isTablet?"300px 1fr":"320px 1fr",gap:16,alignItems:"start"}}>

            {!R.isMobile && (
              <div style={{...cardSt({padding:"18px 16px"}),position:"sticky",top:88}}>
                <div style={{fontWeight:700,fontSize:16,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Icon name="Grid" size={16} color={T.gold}/> Add Items
                </div>
                <input value={buildSearch} onChange={e=>setBuildSearch(e.target.value)} placeholder="Search items..." style={inputSt({fontSize:15})}/>
                <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch",marginTop:10}}>
                  {CATS.map(c=>(<button key={c} onClick={()=>setBuildCat(c)} style={{...btnGhost(buildCat===c),padding:"5px 10px",fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>{c}</button>))}
                </div>
                <div style={{overflowY:"auto",maxHeight:440,display:"flex",flexDirection:"column",gap:5,marginTop:10}}>
                  {sidebarItems.map(item=>(
                    <div key={item.id} onClick={()=>addToBuild(item.id)} style={{
                      padding:"10px 12px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,
                      cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.12s",
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.background=T.goldLight;e.currentTarget.style.borderColor=T.borderAcc;}}
                    onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.border;}}>
                      <div>
                        <div style={{fontSize:13,color:T.text,lineHeight:1.3}}>{item.name}</div>
                        <div style={{fontSize:11,color:T.dim,marginTop:1}}>{item.metal} &middot; {item.cat}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.gold}}>${fmt(item.price,4)}</div>
                        <div style={{fontSize:10,color:T.dim}}>{item.unit}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* Customer info */}
              <div style={cardSt({padding:"18px 20px"})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
                  <div style={{fontWeight:700,fontSize:16,color:T.text}}>Customer Info</div>
                  {buildItems.length>0 && (
                    <button onClick={saveAsTemplate} style={{
                      display:"flex",alignItems:"center",gap:6,
                      padding:"7px 14px",fontSize:13,fontWeight:600,
                      background:tmplFlash?T.green:T.goldLight,
                      color:tmplFlash?"#fff":buildName.trim()?T.gold:T.dim,
                      border:`1px solid ${tmplFlash?T.green:buildName.trim()?T.borderAcc:T.border}`,
                      borderRadius:7,cursor:"pointer",transition:"all 0.2s",
                    }}>
                      <Icon name="Save" size={14}/>
                      {tmplFlash?"Saved!":buildName.trim()?"Save as Template":"Name build to save"}
                    </button>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr",gap:12}}>
                  <div><label style={labelSt}>Build Name</label><input value={buildName} onChange={e=>setBuildName(e.target.value)} placeholder="e.g. Shell Necklace" style={inputSt()}/></div>
                  <div><label style={labelSt}>Customer Name</label><input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Full name" style={inputSt()}/></div>
                  <div><label style={labelSt}>Email (optional)</label><input value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="email@example.com" style={inputSt()}/></div>
                  <div><label style={labelSt}>Order Date</label><input value={orderDate} onChange={e=>setOrderDate(e.target.value)} style={inputSt()}/></div>
                </div>
              </div>

              {/* BOM */}
              <div style={cardSt({padding:"18px 20px"})}>
                <div style={{fontWeight:700,fontSize:16,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Icon name="Tag" size={16} color={T.gold}/> Build Items
                  {buildItems.length>0 && <span style={tagSt(T.green,T.greenBg)}>{buildItems.length}</span>}
                </div>
                {buildItems.length===0 ? (
                  <div style={{textAlign:"center",padding:"28px 0",color:T.dim}}>
                    <Icon name="Cart" size={32} color={T.border}/>
                    <p style={{margin:"10px 0 0",fontSize:14}}>
                      {R.isMobile ? "Tap Browse Items above to add pieces" : "Click items on the left to add them here"}
                    </p>
                  </div>
                ) : (<>
                  <div style={{display:"grid",gridTemplateColumns:`1fr ${R.isMobile?"":"80px "}100px 90px 32px`,gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`,marginBottom:6}}>
                    {["Item",...(!R.isMobile?["Metal"]:[]),"Qty / Unit","Cost",""].map((h,i)=>(<div key={i} style={{fontSize:12,fontWeight:600,color:T.sub}}>{h}</div>))}
                  </div>
                  {totals.lines.map(line=>(
                    <div key={line.id} style={{display:"grid",gridTemplateColumns:`1fr ${R.isMobile?"":"80px "}100px 90px 32px`,gap:8,padding:"8px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                      <div style={{fontSize:13,color:T.text,lineHeight:1.35}}>{line.name}{R.isMobile&&<div style={{fontSize:11,color:T.dim}}>{line.metal}</div>}</div>
                      {!R.isMobile && <div style={{fontSize:12,color:T.dim}}>{line.metal}</div>}
                      <div>
                        <input type="number" min="0.001" step="1" value={line.qty}
                          onChange={e=>updateQty(line.id,e.target.value)}
                          style={{...inputSt({padding:"6px 8px",fontSize:14,textAlign:"center"})}}/>
                        <div style={{fontSize:10,color:T.dim,textAlign:"center",marginTop:2}}>{line.unit}</div>
                      </div>
                      <div style={{fontSize:14,fontWeight:700,color:T.gold,textAlign:"right"}}>${fmt(line.lineCost)}</div>
                      <button onClick={()=>setBuildItems(p=>p.filter(b=>b.itemId!==line.id))}
                        style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.dim,cursor:"pointer",padding:"4px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <Icon name="X" size={14}/>
                      </button>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"flex-end",paddingTop:10}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:12,color:T.sub}}>Material cost per piece</div>
                      <div style={{fontSize:20,fontWeight:700,color:T.gold}}>${fmt(totals.materialCost)}</div>
                    </div>
                  </div>
                </>)}
              </div>

              {/* Pricing + Summary */}
              <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr",gap:14}}>
                <div style={cardSt({padding:"18px 20px"})}>
                  <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:T.text}}>Pricing</div>
                  <div style={{display:"flex",flexDirection:"column",gap:13}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><label style={labelSt}>Pieces</label><input type="number" min="1" value={pieces} onChange={e=>setPieces(Math.max(1,parseInt(e.target.value)||1))} style={inputSt()}/></div>
                      <div><label style={labelSt}>Labor / Piece ($)</label><input type="number" min="0" step="0.5" value={labor} onChange={e=>setLabor(parseFloat(e.target.value)||0)} style={inputSt()}/></div>
                    </div>
                    <div>
                      <label style={labelSt}>Markup</label>
                      <div style={{display:"flex",gap:6,marginBottom:7}}>
                        {[2,2.5,3,4].map(m=>(<button key={m} onClick={()=>setMarkup(m)} style={{...btnGhost(markup===m),flex:1,padding:"8px 0",fontSize:13}}>{m}x</button>))}
                      </div>
                      <input type="number" step="0.1" min="1" value={markup} onChange={e=>setMarkup(parseFloat(e.target.value)||1)} style={inputSt()}/>
                    </div>
                    <div>
                      <label style={labelSt}>Discount (optional)</label>
                      <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}`,marginBottom:7}}>
                        {["%","$"].map(t=>(<button key={t} onClick={()=>setDiscountType(t)} style={{flex:1,padding:"11px",border:"none",cursor:"pointer",fontSize:15,fontWeight:700,background:discountType===t?T.gold:"#F5F0EA",color:discountType===t?"#fff":T.sub,transition:"all 0.13s"}}>{t}</button>))}
                      </div>
                      <input type="number" min="0" step={discountType==="%"?1:0.5} max={discountType==="%"?100:undefined}
                        value={discount||""} placeholder="0" onChange={e=>setDiscount(parseFloat(e.target.value)||0)} style={inputSt()}/>
                      {discount>0 && totals.discAmt>0 && (
                        <div style={{marginTop:6,padding:"7px 10px",background:T.redBg,border:`1px solid ${T.red}20`,borderRadius:6,fontSize:13,color:T.red,fontWeight:600}}>
                          -{discountType==="%" ? discount+"%" : "$"+fmt(discount)} off &mdash; Customer pays ${fmt(totals.totalRetail)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelSt}>Notes</label>
                      <textarea value={buildNotes} onChange={e=>setBuildNotes(e.target.value)} rows={2}
                        placeholder="Special requests, packaging..."
                        style={{...inputSt(),resize:"vertical",fontFamily:"Georgia,serif"}}/>
                    </div>
                  </div>
                </div>

                <div style={{...cardSt({padding:"18px 20px",border:`1.5px solid ${T.borderAcc}`})}}>
                  <div style={{fontWeight:700,fontSize:16,marginBottom:14,color:T.text}}>Order Summary</div>
                  {buildItems.length===0 ? (
                    <p style={{color:T.dim,textAlign:"center",padding:"20px 0",fontSize:14}}>Add items to see totals</p>
                  ) : (<>
                    {[
                      ["Material / piece",     `$${fmt(totals.materialCost)}`,  false],
                      ["Labor / piece",         `$${fmt(labor)}`,               false],
                      ["Cost / piece",          `$${fmt(totals.materialCost+labor)}`, false],
                      ["Markup",                `${markup}x`,                   false],
                      ["Retail / piece",        `$${fmt(totals.rpp)}`,          true],
                      ["Pieces",                `${pieces}`,                    false],
                      ["Total material",        `$${fmt(totals.totalMat)}`,     false],
                      ["Total labor",           `$${fmt(totals.totalLabor)}`,   false],
                      ...(totals.discAmt>0?[["Discount",`-$${fmt(totals.discAmt)}`,false]]:[]),
                      ["Total retail",          `$${fmt(totals.totalRetail)}`,  true],
                      ...(totals.taxAmt>0?[["Tax",`+$${fmt(totals.taxAmt)}`,false]]:[]),
                      ...(totals.taxAmt>0?[["Total w/ tax",`$${fmt(totals.totalWithTax)}`,true]]:[]),
                      ["Profit",                `$${fmt(totals.profit)}`,       true],
                      ["Margin",                `${fmt(totals.margin,1)}%`,     false],
                    ].map(([l,v,hi])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                        <span style={{fontSize:13,color:l==="Discount"?T.red:hi?T.text:T.sub}}>{l}</span>
                        <span style={{fontSize:hi?17:14,fontWeight:hi?700:400,color:l==="Profit"?T.green:l==="Discount"?T.red:hi?T.gold:T.text}}>{v}</span>
                      </div>
                    ))}
                    <button onClick={saveBuild} disabled={!customerName.trim()||buildItems.length===0} style={{
                      ...btnPrimary({width:"100%",marginTop:16,padding:"14px",fontSize:16}),
                      background:flash==="saved"?T.green:customerName.trim()&&buildItems.length?T.gold:"#C8BBA8",
                      cursor:customerName.trim()&&buildItems.length?"pointer":"default",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                    }}>
                      {flash==="saved" ? <><Icon name="Check" size={18}/>Saved! Going to Checkout...</> : "Save Order and Checkout"}
                    </button>
                    {!customerName.trim() && <p style={{textAlign:"center",fontSize:13,color:T.red,marginTop:8}}>Enter a customer name to save</p>}
                  </>)}
                </div>
              </div>
            </div>
          </div>
        </>)}

        {/* ══════════════ CHECKOUT TAB ══════════════ */}
        {tab==="checkout" && (<>
          <div style={{marginBottom:16}}>
            <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>Checkout</h2>
            <p style={{margin:0,color:T.sub,fontSize:14}}>Collect payment from your customer</p>
          </div>

          {!displayRec ? (
            <div style={{...cardSt({padding:"48px 24px"}),textAlign:"center"}}>
              <Icon name="Cart" size={40} color={T.border}/>
              <p style={{color:T.sub,fontSize:16,marginTop:12}}>No order ready yet.</p>
              <button onClick={()=>setTab("build")} style={btnPrimary({marginTop:12})}>Create an Order</button>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":R.isTablet?"1fr":"1fr 360px",gap:16,alignItems:"start"}}>

              {/* Invoice */}
              <div style={cardSt({padding:R.isMobile?"18px 16px":"24px 28px"})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
                  <div>
                    <div style={{fontSize:11,color:T.dim,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Invoice</div>
                    <div style={{fontSize:R.isMobile?18:22,fontWeight:700,color:T.text}}>{displayRec.buildName}</div>
                    <div style={{fontSize:15,color:T.sub,marginTop:3}}>{displayRec.customer}</div>
                    {displayRec.email && <div style={{fontSize:13,color:T.dim}}>{displayRec.email}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,color:T.dim}}>Date</div>
                    <div style={{fontSize:15,fontWeight:600}}>{displayRec.date}</div>
                    <span style={tagSt(displayRec.paid?T.green:T.gold,displayRec.paid?T.greenBg:T.goldLight)}>
                      {displayRec.paid?"Paid":"Awaiting Payment"}
                    </span>
                  </div>
                </div>

                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:360}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${T.border}`}}>
                        {["Item","Metal","Qty","Unit Cost","Total"].map(h=>(
                          <th key={h} style={{padding:"7px 6px",textAlign:h==="Total"?"right":"left",fontSize:12,fontWeight:600,color:T.sub}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRec.lines.map((l,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?"transparent":"#FDFBF7"}}>
                          <td style={{padding:"8px 6px",fontSize:13,color:T.text}}>{l.name}</td>
                          <td style={{padding:"8px 6px",fontSize:12,color:T.dim}}>{l.metal}</td>
                          <td style={{padding:"8px 6px",fontSize:12,color:T.dim}}>{l.qty} {l.unit}</td>
                          <td style={{padding:"8px 6px",fontSize:12,color:T.dim}}>${fmt(l.price,4)}</td>
                          <td style={{padding:"8px 6px",fontSize:13,fontWeight:600,color:T.text,textAlign:"right"}}>${fmt(l.lineCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{borderTop:`2px solid ${T.border}`,paddingTop:12,marginTop:4,display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
                  {[
                    ["Material",`$${fmt((displayRec.materialCost||0)*displayRec.pieces)}`],
                    [`Labor (${displayRec.pieces} pc)`,`$${fmt(displayRec.totalLabor)}`],
                  ].map(([l,v])=>(
                    <div key={l} style={{display:"flex",gap:32}}>
                      <span style={{fontSize:13,color:T.sub}}>{l}</span>
                      <span style={{fontSize:13,color:T.text}}>{v}</span>
                    </div>
                  ))}
                  {displayRec.discountAmt>0 && (
                    <div style={{display:"flex",gap:32}}>
                      <span style={{fontSize:13,color:T.red}}>Discount</span>
                      <span style={{fontSize:13,color:T.red,fontWeight:600}}>-${fmt(displayRec.discountAmt)}</span>
                    </div>
                  )}
                  {(displayRec.taxAmt||0)>0 && (
                    <div style={{display:"flex",gap:32}}>
                      <span style={{fontSize:13,color:T.sub}}>Tax</span>
                      <span style={{fontSize:13,color:T.text}}>+${fmt(displayRec.taxAmt)}</span>
                    </div>
                  )}
                  <div style={{display:"flex",gap:32,borderTop:`1px solid ${T.border}`,paddingTop:10,marginTop:4}}>
                    <span style={{fontSize:16,fontWeight:700}}>Total Due</span>
                    <span style={{fontSize:22,fontWeight:700,color:T.gold}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)}</span>
                  </div>
                  {displayRec.notes && (
                    <div style={{width:"100%",marginTop:6,padding:"8px 12px",background:T.bg,borderRadius:8,fontSize:13,color:T.sub,fontStyle:"italic"}}>
                      Note: {displayRec.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={cardSt({padding:"20px"})}>
                  <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Collect Payment</div>
                  <div style={{fontSize:14,color:T.sub,marginBottom:18}}>
                    Total: <strong style={{color:T.gold,fontSize:20}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)}</strong>
                    {(displayRec.taxAmt||0)>0 && <span style={{fontSize:12,color:T.dim,marginLeft:6}}>(incl. ${fmt(displayRec.taxAmt)} tax)</span>}
                  </div>

                  {!settings.paypal && !settings.venmo && !settings.cashapp ? (
                    <div style={{background:T.goldLight,border:`1px solid ${T.borderAcc}`,borderRadius:8,padding:"14px"}}>
                      <p style={{margin:"0 0 10px",fontSize:14,color:T.sub}}>Add payment handles in Settings to enable QR codes.</p>
                      <button onClick={()=>setTab("settings")} style={btnPrimary({padding:"9px 18px",fontSize:14})}>Go to Settings</button>
                    </div>
                  ) : (<>
                    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                      {PAY_METHODS.map(m=>(
                        <button key={m.key} onClick={()=>setQrMethod(qrMethod===m.key?null:m.key)} style={{
                          flex:1, minWidth:80, padding:"10px 6px",
                          background:qrMethod===m.key?m.bg:"#F5F0EA",
                          color:qrMethod===m.key?"#fff":T.sub,
                          border:`2px solid ${qrMethod===m.key?m.bg:T.border}`,
                          borderRadius:9,cursor:"pointer",fontSize:13,fontWeight:700,
                          display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                          transition:"all 0.15s",
                        }}>
                          <Icon name={m.icon} size={16} color={qrMethod===m.key?"#fff":T.sub}/>{m.label}
                        </button>
                      ))}
                    </div>

                    {qrMethod && PAY_METHODS.filter(m=>m.key===qrMethod&&m.link).map(m=>(
                      <div key={m.key} style={{textAlign:"center"}}>
                        <div style={{background:"#fff",border:`3px solid ${m.bg}`,borderRadius:16,padding:"18px",display:"inline-block",boxShadow:`0 4px 20px ${m.bg}25`,marginBottom:12}}>
                          <QRBox url={m.link} size={R.isMobile?200:220}/>
                          <div style={{marginTop:10,fontSize:13,fontWeight:700,color:m.bg}}>{m.label} &middot; ${fmt(displayRec.totalRetail)}</div>
                          <div style={{fontSize:11,color:T.dim,marginTop:2}}>{displayRec.buildName}</div>
                        </div>
                        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                          <button onClick={()=>setQrFull(true)} style={{...btnPrimary({padding:"10px 18px",fontSize:14,background:m.bg,display:"flex",alignItems:"center",gap:7})}}>
                            <Icon name="Expand" size={16}/>Full Screen
                          </button>
                          <a href={m.link} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                            <button style={btnGhost(false,{padding:"10px 18px",fontSize:14})}>Open Link</button>
                          </a>
                        </div>
                        <p style={{fontSize:12,color:T.dim,marginTop:10}}>Hand your phone to the customer to scan</p>
                      </div>
                    ))}

                    <button onClick={()=>{ if(window.confirm("Mark this order as paid by cash?")) markPaid(displayRec.id); }}
                      style={{...btnGhost(false,{width:"100%",marginTop:10,padding:"11px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}}>
                      <Icon name="Cash" size={16}/>Mark as Cash Payment
                    </button>
                  </>)}

                  {!displayRec.paid ? (
                    <button onClick={()=>markPaid(displayRec.id)} style={{
                      ...btnGhost(false,{width:"100%",marginTop:10,padding:"11px",fontSize:14,borderColor:T.green,color:T.green,display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
                    }}>
                      <Icon name="Check" size={16} color={T.green}/>Mark as Paid
                    </button>
                  ) : (
                    <div style={{...tagSt(T.green,T.greenBg),justifyContent:"center",padding:"12px",borderRadius:8,width:"100%",boxSizing:"border-box",marginTop:10,fontSize:14,display:"flex"}}>
                      <Icon name="Check" size={16}/>Payment Received
                    </div>
                  )}

                  {/* Email Invoice */}
                  <button onClick={()=>emailInvoice(displayRec)} style={{
                    ...btnGhost(false,{width:"100%",marginTop:10,padding:"11px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
                  }}>
                    <Icon name="Save" size={16}/>Send Invoice via Email
                  </button>
                </div>

                {records.length>1 && (
                  <div style={cardSt({padding:"16px"})}>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:10,color:T.sub}}>Other Orders</div>
                    {records.filter(r=>r.id!==displayRec.id).slice(0,4).map(r=>(
                      <div key={r.id} onClick={()=>{setCheckoutRec(r);setQrMethod(null);}}
                        style={{padding:"9px 10px",borderRadius:7,cursor:"pointer",display:"flex",justifyContent:"space-between",transition:"background 0.12s"}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.bg}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div>
                          <div style={{fontSize:13,color:T.text}}>{r.buildName}</div>
                          <div style={{fontSize:11,color:T.dim}}>{r.customer} &middot; {r.date}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:600,color:T.gold}}>${fmt(r.totalRetail)}</div>
                          <span style={tagSt(r.paid?T.green:T.dim,r.paid?T.greenBg:"#F0EBE4")}>{r.paid?"Paid":"Pending"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fullscreen QR modal */}
          {qrFull && qrMethod && PAY_METHODS.find(m=>m.key===qrMethod)?.link && (
            <div onClick={()=>setQrFull(false)} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              {PAY_METHODS.filter(m=>m.key===qrMethod&&m.link).map(m=>(
                <div key={m.key} style={{background:"#fff",borderRadius:20,padding:"28px 24px 24px",textAlign:"center",maxWidth:380,width:"100%",border:`4px solid ${m.bg}`,boxShadow:`0 0 60px ${m.bg}50`}}
                  onClick={e=>e.stopPropagation()}>
                  <div style={{fontSize:12,color:T.dim,letterSpacing:1,marginBottom:4}}>Kiramichael Gems</div>
                  <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:2}}>{displayRec.buildName}</div>
                  <div style={{fontSize:15,color:T.sub,marginBottom:16}}>{displayRec.customer}</div>
                  <div style={{background:"#fff",padding:8,borderRadius:10,display:"inline-block",marginBottom:14}}>
                    <QRBox url={m.link} size={Math.min(280,window.innerWidth-100)}/>
                  </div>
                  <div style={{fontSize:32,fontWeight:700,color:m.bg,marginBottom:4}}>${fmt(displayRec.totalRetail)}</div>
                  <div style={{fontSize:15,color:T.sub,marginBottom:18,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <Icon name={m.icon} size={18} color={m.bg}/>Scan to pay with {m.label}
                  </div>
                  <button onClick={()=>setQrFull(false)} style={btnGhost(false,{width:"100%",padding:"12px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}>
                    <Icon name="X" size={16}/>Close
                  </button>
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* ══════════════ RECORDS TAB ══════════════ */}
        {tab==="records" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>Order Records</h2>
              <p style={{margin:0,color:T.sub,fontSize:14}}>{records.length} order{records.length!==1?"s":""} &middot; Saved on this device</p>
            </div>
            {records.length>0 && (
              <button onClick={exportExcel} style={{...btnGhost(false,{borderColor:T.gold,color:T.gold,padding:"10px 18px",fontSize:14,display:"flex",alignItems:"center",gap:7})}}><Icon name="Save" size={15}/>Export Excel</button>
            )}
          </div>

          {records.length===0 ? (
            <div style={{...cardSt({padding:"48px 24px"}),textAlign:"center"}}>
              <Icon name="List" size={40} color={T.border}/>
              <p style={{color:T.sub,fontSize:16,marginTop:12}}>No orders yet</p>
              <button onClick={()=>setTab("build")} style={btnPrimary({marginTop:12})}>Create First Order</button>
            </div>
          ) : (<>
            {/* Today's summary */}
            {(()=>{
              const today = todayStr();
              const todayRecs = records.filter(r=>r.date===today);
              if (todayRecs.length===0) return null;
              return (
                <div style={{...cardSt({padding:"16px 20px",border:`1.5px solid ${T.borderAcc}`,marginBottom:16})}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:12}}>Today &mdash; {today}</div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${R.isMobile?2:4},1fr)`,gap:10}}>
                    {[
                      ["Sales",    todayRecs.length,                                              T.gold],
                      ["Pieces",   todayRecs.reduce((a,r)=>a+r.pieces,0),                        T.sub],
                      ["Revenue",  `$${fmt(todayRecs.reduce((a,r)=>a+r.totalRetail,0))}`,        T.gold],
                      ["Profit",   `$${fmt(todayRecs.reduce((a,r)=>a+r.profit,0))}`,             T.green],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center"}}>
                        <div style={{fontSize:11,color:T.sub,marginBottom:2}}>{l}</div>
                        <div style={{fontSize:R.isMobile?16:20,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* All-time stats */}
            <div style={{display:"grid",gridTemplateColumns:`repeat(${R.isMobile?2:4},1fr)`,gap:10,marginBottom:16}}>
              {[
                ["Orders",    records.length,                                              T.gold],
                ["Pieces",    records.reduce((a,r)=>a+r.pieces,0),                        T.sub],
                ["Revenue",   `$${fmt(records.reduce((a,r)=>a+r.totalRetail,0))}`,        T.gold],
                ["Profit",    `$${fmt(records.reduce((a,r)=>a+r.profit,0))}`,             T.green],
              ].map(([l,v,c])=>(
                <div key={l} style={{...cardSt({padding:"14px 16px",textAlign:"center"})}}>
                  <div style={{fontSize:12,color:T.sub,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:R.isMobile?18:22,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {records.map(r=>(
                <div key={r.id} style={cardSt({padding:"16px 18px"})}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:T.text}}>{r.buildName}</div>
                      <div style={{fontSize:13,color:T.sub,marginTop:2}}>{r.customer} &middot; {r.date} &middot; {r.pieces} pc</div>
                      {r.notes && <div style={{fontSize:12,color:T.dim,marginTop:3,fontStyle:"italic"}}>{r.notes}</div>}
                    </div>
                    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                      {[["Retail",`$${fmt(r.totalRetail)}`,T.gold],["Profit",`$${fmt(r.profit)}`,T.green],["Margin",`${fmt(r.margin,1)}%`,T.sub]].map(([l,v,c])=>(
                        <div key={l} style={{textAlign:"right"}}>
                          <div style={{fontSize:11,color:T.dim}}>{l}</div>
                          <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                      <span style={tagSt(r.paid?T.green:T.dim,r.paid?T.greenBg:"#F0EBE4")}>{r.paid?"Paid":"Pending"}</span>
                      <button onClick={()=>{setCheckoutRec(r);setTab("checkout");}} style={{...btnGhost(false,{padding:"7px 12px",fontSize:13,display:"flex",alignItems:"center",gap:5})}}><Icon name="QR" size={14}/>Checkout</button>
                      <button onClick={()=>deleteRecord(r.id)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.dim,cursor:"pointer",padding:"7px 9px",display:"flex",alignItems:"center"}}>
                        <Icon name="Trash" size={14}/>
                      </button>
                    </div>
                  </div>
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:9,display:"flex",flexWrap:"wrap",gap:6}}>
                    {r.lines.map((l,i)=>(
                      <span key={i} style={{fontSize:12,color:T.sub,padding:"3px 10px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:20}}>
                        {l.name} x{l.qty} &mdash; <strong style={{color:T.gold}}>${fmt(l.lineCost)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Reorder Calculator */}
            {reorderData.length>0 && (
              <div style={{...cardSt({padding:"18px 20px",marginTop:16})}}>
                <div style={{fontWeight:700,fontSize:16,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Icon name="Tag" size={16} color={T.gold}/> Reorder Calculator
                </div>
                <p style={{fontSize:13,color:T.sub,marginBottom:12}}>Total usage across all orders — use this to plan your next JK Findings reorder.</p>
                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${T.border}`}}>
                        {["Item","Metal","Total Used","Unit","Est. Cost"].map(h=>(
                          <th key={h} style={{padding:"7px 8px",textAlign:h==="Est. Cost"?"right":"left",fontSize:12,fontWeight:600,color:T.sub}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reorderData.map((d,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?"transparent":"#FDFBF7"}}>
                          <td style={{padding:"8px",fontSize:13,color:T.text}}>{d.name}</td>
                          <td style={{padding:"8px",fontSize:12,color:T.dim}}>{d.metal}</td>
                          <td style={{padding:"8px",fontSize:13,fontWeight:600,color:T.text}}>{fmt(d.totalQty,d.unit==="each"?0:1)}</td>
                          <td style={{padding:"8px",fontSize:12,color:T.dim}}>{d.unit}</td>
                          <td style={{padding:"8px",fontSize:13,fontWeight:600,color:T.gold,textAlign:"right"}}>${fmt(d.totalQty*d.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:`2px solid ${T.border}`}}>
                        <td colSpan="4" style={{padding:"8px",fontSize:14,fontWeight:700}}>Total Reorder Cost</td>
                        <td style={{padding:"8px",fontSize:16,fontWeight:700,color:T.gold,textAlign:"right"}}>${fmt(reorderData.reduce((s,d)=>s+d.totalQty*d.price,0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>)}
        </>)}

        {/* ══════════════ SETTINGS TAB ══════════════ */}
        {tab==="settings" && (<>
          <div style={{marginBottom:16}}>
            <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>Settings</h2>
            <p style={{margin:0,color:T.sub,fontSize:14}}>Your payment handles and business details</p>
          </div>
          <div style={{maxWidth:520,display:"flex",flexDirection:"column",gap:16}}>
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>Business Info</div>
              <div>
                <label style={labelSt}>Business Name</label>
                <input value={settings.bizName} onChange={e=>saveSettings({...settings,bizName:e.target.value})}
                  placeholder="Kiramichael Gems" style={inputSt()}/>
              </div>
            </div>
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Payment Handles</div>
              <p style={{fontSize:14,color:T.sub,marginBottom:16}}>Enter your usernames below. Checkout will generate QR codes with the exact total pre-filled.</p>
              {[
                ["paypal","PayPal","PayPal","PayPal.me username","e.g. kiramichaelgems","#0070BA"],
                ["venmo","Venmo","Venmo","Venmo username","e.g. kira-gems","#3D95CE"],
                ["cashapp","Cash App","CashApp","Cash App $cashtag","e.g. $KiraGems","#00A63E"],
              ].map(([key,label,icon,sublabel,ph,color])=>(
                <div key={key} style={{marginBottom:16}}>
                  <label style={{...labelSt,display:"flex",alignItems:"center",gap:7}}>
                    <Icon name={icon} size={16} color={color}/>{label} &mdash; {sublabel}
                  </label>
                  <input value={settings[key]} onChange={e=>saveSettings({...settings,[key]:e.target.value})}
                    placeholder={ph} style={{...inputSt(),borderColor:settings[key]?color:T.border}}/>
                  {settings[key] && <div style={{fontSize:12,color:T.green,marginTop:5,display:"flex",alignItems:"center",gap:5}}><Icon name="Check" size={13} color={T.green}/>QR checkout enabled</div>}
                </div>
              ))}
            </div>
            {/* Tax Settings */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>Sales Tax</div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <button onClick={()=>saveSettings({...settings,taxEnabled:!settings.taxEnabled})} style={{
                  width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",
                  background:settings.taxEnabled?T.green:"#D5CCB8",
                  position:"relative",transition:"background 0.2s",
                }}>
                  <div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:2,
                    left:settings.taxEnabled?24:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                </button>
                <span style={{fontSize:15,color:T.text,fontWeight:600}}>
                  {settings.taxEnabled ? "Tax enabled" : "Tax disabled"}
                </span>
              </div>
              {settings.taxEnabled && (
                <div>
                  <label style={labelSt}>Tax Rate (%)</label>
                  <input type="number" min="0" max="20" step="0.1"
                    value={settings.taxRate||""} placeholder="6"
                    onChange={e=>saveSettings({...settings,taxRate:parseFloat(e.target.value)||0})}
                    style={inputSt({maxWidth:120})}/>
                  <div style={{fontSize:12,color:T.dim,marginTop:4}}>Florida default: 6%</div>
                </div>
              )}
            </div>

            {/* Price Rounding */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Price Rounding</div>
              <p style={{fontSize:13,color:T.sub,marginBottom:12}}>Automatically round retail prices to clean numbers.</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[
                  ["none","Off (exact)"],
                  ["whole","Whole dollar ($35)"],
                  ["99","X.99 ($34.99)"],
                  ["95","X.95 ($34.95)"],
                ].map(([val,label])=>(
                  <button key={val} onClick={()=>saveSettings({...settings,priceRounding:val})} style={{
                    ...btnGhost(settings.priceRounding===val),
                    padding:"8px 14px",fontSize:13,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Inventory Management */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Inventory</div>
              <p style={{fontSize:13,color:T.sub,marginBottom:12}}>Stock auto-decrements when you save orders. Adjust manually below.</p>
              <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                <div>
                  <label style={labelSt}>Low Stock Alert (each items)</label>
                  <input type="number" min="1" max="50" value={settings.lowStockThreshold||5}
                    onChange={e=>saveSettings({...settings,lowStockThreshold:parseInt(e.target.value)||5})}
                    style={inputSt({maxWidth:100})}/>
                </div>
                <div style={{alignSelf:"flex-end"}}>
                  <button onClick={resetInventory} style={btnGhost(false,{padding:"10px 16px",fontSize:13,borderColor:T.red,color:T.red})}>
                    Reset to Invoice Qty
                  </button>
                </div>
              </div>
              <div style={{maxHeight:400,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                {ALL_ITEMS.map(item=>{
                  const stock = getStock(item.id);
                  const low = isLowStock(item.id);
                  const out = stock <= 0;
                  const unitLabel = item.unit==="per inch"?'"':item.unit==="per gram"?"g":"";
                  return (
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:out?T.redBg:low?"#FFF8E1":"transparent",borderRadius:6,border:`1px solid ${out?T.red+"20":low?"#B8860B20":T.border}`}}>
                      <div style={{flex:1,fontSize:13,color:T.text}}>{item.name} <span style={{color:T.dim,fontSize:11}}>({item.metal})</span></div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <button onClick={()=>adjustStock(item.id,-1)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:"none",cursor:"pointer",fontSize:16,fontWeight:700,color:T.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>&minus;</button>
                        <input type="number" min="0" step={item.unit==="each"?1:0.1}
                          value={item.unit==="each"?stock:parseFloat(stock.toFixed(1))}
                          onChange={e=>setStock(item.id,parseFloat(e.target.value)||0)}
                          style={{...inputSt({width:70,padding:"4px 6px",fontSize:14,textAlign:"center"})}}/>
                        <button onClick={()=>adjustStock(item.id,1)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:"none",cursor:"pointer",fontSize:16,fontWeight:700,color:T.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                        <span style={{fontSize:11,color:T.dim,width:12}}>{unitLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{...cardSt({padding:"16px",background:T.goldLight,border:`1px solid ${T.borderAcc}`})}}>
              <p style={{margin:0,fontSize:14,color:T.sub,lineHeight:1.6}}>
                <strong style={{color:T.text}}>All data stays on this device.</strong> Records, templates, settings, and catalog items are saved in your browser's local storage. They persist when you close the app and reopen it. Clearing Safari website data will erase them.
              </p>
            </div>
          </div>
        </>)}

      </main>

      {/* BOTTOM NAV - mobile only */}
      {R.isMobile && (
        <nav style={{
          position:"fixed",bottom:0,left:0,right:0,zIndex:100,
          background:T.card,borderTop:`1px solid ${T.border}`,
          display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)",
          boxShadow:"0 -2px 10px rgba(100,80,40,0.08)",
        }}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", gap:3, padding:"10px 0 8px",
              background:"none", border:"none", cursor:"pointer",
              color:tab===n.id?T.gold:T.dim,
              position:"relative",
            }}>
              <Icon name={n.icon} size={22} color={tab===n.id?T.gold:T.dim}/>
              <span style={{fontSize:10,fontWeight:tab===n.id?700:400,fontFamily:"sans-serif"}}>{n.label}</span>
              {n.badge>0 && <span style={{position:"absolute",top:6,right:"50%",transform:"translateX(12px)",background:n.id==="records"?T.green:T.gold,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</span>}
            </button>
          ))}
        </nav>
      )}

      {/* Item modal */}
      {itemModal && (
        <ItemModal
          item={typeof itemModal==="object" ? itemModal : null}
          onSave={(form)=>saveCustomItem(form, typeof itemModal==="object" ? itemModal.id : null)}
          onCancel={()=>setItemModal(null)}
        />
      )}

      <footer style={{textAlign:"center",padding:"20px",color:T.dim,fontSize:12,borderTop:`1px solid ${T.border}`,display:R.isMobile?"none":"block"}}>
        Kiramichael Gems &middot; JK Findings Invoice PI26-04970 &middot; March 24, 2026
      </footer>
    </div>
  );
}
