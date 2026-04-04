import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { DEFAULT_ITEMS, CATS, INITIAL_STOCK, INVOICE_TOTAL, INVOICE_COST, INVOICE_FREIGHT, INVOICE_GOLD_OZ, INVOICE_SILVER_OZ, INVOICE_14KGF_COST, INVOICE_925AG_COST } from "./data/catalog";
import useMetalPrices from "./hooks/useMetalPrices";
import { T, fmt, todayStr, uid, store, cardSt, inputSt, labelSt, btnPrimary, btnGhost, tagSt } from "./theme";
import Icon from "./components/Icons";
import useResponsive from "./hooks/useResponsive";
import QRBox from "./components/QRBox";
import ItemModal from "./components/ItemModal";
import { dbLoad, dbSave, isOnline } from "./lib/supabase";

const UNITS = ["each","per inch","per gram","per foot"];

export default function App() {
  const R = useResponsive();
  const metals = useMetalPrices();

  const [records,    setRecords]    = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [customItems,setCustomItems]= useState([]);
  const [settings,   setSettings]   = useState({paypal:"",venmo:"",cashapp:"",bizName:"Kiramichael Gems",taxRate:0,taxEnabled:false,priceRounding:"none",lowStockThreshold:5});
  const [inventory,  setInventory]  = useState({});
  const [shows,      setShows]      = useState([]);     // all shows/events
  const [activeShow, setActiveShow] = useState(null);   // current show id
  const [showPicker, setShowPicker] = useState(false);   // show picker modal
  const [sellers,    setSellers]    = useState([]);     // seller profiles
  const [activeSeller,setActiveSeller]=useState(null);  // current seller id
  const [sellerPicker,setSellerPicker]=useState(true);  // show on startup

  const [loading,     setLoading]     = useState(true);
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
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderDate,     setOrderDate]     = useState(todayStr());
  const [buildNotes,    setBuildNotes]    = useState("");
  const [discount,      setDiscount]      = useState(0);
  const [discountType,  setDiscountType]  = useState("%");
  const [toast,         setToast]         = useState(null);
  const [quickSell,     setQuickSell]     = useState(null); // item for quick sell modal

  useEffect(() => {
    const splashMin = new Promise(r => setTimeout(r, 1800)); // Show splash at least 1.8s

    async function loadData() {
      try {
        const [r, t, c, s, inv, sh, sl] = await Promise.all([
          dbLoad("orders").catch(() => null),
          dbLoad("templates").catch(() => null),
          dbLoad("items").catch(() => null),
          dbLoad("settings").catch(() => null),
          dbLoad("inventory").catch(() => null),
          dbLoad("shows").catch(() => null),
          dbLoad("sellers").catch(() => null),
        ]);

        const records_  = r && r.length ? r : store.get("km-builds");
        const templates_= t && t.length ? t : store.get("km-templates");
        const items_    = c && c.length ? c : store.get("km-custom");
        const settings_ = s && Object.keys(s).length ? s : store.get("km-settings");
        const inv_      = inv && Object.keys(inv).length ? inv : store.get("km-inventory");
        const shows_    = sh && sh.length ? sh : store.get("km-shows");

        if (records_)   setRecords(records_);
        if (templates_) setTemplates(templates_);
        if (items_)     setCustomItems(items_);
        if (settings_)  setSettings(prev => ({...prev, ...settings_}));
        if (inv_)       setInventory(inv_);
        else { setInventory({...INITIAL_STOCK}); dbSave("inventory", {...INITIAL_STOCK}).catch(()=>{}); }
        if (shows_ && shows_.length) setShows(shows_);
        const sellers_ = sl && sl.length ? sl : store.get("km-sellers");
        if (sellers_ && sellers_.length) setSellers(sellers_);

        // Restore active show + seller from localStorage
        const lastShow = store.get("km-activeShow");
        if (lastShow) setActiveShow(lastShow);
        const lastSeller = store.get("km-activeSeller");
        if (lastSeller) { setActiveSeller(lastSeller); setSellerPicker(false); }
      } catch (err) {
        console.warn("Init failed, using localStorage:", err);
        const r = store.get("km-builds");    if (r) setRecords(r);
        const t = store.get("km-templates"); if (t) setTemplates(t);
        const c = store.get("km-custom");    if (c) setCustomItems(c);
        const s = store.get("km-settings");  if (s) setSettings(prev => ({...prev, ...s}));
        const inv = store.get("km-inventory");
        if (inv) setInventory(inv);
        else setInventory({...INITIAL_STOCK});
        const sh = store.get("km-shows"); if (sh) setShows(sh);
        const sl2 = store.get("km-sellers"); if (sl2) setSellers(sl2);
        const lastShow = store.get("km-activeShow");
        if (lastShow) setActiveShow(lastShow);
        const lastSeller = store.get("km-activeSeller");
        if (lastSeller) { setActiveSeller(lastSeller); setSellerPicker(false); }
      }
    }

    // Wait for BOTH the minimum splash time AND data loading
    Promise.all([splashMin, loadData()]).then(() => setLoading(false));
  }, []);

  const saveSettings = s => { setSettings(s); store.set("km-settings",s); dbSave("settings",s); showToast("Settings saved"); };

  function showToast(msg, type="success") {
    setToast({msg, type});
    setTimeout(() => setToast(null), 2500);
  }

  const ALL_ITEMS = useMemo(() => {
    const overrides = new Map(customItems.filter(c=>DEFAULT_ITEMS.find(d=>d.id===c.id)).map(c=>[c.id,c]));
    const defaults = DEFAULT_ITEMS.map(d => overrides.has(d.id) ? {...d, ...overrides.get(d.id)} : d);
    const customs = customItems.filter(c=>!DEFAULT_ITEMS.find(d=>d.id===c.id));
    return [...defaults, ...customs];
  }, [customItems]);

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

  function quickSellComplete(name, phone, email) {
    const item = quickSell;
    if (!item || !name.trim()) return;
    const qty = item.unit==="per inch"?18:1;
    const lineCost = item.price * qty;
    const mk = markup;
    const retail = lineCost * mk;
    const rec = {
      id:Date.now(), date:todayStr(), showId:activeShow||null, showName:activeShowData?.name||null, sellerId:activeSeller||null, sellerName:activeSellerData?.name||null,
      buildName:item.name, customer:name.trim(),
      email:email.trim(), phone:phone.trim(),
      markup:mk, labor:0, pieces:1, discount:0, discountType:"%",
      notes:"Quick sale",
      lines:[{name:item.name,metal:item.metal,unit:item.unit,price:item.price,qty,lineCost}],
      materialCost:lineCost, totalMaterial:lineCost,
      totalLabor:0, retailBefore:retail, discountAmt:0,
      totalRetail:retail, taxAmt:0, totalWithTax:retail,
      profit:retail-lineCost, margin:retail>0?((retail-lineCost)/retail)*100:0,
      rpp:retail, paid:false,
    };
    const inv = {...inventory};
    if (inv[item.id]!==undefined) inv[item.id] = Math.max(0, inv[item.id]-qty);
    updateInventory(inv);
    const updated = [rec,...records];
    setRecords(updated); store.set("km-builds",updated); dbSave("orders",updated);
    setCheckoutRec(rec);
    setQuickSell(null);
    setTab("checkout");
    showToast(`${item.name} — ready for payment`);
  }
  function updateQty(itemId, val) {
    const q = parseFloat(val);
    if (isNaN(q)||q<=0) { setBuildItems(p=>p.filter(b=>b.itemId!==itemId)); return; }
    setBuildItems(p=>p.map(b=>b.itemId===itemId?{...b,qty:q}:b));
  }

  function saveBuild() {
    if (!buildItems.length || !customerName.trim()) return;
    const rec = {
      id:Date.now(), date:orderDate, showId:activeShow||null, showName:activeShowData?.name||null, sellerId:activeSeller||null, sellerName:activeSellerData?.name||null,
      buildName:buildName.trim()||"Custom Build",
      customer:customerName.trim(), email:customerEmail.trim(), phone:customerPhone.trim(),
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
    setRecords(updated); store.set("km-builds",updated); dbSave("orders",updated);
    setFlash("saved"); setTimeout(()=>setFlash(""),2500);
    showToast("Order saved — heading to checkout");
    setCheckoutRec(rec);
    setBuildItems([]); setCustomerName(""); setCustomerEmail(""); setCustomerPhone("");
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
    setTemplates(updated); store.set("km-templates",updated); dbSave("templates",updated);
    setTmplFlash(t.id); setTimeout(()=>setTmplFlash(""),2200);
  }

  function loadTemplate(t) {
    setBuildItems(t.items);
    setBuildName(t.name); setMarkup(t.markup??2.5); setLabor(t.labor??0);
    setDiscountType(t.discountType??"%"); setDiscount(0); setBuildNotes(t.notes??"");
    setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setOrderDate(todayStr());
    if (R.isMobile) setShowBrowser(false);
  }

  function markPaid(id) {
    const u = records.map(r=>r.id===id?{...r,paid:true}:r);
    setRecords(u); store.set("km-builds",u); dbSave("orders",u);
    // Update checkoutRec if it's the one being marked
    if (checkoutRec?.id===id) setCheckoutRec({...checkoutRec, paid:true});
    showToast("Marked as paid");
  }

  function deleteRecord(id) {
    const u = records.filter(r=>r.id!==id);
    setRecords(u); store.set("km-builds",u); dbSave("orders",u);
    if (checkoutRec?.id===id) setCheckoutRec(null);
    showToast("Order deleted", "info");
  }

  function deleteTemplate(id) {
    const u = templates.filter(t=>t.id!==id);
    setTemplates(u); store.set("km-templates",u); dbSave("templates",u);
  }

  // ── Edit / Duplicate / Undo order ───────────────────────────────────────────
  function editOrder(rec) {
    // Load the order back into the build tab for editing
    const items = rec.lines.map(l => {
      const match = ALL_ITEMS.find(i => i.name === l.name && i.metal === l.metal);
      return match ? { itemId: match.id, qty: l.qty } : null;
    }).filter(Boolean);
    setBuildItems(items);
    setBuildName(rec.buildName);
    setCustomerName(rec.customer);
    setCustomerEmail(rec.email || ""); setCustomerPhone(rec.phone || "");
    setOrderDate(rec.date);
    setMarkup(rec.markup);
    setLabor(rec.labor || 0);
    setPieces(rec.pieces);
    setDiscount(rec.discount || 0);
    setDiscountType(rec.discountType || "%");
    setBuildNotes(rec.notes || "");
    // Remove the old record so saving creates an updated one
    const u = records.filter(r => r.id !== rec.id);
    setRecords(u); store.set("km-builds", u); dbSave("orders", u);
    if (checkoutRec?.id === rec.id) setCheckoutRec(null);
    // Restore inventory that was deducted for this order
    const inv = { ...inventory };
    rec.lines.forEach(l => {
      const match = ALL_ITEMS.find(i => i.name === l.name && i.metal === l.metal);
      if (match && inv[match.id] !== undefined) {
        inv[match.id] += l.qty * (rec.pieces || 1);
      }
    });
    updateInventory(inv);
    setTab("build");
  }

  function duplicateOrder(rec) {
    setBuildItems(rec.lines.map(l => {
      const match = ALL_ITEMS.find(i => i.name === l.name && i.metal === l.metal);
      return match ? { itemId: match.id, qty: l.qty } : null;
    }).filter(Boolean));
    setBuildName(rec.buildName + " (copy)");
    setCustomerName("");
    setCustomerEmail("");
    setOrderDate(todayStr());
    setMarkup(rec.markup);
    setLabor(rec.labor || 0);
    setPieces(rec.pieces);
    setDiscount(rec.discount || 0);
    setDiscountType(rec.discountType || "%");
    setBuildNotes(rec.notes || "");
    setTab("build");
  }

  function undoLastSale() {
    if (!records.length) return;
    const last = records[0];
    if (!window.confirm(`Undo "${last.buildName}" for ${last.customer}? This will restore inventory and delete the order.`)) return;
    // Restore inventory
    const inv = { ...inventory };
    last.lines.forEach(l => {
      const match = ALL_ITEMS.find(i => i.name === l.name && i.metal === l.metal);
      if (match && inv[match.id] !== undefined) {
        inv[match.id] += l.qty * (last.pieces || 1);
      }
    });
    updateInventory(inv);
    deleteRecord(last.id);
  }

  function saveCustomItem(form, existingId=null) {
    const price = form.unit==="per foot" ? parseFloat(form.price)/12 : parseFloat(form.price);
    const unit  = form.unit==="per foot" ? "per inch" : form.unit;
    const stockQty = parseFloat(form.initialStock);
    const image = form.image || "";

    if (existingId) {
      // Check if it's a default item being edited (add photo etc.)
      const isDefault = DEFAULT_ITEMS.find(i=>i.id===existingId);
      if (isDefault && !customItems.find(i=>i.id===existingId)) {
        // Store as an override in customItems
        const override = {...isDefault, ...form, price, unit, image, id:existingId, isCustom:false};
        const u = [...customItems, override];
        setCustomItems(u); store.set("km-custom",u); dbSave("items",u);
      } else {
        const u = customItems.map(i=>i.id===existingId?{...i,...form,price,unit,image,isCustom:i.isCustom??true}:i);
        setCustomItems(u); store.set("km-custom",u); dbSave("items",u);
      }
      if (!isNaN(stockQty) && stockQty >= 0) setStock(existingId, stockQty);
    } else {
      const newItem = {...form, price, unit, image, id:uid(), isCustom:true};
      const u = [...customItems, newItem];
      setCustomItems(u); store.set("km-custom",u); dbSave("items",u);
      if (!isNaN(stockQty) && stockQty >= 0) {
        const inv = {...inventory, [newItem.id]: stockQty};
        updateInventory(inv);
      }
    }
    setItemModal(null);
    showToast(existingId ? "Item updated" : "Item added to catalog");
  }

  function deleteCustomItem(id) {
    const u = customItems.filter(i=>i.id!==id);
    setCustomItems(u); store.set("km-custom",u); dbSave("items",u);
    setBuildItems(p=>p.filter(b=>b.itemId!==id));
  }

  // ── Inventory helpers ─────────────────────────────────────────────────────
  function updateInventory(newInv) {
    setInventory(newInv); store.set("km-inventory",newInv); dbSave("inventory",newInv);
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

  // ── Show / Event management ─────────────────────────────────────────────────
  function saveShows(s) { setShows(s); store.set("km-shows",s); dbSave("shows",s); }
  function createShow(name, location, date) {
    const s = { id:Date.now(), name:name.trim(), location:location.trim(), date:date||todayStr(), createdAt:todayStr() };
    const u = [s,...shows];
    saveShows(u);
    setActiveShow(s.id); store.set("km-activeShow",s.id);
    setShowPicker(false);
    showToast(`"${s.name}" — let's sell!`);
  }
  function selectShow(id) {
    setActiveShow(id); store.set("km-activeShow",id);
    setShowPicker(false);
    const s = shows.find(sh=>sh.id===id);
    if (s) showToast(`Switched to "${s.name}"`);
  }
  function deleteShow(id) {
    if (!window.confirm("Delete this show? Orders tagged with it will keep their tag.")) return;
    saveShows(shows.filter(s=>s.id!==id));
    if (activeShow===id) { setActiveShow(null); store.set("km-activeShow",null); }
  }
  const activeShowData = shows.find(s=>s.id===activeShow);
  const activeSellerData = sellers.find(s=>s.id===activeSeller);
  const showRecords = activeShow ? records.filter(r=>r.showId===activeShow) : records;

  // ── Seller management ───────────────────────────────────────────────────────
  function saveSellers(s) { setSellers(s); store.set("km-sellers",s); dbSave("sellers",s); }
  function createSeller(name, emoji) {
    const s = { id:Date.now(), name:name.trim(), emoji:emoji||"💎" };
    const u = [s,...sellers];
    saveSellers(u);
    setActiveSeller(s.id); store.set("km-activeSeller",s.id);
    setSellerPicker(false);
    showToast(`Welcome, ${s.name}!`);
  }
  function pickSeller(id) {
    setActiveSeller(id); store.set("km-activeSeller",id);
    setSellerPicker(false);
    const s = sellers.find(x=>x.id===id);
    if (s) showToast(`Hey ${s.name}! Let's sell.`);
  }
  function deleteSeller(id) {
    if (!window.confirm("Delete this profile?")) return;
    saveSellers(sellers.filter(s=>s.id!==id));
    if (activeSeller===id) { setActiveSeller(null); store.set("km-activeSeller",null); setSellerPicker(true); }
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
  function receiptText(rec) {
    const amt = rec.totalWithTax || rec.totalRetail;
    const lines = rec.lines.map(l => `  ${l.name} (${l.metal}) x${l.qty} — $${fmt(l.lineCost)}`).join("\n");
    return `${settings.bizName}\n${rec.paid?"Receipt":"Invoice"} — ${rec.date}\n\nCustomer: ${rec.customer}\nBuild: ${rec.buildName}\n\nItems:\n${lines}\n\nSubtotal: $${fmt(rec.totalRetail)}${(rec.taxAmt||0)>0?`\nTax: $${fmt(rec.taxAmt)}`:""}${(rec.discountAmt||0)>0?`\nDiscount: -$${fmt(rec.discountAmt)}`:""}\n\n${rec.paid?"Amount Paid":"Total Due"}: $${fmt(amt)}${rec.notes?`\n\nNote: ${rec.notes}`:""}\n\nThank you for your purchase! 💜`;
  }

  function emailInvoice(rec) {
    const amt = rec.totalWithTax || rec.totalRetail;
    const subject = encodeURIComponent(`${rec.paid?"Receipt":"Invoice"}: ${rec.buildName} — ${settings.bizName}`);
    const body = encodeURIComponent(receiptText(rec));
    window.location.href = `mailto:${rec.email||""}?subject=${subject}&body=${body}`;
  }

  function textInvoice(rec) {
    const body = encodeURIComponent(receiptText(rec));
    const phone = (rec.phone||"").replace(/\D/g,"");
    window.location.href = `sms:${phone}?&body=${body}`;
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

  // ── Dashboard analytics ────────────────────────────────────────────────────
  const dashboard = useMemo(() => {
    const totalRevenue  = records.reduce((s,r) => s + r.totalRetail, 0);
    const totalProfit   = records.reduce((s,r) => s + r.profit, 0);
    const totalCOGS     = records.reduce((s,r) => s + (r.materialCost||0) * (r.pieces||1), 0);
    const totalLabor    = records.reduce((s,r) => s + (r.totalLabor||0), 0);
    const totalPieces   = records.reduce((s,r) => s + (r.pieces||1), 0);
    const totalTax      = records.reduce((s,r) => s + (r.taxAmt||0), 0);
    const totalDiscount = records.reduce((s,r) => s + (r.discountAmt||0), 0);
    const paidOrders    = records.filter(r => r.paid);
    const pendingOrders = records.filter(r => !r.paid);
    const collected     = paidOrders.reduce((s,r) => s + (r.totalWithTax||r.totalRetail), 0);
    const pending       = pendingOrders.reduce((s,r) => s + (r.totalWithTax||r.totalRetail), 0);

    // ROI based on invoice investment
    const netProfit     = totalRevenue - INVOICE_TOTAL;
    const roi           = INVOICE_TOTAL > 0 ? (netProfit / INVOICE_TOTAL) * 100 : 0;

    // Inventory value remaining (current stock * unit price)
    const invValue = ALL_ITEMS.reduce((s, item) => {
      const stock = inventory[item.id] || 0;
      return s + stock * item.price;
    }, 0);

    // Inventory consumed value
    const invConsumed = INVOICE_COST - invValue;
    const invUsedPct  = INVOICE_COST > 0 ? (invConsumed / INVOICE_COST) * 100 : 0;

    // Average order value
    const avgOrder = records.length > 0 ? totalRevenue / records.length : 0;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Top sellers
    const itemSales = {};
    records.forEach(r => {
      r.lines.forEach(l => {
        const key = l.name;
        if (!itemSales[key]) itemSales[key] = { name:l.name, metal:l.metal, revenue:0, qty:0, orders:0 };
        itemSales[key].revenue += l.lineCost * (r.markup||2.5) * (r.pieces||1);
        itemSales[key].qty += l.qty * (r.pieces||1);
        itemSales[key].orders++;
      });
    });
    const topSellers = Object.values(itemSales).sort((a,b) => b.revenue - a.revenue).slice(0, 8);

    // Daily breakdown
    const byDate = {};
    records.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { date:r.date, revenue:0, profit:0, orders:0, pieces:0 };
      byDate[r.date].revenue += r.totalRetail;
      byDate[r.date].profit += r.profit;
      byDate[r.date].orders++;
      byDate[r.date].pieces += r.pieces||1;
    });
    const dailyData = Object.values(byDate).reverse();

    // Per-show breakdown
    const showBreakdown = shows.map(s => {
      const sOrders = records.filter(r=>r.showId===s.id);
      const sRevenue = sOrders.reduce((a,r)=>a+r.totalRetail,0);
      const sProfit = sOrders.reduce((a,r)=>a+r.profit,0);
      const sPieces = sOrders.reduce((a,r)=>a+(r.pieces||1),0);
      return { ...s, orders:sOrders.length, revenue:sRevenue, profit:sProfit, pieces:sPieces };
    }).sort((a,b)=>b.revenue-a.revenue);

    // Gold/Silver price impact
    const goldRatio = metals.gold ? metals.gold / INVOICE_GOLD_OZ : 1;
    const silverRatio = metals.silver ? metals.silver / INVOICE_SILVER_OZ : 1;
    const invoiceTodayGold = INVOICE_14KGF_COST * goldRatio;
    const invoiceTodaySilver = INVOICE_925AG_COST * silverRatio;
    const invoiceToday = invoiceTodayGold + invoiceTodaySilver + INVOICE_FREIGHT;
    const metalGainLoss = invoiceToday - INVOICE_TOTAL;
    const metalPctChange = ((invoiceToday / INVOICE_TOTAL) - 1) * 100;

    // Per-seller breakdown
    const sellerBreakdown = sellers.map(s => {
      const sOrders = records.filter(r=>r.sellerId===s.id);
      const sRevenue = sOrders.reduce((a,r)=>a+r.totalRetail,0);
      const sProfit = sOrders.reduce((a,r)=>a+r.profit,0);
      const sPieces = sOrders.reduce((a,r)=>a+(r.pieces||1),0);
      const sAvg = sOrders.length>0?sRevenue/sOrders.length:0;
      return { ...s, orders:sOrders.length, revenue:sRevenue, profit:sProfit, pieces:sPieces, avg:sAvg };
    }).sort((a,b)=>b.revenue-a.revenue);

    return { totalRevenue, totalProfit, totalCOGS, totalLabor, totalPieces, totalTax, totalDiscount,
             collected, pending, paidOrders, pendingOrders, netProfit, roi,
             invValue, invConsumed, invUsedPct, avgOrder, avgMargin, topSellers, dailyData, showBreakdown, sellerBreakdown,
             goldRatio, silverRatio, invoiceToday, metalGainLoss, metalPctChange };
  }, [records, inventory, ALL_ITEMS, shows, sellers, metals.gold, metals.silver]);

  const NAV_FULL = [
    {id:"catalog",  label:"Catalog",   icon:"Grid"},
    {id:"build",    label:"Build",     icon:"Cart",   badge:buildItems.length||null},
    {id:"checkout", label:"Pay",       icon:"QR"},
    {id:"dashboard",label:"Dashboard", icon:"Sparkle"},
    {id:"records",  label:"Records",   icon:"List",   badge:records.length||null},
    {id:"settings", label:"Settings",  icon:"Gear"},
  ];
  // Mobile: 5 tabs (hide Records — accessible from Dashboard)
  const NAV = R.isMobile ? NAV_FULL.filter(n=>n.id!=="records") : NAV_FULL;

  const mainPad = R.isMobile ? "16px 14px" : "24px 24px";
  const mainPB  = R.isMobile ? "90px" : "32px";

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  if (loading) return (
    <div style={{
      minHeight:"100vh",background:"linear-gradient(145deg, #FAFAFD 0%, #F3EAFA 40%, #EDE2F6 70%, #FAFAFD 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,'Times New Roman',serif",
    }}>
      <style>{`
        @keyframes km-logoIn { 0%{opacity:0;transform:scale(0.85)} 100%{opacity:1;transform:scale(1)} }
        @keyframes km-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes km-fade { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes km-glow { 0%,100%{filter:drop-shadow(0 0 0px rgba(139,47,201,0))} 50%{filter:drop-shadow(0 0 24px rgba(139,47,201,0.18))} }
      `}</style>
      <div style={{animation:"km-logoIn 0.8s cubic-bezier(0.4,0,0.2,1) both, km-glow 2.5s ease-in-out 0.8s infinite",marginBottom:28}}>
        <img src="/IMG_7676.jpeg" alt="Kira-Michael-Gems" style={{width:240,height:"auto"}}/>
      </div>
      <div style={{
        fontSize:13,color:T.dim,letterSpacing:3,textTransform:"uppercase",marginBottom:36,
        animation:"km-fade 0.7s ease-out 0.4s both",
      }}>
        Build &middot; Price &middot; Sell
      </div>
      <div style={{
        width:200,height:2,borderRadius:2,overflow:"hidden",
        background:T.border,
        animation:"km-fade 0.7s ease-out 0.6s both",
      }}>
        <div style={{
          width:"100%",height:"100%",borderRadius:2,
          background:"linear-gradient(90deg, transparent 10%, #B88FD9 40%, #8B2FC9 50%, #B88FD9 60%, transparent 90%)",
          backgroundSize:"200% 100%",
          animation:"km-shimmer 1.4s ease-in-out infinite",
        }}/>
      </div>
      <div style={{
        fontSize:12,color:T.dim,marginTop:18,letterSpacing:0.5,
        animation:"km-fade 0.7s ease-out 0.75s both",
      }}>
        Loading catalog & inventory...
      </div>
    </div>
  );

  // ── Seller picker (shows before main app) ──────────────────────────────────
  if (sellerPicker && !activeSeller) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(145deg, #FAFAFD 0%, #F3EAFA 40%, #EDE2F6 70%, #FAFAFD 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,'Times New Roman',serif",padding:24,
    }}>
      <img src="/IMG_7676.jpeg" alt="KM" style={{height:80,marginBottom:24}}/>
      <div style={{fontSize:24,fontWeight:700,color:T.text,marginBottom:4}}>Who's selling today?</div>
      <p style={{fontSize:14,color:T.dim,marginBottom:28}}>Pick your profile to track your sales</p>

      <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:10}}>
        {sellers.map(s=>(
          <button key={s.id} onClick={()=>pickSeller(s.id)} className="km-btn-press" style={{
            ...cardSt({padding:"18px 20px"}),width:"100%",cursor:"pointer",
            display:"flex",alignItems:"center",gap:14,border:`1.5px solid ${T.border}`,
            textAlign:"left",background:"#fff",
          }}>
            <div style={{width:46,height:46,borderRadius:"50%",background:T.goldGradient,color:"#fff",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
              {s.emoji||s.name.charAt(0)}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:T.text}}>{s.name}</div>
              <div style={{fontSize:12,color:T.dim}}>
                {records.filter(r=>r.sellerId===s.id).length} total sales
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Create new profile */}
      <div style={{width:"100%",maxWidth:400,marginTop:20,padding:"20px",borderRadius:16,background:"#fff",border:`1px solid ${T.border}`,boxShadow:T.shadow}}>
        <div style={{fontSize:14,fontWeight:700,color:T.sub,marginBottom:10}}>New Profile</div>
        <div style={{display:"flex",gap:8}}>
          <select id="sp-emoji" style={{...inputSt({width:60,padding:"10px 8px",fontSize:20,textAlign:"center"})}}>
            {["💎","👑","✨","🌟","💜","🔮","💫","🦋","🌸","🎨"].map(e=><option key={e} value={e}>{e}</option>)}
          </select>
          <input id="sp-name" placeholder="Your name" style={{...inputSt({flex:1,fontSize:16})}}/>
          <button className="km-btn-press" onClick={()=>{
            const n=document.getElementById("sp-name")?.value;
            const e=document.getElementById("sp-emoji")?.value;
            if(n?.trim()) createSeller(n,e);
          }} style={{...btnPrimary({padding:"10px 20px",fontSize:15,flexShrink:0})}}>
            Go
          </button>
        </div>
      </div>

      {sellers.length>0 && (
        <button onClick={()=>setSellerPicker(false)} style={{
          background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:13,
          marginTop:16,fontFamily:"Georgia,serif",padding:8,
        }}>
          Skip for now
        </button>
      )}
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"Georgia,'Times New Roman',serif",color:T.text,fontSize:15}}>

      {/* HEADER */}
      <header style={{
        background:T.headerGradient, borderBottom:`1px solid ${T.border}`,
        boxShadow:"0 1px 3px rgba(100,80,40,0.04), 0 4px 16px rgba(100,80,40,0.06)",
        padding: R.isMobile ? "14px 16px" : "16px 28px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
        backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/IMG_7676.jpeg" alt="KM" style={{height:R.isMobile?40:46,width:"auto",objectFit:"contain"}}/>
          <div>
            <div style={{fontSize:R.isMobile?14:16,fontWeight:700,color:T.text,letterSpacing:0.3}}>Kira-Michael Gems</div>
            <button onClick={()=>setShowPicker(true)} style={{
              background:"none",border:"none",cursor:"pointer",padding:0,
              fontSize:12,color:activeShowData?T.accent:T.dim,fontWeight:600,fontFamily:"Georgia,serif",
              display:"flex",alignItems:"center",gap:4,marginTop:1,
            }}>
              {activeShowData ? <><span style={{width:6,height:6,borderRadius:"50%",background:T.green,flexShrink:0}}/>{activeShowData.name}</> : "No show selected — tap to pick"}
              <Icon name="ChevronDown" size={12}/>
            </button>
          </div>
          {activeSellerData && (
            <button onClick={()=>{setActiveSeller(null);store.set("km-activeSeller",null);setSellerPicker(true);}} style={{
              background:T.accentLight,border:`1px solid ${T.accent}30`,borderRadius:20,
              padding:"4px 12px 4px 6px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
              fontSize:12,fontWeight:600,color:T.accent,fontFamily:"Georgia,serif",marginLeft:R.isMobile?0:8,
            }}>
              <span style={{fontSize:16}}>{activeSellerData.emoji}</span>
              {activeSellerData.name}
            </button>
          )}
          {isOnline() && !R.isMobile && <span style={{fontSize:10,color:T.green,marginLeft:4}}>&#9679; Synced</span>}
        </div>
        {!R.isMobile && (
          <nav style={{display:"flex",gap:4,background:T.bg,borderRadius:12,padding:4,border:`1px solid ${T.border}`}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>setTab(n.id)} className="km-btn-press" style={{
                background:tab===n.id?T.card:"transparent",
                color:tab===n.id?T.gold:T.dim,
                border:"none",
                borderRadius:9,padding:"9px 16px",
                cursor:"pointer",fontSize:14,fontFamily:"Georgia,serif",
                display:"flex",alignItems:"center",gap:7,
                position:"relative",
                fontWeight:tab===n.id?600:400,
                boxShadow:tab===n.id?T.shadow:"none",
                transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
              }}>
                <Icon name={n.icon} size={16}/>
                {n.label}
                {n.badge>0 && <span style={{position:"absolute",top:-4,right:-4,background:n.id==="records"?T.green:T.goldGradient,color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}>{n.badge}</span>}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:mainPad,paddingBottom:mainPB,animation:"km-tabEnter 0.35s ease-out"}}>

        {/* ══════════════ CATALOG TAB ══════════════ */}
        {tab==="catalog" && (<div key={tab} className="km-tab-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
            <div>
              <h2 style={{margin:0,fontSize:R.isMobile?21:26,fontWeight:700,letterSpacing:0.3}}>Item Catalog</h2>
              <p style={{margin:"4px 0 0",color:T.sub,fontSize:14}}>{catalogItems.length} of {ALL_ITEMS.length} items</p>
            </div>
            <button onClick={()=>setItemModal("new")} className="km-btn-press" style={{...btnPrimary({padding:"10px 20px",fontSize:14}),display:"flex",alignItems:"center",gap:8}}>
              <Icon name="Plus" size={16}/> Add Item
            </button>
          </div>
          {/* Low stock alerts — compact banner */}
          {(()=>{
            const lowItems = ALL_ITEMS.filter(i=>isLowStock(i.id));
            const outItems = lowItems.filter(i=>getStock(i.id)<=0);
            const warnItems = lowItems.filter(i=>getStock(i.id)>0);
            if (lowItems.length===0) return null;
            return (
              <div style={{padding:"10px 16px",marginBottom:12,borderRadius:10,fontSize:13,
                background:outItems.length>0?T.redBg:T.accentLight,
                color:outItems.length>0?T.red:T.accent,
                border:`1px solid ${outItems.length>0?T.red+"25":T.accent+"25"}`,
                display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
              }}>
                <span style={{fontWeight:700}}>
                  {outItems.length>0 && `${outItems.length} out`}
                  {outItems.length>0 && warnItems.length>0 && " · "}
                  {warnItems.length>0 && `${warnItems.length} low`}
                </span>
                <span style={{color:outItems.length>0?T.red+"99":T.accent+"99"}}>
                  {lowItems.slice(0,5).map(i=>i.name.replace(/\(.*\)/,"").trim()).join(", ")}
                  {lowItems.length>5 && ` +${lowItems.length-5} more`}
                </span>
              </div>
            );
          })()}

          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items..." style={{...inputSt(),flex:"1 1 180px",fontSize:15}}/>
            <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} className="km-btn-press" style={{...btnGhost(false),padding:"10px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
              <span style={{display:"inline-flex",transition:"transform 0.2s",transform:sortDir==="asc"?"rotate(0deg)":"rotate(180deg)"}}><Icon name="ChevronDown" size={14}/></span>{sortDir==="asc"?"Price: Low to High":"Price: High to Low"}
            </button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:18,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>setCatFilter(c)} className="km-btn-press" style={{
                ...btnGhost(catFilter===c),
                padding:"7px 14px",fontSize:13,whiteSpace:"nowrap",flexShrink:0,
              }}>{c}{c!=="All" && <span style={{...tagSt(T.dim,"#EDEBF0"),marginLeft:6,fontSize:10,padding:"2px 7px"}}>{ALL_ITEMS.filter(i=>i.cat===c).length}</span>}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${R.isMobile?"160px":"260px"},1fr))`,gap:12}}>
            {catalogItems.map(item=>(
              <div key={item.id} className="km-card-hover km-grid-item" style={{...cardSt({padding:"16px 18px"}),position:"relative",cursor:"default"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderAcc+"60";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>
                <div style={{position:"absolute",top:12,right:12,display:"flex",gap:3}}>
                  <button onClick={()=>setItemModal(item)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer",color:T.dim,padding:4,display:"flex",alignItems:"center",transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.color=T.accent;e.currentTarget.style.borderColor=T.borderAcc;}}
                    onMouseLeave={e=>{e.currentTarget.style.color=T.dim;e.currentTarget.style.borderColor=T.border;}}><Icon name="Edit" size={14}/></button>
                  {item.isCustom && <button onClick={()=>deleteCustomItem(item.id)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer",color:T.dim,padding:4,display:"flex",alignItems:"center",transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red+"60";}}
                    onMouseLeave={e=>{e.currentTarget.style.color=T.dim;e.currentTarget.style.borderColor=T.border;}}><Icon name="Trash" size={14}/></button>}
                </div>
                {item.image && <img src={item.image} alt="" style={{width:"100%",height:120,objectFit:"cover",borderRadius:10,marginBottom:10,border:`1px solid ${T.border}`}}/>}
                <div style={{fontSize:14,color:T.text,lineHeight:1.45,marginBottom:8,paddingRight:item.isCustom?48:0,fontWeight:600}}>{item.name}</div>
                <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
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
                    <div style={{fontSize:11,fontWeight:600,marginBottom:10,padding:"5px 10px",borderRadius:8,
                      background:out?T.redBg:low?T.accentLight:T.greenBg,
                      color:out?T.red:low?T.accent:T.green,
                      border:`1px solid ${out?T.red+"20":low?"#B8860B20":T.green+"20"}`,
                      display:"flex",alignItems:"center",gap:4,
                    }}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:out?T.red:low?T.accent:T.green,flexShrink:0}}/>
                      {out ? "Out of stock" : `${item.unit==="each"?stock:fmt(stock,1)}${unitLabel} in stock`}
                      {low && !out && " — Low"}
                    </div>
                  );
                })()}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
                  <div>
                    <span style={{fontSize:R.isMobile?17:19,fontWeight:700,color:T.gold}}>${fmt(item.price,4)}</span>
                    <span style={{fontSize:11,color:T.dim,marginLeft:4}}>{item.unit}</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {item.unit==="each" && getStock(item.id)>0 && (
                      <button onClick={()=>setQuickSell(item)} className="km-btn-press" style={{
                        ...btnPrimary({padding:"7px 12px",fontSize:12,borderRadius:8}),
                        display:"flex",alignItems:"center",gap:4,
                      }}>
                        <Icon name="Tag" size={12}/>Sell
                      </button>
                    )}
                    <button onClick={()=>{addToBuild(item.id);setTab("build");}} className="km-btn-press" style={{
                      background:getStock(item.id)<=0?"#EDEBF0":T.accentLight,
                      color:getStock(item.id)<=0?T.dim:T.accent,
                      border:`1.5px solid ${getStock(item.id)<=0?T.border:T.borderAcc+"60"}`,
                      borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:600,
                      display:"flex",alignItems:"center",gap:4,
                    }}>
                      <Icon name="Plus" size={12}/> Build
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>)}

        {/* ══════════════ BUILD TAB ══════════════ */}
        {tab==="build" && (<div key={tab} className="km-tab-panel">
          <div style={{marginBottom:18}}>
            <h2 style={{margin:"0 0 3px",fontSize:R.isMobile?21:26,fontWeight:700,letterSpacing:0.3}}>New Order</h2>
            {/* Step indicator */}
            <div style={{display:"flex",gap:4,marginTop:10}}>
              {[
                {n:1, label:"Add Items",    done:buildItems.length>0},
                {n:2, label:"Customer",     done:customerName.trim().length>0},
                {n:3, label:"Price & Save", done:false},
              ].map(s=>(
                <div key={s.n} style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:8,
                  background:s.done?T.greenBg:T.bg,border:`1px solid ${s.done?T.green+"30":T.border}`,transition:"all 0.3s ease"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",fontSize:11,fontWeight:700,
                    background:s.done?T.green:T.border,color:s.done?"#fff":T.dim,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.3s ease"}}>
                    {s.done?"✓":s.n}
                  </div>
                  <span style={{fontSize:12,fontWeight:600,color:s.done?T.green:T.dim}}>{s.label}</span>
                </div>
              ))}
            </div>
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
                      <div style={{fontSize:11,color:T.dim,marginTop:1}}>{item.metal} &middot; {item.cat} &middot; <span style={{color:isLowStock(item.id)?getStock(item.id)<=0?T.red:T.accent:T.green,fontWeight:600}}>{item.unit==="each"?getStock(item.id):fmt(getStock(item.id),1)}{item.unit==="per inch"?'"':item.unit==="per gram"?"g":""}</span></div>
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
                  <div><label style={labelSt}>Phone (optional)</label><input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="(239) 555-0123" style={inputSt()}/></div>
                  <div><label style={labelSt}>Email (optional)</label><input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="email@example.com" style={inputSt()}/></div>
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
                      <div><label style={labelSt}>Pieces</label><input type="number" min="0" value={pieces} onChange={e=>setPieces(e.target.value===""?"":parseInt(e.target.value))} onBlur={()=>{if(pieces===""||isNaN(pieces)||pieces<1)setPieces(1);}} style={inputSt()}/></div>
                      <div><label style={labelSt}>Labor / Piece ($)</label><input type="number" min="0" step="0.5" value={labor} onChange={e=>setLabor(e.target.value===""?"":parseFloat(e.target.value))} onBlur={()=>{if(labor===""||isNaN(labor))setLabor(0);}} style={inputSt()}/></div>
                    </div>
                    <div>
                      <label style={labelSt}>Markup</label>
                      <div style={{display:"flex",gap:6,marginBottom:7}}>
                        {[2,2.5,3,4].map(m=>(<button key={m} onClick={()=>setMarkup(m)} style={{...btnGhost(markup===m),flex:1,padding:"8px 0",fontSize:13}}>{m}x</button>))}
                      </div>
                      <input type="number" step="0.1" min="0" value={markup} onChange={e=>setMarkup(e.target.value===""?"":parseFloat(e.target.value))} onBlur={()=>{if(markup===""||isNaN(markup)||markup<1)setMarkup(2.5);}} style={inputSt()}/>
                    </div>
                    <div>
                      <label style={labelSt}>Discount (optional)</label>
                      <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}`,marginBottom:7}}>
                        {["%","$"].map(t=>(<button key={t} onClick={()=>setDiscountType(t)} style={{flex:1,padding:"11px",border:"none",cursor:"pointer",fontSize:15,fontWeight:700,background:discountType===t?T.gold:"#F5F0EA",color:discountType===t?"#fff":T.sub,transition:"all 0.13s"}}>{t}</button>))}
                      </div>
                      <input type="number" min="0" step={discountType==="%"?1:0.5} max={discountType==="%"?100:undefined}
                        value={discount===""?"":discount} placeholder="0" onChange={e=>setDiscount(e.target.value===""?"":parseFloat(e.target.value))} onBlur={()=>{if(discount===""||isNaN(discount))setDiscount(0);}} style={inputSt()}/>
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
                    <button onClick={saveBuild} disabled={!customerName.trim()||buildItems.length===0} className="km-btn-press" style={{
                      ...btnPrimary({width:"100%",marginTop:18,padding:"15px",fontSize:16}),
                      background:flash==="saved"?T.green:customerName.trim()&&buildItems.length?T.goldGradient:"#C8BBA8",
                      cursor:customerName.trim()&&buildItems.length?"pointer":"default",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      boxShadow:flash==="saved"?`0 2px 12px rgba(45,125,79,0.3)`:customerName.trim()&&buildItems.length?T.shadowGold:"none",
                    }}>
                      {flash==="saved" ? <><Icon name="Check" size={18}/>Saved! Going to Checkout...</> : "Save Order and Checkout"}
                    </button>
                    {!customerName.trim() && <p style={{textAlign:"center",fontSize:13,color:T.red,marginTop:8}}>Enter a customer name to save</p>}
                  </>)}
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ══════════════ CHECKOUT TAB ══════════════ */}
        {tab==="checkout" && (<div key={tab} className="km-tab-panel">
          <div style={{marginBottom:18}}>
            <h2 style={{margin:"0 0 3px",fontSize:R.isMobile?21:26,fontWeight:700,letterSpacing:0.3}}>Checkout</h2>
            <p style={{margin:0,color:T.sub,fontSize:14}}>Collect payment from your customer</p>
          </div>

          {!displayRec ? (
            <div style={{...cardSt({padding:"48px 24px"}),textAlign:"center"}}>
              <Icon name="QR" size={48} color={T.border}/>
              <p style={{fontSize:18,fontWeight:700,color:T.text,marginTop:16}}>Ready to collect payment?</p>
              <p style={{color:T.sub,fontSize:14,marginTop:4}}>Build an order first, or quick-sell from the catalog</p>
              <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:16,flexWrap:"wrap"}}>
                <button onClick={()=>setTab("catalog")} className="km-btn-press" style={btnPrimary({padding:"12px 24px",fontSize:15})}>
                  <Icon name="Tag" size={16} color="#fff"/> Quick Sell
                </button>
                <button onClick={()=>setTab("build")} className="km-btn-press" style={btnGhost(false,{padding:"12px 24px",fontSize:15})}>
                  Build Custom Order
                </button>
              </div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":R.isTablet?"1fr":"1fr 360px",gap:16,alignItems:"start"}}>

              {/* ── Beautiful Invoice ── */}
              <div style={{...cardSt({padding:0,borderRadius:20,overflow:"hidden"})}}>
                {/* Invoice header band */}
                <div style={{background:T.goldGradient,padding:"20px 24px",color:"#fff"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",opacity:0.8,marginBottom:4}}>{displayRec.paid?"Receipt":"Invoice"}</div>
                      <div style={{fontSize:R.isMobile?18:22,fontWeight:700,letterSpacing:0.3}}>{displayRec.buildName}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:12,opacity:0.8}}>{displayRec.date}</div>
                      <div style={{fontSize:10,marginTop:2,padding:"3px 10px",borderRadius:20,background:displayRec.paid?"rgba(255,255,255,0.25)":"rgba(0,0,0,0.15)",fontWeight:700}}>
                        {displayRec.paid?"PAID":"UNPAID"}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Customer info */}
                <div style={{padding:"16px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:11,color:T.dim,textTransform:"uppercase",letterSpacing:0.5}}>Customer</div>
                    <div style={{fontSize:16,fontWeight:600,color:T.text,marginTop:2}}>{displayRec.customer}</div>
                  </div>
                  <div style={{textAlign:"right",fontSize:13,color:T.dim}}>
                    {displayRec.phone && <div>{displayRec.phone}</div>}
                    {displayRec.email && <div>{displayRec.email}</div>}
                  </div>
                </div>
                {/* Line items */}
                <div style={{padding:"0 24px"}}>
                  {displayRec.lines.map((l,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:i<displayRec.lines.length-1?`1px solid ${T.border}`:"none"}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:T.text}}>{l.name}</div>
                        <div style={{fontSize:12,color:T.dim,marginTop:1}}>{l.metal} &middot; {l.qty} {l.unit} @ ${fmt(l.price,4)}</div>
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:T.text,flexShrink:0,marginLeft:12}}>${fmt(l.lineCost)}</div>
                    </div>
                  ))}
                </div>
                {/* Totals */}
                <div style={{padding:"16px 24px",borderTop:`1px solid ${T.border}`,background:T.bg}}>
                  {[
                    (displayRec.pieces||1)>1 && [`${displayRec.pieces} pieces &times; ${displayRec.markup}x markup`, null],
                    (displayRec.totalLabor||0)>0 && ["Labor", `$${fmt(displayRec.totalLabor)}`],
                    (displayRec.discountAmt||0)>0 && ["Discount", `-$${fmt(displayRec.discountAmt)}`, T.red],
                    (displayRec.taxAmt||0)>0 && ["Tax", `+$${fmt(displayRec.taxAmt)}`],
                  ].filter(Boolean).map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13,color:c||T.sub}}>
                      <span>{l}</span>{v && <span style={{fontWeight:600}}>{v}</span>}
                    </div>
                  ))}
                </div>
                {/* Total due — big */}
                <div style={{padding:"20px 24px",background:T.goldGradientLight,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:16,fontWeight:700,color:T.text}}>{displayRec.paid?"Amount Paid":"Total Due"}</span>
                  <span style={{fontSize:28,fontWeight:700,color:T.accent}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)}</span>
                </div>
                {displayRec.notes && (
                  <div style={{padding:"12px 24px",fontSize:13,color:T.sub,fontStyle:"italic",borderTop:`1px solid ${T.border}`}}>
                    {displayRec.notes}
                  </div>
                )}
              </div>

              {/* ── Payment / Receipt Panel ── */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* If NOT paid — show payment options */}
                {!displayRec.paid && (
                  <div style={cardSt({padding:"22px",borderRadius:18})}>
                    <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>Collect Payment</div>

                    {!settings.paypal && !settings.venmo && !settings.cashapp ? (
                      <div style={{background:T.accentLight,border:`1px solid ${T.borderAcc}40`,borderRadius:10,padding:"14px"}}>
                        <p style={{margin:"0 0 10px",fontSize:14,color:T.sub}}>Add payment handles in Settings to enable QR codes.</p>
                        <button onClick={()=>setTab("settings")} className="km-btn-press" style={btnPrimary({padding:"9px 18px",fontSize:14})}>Go to Settings</button>
                      </div>
                    ) : (<>
                      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                        {PAY_METHODS.map(m=>(
                          <button key={m.key} onClick={()=>setQrMethod(qrMethod===m.key?null:m.key)} className="km-btn-press" style={{
                            flex:1, minWidth:80, padding:"11px 6px",
                            background:qrMethod===m.key?m.bg:T.bg,
                            color:qrMethod===m.key?"#fff":T.sub,
                            border:`2px solid ${qrMethod===m.key?m.bg:T.border}`,
                            borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,
                            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                            transition:"all 0.2s cubic-bezier(0.22,1,0.36,1)",
                          }}>
                            <Icon name={m.icon} size={16} color={qrMethod===m.key?"#fff":T.sub}/>{m.label}
                          </button>
                        ))}
                      </div>

                      {qrMethod && PAY_METHODS.filter(m=>m.key===qrMethod&&m.link).map(m=>(
                        <div key={m.key} style={{textAlign:"center",animation:"km-scaleIn 0.3s cubic-bezier(0.22,1,0.36,1)"}}>
                          <div style={{background:"#fff",borderRadius:20,padding:"24px 20px 18px",display:"inline-block",boxShadow:T.shadowLg,border:`1px solid ${T.border}`,marginBottom:14}}>
                            <img src="/IMG_7676.jpeg" alt="KM" style={{height:36,marginBottom:12}}/>
                            <div style={{border:`3px solid ${m.bg}`,borderRadius:14,padding:12,display:"inline-block",background:"#fff"}}>
                              <QRBox url={m.link} size={R.isMobile?180:200}/>
                            </div>
                            <div style={{marginTop:12,fontSize:22,fontWeight:700,color:T.text}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)}</div>
                            <div style={{fontSize:13,fontWeight:600,color:m.bg,marginTop:2}}>{m.label}</div>
                            <div style={{fontSize:12,color:T.dim,marginTop:4}}>{displayRec.buildName} &middot; {displayRec.customer}</div>
                          </div>
                          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                            <button onClick={()=>setQrFull(true)} className="km-btn-press" style={{...btnPrimary({padding:"10px 18px",fontSize:14,background:m.bg,display:"flex",alignItems:"center",gap:7})}}>
                              <Icon name="Expand" size={16}/>Full Screen
                            </button>
                            <a href={m.link} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                              <button className="km-btn-press" style={btnGhost(false,{padding:"10px 18px",fontSize:14})}>Open Link</button>
                            </a>
                          </div>
                          <p style={{fontSize:12,color:T.dim,marginTop:10}}>Hand your phone to the customer to scan</p>
                        </div>
                      ))}
                    </>)}

                    <div className="km-divider-shimmer" style={{margin:"16px 0"}}/>

                    <button onClick={()=>markPaid(displayRec.id)} className="km-btn-press" style={{
                      ...btnPrimary({width:"100%",padding:"14px",fontSize:15,background:`linear-gradient(135deg, ${T.green}, #4CAF50)`,boxShadow:"0 2px 8px rgba(45,125,79,0.2)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
                    }}>
                      <Icon name="Check" size={18}/>Mark as Paid
                    </button>
                    <button onClick={()=>{ if(window.confirm("Mark as paid by cash?")) markPaid(displayRec.id); }} className="km-btn-press"
                      style={{...btnGhost(false,{width:"100%",marginTop:8,padding:"11px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}}>
                      <Icon name="Cash" size={16}/>Cash Payment
                    </button>
                  </div>
                )}

                {/* If PAID — show receipt actions */}
                {displayRec.paid && (
                  <div style={cardSt({padding:"22px",borderRadius:18})}>
                    <div style={{textAlign:"center",padding:"12px 0 16px"}}>
                      <div style={{width:48,height:48,borderRadius:"50%",background:T.greenBg,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
                        <Icon name="Check" size={24} color={T.green}/>
                      </div>
                      <div style={{fontSize:18,fontWeight:700,color:T.green}}>Payment Received</div>
                      <div style={{fontSize:14,color:T.sub,marginTop:2}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)} collected</div>
                    </div>

                    <div className="km-divider-shimmer" style={{margin:"12px 0"}}/>

                    <div style={{fontSize:13,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Send Receipt</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {displayRec.phone && (
                        <button onClick={()=>textInvoice(displayRec)} className="km-btn-press" style={{
                          ...btnPrimary({width:"100%",padding:"13px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
                        }}>
                          <Icon name="Cash" size={16}/>Text Receipt to {displayRec.phone}
                        </button>
                      )}
                      {displayRec.email && (
                        <button onClick={()=>emailInvoice(displayRec)} className="km-btn-press" style={{
                          ...btnGhost(false,{width:"100%",padding:"13px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
                        }}>
                          <Icon name="Save" size={16}/>Email Receipt to {displayRec.email}
                        </button>
                      )}
                      {!displayRec.phone && !displayRec.email && (
                        <p style={{fontSize:13,color:T.dim,textAlign:"center",padding:"8px 0"}}>No phone or email on file for this customer</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Edit / Duplicate / Delete — always visible */}
                <div style={cardSt({padding:"16px",borderRadius:14})}>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>editOrder(displayRec)} className="km-btn-press" style={{...btnGhost(false,{flex:1,padding:"11px",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6})}}>
                      <Icon name="Edit" size={14}/>Edit
                    </button>
                    <button onClick={()=>duplicateOrder(displayRec)} className="km-btn-press" style={{...btnGhost(false,{flex:1,padding:"11px",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6})}}>
                      <Icon name="Plus" size={14}/>Duplicate
                    </button>
                    <button onClick={()=>{if(window.confirm(`Delete "${displayRec.buildName}"?`))deleteRecord(displayRec.id);}} className="km-btn-press" style={{...btnGhost(false,{flex:1,padding:"11px",fontSize:13,borderColor:T.red+"40",color:T.red,display:"flex",alignItems:"center",justifyContent:"center",gap:6})}}>
                      <Icon name="Trash" size={14}/>Delete
                    </button>
                  </div>
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
                          <span style={tagSt(r.paid?T.green:T.dim,r.paid?T.greenBg:"#EDEBF0")}>{r.paid?"Paid":"Pending"}</span>
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
                <div key={m.key} style={{background:"#fff",borderRadius:24,padding:"32px 28px 28px",textAlign:"center",maxWidth:400,width:"100%",boxShadow:`0 0 80px ${m.bg}40, 0 0 200px rgba(139,47,201,0.1)`}}
                  onClick={e=>e.stopPropagation()}>
                  <img src="/IMG_7676.jpeg" alt="Kira-Michael-Gems" style={{height:48,marginBottom:16}}/>
                  <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:2}}>{displayRec.buildName}</div>
                  <div style={{fontSize:15,color:T.sub,marginBottom:20}}>{displayRec.customer}</div>
                  <div style={{border:`3px solid ${m.bg}`,borderRadius:16,padding:12,display:"inline-block",marginBottom:16,background:"#fff"}}>
                    <QRBox url={m.link} size={Math.min(260,window.innerWidth-120)}/>
                  </div>
                  <div style={{fontSize:36,fontWeight:700,color:T.text,marginBottom:4}}>${fmt(displayRec.totalWithTax||displayRec.totalRetail)}</div>
                  <div style={{fontSize:15,color:m.bg,fontWeight:600,marginBottom:20,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <Icon name={m.icon} size={18} color={m.bg}/>Scan to pay with {m.label}
                  </div>
                  <button onClick={()=>setQrFull(false)} className="km-btn-press" style={btnGhost(false,{width:"100%",padding:"12px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}>
                    <Icon name="X" size={16}/>Close
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {tab==="dashboard" && (<div key={tab} className="km-tab-panel">
          <div style={{marginBottom:16}}>
            <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>Dashboard</h2>
            <p style={{margin:0,color:T.sub,fontSize:14}}>Real-time P&L from Invoice PI26-04970 &middot; Investment: ${fmt(INVOICE_TOTAL)}</p>
          </div>

          {/* ROI Hero Card */}
          <div style={{...cardSt({padding:"24px",marginBottom:16,border:`2px solid ${dashboard.netProfit>=0?T.green+"40":T.red+"40"}`,background:dashboard.netProfit>=0?"linear-gradient(135deg, #FFFFFF 0%, #EAF6EF 100%)":"linear-gradient(135deg, #FFFFFF 0%, #FDECEA 100%)"})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Net Profit (Revenue − Investment)</div>
                <div style={{fontSize:R.isMobile?28:36,fontWeight:700,color:dashboard.netProfit>=0?T.green:T.red}}>
                  {dashboard.netProfit>=0?"+":""}${fmt(dashboard.netProfit)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>ROI</div>
                <div style={{fontSize:R.isMobile?24:32,fontWeight:700,color:dashboard.roi>=0?T.green:T.red}}>
                  {dashboard.roi>=0?"+":""}{fmt(dashboard.roi,1)}%
                </div>
              </div>
            </div>
            {/* Progress bar: revenue vs investment */}
            <div style={{marginTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.sub,marginBottom:4}}>
                <span>Revenue: ${fmt(dashboard.totalRevenue)}</span>
                <span>Goal: ${fmt(INVOICE_TOTAL)} (break even)</span>
              </div>
              <div style={{height:8,background:T.border,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,transition:"width 0.5s ease",
                  width:`${Math.min(100,(dashboard.totalRevenue/INVOICE_TOTAL)*100)}%`,
                  background:dashboard.totalRevenue>=INVOICE_TOTAL?`linear-gradient(90deg, ${T.green}, #4CAF50)`:`linear-gradient(90deg, ${T.accent}, ${T.accentMid})`,
                }}/>
              </div>
            </div>
          </div>

          {/* Live Metal Prices */}
          <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:16}}>
            {/* Gold price card */}
            <div style={{...cardSt({padding:"18px 20px",border:`1.5px solid ${metals.gold?dashboard.metalGainLoss>=0?T.green+"40":T.red+"40":T.border}`})}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:0.5}}>Gold Spot</div>
                  <div style={{fontSize:26,fontWeight:700,color:T.text,marginTop:2}}>
                    {metals.gold ? `$${fmt(metals.gold)}` : metals.loading ? "Loading..." : "—"}
                  </div>
                  <div style={{fontSize:12,color:T.dim}}>per troy oz</div>
                </div>
                {metals.silver && (
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:0.5}}>Silver</div>
                    <div style={{fontSize:18,fontWeight:700,color:T.text,marginTop:2}}>${fmt(metals.silver)}</div>
                    <div style={{fontSize:12,color:T.dim}}>per oz</div>
                  </div>
                )}
              </div>
              {metals.gold && (
                <div style={{padding:"12px 14px",borderRadius:10,
                  background:dashboard.metalGainLoss>=0?T.greenBg:T.redBg,
                  border:`1px solid ${dashboard.metalGainLoss>=0?T.green+"20":T.red+"20"}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:dashboard.metalGainLoss>=0?T.green:T.red,marginBottom:2}}>
                    Your invoice at today's prices
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:18,fontWeight:700,color:dashboard.metalGainLoss>=0?T.green:T.red}}>
                        ${fmt(dashboard.invoiceToday)}
                      </span>
                      <span style={{fontSize:13,color:T.dim,marginLeft:6}}>
                        vs ${fmt(INVOICE_TOTAL)} paid
                      </span>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:dashboard.metalGainLoss>=0?T.green:T.red}}>
                      {dashboard.metalGainLoss>=0?"+":""}${fmt(dashboard.metalGainLoss)}
                      <div style={{fontSize:11,fontWeight:600}}>{dashboard.metalPctChange>=0?"+":""}{fmt(dashboard.metalPctChange,1)}%</div>
                    </div>
                  </div>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                <div style={{fontSize:11,color:T.dim}}>
                  Invoice gold: ${fmt(INVOICE_GOLD_OZ)}/oz &middot; Silver: ${fmt(INVOICE_SILVER_OZ)}/oz
                </div>
                <button onClick={metals.refresh} className="km-btn-press" style={{
                  background:"none",border:`1px solid ${T.border}`,borderRadius:6,
                  padding:"4px 10px",fontSize:11,color:T.dim,cursor:"pointer",fontFamily:"Georgia,serif",
                }}>
                  {metals.loading?"...":"Refresh"}
                </button>
              </div>
              {metals.error && <div style={{fontSize:11,color:T.red,marginTop:4}}>Could not fetch live price</div>}
            </div>

            {/* Price movement context */}
            <div style={cardSt({padding:"18px 20px"})}>
              <div style={{fontSize:11,fontWeight:700,color:T.dim,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>What This Means</div>
              {metals.gold ? (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    ["Gold moved", `${dashboard.metalPctChange>=0?"+":""}${fmt(dashboard.metalPctChange,1)}% since your buy`, dashboard.metalPctChange>=0?T.green:T.red],
                    ["14KGF materials", `Would cost $${fmt(INVOICE_14KGF_COST*dashboard.goldRatio)} today`, T.text],
                    ["925AG materials", `Would cost $${fmt(INVOICE_925AG_COST*dashboard.silverRatio)} today`, T.text],
                    [dashboard.metalGainLoss>=0?"Your inventory gained":"Your inventory lost",
                     `$${fmt(Math.abs(dashboard.metalGainLoss))} in material value`,
                     dashboard.metalGainLoss>=0?T.green:T.red],
                  ].map(([l,v,c])=>(
                    <div key={l}>
                      <div style={{fontSize:13,fontWeight:600,color:c}}>{l}</div>
                      <div style={{fontSize:12,color:T.dim}}>{v}</div>
                    </div>
                  ))}
                  <div style={{marginTop:4,padding:"8px 12px",borderRadius:8,background:T.bg,fontSize:12,color:T.sub}}>
                    {dashboard.metalGainLoss>=0
                      ? "Gold is up — your materials are worth more than you paid. Great time to sell."
                      : "Gold dipped — your cost basis is higher than current market. Your retail markup still covers this."}
                  </div>
                </div>
              ) : (
                <div style={{fontSize:14,color:T.dim,padding:"20px 0",textAlign:"center"}}>
                  {metals.loading ? "Fetching live metal prices..." : "Metal prices unavailable — check connection"}
                </div>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${R.isMobile?2:4},1fr)`,gap:10,marginBottom:16}}>
            {[
              ["Revenue",      `$${fmt(dashboard.totalRevenue)}`,  T.accent],
              ["Material Cost",`$${fmt(dashboard.totalCOGS)}`,     T.sub],
              ["Gross Profit", `$${fmt(dashboard.totalProfit)}`,   T.green],
              ["Avg Margin",   `${fmt(dashboard.avgMargin,1)}%`,   T.accent],
              ["Orders",       dashboard.paidOrders.length+dashboard.pendingOrders.length, T.text],
              ["Pieces Sold",  dashboard.totalPieces,              T.text],
              ["Avg Order",    `$${fmt(dashboard.avgOrder)}`,      T.accent],
              ["Labor Earned", `$${fmt(dashboard.totalLabor)}`,    T.sub],
            ].map(([l,v,c])=>(
              <div key={l} style={{...cardSt({padding:"14px 16px",textAlign:"center"})}}>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>{l}</div>
                <div style={{fontSize:R.isMobile?16:20,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Money Flow */}
          <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:16}}>
            {/* P&L Breakdown */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Profit & Loss</div>
              {[
                ["Invoice Materials",  `-$${fmt(INVOICE_COST)}`,   T.red,   false],
                ["Freight",            `-$${fmt(INVOICE_FREIGHT)}`, T.red,   false],
                ["Total Investment",   `-$${fmt(INVOICE_TOTAL)}`,  T.red,   true],
                ["divider"],
                ["Revenue (sales)",    `+$${fmt(dashboard.totalRevenue)}`, T.green, false],
                ...(dashboard.totalDiscount>0?[["Discounts Given",`-$${fmt(dashboard.totalDiscount)}`,T.red,false]]:[]),
                ...(dashboard.totalTax>0?[["Tax Collected",`+$${fmt(dashboard.totalTax)}`,T.sub,false]]:[]),
                ["divider"],
                ["Net Profit/Loss",    `${dashboard.netProfit>=0?"+":""}$${fmt(dashboard.netProfit)}`, dashboard.netProfit>=0?T.green:T.red, true],
              ].map((row,i)=>{
                if (row[0]==="divider") return <div key={i} className="km-divider-shimmer" style={{margin:"8px 0"}}/>;
                const [l,v,c,bold] = row;
                return (
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:13,color:bold?T.text:T.sub,fontWeight:bold?700:400}}>{l}</span>
                    <span style={{fontSize:bold?16:14,fontWeight:bold?700:500,color:c}}>{v}</span>
                  </div>
                );
              })}
            </div>

            {/* Collections */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Collections</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{padding:"16px",background:T.greenBg,borderRadius:12,border:`1px solid ${T.green}20`}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:0.5}}>Collected</div>
                  <div style={{fontSize:24,fontWeight:700,color:T.green}}>${fmt(dashboard.collected)}</div>
                  <div style={{fontSize:12,color:T.sub}}>{dashboard.paidOrders.length} paid order{dashboard.paidOrders.length!==1?"s":""}</div>
                </div>
                {dashboard.pending>0 && (
                  <div style={{padding:"16px",background:T.accentLight,borderRadius:12,border:"1px solid #F0D06020"}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:0.5}}>Pending</div>
                    <div style={{fontSize:24,fontWeight:700,color:T.accent}}>${fmt(dashboard.pending)}</div>
                    <div style={{fontSize:12,color:T.sub}}>{dashboard.pendingOrders.length} unpaid order{dashboard.pendingOrders.length!==1?"s":""}</div>
                  </div>
                )}
                {/* Inventory status */}
                <div style={{padding:"16px",background:T.accentLight,borderRadius:12,border:`1px solid ${T.accent}20`}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:0.5}}>Inventory Remaining</div>
                  <div style={{fontSize:24,fontWeight:700,color:T.accent}}>${fmt(dashboard.invValue)}</div>
                  <div style={{fontSize:12,color:T.sub}}>{fmt(dashboard.invUsedPct,1)}% of materials used</div>
                  <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden",marginTop:8}}>
                    <div style={{height:"100%",borderRadius:3,background:T.goldGradient,width:`${Math.min(100,dashboard.invUsedPct)}%`,transition:"width 0.5s"}}/>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Sellers */}
          {dashboard.topSellers.length>0 && (
            <div style={cardSt({padding:"20px",marginBottom:16})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Top Sellers</div>
              <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${R.isMobile?"140px":"180px"},1fr))`,gap:8}}>
                {dashboard.topSellers.map((item,i)=>(
                  <div key={item.name} style={{padding:"12px",background:i===0?T.accentLight:T.bg,borderRadius:10,border:`1px solid ${i===0?T.accent+"30":T.border}`}}>
                    <div style={{fontSize:12,fontWeight:700,color:i===0?T.accent:T.text,marginBottom:4}}>#{i+1}</div>
                    <div style={{fontSize:13,color:T.text,lineHeight:1.3,marginBottom:6}}>{item.name}</div>
                    <div style={{fontSize:11,color:T.dim}}>{item.metal} &middot; {item.orders} order{item.orders!==1?"s":""}</div>
                    <div style={{fontSize:15,fontWeight:700,color:T.accent,marginTop:4}}>${fmt(item.revenue)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Breakdown */}
          {dashboard.dailyData.length>0 && (
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Sales by Day</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${T.border}`}}>
                      {["Date","Orders","Pieces","Revenue","Profit"].map(h=>(
                        <th key={h} style={{padding:"8px",textAlign:h==="Date"?"left":"right",fontSize:12,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.dailyData.map(d=>(
                      <tr key={d.date}>
                        <td style={{padding:"10px 8px",fontSize:14,fontWeight:600,color:T.text}}>{d.date}</td>
                        <td style={{padding:"10px 8px",fontSize:14,color:T.sub,textAlign:"right"}}>{d.orders}</td>
                        <td style={{padding:"10px 8px",fontSize:14,color:T.sub,textAlign:"right"}}>{d.pieces}</td>
                        <td style={{padding:"10px 8px",fontSize:14,fontWeight:600,color:T.accent,textAlign:"right"}}>${fmt(d.revenue)}</td>
                        <td style={{padding:"10px 8px",fontSize:14,fontWeight:600,color:T.green,textAlign:"right"}}>${fmt(d.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${T.border}`}}>
                      <td style={{padding:"10px 8px",fontSize:14,fontWeight:700}}>Total</td>
                      <td style={{padding:"10px 8px",fontSize:14,fontWeight:600,textAlign:"right"}}>{records.length}</td>
                      <td style={{padding:"10px 8px",fontSize:14,fontWeight:600,textAlign:"right"}}>{dashboard.totalPieces}</td>
                      <td style={{padding:"10px 8px",fontSize:14,fontWeight:700,color:T.accent,textAlign:"right"}}>${fmt(dashboard.totalRevenue)}</td>
                      <td style={{padding:"10px 8px",fontSize:14,fontWeight:700,color:T.green,textAlign:"right"}}>${fmt(dashboard.totalProfit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {records.length===0 && (
            <div style={{...cardSt({padding:"48px 24px"}),textAlign:"center"}}>
              <Icon name="Sparkle" size={40} color={T.border}/>
              <p style={{color:T.sub,fontSize:16,marginTop:12}}>Make your first sale to see analytics</p>
              <button onClick={()=>setTab("catalog")} className="km-btn-press" style={btnPrimary({marginTop:12})}>Start Selling</button>
            </div>
          )}

          {/* Seller Leaderboard */}
          {dashboard.sellerBreakdown.length>0 && (
            <div style={cardSt({padding:"20px",marginBottom:16})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Seller Leaderboard</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {dashboard.sellerBreakdown.map((s,i)=>(
                  <div key={s.id} style={{
                    padding:"14px 16px",borderRadius:12,
                    background:i===0&&s.orders>0?T.accentLight:T.bg,
                    border:`1px solid ${i===0&&s.orders>0?T.accent+"40":T.border}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:i===0&&s.orders>0?T.goldGradient:T.border,
                        color:i===0&&s.orders>0?"#fff":T.dim,display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:16,fontWeight:700,flexShrink:0}}>
                        {s.emoji||s.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{fontSize:15,fontWeight:700,color:T.text}}>
                          {s.name}
                          {i===0&&s.orders>0&&<span style={{marginLeft:6,fontSize:11,color:T.accent}}>Top Seller</span>}
                        </div>
                        <div style={{fontSize:12,color:T.dim,marginTop:1}}>
                          {s.orders} sale{s.orders!==1?"s":""} &middot; {s.pieces} pc &middot; avg ${fmt(s.avg)}
                        </div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:700,color:T.accent}}>${fmt(s.revenue)}</div>
                      <div style={{fontSize:12,fontWeight:600,color:s.profit>=0?T.green:T.red}}>
                        ${fmt(s.profit)} profit
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show Performance */}
          {dashboard.showBreakdown.length>0 && (
            <div style={cardSt({padding:"20px",marginBottom:16})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Show Performance</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {dashboard.showBreakdown.map(s=>(
                  <div key={s.id} className="km-card-hover" onClick={()=>{selectShow(s.id);setTab("records");}} style={{
                    padding:"14px 16px",borderRadius:12,cursor:"pointer",
                    background:activeShow===s.id?T.accentLight:T.bg,
                    border:`1px solid ${activeShow===s.id?T.accent+"40":T.border}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                  }}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>{s.name}</div>
                      <div style={{fontSize:12,color:T.dim,marginTop:2}}>
                        {s.location && `${s.location} · `}{s.date} · {s.orders} sale{s.orders!==1?"s":""} · {s.pieces} pc
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:700,color:T.accent}}>${fmt(s.revenue)}</div>
                      <div style={{fontSize:12,fontWeight:600,color:s.profit>=0?T.green:T.red}}>
                        {s.profit>=0?"+":""}${fmt(s.profit)} profit
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View all orders link */}
          {records.length>0 && (
            <button onClick={()=>setTab("records")} className="km-btn-press" style={{
              ...btnGhost(false,{width:"100%",marginTop:8,padding:"14px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8}),
            }}>
              <Icon name="List" size={16}/>View All {records.length} Orders
            </button>
          )}
        </div>)}

        {/* ══════════════ RECORDS TAB ══════════════ */}
        {tab==="records" && (<div key={tab} className="km-tab-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
            <div>
              <h2 style={{margin:"0 0 3px",fontSize:R.isMobile?21:26,fontWeight:700,letterSpacing:0.3}}>Order Records</h2>
              <p style={{margin:0,color:T.sub,fontSize:14}}>{records.length} order{records.length!==1?"s":""} &middot; Saved on this device</p>
            </div>
            {records.length>0 && (
              <div style={{display:"flex",gap:8}}>
                <button onClick={undoLastSale} className="km-btn-press" style={{...btnGhost(false,{borderColor:T.red+"60",color:T.red,padding:"10px 14px",fontSize:14,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="X" size={14}/>Undo Last
                </button>
                <button onClick={exportExcel} className="km-btn-press" style={{...btnGhost(false,{borderColor:T.gold,color:T.gold,padding:"10px 18px",fontSize:14,display:"flex",alignItems:"center",gap:7})}}>
                  <Icon name="Save" size={15}/>Export Excel
                </button>
              </div>
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
            <div style={{display:"grid",gridTemplateColumns:`repeat(${R.isMobile?2:4},1fr)`,gap:12,marginBottom:18}}>
              {[
                ["Orders",    records.length,                                              T.gold],
                ["Pieces",    records.reduce((a,r)=>a+r.pieces,0),                        T.sub],
                ["Revenue",   `$${fmt(records.reduce((a,r)=>a+r.totalRetail,0))}`,        T.gold],
                ["Profit",    `$${fmt(records.reduce((a,r)=>a+r.profit,0))}`,             T.green],
              ].map(([l,v,c])=>(
                <div key={l} style={{...cardSt({padding:"16px 18px",textAlign:"center",borderTop:`2px solid ${c}30`})}}>
                  <div style={{fontSize:11,color:T.sub,marginBottom:6,letterSpacing:0.5,textTransform:"uppercase",fontWeight:600}}>{l}</div>
                  <div style={{fontSize:R.isMobile?19:24,fontWeight:700,color:c,letterSpacing:0.3}}>{v}</div>
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
                      <span style={tagSt(r.paid?T.green:T.dim,r.paid?T.greenBg:"#EDEBF0")}>{r.paid?"Paid":"Pending"}</span>
                      <button onClick={()=>{setCheckoutRec(r);setTab("checkout");}} className="km-btn-press" style={{...btnGhost(false,{padding:"7px 12px",fontSize:13,display:"flex",alignItems:"center",gap:5})}}><Icon name="QR" size={14}/>Checkout</button>
                      <button onClick={()=>editOrder(r)} className="km-btn-press" style={{...btnGhost(false,{padding:"7px 12px",fontSize:13,display:"flex",alignItems:"center",gap:5})}}><Icon name="Edit" size={14}/>Edit</button>
                      <button onClick={()=>duplicateOrder(r)} className="km-btn-press" style={{...btnGhost(false,{padding:"7px 12px",fontSize:13,display:"flex",alignItems:"center",gap:5})}}><Icon name="Plus" size={14}/>Copy</button>
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
        </div>)}

        {/* ══════════════ SETTINGS TAB ══════════════ */}
        {tab==="settings" && (<div key={tab} className="km-tab-panel">
          <div style={{marginBottom:18}}>
            <h2 style={{margin:"0 0 3px",fontSize:R.isMobile?21:26,fontWeight:700,letterSpacing:0.3}}>Settings</h2>
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
                  background:settings.taxEnabled?T.accent:"#D0C4DC",
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
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:out?T.redBg:low?T.accentLight:"transparent",borderRadius:6,border:`1px solid ${out?T.red+"20":low?"#B8860B20":T.border}`}}>
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
        </div>)}

      </main>

      {/* BOTTOM NAV - mobile only */}
      {R.isMobile && (
        <nav style={{
          position:"fixed",bottom:0,left:0,right:0,zIndex:100,
          background:"rgba(255,255,255,0.95)",borderTop:`1px solid ${T.border}`,
          display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)",
          boxShadow:"0 -1px 3px rgba(100,80,40,0.04), 0 -4px 16px rgba(100,80,40,0.06)",
          backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
        }}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", gap:2, padding:"10px 0 8px",
              background:"none", border:"none", cursor:"pointer",
              color:tab===n.id?T.gold:T.dim,
              position:"relative",
              transition:"color 0.2s ease",
            }}>
              <div style={{padding:4,borderRadius:10,background:tab===n.id?T.accentLight:"transparent",transition:"all 0.3s cubic-bezier(0.22,1,0.36,1)",transform:tab===n.id?"scale(1.1)":"scale(1)"}}>
                <Icon name={n.icon} size={20} color={tab===n.id?T.accent:T.dim}/>
              </div>
              <span style={{fontSize:10,fontWeight:tab===n.id?700:400,fontFamily:"sans-serif",letterSpacing:tab===n.id?0.3:0,transition:"all 0.2s ease"}}>{n.label}</span>
              {tab===n.id && <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:20,height:2.5,borderRadius:2,background:T.goldGradient,animation:"km-navDot 0.3s cubic-bezier(0.22,1,0.36,1)"}}/>}
              {n.badge>0 && <span style={{position:"absolute",top:5,right:"50%",transform:"translateX(13px)",background:n.id==="records"?T.green:T.goldGradient,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}>{n.badge}</span>}
            </button>
          ))}
        </nav>
      )}

      {/* Item modal */}
      {itemModal && (
        <ItemModal
          item={typeof itemModal==="object" ? itemModal : null}
          currentStock={typeof itemModal==="object" ? getStock(itemModal.id) : null}
          onSave={(form)=>saveCustomItem(form, typeof itemModal==="object" ? itemModal.id : null)}
          onCancel={()=>setItemModal(null)}
        />
      )}

      {/* Show Picker modal */}
      {showPicker && (
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"km-overlayIn 0.2s ease"}}
          onClick={()=>setShowPicker(false)}>
          <div style={{...cardSt(),width:"100%",maxWidth:480,borderBottomLeftRadius:0,borderBottomRightRadius:0,borderTopLeftRadius:20,borderTopRightRadius:20,padding:"24px 22px 36px",maxHeight:"85vh",overflowY:"auto",animation:"km-modalSlide 0.3s cubic-bezier(0.22,1,0.36,1)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,borderRadius:2,background:T.border,margin:"0 auto 16px"}}/>
            <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:4}}>Shows & Events</div>
            <p style={{fontSize:13,color:T.sub,marginBottom:16}}>Pick a show to tag your sales. See how you did at each event.</p>

            {/* New Show form */}
            <div style={{padding:"14px",background:T.bg,borderRadius:12,border:`1px solid ${T.border}`,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>New Show</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input id="new-show-name" placeholder="Show name (e.g. Cape Coral Art Fest)" style={inputSt({fontSize:15})}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <input id="new-show-location" placeholder="Location" style={inputSt()}/>
                  <input id="new-show-date" placeholder={todayStr()} style={inputSt()}/>
                </div>
                <button className="km-btn-press" onClick={()=>{
                  const n=document.getElementById("new-show-name")?.value;
                  const l=document.getElementById("new-show-location")?.value||"";
                  const d=document.getElementById("new-show-date")?.value||todayStr();
                  if(n?.trim()) createShow(n,l,d);
                }} style={{...btnPrimary({width:"100%",padding:"12px",fontSize:15})}}>
                  Create Show
                </button>
              </div>
            </div>

            {/* No show (general sales) */}
            <button onClick={()=>{setActiveShow(null);store.set("km-activeShow",null);setShowPicker(false);showToast("Switched to general sales");}} className="km-btn-press"
              style={{...btnGhost(!activeShow,{width:"100%",marginBottom:8,padding:"12px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}}>
              No show — general sales
            </button>

            {/* Existing shows */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {shows.map(s=>{
                const showOrders = records.filter(r=>r.showId===s.id);
                const rev = showOrders.reduce((a,r)=>a+r.totalRetail,0);
                const isActive = activeShow===s.id;
                return (
                  <div key={s.id} onClick={()=>selectShow(s.id)} style={{
                    padding:"14px 16px",borderRadius:12,cursor:"pointer",
                    background:isActive?T.accentLight:T.bg,
                    border:`1.5px solid ${isActive?T.accent+"60":T.border}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    transition:"all 0.2s ease",
                  }}>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:isActive?T.accent:T.text}}>{s.name}</div>
                      <div style={{fontSize:12,color:T.dim,marginTop:2}}>
                        {s.location && `${s.location} · `}{s.date} · {showOrders.length} order{showOrders.length!==1?"s":""}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontSize:16,fontWeight:700,color:rev>0?T.green:T.dim}}>${fmt(rev)}</div>
                      <button onClick={e=>{e.stopPropagation();deleteShow(s.id);}} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,padding:4}}>
                        <Icon name="Trash" size={14}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Sell modal */}
      {quickSell && (()=>{
        const item = quickSell;
        const retail = item.price * (item.unit==="per inch"?18:1) * markup;
        return (
          <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"km-overlayIn 0.2s ease"}}
            onClick={()=>setQuickSell(null)}>
            <div style={{...cardSt(),width:"100%",maxWidth:480,borderBottomLeftRadius:0,borderBottomRightRadius:0,borderTopLeftRadius:20,borderTopRightRadius:20,padding:"28px 22px 36px",animation:"km-modalSlide 0.3s cubic-bezier(0.22,1,0.36,1)"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{width:36,height:4,borderRadius:2,background:T.border,margin:"0 auto 20px"}}/>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontSize:20,fontWeight:700,color:T.text}}>{item.name}</div>
                <div style={{fontSize:14,color:T.dim,marginTop:4}}>{item.metal} &middot; {item.cat}</div>
                <div style={{fontSize:28,fontWeight:700,color:T.accent,marginTop:8}}>${fmt(retail)}</div>
                <div style={{fontSize:12,color:T.dim}}>at {markup}x markup</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <label style={labelSt}>Customer Name *</label>
                  <input id="qs-name" placeholder="Full name" style={inputSt({fontSize:18,padding:"14px 16px"})} autoFocus/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={labelSt}>Phone</label>
                    <input id="qs-phone" type="tel" placeholder="(555) 123-4567" style={inputSt()}/>
                  </div>
                  <div>
                    <label style={labelSt}>Email</label>
                    <input id="qs-email" type="email" placeholder="optional" style={inputSt()}/>
                  </div>
                </div>
              </div>
              <button className="km-btn-press" onClick={()=>{
                const n=document.getElementById("qs-name")?.value;
                const p=document.getElementById("qs-phone")?.value;
                const e=document.getElementById("qs-email")?.value;
                if(n?.trim()) quickSellComplete(n,p||"",e||"");
              }} style={{...btnPrimary({width:"100%",padding:"16px",fontSize:17,marginTop:20,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}}>
                <Icon name="Check" size={18}/>Sell &mdash; ${fmt(retail)}
              </button>
            </div>
          </div>
        );
      })()}

      <footer style={{textAlign:"center",padding:"24px 20px",color:T.dim,fontSize:12,borderTop:`1px solid ${T.border}`,display:R.isMobile?"none":"block",letterSpacing:0.3}}>
        <span style={{opacity:0.7}}>Kiramichael Gems &middot; JK Findings Invoice PI26-04970 &middot; March 24, 2026</span>
      </footer>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position:"fixed",top:R.isMobile?20:28,left:"50%",zIndex:300,
          background:toast.type==="info"?T.text:T.accent,
          color:"#fff",padding:"12px 24px",borderRadius:12,
          fontSize:14,fontWeight:600,fontFamily:"Georgia,serif",
          boxShadow:T.shadowLg,
          animation:"km-toastIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
          display:"flex",alignItems:"center",gap:8,
          maxWidth:"90vw",
        }}>
          <Icon name={toast.type==="info"?"Check":"Check"} size={16} color="#fff"/>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
