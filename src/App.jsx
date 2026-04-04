import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { DEFAULT_ITEMS, CATS, INITIAL_STOCK, INVOICE_TOTAL, INVOICE_COST, INVOICE_FREIGHT, INVOICE_GOLD_OZ, INVOICE_SILVER_OZ, INVOICE_14KGF_COST, INVOICE_925AG_COST } from "./data/catalog";
import useMetalPrices from "./hooks/useMetalPrices";
import useGeoTax from "./hooks/useGeoTax";
import useOnlineStatus from "./hooks/useOnlineStatus";
import { T, fmt, todayStr, uid, store, cardSt, inputSt, labelSt, btnPrimary, btnGhost, tagSt, applyDarkMode } from "./theme";
import Icon from "./components/Icons";
import useResponsive from "./hooks/useResponsive";
import QRBox from "./components/QRBox";
import ItemModal from "./components/ItemModal";
import { supabase, dbLoad, dbSave, dbMergeLoad, isOnline, testConnection, getDebugInfo } from "./lib/supabase";
import { haptic, hapticSuccess, hapticError, hapticHeavy, hapticSelect } from "./utils/haptic";

const UNITS = ["each","per inch","per gram","per foot"];

export default function App() {
  const R = useResponsive();
  const metals = useMetalPrices();
  const geoTax = useGeoTax();
  const netStatus = useOnlineStatus();
  const [darkMode, setDarkMode] = useState(() => store.get("km-darkmode") || false);
  const [pwaPrompt, setPwaPrompt] = useState(null);
  const [showPwaPrompt, setShowPwaPrompt] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(null); // for customer list detail
  const [showCloseShowModal, setShowCloseShowModal] = useState(false);

  const [records,    setRecords]    = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [customItems,setCustomItems]= useState([]);
  const [settings,   setSettings]   = useState({paypal:"",venmo:"",cashapp:"",bizName:"KM Gems",taxRate:0,taxEnabled:false,priceRounding:"none",lowStockThreshold:5});
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
  const [customerView,setCustomerView]= useState(false);
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
  const [qsName,        setQsName]        = useState("");
  const [qsPhone,       setQsPhone]       = useState("");
  const [qsEmail,       setQsEmail]       = useState("");

  useEffect(() => {
    const splashMin = new Promise(r => setTimeout(r, 1800)); // Show splash at least 1.8s

    async function loadData() {
      try {
        const [r, t, c, s, inv, sh, sl] = await Promise.all([
          dbMergeLoad("orders").catch(() => null),
          dbMergeLoad("templates").catch(() => null),
          dbMergeLoad("items").catch(() => null),
          dbLoad("settings").catch(() => null),
          dbLoad("inventory").catch(() => null),
          dbMergeLoad("shows").catch(() => null),
          dbMergeLoad("sellers").catch(() => null),
        ]);

        const records_  = r && r.length ? r : store.get("km-builds");
        const templates_= t && t.length ? t : store.get("km-templates");
        const items_    = c && c.length ? c : store.get("km-custom");
        const settings_ = s && Object.keys(s).length ? s : store.get("km-settings");
        const inv_      = inv && Object.keys(inv).length ? inv : store.get("km-inventory");
        if (records_)   setRecords(records_);
        if (templates_) setTemplates(templates_);
        if (items_)     setCustomItems(items_);
        if (settings_)  setSettings(prev => ({...prev, ...settings_}));
        if (inv_ && Object.keys(inv_).length > 0) setInventory(inv_);
        else {
          const seed = {...INITIAL_STOCK};
          setInventory(seed);
          store.set("km-inventory", seed);
          dbSave("inventory", seed).catch(()=>{});
        }
        const shows_   = sh && sh.length ? sh : store.get("km-shows");
        if (shows_ && shows_.length) setShows(shows_);
        const sellers_ = sl && sl.length ? sl : store.get("km-sellers");
        if (sellers_ && sellers_.length) setSellers(sellers_);

        // Auto-push local data to cloud if cloud was empty but local has data
        // This handles the case where SQL was re-run and wiped the cloud
        const autoPush = [];
        if (records_ && records_.length && (!r || !r.length))   autoPush.push(dbSave("orders", records_));
        if (templates_&& templates_.length&& (!t || !t.length)) autoPush.push(dbSave("templates", templates_));
        if (shows_ && shows_.length && (!sh || !sh.length))     autoPush.push(dbSave("shows", shows_));
        if (sellers_ && sellers_.length && (!sl || !sl.length))  autoPush.push(dbSave("sellers", sellers_));
        if (autoPush.length > 0) {
          Promise.all(autoPush).catch(()=>{});
          console.log(`Auto-pushed ${autoPush.length} tables to cloud (cloud was empty, local had data)`);
        }

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
        if (inv && Object.keys(inv).length > 0) setInventory(inv);
        else { setInventory({...INITIAL_STOCK}); store.set("km-inventory",{...INITIAL_STOCK}); }
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

  // ── Dark mode effect ─────────────────────────────────────────────────────
  useEffect(() => {
    applyDarkMode(darkMode);
    if (darkMode) document.documentElement.classList.add("km-dark");
    else document.documentElement.classList.remove("km-dark");
  }, [darkMode]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    store.set("km-darkmode", next);
    applyDarkMode(next);
    // Force re-render by toggling class
    if (next) document.documentElement.classList.add("km-dark");
    else document.documentElement.classList.remove("km-dark");
  }

  // ── PWA install prompt ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPwaPrompt(e);
      const dismissed = store.get("km-pwa-dismissed");
      if (!dismissed) setShowPwaPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function installPwa() {
    if (!pwaPrompt) return;
    pwaPrompt.prompt();
    pwaPrompt.userChoice.then(() => {
      setShowPwaPrompt(false);
      store.set("km-pwa-dismissed", true);
    });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        if (showPicker) { setShowPicker(false); return; }
        if (quickSell) { setQuickSell(null); return; }
        if (itemModal) { setItemModal(null); return; }
        if (qrFull) { setQrFull(false); return; }
      }
      if (e.key === "n" || e.key === "N") { setTab("build"); hapticSelect(); return; }
      if (e.key === "s" || e.key === "S") { saveBuild(); hapticSuccess(); return; }
      const tabKeys = ["1","2","3","4","5"];
      const tabIds = ["catalog","build","checkout","dashboard","records"];
      const idx = tabKeys.indexOf(e.key);
      if (idx >= 0) { setTab(tabIds[idx]); hapticSelect(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showPicker, quickSell, itemModal, qrFull, buildItems, customerName]);

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
    hapticSuccess();
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
    hapticSuccess();
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
    hapticHeavy();
    const u = records.map(r=>r.id===id?{...r,paid:true}:r);
    setRecords(u); store.set("km-builds",u); dbSave("orders",u);
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
    // Auto-detect tax for this location
    geoTax.detect().then(result => {
      if (result?.taxRate && result.taxRate !== settings.taxRate) {
        saveSettings({...settings, taxEnabled:true, taxRate:result.taxRate, taxCounty:result.county});
        showToast(`Tax set to ${result.taxRate}% for ${result.county}`);
      }
    }).catch(()=>{});
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
    if (!activeShow) setShowPicker(true);
    else showToast(`Welcome, ${s.name}!`);
  }
  function pickSeller(id) {
    setActiveSeller(id); store.set("km-activeSeller",id);
    setSellerPicker(false);
    // If no show is active, prompt to pick one
    if (!activeShow) setShowPicker(true);
    const s = sellers.find(x=>x.id===id);
    if (s && activeShow) showToast(`Hey ${s.name}! Let's sell.`);
  }
  function deleteSeller(id) {
    if (!window.confirm("Delete this profile?")) return;
    saveSellers(sellers.filter(s=>s.id!==id));
    if (activeSeller===id) { setActiveSeller(null); store.set("km-activeSeller",null); setSellerPicker(true); }
  }

  // ── Customer list ──────────────────────────────────────────────────────
  const customerList = useMemo(() => {
    const map = {};
    records.forEach(r => {
      const key = (r.customer||"").toLowerCase().trim();
      if (!key) return;
      if (!map[key]) map[key] = { name:r.customer, phone:r.phone||"", email:r.email||"", orders:0, total:0, lastDate:r.date, orderIds:[] };
      map[key].orders++;
      map[key].total += (r.totalWithTax || r.totalRetail);
      if (!map[key].phone && r.phone) map[key].phone = r.phone;
      if (!map[key].email && r.email) map[key].email = r.email;
      map[key].lastDate = r.date;
      map[key].orderIds.push(r.id);
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [records]);

  // ── Repeat customer lookup helper ─────────────────────────────────────
  function getCustomerSuggestions(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return customerList.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
  }

  // ── End-of-day report ─────────────────────────────────────────────────
  function generateDayReport() {
    const today = todayStr();
    let recs = records.filter(r => r.date === today);
    if (activeShow) recs = recs.filter(r => r.showId === activeShow);
    if (recs.length === 0) { showToast("No sales today", "info"); return null; }
    const revenue = recs.reduce((s,r) => s + r.totalRetail, 0);
    const profit = recs.reduce((s,r) => s + r.profit, 0);
    const pieces = recs.reduce((s,r) => s + (r.pieces||1), 0);
    const paid = recs.filter(r => r.paid);
    const pending = recs.filter(r => !r.paid);
    // Top 3 items
    const itemMap = {};
    recs.forEach(r => r.lines.forEach(l => {
      if (!itemMap[l.name]) itemMap[l.name] = { name:l.name, revenue:0, qty:0 };
      itemMap[l.name].revenue += l.lineCost * (r.markup||2.5);
      itemMap[l.name].qty += l.qty * (r.pieces||1);
    }));
    const top3 = Object.values(itemMap).sort((a,b) => b.revenue - a.revenue).slice(0,3);
    const cashCount = paid.length; // approximate: paid = collected
    const showLabel = activeShowData ? ` @ ${activeShowData.name}` : "";
    const text = `${settings.bizName} - Day Report${showLabel}\n${today}\n\n` +
      `Revenue: $${fmt(revenue)}\nProfit: $${fmt(profit)}\nPieces Sold: ${pieces}\nOrders: ${recs.length}\n` +
      `Paid: ${paid.length} ($${fmt(paid.reduce((s,r)=>s+(r.totalWithTax||r.totalRetail),0))})\n` +
      `Pending: ${pending.length} ($${fmt(pending.reduce((s,r)=>s+(r.totalWithTax||r.totalRetail),0))})\n\n` +
      `Top Items:\n${top3.map((t,i) => `  ${i+1}. ${t.name} — $${fmt(t.revenue)} (${t.qty} sold)`).join("\n")}\n`;
    return text;
  }

  function sendDayReport() {
    const text = generateDayReport();
    if (!text) return;
    if (navigator.share) {
      navigator.share({ title:`${settings.bizName} Day Report`, text }).catch(()=>{});
    } else {
      const body = encodeURIComponent(text);
      window.location.href = `sms:?&body=${body}`;
    }
  }

  // ── Reorder alert (items running out in ~3 shows) ─────────────────────
  const reorderAlerts = useMemo(() => {
    if (records.length === 0) return [];
    // Calculate avg daily usage rate per item across all shows
    const showDates = {};
    records.forEach(r => { if (r.showId) showDates[r.showId] = (showDates[r.showId]||0)+1; });
    const numShows = Object.keys(showDates).length || 1;
    const usagePerShow = {};
    records.forEach(r => {
      r.lines.forEach(l => {
        const match = ALL_ITEMS.find(i => i.name === l.name && i.metal === l.metal);
        if (!match) return;
        if (!usagePerShow[match.id]) usagePerShow[match.id] = { item:match, totalUsed:0 };
        usagePerShow[match.id].totalUsed += l.qty * (r.pieces||1);
      });
    });
    const alerts = [];
    Object.values(usagePerShow).forEach(({ item, totalUsed }) => {
      const avgPerShow = totalUsed / numShows;
      const stock = inventory[item.id] || 0;
      const showsLeft = avgPerShow > 0 ? stock / avgPerShow : Infinity;
      if (showsLeft <= 3 && stock > 0) {
        alerts.push({ item, stock, avgPerShow, showsLeft, reorderQty: Math.ceil(avgPerShow * 3 - stock) });
      } else if (stock <= 0 && avgPerShow > 0) {
        alerts.push({ item, stock:0, avgPerShow, showsLeft:0, reorderQty: Math.ceil(avgPerShow * 3) });
      }
    });
    return alerts.sort((a,b) => a.showsLeft - b.showsLeft);
  }, [records, inventory, ALL_ITEMS]);

  function generateReorderText() {
    if (reorderAlerts.length === 0) { showToast("No items need reordering", "info"); return; }
    const text = `${settings.bizName} - Reorder List\n${todayStr()}\n\nItems running low (< 3 shows of stock):\n\n` +
      reorderAlerts.map(a =>
        `${a.item.name} (${a.item.metal})\n  Stock: ${a.item.unit==="each"?a.stock:fmt(a.stock,1)}${a.item.unit==="per inch"?'"':a.item.unit==="per gram"?"g":""} | Avg/show: ${fmt(a.avgPerShow,1)} | Shows left: ${fmt(a.showsLeft,1)} | Reorder: ${a.reorderQty}`
      ).join("\n\n") + `\n\nTotal items to reorder: ${reorderAlerts.length}`;
    if (navigator.share) {
      navigator.share({ title:"Reorder List", text }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(text).then(()=>showToast("Reorder list copied!")).catch(()=>{});
    }
  }

  // ── Close Show — generate P&L and save on show ────────────────────────
  function closeShow(showId) {
    const show = shows.find(s => s.id === showId);
    if (!show) return;
    const sOrders = records.filter(r => r.showId === showId);
    const revenue = sOrders.reduce((s,r) => s + r.totalRetail, 0);
    const profit = sOrders.reduce((s,r) => s + r.profit, 0);
    const cogs = sOrders.reduce((s,r) => s + (r.materialCost||0)*(r.pieces||1), 0);
    const laborTotal = sOrders.reduce((s,r) => s + (r.totalLabor||0), 0);
    const pieces = sOrders.reduce((s,r) => s + (r.pieces||1), 0);
    const tax = sOrders.reduce((s,r) => s + (r.taxAmt||0), 0);
    const discount = sOrders.reduce((s,r) => s + (r.discountAmt||0), 0);
    const paid = sOrders.filter(r => r.paid);
    const collected = paid.reduce((s,r) => s + (r.totalWithTax||r.totalRetail), 0);

    const summary = {
      closedAt: new Date().toISOString(),
      orders: sOrders.length, pieces, revenue, profit, cogs, laborTotal, tax, discount,
      collected, pending: revenue - collected + tax,
      paidCount: paid.length, pendingCount: sOrders.length - paid.length,
    };

    const updated = shows.map(s => s.id === showId ? { ...s, closed: true, summary } : s);
    saveShows(updated);
    if (activeShow === showId) { setActiveShow(null); store.set("km-activeShow", null); }
    setShowCloseShowModal(false);
    showToast(`"${show.name}" closed — P&L saved`);
  }

  // ── Share invoice ─────────────────────────────────────────────────────
  function shareInvoice(rec) {
    const text = receiptText(rec);
    if (navigator.share) {
      navigator.share({ title:`${rec.paid?"Receipt":"Invoice"}: ${rec.buildName}`, text }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(text).then(() => showToast("Invoice copied to clipboard")).catch(()=>{});
    }
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
    XLSX.writeFile(wb,`KMGems_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function exportQuickBooks() {
    // QBO Sales Receipt import format
    const paidRecords = records.filter(r=>r.paid);
    if (!paidRecords.length) { showToast("No paid orders to export", "info"); return; }

    const rows = [];
    paidRecords.forEach(r => {
      const amt = r.totalWithTax || r.totalRetail;
      // First line item for this sale
      r.lines.forEach((l, i) => {
        const lineAmt = +(l.lineCost * (r.markup||2.5) * (r.pieces||1)).toFixed(2);
        rows.push({
          // Sales Receipt header fields (only on first line)
          "*SalesReceiptNo":  i===0 ? r.id : "",
          "*SalesReceiptDate": r.date,
          "*Customer":        i===0 ? r.customer : "",
          "Email":            i===0 ? (r.email||"") : "",
          "Phone":            i===0 ? (r.phone||"") : "",
          "Memo":             i===0 ? `${r.buildName}${r.showName?" — "+r.showName:""}${r.sellerName?" ("+r.sellerName+")":""}` : "",
          "PaymentMethod":    i===0 ? "Other" : "",
          // Line item fields
          "*ProductService":  l.name.replace(/[,"]/g,""),
          "Description":      `${l.metal} ${l.unit} — ${l.name}`,
          "*Qty":             +(l.qty * (r.pieces||1)).toFixed(2),
          "*Rate":            +(l.price * (r.markup||2.5)).toFixed(4),
          "*Amount":          lineAmt,
          "ServiceDate":      r.date,
        });
      });
      // Labor line if any
      if ((r.totalLabor||0) > 0) {
        rows.push({
          "*SalesReceiptNo":"", "*SalesReceiptDate":r.date, "*Customer":"",
          "Email":"","Phone":"","Memo":"","PaymentMethod":"",
          "*ProductService":"Labor",
          "Description":`Labor — ${r.pieces||1} piece${(r.pieces||1)>1?"s":""}`,
          "*Qty":1, "*Rate":+r.totalLabor.toFixed(2), "*Amount":+r.totalLabor.toFixed(2),
          "ServiceDate":r.date,
        });
      }
      // Discount line if any
      if ((r.discountAmt||0) > 0) {
        rows.push({
          "*SalesReceiptNo":"", "*SalesReceiptDate":r.date, "*Customer":"",
          "Email":"","Phone":"","Memo":"","PaymentMethod":"",
          "*ProductService":"Discount",
          "Description":`Discount — ${r.discountType==="%"?r.discount+"%":"$"+fmt(r.discount)}`,
          "*Qty":1, "*Rate":+(-r.discountAmt).toFixed(2), "*Amount":+(-r.discountAmt).toFixed(2),
          "ServiceDate":r.date,
        });
      }
      // Tax line if any
      if ((r.taxAmt||0) > 0) {
        rows.push({
          "*SalesReceiptNo":"", "*SalesReceiptDate":r.date, "*Customer":"",
          "Email":"","Phone":"","Memo":"","PaymentMethod":"",
          "*ProductService":"Sales Tax",
          "Description":"Tax",
          "*Qty":1, "*Rate":+r.taxAmt.toFixed(2), "*Amount":+r.taxAmt.toFixed(2),
          "ServiceDate":r.date,
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [16,14,20,24,14,30,12,28,36,8,10,12,14].map(w=>({wch:w}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Receipts");

    // Also add a P&L summary sheet
    const plRows = [
      {"Category":"Revenue", "Amount":+paidRecords.reduce((s,r)=>s+(r.totalWithTax||r.totalRetail),0).toFixed(2)},
      {"Category":"Cost of Goods Sold", "Amount":+paidRecords.reduce((s,r)=>s+(r.materialCost||0)*(r.pieces||1),0).toFixed(2)},
      {"Category":"Labor", "Amount":+paidRecords.reduce((s,r)=>s+(r.totalLabor||0),0).toFixed(2)},
      {"Category":"Discounts Given", "Amount":+paidRecords.reduce((s,r)=>s+(r.discountAmt||0),0).toFixed(2)},
      {"Category":"Tax Collected", "Amount":+paidRecords.reduce((s,r)=>s+(r.taxAmt||0),0).toFixed(2)},
      {"Category":"Gross Profit", "Amount":+paidRecords.reduce((s,r)=>s+r.profit,0).toFixed(2)},
      {},
      {"Category":"Total Orders", "Amount":paidRecords.length},
      {"Category":"Total Pieces", "Amount":paidRecords.reduce((s,r)=>s+(r.pieces||1),0)},
      {"Category":"Avg Order Value", "Amount":+(paidRecords.reduce((s,r)=>s+r.totalRetail,0)/paidRecords.length).toFixed(2)},
    ];
    const ws2 = XLSX.utils.json_to_sheet(plRows);
    ws2["!cols"] = [{wch:20},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws2, "P&L Summary");

    // Customer list sheet
    const customers = {};
    paidRecords.forEach(r => {
      if (!customers[r.customer]) customers[r.customer] = {name:r.customer,email:r.email||"",phone:r.phone||"",orders:0,total:0};
      customers[r.customer].orders++;
      customers[r.customer].total += (r.totalWithTax||r.totalRetail);
    });
    const custRows = Object.values(customers).sort((a,b)=>b.total-a.total).map(c=>({
      "*Name":c.name, "Email":c.email, "Phone":c.phone,
      "Orders":c.orders, "Total Spent ($)":+c.total.toFixed(2),
    }));
    const ws3 = XLSX.utils.json_to_sheet(custRows);
    ws3["!cols"] = [{wch:24},{wch:26},{wch:16},{wch:8},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws3, "Customers");

    XLSX.writeFile(wb, `KMGems_QuickBooks_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`Exported ${paidRecords.length} paid orders for QuickBooks`);
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
  // Mobile: 5 tabs (Settings accessible from Dashboard gear icon)
  const NAV = R.isMobile ? NAV_FULL.filter(n=>n.id!=="settings") : NAV_FULL;

  const mainPad = R.isMobile ? "12px 10px" : "24px 24px";
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
        <img src="/IMG_7676.jpeg" alt="KM Gems" style={{width:240,height:"auto"}}/>
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
      {isOnline() && (
        <button onClick={async ()=>{
          showToast("Syncing...", "info");
          if (sellers.length > 0) {
            // This device has profiles — push them to cloud
            // Use simple delete+insert to avoid upsert issues
            try {
              await supabase.from("sellers").delete().gte("id", 0);
              const rows = sellers.map(s => ({ record_id: String(s.id), data: s }));
              await supabase.from("sellers").insert(rows);
              showToast(`Pushed ${sellers.length} profiles to cloud!`);
            } catch(e) { showToast("Push failed: " + e.message, "info"); }
          } else {
            // This device has no profiles — pull from cloud
            try {
              const { data } = await supabase.from("sellers").select("data");
              if (data && data.length) {
                const profiles = data.map(r => r.data);
                setSellers(profiles); store.set("km-sellers", profiles);
                showToast(`Found ${profiles.length} profiles!`);
              } else {
                showToast("No profiles in cloud — create one below");
              }
            } catch(e) { showToast("Sync failed: " + e.message, "info"); }
          }
        }} className="km-btn-press" style={{...btnGhost(false,{padding:"8px 16px",fontSize:13,marginBottom:12,display:"flex",alignItems:"center",gap:6})}}>
          <Icon name="Save" size={14}/>{sellers.length > 0 ? "Push profiles to cloud" : "Pull profiles from cloud"}
        </button>
      )}
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

  // ── Show picker gate (after profile, before main app) ──────────────────────
  if (activeSeller && !activeShow && showPicker) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(145deg, #FAFAFD 0%, #F3EAFA 40%, #EDE2F6 70%, #FAFAFD 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,'Times New Roman',serif",padding:24,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <span style={{fontSize:28}}>{activeSellerData?.emoji}</span>
        <span style={{fontSize:18,fontWeight:700,color:T.text}}>Hey {activeSellerData?.name}!</span>
      </div>
      <div style={{fontSize:22,fontWeight:700,color:T.text,marginBottom:4}}>What show are you at?</div>
      <p style={{fontSize:14,color:T.dim,marginBottom:28}}>Pick a show or create a new one</p>

      <div style={{width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:10}}>
        {/* Existing shows */}
        {shows.map(s=>{
          const ct = records.filter(r=>r.showId===s.id).length;
          return (
            <button key={s.id} onClick={()=>selectShow(s.id)} className="km-btn-press" style={{
              ...cardSt({padding:"18px 20px"}),width:"100%",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              border:`1.5px solid ${T.border}`,textAlign:"left",background:"#fff",
            }}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:T.text}}>{s.name}</div>
                <div style={{fontSize:12,color:T.dim,marginTop:2}}>
                  {s.location && `${s.location} · `}{s.date}{ct>0&&` · ${ct} sales`}
                </div>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:T.accent}}>Select →</div>
            </button>
          );
        })}

        {/* Create new show */}
        <div style={{padding:"20px",borderRadius:16,background:"#fff",border:`1px solid ${T.border}`,boxShadow:T.shadow,marginTop:shows.length>0?10:0}}>
          <div style={{fontSize:14,fontWeight:700,color:T.sub,marginBottom:10}}>Create New Show</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input id="gate-show-name" placeholder="Show name (e.g. Cape Coral Art Fest)" style={inputSt({fontSize:16})} autoFocus/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input id="gate-show-loc" placeholder="Location" style={inputSt()}/>
              <input id="gate-show-date" placeholder={todayStr()} style={inputSt()}/>
            </div>
            <button className="km-btn-press" onClick={()=>{
              const n=document.getElementById("gate-show-name")?.value;
              const l=document.getElementById("gate-show-loc")?.value||"";
              const d=document.getElementById("gate-show-date")?.value||todayStr();
              if(n?.trim()) createShow(n,l,d);
            }} style={{...btnPrimary({width:"100%",padding:"14px",fontSize:16})}}>
              Start Selling
            </button>
          </div>
        </div>

        {/* Skip — general sales */}
        <button onClick={()=>{setShowPicker(false);showToast("Ready to sell — no show selected");}} style={{
          background:"none",border:"none",cursor:"pointer",color:T.dim,fontSize:14,
          marginTop:8,fontFamily:"Georgia,serif",padding:8,
        }}>
          Skip — just general sales
        </button>
      </div>
    </div>
  );

  return (
    <div className={darkMode?"km-dark":""} style={{minHeight:"100vh",background:T.bg,fontFamily:"Georgia,'Times New Roman',serif",color:T.text,fontSize:15,transition:"background 0.3s, color 0.3s",overflowX:"hidden",maxWidth:"100vw"}}>

      {/* PWA Install Prompt */}
      {showPwaPrompt && (
        <div style={{position:"fixed",bottom:R.isMobile?70:20,left:"50%",transform:"translateX(-50%)",zIndex:250,
          background:T.card,border:`1.5px solid ${T.borderAcc}`,borderRadius:14,padding:"14px 20px",
          boxShadow:T.shadowLg,display:"flex",alignItems:"center",gap:12,maxWidth:360,animation:"km-modalSlide 0.3s cubic-bezier(0.22,1,0.36,1)"}}>
          <Icon name="Download" size={22} color={T.accent}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:T.text}}>Add to Home Screen</div>
            <div style={{fontSize:12,color:T.dim}}>Quick access to KM Gems</div>
          </div>
          <button onClick={installPwa} className="km-btn-press" style={{...btnPrimary({padding:"8px 14px",fontSize:13})}}>Install</button>
          <button onClick={()=>{setShowPwaPrompt(false);store.set("km-pwa-dismissed",true);}} style={{background:"none",border:"none",cursor:"pointer",color:T.dim,padding:4}}>
            <Icon name="X" size={16}/>
          </button>
        </div>
      )}

      {/* HEADER */}
      <header style={{
        background:T.headerGradient, borderBottom:`1px solid ${T.border}`,
        boxShadow:"0 1px 3px rgba(80,30,120,0.04), 0 2px 8px rgba(80,30,120,0.04)",
        padding: R.isMobile ? "8px 14px" : "12px 28px",
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
        position:"sticky", top:0, zIndex:100,
        backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
      }}>
        {/* Left: logo + text */}
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:1}}>
          <img src="/IMG_7676.jpeg" alt="KM" style={{height:R.isMobile?34:42,width:"auto",objectFit:"contain",flexShrink:0}}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:R.isMobile?15:18,fontWeight:700,color:T.text,lineHeight:1.2}}>KM Gems</div>
            <button onClick={()=>setShowPicker(true)} style={{
              background:"none",border:"none",cursor:"pointer",padding:0,marginTop:1,
              fontSize:R.isMobile?11:12,color:activeShowData?T.accent:T.dim,fontWeight:500,fontFamily:"Georgia,serif",
              display:"flex",alignItems:"center",gap:3,
            }}>
              {activeShowData ? <><span style={{width:5,height:5,borderRadius:"50%",background:T.green,flexShrink:0}}/>{activeShowData.name}</> : "Tap to pick show"}
              <Icon name="ChevronDown" size={10}/>
            </button>
          </div>
        </div>
        {/* Right: seller profile */}
        {activeSellerData && (
          <button onClick={()=>{setActiveSeller(null);store.set("km-activeSeller",null);setSellerPicker(true);}} className="km-btn-press" style={{
            background:T.accentLight,border:`1px solid ${T.accent}25`,borderRadius:20,
            padding:R.isMobile?"5px 10px 5px 6px":"6px 14px 6px 8px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:5,flexShrink:0,
            fontSize:R.isMobile?12:13,fontWeight:600,color:T.accent,fontFamily:"Georgia,serif",
          }}>
            <span style={{fontSize:R.isMobile?16:18}}>{activeSellerData.emoji}</span>
            {activeSellerData.name}
          </button>
        )}
        {!R.isMobile && (
          <nav style={{display:"flex",gap:4,background:T.bg,borderRadius:12,padding:4,border:`1px solid ${T.border}`}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>{setTab(n.id);hapticSelect();}} className="km-btn-press" style={{
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

      {/* Offline indicator */}
      {!netStatus.online && (
        <div style={{background:T.red,color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,animation:"km-offlineIn 0.3s ease"}}>
          Offline — changes saved locally
        </div>
      )}
      {netStatus.online && netStatus.showBack && (
        <div style={{background:T.green,color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,animation:"km-offlineIn 0.3s ease"}}>
          Back online
        </div>
      )}

      <main style={{maxWidth:1200,margin:"0 auto",padding:mainPad,paddingBottom:mainPB,animation:"km-tabEnter 0.35s ease-out",overflowX:"hidden"}}>

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
          <div style={{marginBottom:14}}>
            <h2 style={{margin:"0 0 6px",fontSize:R.isMobile?19:24,fontWeight:700}}>New Order</h2>
            {/* Step indicator — compact */}
            <div style={{display:"flex",gap:3}}>
              {[
                {n:1, label:"Items",     done:buildItems.length>0},
                {n:2, label:"Customer",  done:customerName.trim().length>0},
                {n:3, label:"Save",      done:false},
              ].map(s=>(
                <div key={s.n} style={{flex:1,display:"flex",alignItems:"center",gap:4,padding:"6px 8px",borderRadius:6,
                  background:s.done?T.greenBg:T.bg,border:`1px solid ${s.done?T.green+"30":T.border}`,transition:"all 0.3s ease"}}>
                  <div style={{width:18,height:18,borderRadius:"50%",fontSize:10,fontWeight:700,
                    background:s.done?T.green:T.border,color:s.done?"#fff":T.dim,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {s.done?"✓":s.n}
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:s.done?T.green:T.dim}}>{s.label}</span>
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

          <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":R.isTablet?"300px 1fr":"320px 1fr",gap:R.isMobile?12:16,alignItems:"start"}}>

            {/* Item Browser — sidebar on desktop, inline on mobile */}
            <div style={{...cardSt({padding:R.isMobile?"12px":"16px"}),position:R.isMobile?"static":"sticky",top:88,overflow:"hidden"}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                <Icon name="Grid" size={14} color={T.accent}/> Add Items
                {buildItems.length>0 && <span style={tagSt(T.green,T.greenBg)}>{buildItems.length}</span>}
              </div>
              <input value={buildSearch} onChange={e=>setBuildSearch(e.target.value)} placeholder="Search items..." style={inputSt({fontSize:14})}/>
              <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch",marginTop:6,marginRight:-4}}>
                {CATS.map(c=>(<button key={c} onClick={()=>setBuildCat(c)} className="km-btn-press" style={{...btnGhost(buildCat===c),padding:"4px 8px",fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>{c}</button>))}
              </div>
              <div style={{overflowY:"auto",maxHeight:R.isMobile?160:440,display:"flex",flexDirection:"column",gap:3,marginTop:6}}>
                {sidebarItems.map(item=>{
                  const inBuild = buildItems.find(b=>b.itemId===item.id);
                  return (
                    <div key={item.id} onClick={()=>addToBuild(item.id)} style={{
                      padding:"8px 10px",background:inBuild?T.accentLight:T.bg,
                      border:`1px solid ${inBuild?T.accent+"40":T.border}`,borderRadius:7,
                      cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",
                      transition:"all 0.15s",minWidth:0,
                    }}>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:13,color:T.text,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                        <div style={{fontSize:10,color:T.dim,marginTop:1}}>{item.metal} &middot; <span style={{color:isLowStock(item.id)?getStock(item.id)<=0?T.red:T.accent:T.green,fontWeight:600}}>{item.unit==="each"?getStock(item.id):fmt(getStock(item.id),1)}{item.unit==="per inch"?'"':item.unit==="per gram"?"g":""}</span></div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.accent}}>${fmt(item.price,4)}</div>
                        {inBuild && <div style={{fontSize:10,fontWeight:700,color:T.accent}}>x{inBuild.qty}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* BOM — right next to the browser */}
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

              {/* Customer info — last step before saving */}
              {buildItems.length>0 && (
              <div style={cardSt({padding:"18px 20px"})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <div style={{fontWeight:700,fontSize:16,color:T.text}}>Customer Info</div>
                  {buildItems.length>0 && buildName.trim() && (
                    <button onClick={saveAsTemplate} className="km-btn-press" style={{
                      display:"flex",alignItems:"center",gap:6,
                      padding:"7px 14px",fontSize:13,fontWeight:600,
                      background:tmplFlash?T.green:T.accentLight,
                      color:tmplFlash?"#fff":T.accent,
                      border:`1px solid ${tmplFlash?T.green:T.borderAcc}`,
                      borderRadius:7,cursor:"pointer",transition:"all 0.2s",
                    }}>
                      <Icon name="Save" size={14}/>
                      {tmplFlash?"Saved!":"Save as Template"}
                    </button>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr 1fr",gap:10}}>
                  <div><label style={labelSt}>Build Name</label><input value={buildName} onChange={e=>setBuildName(e.target.value)} placeholder="e.g. Shell Necklace" style={inputSt()}/></div>
                  <div style={{position:"relative"}}>
                    <label style={labelSt}>Customer Name *</label>
                    <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Full name" style={inputSt()} autoComplete="off"/>
                    {customerName.length>=2 && getCustomerSuggestions(customerName).length>0 && (
                      <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:T.shadowLg,marginTop:4,overflow:"hidden"}}>
                        {getCustomerSuggestions(customerName).map((c,i)=>(
                          <div key={i} onClick={()=>{setCustomerName(c.name);setCustomerPhone(c.phone);setCustomerEmail(c.email);}} style={{
                            padding:"10px 14px",cursor:"pointer",borderBottom:i<4?`1px solid ${T.border}`:"none",
                            transition:"background 0.1s",
                          }} onMouseEnter={e=>e.currentTarget.style.background=T.accentLight}
                             onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <div style={{fontSize:14,fontWeight:600,color:T.text}}>{c.name}</div>
                            <div style={{fontSize:11,color:T.dim}}>{c.orders} order{c.orders!==1?"s":""} · ${fmt(c.total)} spent{c.phone?` · ${c.phone}`:""}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div><label style={labelSt}>Phone</label><input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="(239) 555-0123" style={inputSt()}/></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:R.isMobile?"1fr":"1fr 1fr",gap:10,marginTop:10}}>
                  <div><label style={labelSt}>Email</label><input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="email@example.com" style={inputSt()}/></div>
                  <div><label style={labelSt}>Order Date</label><input value={orderDate} onChange={e=>setOrderDate(e.target.value)} style={inputSt()}/></div>
                </div>
              </div>
              )}
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
                {/* Share Invoice button */}
                <div style={{padding:"12px 24px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center"}}>
                  <button onClick={()=>shareInvoice(displayRec)} className="km-btn-press" style={{...btnGhost(false,{padding:"9px 18px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                    <Icon name="Share" size={14}/>Share Invoice
                  </button>
                </div>
              </div>

              {/* ── Payment / Receipt Panel ── */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* Show to Customer button — always visible */}
                <button onClick={()=>setCustomerView(true)} className="km-btn-press" style={{
                  ...btnPrimary({width:"100%",padding:"16px",fontSize:17,borderRadius:14,marginBottom:14,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                    background:"linear-gradient(135deg, #A040E0 0%, #8B2FC9 40%, #6B1FA0 100%)",
                    boxShadow:"0 4px 20px rgba(139,47,201,0.3)",
                  }),
                }}>
                  <Icon name="Expand" size={18}/>Show to Customer
                </button>

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
                  <img src="/IMG_7676.jpeg" alt="KM Gems" style={{height:48,marginBottom:16}}/>
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

          {/* ── Customer-facing fullscreen view ── */}
          {customerView && displayRec && (
            <div style={{position:"fixed",inset:0,zIndex:250,background:"#fff",overflowY:"auto",WebkitOverflowScrolling:"touch"}}
              onClick={e=>e.stopPropagation()}>
              <style>{`
                @keyframes cv-fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
                @keyframes cv-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
              `}</style>
              {/* Purple gradient header */}
              <div style={{background:"linear-gradient(135deg, #A040E0 0%, #8B2FC9 40%, #6B1FA0 100%)",
                padding:"40px 24px 32px",textAlign:"center",color:"#fff",position:"relative"}}>
                <img src="/IMG_7676.jpeg" alt="KM" style={{height:56,marginBottom:16,filter:"brightness(10)"}}/>
                <div style={{fontSize:13,letterSpacing:2,textTransform:"uppercase",opacity:0.8,marginBottom:8}}>
                  {displayRec.paid?"Thank You":"Your Order"}
                </div>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:0.5,animation:"cv-fadeUp 0.5s ease-out"}}>
                  {displayRec.customer}
                </div>
                {activeShowData && (
                  <div style={{fontSize:12,opacity:0.7,marginTop:6}}>{activeShowData.name}</div>
                )}
              </div>

              {/* Items list — clean, no costs visible */}
              <div style={{padding:"24px 20px 0",maxWidth:480,margin:"0 auto"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>
                  {displayRec.buildName}
                </div>
                {displayRec.lines.map((l,i)=>(
                  <div key={i} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"14px 0",borderBottom:i<displayRec.lines.length-1?"1px solid #F0ECF4":"none",
                    animation:`cv-fadeUp 0.4s ease-out ${0.1+i*0.05}s both`,
                  }}>
                    <div>
                      <div style={{fontSize:16,fontWeight:600,color:"#1A1A1A"}}>{l.name}</div>
                      <div style={{fontSize:13,color:"#888",marginTop:2}}>{l.metal} &middot; qty {l.qty}</div>
                    </div>
                    <div style={{fontSize:16,fontWeight:700,color:"#1A1A1A"}}>${fmt(l.lineCost * (displayRec.markup||2.5))}</div>
                  </div>
                ))}

                {/* Totals */}
                <div style={{borderTop:"2px solid #E4E0EA",marginTop:8,paddingTop:16}}>
                  {(displayRec.discountAmt||0)>0 && (
                    <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:14,color:"#C0392B"}}>
                      <span>Discount</span><span>-${fmt(displayRec.discountAmt)}</span>
                    </div>
                  )}
                  {(displayRec.taxAmt||0)>0 && (
                    <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:14,color:"#888"}}>
                      <span>Tax</span><span>${fmt(displayRec.taxAmt)}</span>
                    </div>
                  )}
                </div>

                {/* Big total */}
                <div style={{
                  textAlign:"center",padding:"28px 0",
                  animation:"cv-fadeUp 0.5s ease-out 0.3s both",
                }}>
                  <div style={{fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                    {displayRec.paid?"Amount Paid":"Total Due"}
                  </div>
                  <div style={{fontSize:48,fontWeight:700,color:"#8B2FC9",letterSpacing:-1,
                    animation:displayRec.paid?"none":"cv-pulse 2s ease-in-out infinite"}}>
                    ${fmt(displayRec.totalWithTax||displayRec.totalRetail)}
                  </div>
                </div>

                {/* QR code for payment (if unpaid and method selected) */}
                {!displayRec.paid && qrMethod && PAY_METHODS.find(m=>m.key===qrMethod)?.link && (
                  <div style={{textAlign:"center",marginBottom:24,animation:"cv-fadeUp 0.5s ease-out 0.4s both"}}>
                    {PAY_METHODS.filter(m=>m.key===qrMethod&&m.link).map(m=>(
                      <div key={m.key}>
                        <div style={{border:`3px solid ${m.bg}`,borderRadius:16,padding:14,display:"inline-block",background:"#fff",marginBottom:12}}>
                          <QRBox url={m.link} size={Math.min(220,window.innerWidth-100)}/>
                        </div>
                        <div style={{fontSize:15,fontWeight:600,color:m.bg,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          <Icon name={m.icon} size={18} color={m.bg}/>Scan to pay with {m.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment method buttons for customer (if unpaid, no QR selected) */}
                {!displayRec.paid && !qrMethod && PAY_METHODS.length>0 && (
                  <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap",justifyContent:"center"}}>
                    {PAY_METHODS.map(m=>(
                      <a key={m.key} href={m.link} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                        <button className="km-btn-press" style={{
                          background:m.bg,color:"#fff",border:"none",borderRadius:12,
                          padding:"14px 24px",fontSize:15,fontWeight:700,cursor:"pointer",
                          display:"flex",alignItems:"center",gap:8,
                          boxShadow:`0 4px 16px ${m.bg}40`,
                        }}>
                          <Icon name={m.icon} size={18} color="#fff"/>Pay with {m.label}
                        </button>
                      </a>
                    ))}
                  </div>
                )}

                {/* Paid state — thank you */}
                {displayRec.paid && (
                  <div style={{textAlign:"center",padding:"16px 0 24px",animation:"cv-fadeUp 0.5s ease-out 0.4s both"}}>
                    <div style={{width:56,height:56,borderRadius:"50%",background:"#EAF6EF",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>
                      <Icon name="Check" size={28} color="#2D7D4F"/>
                    </div>
                    <div style={{fontSize:18,fontWeight:700,color:"#2D7D4F"}}>Payment Complete</div>
                    <div style={{fontSize:14,color:"#888",marginTop:4}}>Thank you for shopping with KM Gems!</div>
                  </div>
                )}

                {/* Footer / branding */}
                <div style={{textAlign:"center",padding:"20px 0 40px",borderTop:"1px solid #F0ECF4"}}>
                  <img src="/IMG_7676.jpeg" alt="KM" style={{height:32,opacity:0.5,marginBottom:8}}/>
                  <div style={{fontSize:11,color:"#AAA",letterSpacing:0.5}}>{displayRec.date}</div>
                </div>
              </div>

              {/* Close button — small, top right (seller only sees this) */}
              <button onClick={()=>setCustomerView(false)} style={{
                position:"fixed",top:16,right:16,zIndex:260,
                width:36,height:36,borderRadius:"50%",
                background:"rgba(0,0,0,0.3)",border:"none",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                backdropFilter:"blur(4px)",
              }}>
                <Icon name="X" size={18} color="#fff"/>
              </button>
            </div>
          )}
        </div>)}

        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {tab==="dashboard" && (<div key={tab} className="km-tab-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div>
              <h2 style={{margin:"0 0 2px",fontSize:R.isMobile?20:24,fontWeight:700}}>Dashboard</h2>
              <p style={{margin:0,color:T.sub,fontSize:14}}>Real-time P&L &middot; Investment: ${fmt(INVOICE_TOTAL)}</p>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {records.length>0 && (
                <button onClick={sendDayReport} className="km-btn-press" style={{...btnPrimary({padding:"8px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="Share" size={14}/>Day Report
                </button>
              )}
              {R.isMobile && (
                <button onClick={()=>setTab("settings")} className="km-btn-press" style={{...btnGhost(false,{padding:"8px 12px",display:"flex",alignItems:"center",gap:6,fontSize:13})}}>
                  <Icon name="Gear" size={16}/>Settings
                </button>
              )}
            </div>
          </div>

          {/* ROI Hero Card */}
          {records.length > 0 ? (
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
          ) : (
          <div style={{...cardSt({padding:"24px",marginBottom:16,background:T.accentLight,border:`1.5px solid ${T.accent}30`})}}>
            <div style={{fontSize:12,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Break-Even Goal</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:24,fontWeight:700,color:T.text}}>${fmt(INVOICE_TOTAL)}</div>
                <div style={{fontSize:13,color:T.sub,marginTop:2}}>Total invested — make your first sale!</div>
              </div>
              <button onClick={()=>setTab("catalog")} className="km-btn-press" style={btnPrimary({padding:"12px 24px",fontSize:15})}>
                Start Selling
              </button>
            </div>
          </div>
          )}

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

          {/* Reorder Alerts */}
          {reorderAlerts.length>0 && (
            <div style={cardSt({padding:"20px",marginBottom:16})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{fontWeight:700,fontSize:16,display:"flex",alignItems:"center",gap:8}}>
                  <Icon name="Alert" size={18} color={T.red}/> Reorder Alerts
                  <span style={tagSt(T.red,T.redBg)}>{reorderAlerts.length}</span>
                </div>
                <button onClick={generateReorderText} className="km-btn-press" style={{...btnPrimary({padding:"8px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="Share" size={14}/>Generate Reorder List
                </button>
              </div>
              <p style={{fontSize:13,color:T.sub,marginBottom:12}}>Items that will run out within 3 shows based on average usage.</p>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {reorderAlerts.slice(0,8).map(a=>(
                  <div key={a.item.id} style={{padding:"10px 14px",borderRadius:10,
                    background:a.showsLeft<=1?T.redBg:T.accentLight,
                    border:`1px solid ${a.showsLeft<=1?T.red+"25":T.accent+"25"}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
                  }}>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:T.text}}>{a.item.name}</div>
                      <div style={{fontSize:12,color:T.dim}}>{a.item.metal} | Stock: {a.item.unit==="each"?a.stock:fmt(a.stock,1)} | Avg/show: {fmt(a.avgPerShow,1)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:14,fontWeight:700,color:a.showsLeft<=1?T.red:T.accent}}>{fmt(a.showsLeft,1)} shows left</div>
                      <div style={{fontSize:12,color:T.dim}}>Reorder: {a.reorderQty}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer List */}
          {customerList.length>0 && (
            <div style={cardSt({padding:"20px",marginBottom:16})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                <Icon name="Users" size={18} color={T.accent}/> Customers
                <span style={tagSt()}>{customerList.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {customerList.map((c,i)=>(
                  <div key={i}>
                    <div onClick={()=>setCustomerExpanded(customerExpanded===i?null:i)}
                      style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",
                        background:customerExpanded===i?T.accentLight:T.bg,
                        border:`1px solid ${customerExpanded===i?T.accent+"40":T.border}`,
                        display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.2s",
                      }}>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:T.text}}>{c.name}</div>
                        <div style={{fontSize:12,color:T.dim}}>
                          {c.phone && `${c.phone} · `}{c.email && `${c.email} · `}{c.orders} order{c.orders!==1?"s":""} · Last: {c.lastDate}
                        </div>
                      </div>
                      <div style={{fontSize:16,fontWeight:700,color:T.accent}}>${fmt(c.total)}</div>
                    </div>
                    {customerExpanded===i && (
                      <div style={{padding:"8px 14px",background:T.bg,borderRadius:"0 0 10px 10px",border:`1px solid ${T.border}`,borderTop:"none"}}>
                        {records.filter(r=>c.orderIds.includes(r.id)).map(r=>(
                          <div key={r.id} onClick={()=>{setCheckoutRec(r);setTab("checkout");}} style={{
                            padding:"8px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer",
                            display:"flex",justifyContent:"space-between",alignItems:"center",
                          }}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{r.buildName}</div>
                              <div style={{fontSize:11,color:T.dim}}>{r.date} · {r.pieces} pc</div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:14,fontWeight:700,color:T.accent}}>${fmt(r.totalRetail)}</span>
                              <span style={tagSt(r.paid?T.green:T.dim,r.paid?T.greenBg:"#EDEBF0")}>{r.paid?"Paid":"Pending"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={exportQuickBooks} className="km-btn-press" style={{...btnPrimary({padding:"10px 16px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="Save" size={14}/>QuickBooks
                </button>
                <button onClick={exportExcel} className="km-btn-press" style={{...btnGhost(false,{padding:"10px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="Save" size={14}/>Excel
                </button>
                <button onClick={undoLastSale} className="km-btn-press" style={{...btnGhost(false,{borderColor:T.red+"60",color:T.red,padding:"10px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6})}}>
                  <Icon name="X" size={14}/>Undo
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
                  placeholder="KM Gems" style={inputSt()}/>
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
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                    <div>
                      <label style={labelSt}>Tax Rate (%)</label>
                      <input type="number" min="0" max="20" step="0.1"
                        value={settings.taxRate||""} placeholder="6"
                        onChange={e=>saveSettings({...settings,taxRate:parseFloat(e.target.value)||0})}
                        style={inputSt({maxWidth:100})}/>
                    </div>
                    <button className="km-btn-press" onClick={async ()=>{
                      const result = await geoTax.detect();
                      if (result.taxRate) {
                        saveSettings({...settings, taxEnabled:true, taxRate:result.taxRate, taxCounty:result.county});
                        showToast(`${result.note}`);
                      } else {
                        showToast(result.error || "Could not detect location", "info");
                      }
                    }} style={{...btnPrimary({padding:"10px 16px",fontSize:13,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"})}}>
                      <Icon name="Sparkle" size={14}/>
                      {geoTax.loading ? "Detecting..." : "Auto-Detect"}
                    </button>
                  </div>
                  {settings.taxCounty && (
                    <div style={{padding:"10px 14px",background:T.accentLight,borderRadius:8,fontSize:13,color:T.accent,fontWeight:600,border:`1px solid ${T.accent}20`}}>
                      {settings.taxRate}% &mdash; {settings.taxCounty}
                    </div>
                  )}
                  {!settings.taxCounty && (
                    <div style={{fontSize:12,color:T.dim}}>Tap Auto-Detect to set your rate based on location, or enter manually</div>
                  )}
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

            {/* Dark Mode */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Appearance</div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={toggleDarkMode} style={{
                  width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",
                  background:darkMode?T.accent:"#D0C4DC",
                  position:"relative",transition:"background 0.2s",
                }}>
                  <div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:2,
                    left:darkMode?24:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                </button>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Icon name={darkMode?"Moon":"Sun"} size={18} color={T.accent}/>
                  <span style={{fontSize:15,color:T.text,fontWeight:600}}>
                    {darkMode ? "Dark mode" : "Light mode"}
                  </span>
                </div>
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

            {/* Sync Debug */}
            <div style={cardSt({padding:"20px"})}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Cloud Sync</div>
              <div style={{fontSize:13,color:T.sub,marginBottom:12}}>
                Status: {isOnline() ? <span style={{color:T.green,fontWeight:700}}>Connected</span> : <span style={{color:T.red,fontWeight:700}}>Offline (localStorage only)</span>}
              </div>
              <button className="km-btn-press" onClick={async ()=>{
                const result = await testConnection();
                showToast(result.ok ? `Sync working! (${result.rows} rows)` : `Sync failed: ${result.error}`, result.ok?"success":"info");
                console.log("Sync test:", JSON.stringify(result, null, 2));
              }} style={{...btnGhost(false,{padding:"11px 18px",fontSize:14,display:"flex",alignItems:"center",gap:8,marginBottom:10})}}>
                <Icon name="Check" size={15}/>Test Connection
              </button>
              <button className="km-btn-press" onClick={async ()=>{
                showToast("Syncing all data...", "info");
                await Promise.all([
                  dbSave("orders", records),
                  dbSave("templates", templates),
                  dbSave("items", customItems),
                  dbSave("settings", settings),
                  dbSave("inventory", inventory),
                  dbSave("shows", shows),
                  dbSave("sellers", sellers),
                ]);
                showToast("All data pushed to cloud!");
              }} style={{...btnPrimary({padding:"11px 18px",fontSize:14,display:"flex",alignItems:"center",gap:8,width:"100%"})}}>
                <Icon name="Save" size={15}/>Push All Data to Cloud
              </button>
              <button className="km-btn-press" onClick={()=>{
                if (window.confirm("Reset inventory to original JK Findings invoice quantities and sync to cloud?")) {
                  setInventory({...INITIAL_STOCK});
                  store.set("km-inventory", {...INITIAL_STOCK});
                  dbSave("inventory", {...INITIAL_STOCK});
                  showToast("Inventory reset to invoice quantities and synced!");
                }
              }} style={{...btnGhost(false,{padding:"11px 18px",fontSize:14,display:"flex",alignItems:"center",gap:8,width:"100%",marginTop:8})}}>
                <Icon name="Tag" size={15}/>Reset Inventory to Invoice Quantities
              </button>
              <pre style={{marginTop:12,padding:10,background:T.bg,borderRadius:8,fontSize:11,color:T.dim,overflow:"auto",maxHeight:100}}>
                {JSON.stringify(getDebugInfo(), null, 2)}
              </pre>
            </div>

            <div style={{...cardSt({padding:"16px",background:T.accentLight,border:`1px solid ${T.borderAcc}40`})}}>
              <p style={{margin:0,fontSize:14,color:T.sub,lineHeight:1.6}}>
                <strong style={{color:T.text}}>Data syncs to Supabase</strong> when connected. Local storage is used as a cache when offline. Tap "Push All Data" to force sync.
              </p>
            </div>
          </div>
        </div>)}

      </main>

      {/* BOTTOM NAV - mobile only */}
      {R.isMobile && (
        <nav style={{
          position:"fixed",bottom:0,left:0,right:0,zIndex:100,
          background:darkMode?"rgba(26,26,26,0.95)":"rgba(255,255,255,0.95)",borderTop:`1px solid ${T.border}`,
          display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)",
          boxShadow:"0 -1px 3px rgba(100,80,40,0.04), 0 -4px 16px rgba(100,80,40,0.06)",
          backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
        }}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setTab(n.id);hapticSelect();}} style={{
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
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{fontSize:16,fontWeight:700,color:rev>0?T.green:T.dim}}>${fmt(rev)}</div>
                      {!s.closed && showOrders.length>0 && (
                        <button onClick={e=>{e.stopPropagation();closeShow(s.id);}} style={{background:T.accent,border:"none",borderRadius:6,cursor:"pointer",color:"#fff",padding:"4px 8px",fontSize:11,fontWeight:700}}>
                          Close
                        </button>
                      )}
                      {s.closed && <span style={{...tagSt(T.green,T.greenBg),fontSize:10}}>Closed</span>}
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
        const qsSuggestions = getCustomerSuggestions(qsName);
        return (
          <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"km-overlayIn 0.2s ease"}}
            onClick={()=>{setQuickSell(null);setQsName("");setQsPhone("");setQsEmail("");}}>
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
                <div style={{position:"relative"}}>
                  <label style={labelSt}>Customer Name *</label>
                  <input value={qsName} onChange={e=>setQsName(e.target.value)} placeholder="Full name" style={inputSt({fontSize:18,padding:"14px 16px"})} autoFocus autoComplete="off"/>
                  {qsName.length>=2 && qsSuggestions.length>0 && (
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:T.shadowLg,marginTop:4,overflow:"hidden"}}>
                      {qsSuggestions.map((c,i)=>(
                        <div key={i} onClick={()=>{setQsName(c.name);setQsPhone(c.phone);setQsEmail(c.email);}} style={{
                          padding:"10px 14px",cursor:"pointer",borderBottom:i<4?`1px solid ${T.border}`:"none",
                          transition:"background 0.1s",
                        }} onMouseEnter={e=>e.currentTarget.style.background=T.accentLight}
                           onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{fontSize:14,fontWeight:600,color:T.text}}>{c.name}</div>
                          <div style={{fontSize:11,color:T.dim}}>{c.orders} order{c.orders!==1?"s":""}{c.phone?` · ${c.phone}`:""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={labelSt}>Phone</label>
                    <input value={qsPhone} onChange={e=>setQsPhone(e.target.value)} type="tel" placeholder="(555) 123-4567" style={inputSt()}/>
                  </div>
                  <div>
                    <label style={labelSt}>Email</label>
                    <input value={qsEmail} onChange={e=>setQsEmail(e.target.value)} type="email" placeholder="optional" style={inputSt()}/>
                  </div>
                </div>
              </div>
              <button className="km-btn-press" onClick={()=>{
                if(qsName.trim()) { quickSellComplete(qsName,qsPhone,qsEmail); setQsName(""); setQsPhone(""); setQsEmail(""); }
              }} style={{...btnPrimary({width:"100%",padding:"16px",fontSize:17,marginTop:20,display:"flex",alignItems:"center",justifyContent:"center",gap:8})}}>
                <Icon name="Check" size={18}/>Sell &mdash; ${fmt(retail)}
              </button>
            </div>
          </div>
        );
      })()}

      <footer style={{textAlign:"center",padding:"24px 20px",color:T.dim,fontSize:12,borderTop:`1px solid ${T.border}`,display:R.isMobile?"none":"block",letterSpacing:0.3}}>
        <span style={{opacity:0.7}}>KM Gems &middot; JK Findings Invoice PI26-04970 &middot; March 24, 2026</span>
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
