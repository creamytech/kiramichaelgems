import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { T, fmt, btnPrimary, btnGhost } from "../theme";
import Icon from "./Icons";

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
let stripePromise = null;
if (stripeKey) stripePromise = loadStripe(stripeKey);

export default function StripePayment({ amount, description, customerName, customerEmail, onSuccess, onCancel }) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | processing | success | error
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [stripe, setStripe] = useState(null);
  const [elements, setElements] = useState(null);
  const [canApplePay, setCanApplePay] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const payRequestRef = useRef(null);

  if (!stripeKey) return null;

  const amountCents = Math.round(amount * 100);

  // Check Apple Pay / Google Pay availability on mount
  useEffect(() => {
    async function checkWallets() {
      try {
        const s = await stripePromise;
        if (!s) return;
        const pr = s.paymentRequest({
          country: "US",
          currency: "usd",
          total: { label: "KM Gems", amount: amountCents },
          requestPayerName: true,
          requestPayerEmail: true,
        });
        const result = await pr.canMakePayment();
        if (result) {
          setCanApplePay(true);
          payRequestRef.current = pr;
        }
      } catch {}
    }
    checkWallets();
  }, [amountCents]);

  // Handle Apple Pay / Google Pay
  async function handleWalletPay() {
    setStatus("loading");
    setError(null);
    try {
      // Create PaymentIntent
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountCents,
          description: description || "KM Gems",
          customer_name: customerName,
          customer_email: customerEmail,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const s = await stripePromise;
      const pr = payRequestRef.current;

      // Update payment request with new amount (in case it changed)
      pr.update({ total: { label: description || "KM Gems", amount: amountCents } });

      // Listen for the token
      pr.on("paymentmethod", async (ev) => {
        setStatus("processing");
        const { error: confirmError, paymentIntent } = await s.confirmCardPayment(
          data.clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );
        if (confirmError) {
          ev.complete("fail");
          setError(confirmError.message);
          setStatus("idle");
        } else {
          ev.complete("success");
          if (paymentIntent.status === "requires_action") {
            const { error: actionError } = await s.confirmCardPayment(data.clientSecret);
            if (actionError) {
              setError(actionError.message);
              setStatus("idle");
            } else {
              setStatus("success");
              onSuccess?.(paymentIntent.id);
            }
          } else {
            setStatus("success");
            onSuccess?.(paymentIntent.id);
          }
        }
      });

      pr.on("cancel", () => setStatus("idle"));

      // Show the wallet sheet
      pr.show();
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  // Handle manual card entry
  async function initCardForm() {
    setShowCardForm(true);
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountCents,
          description: description || "KM Gems",
          customer_name: customerName,
          customer_email: customerEmail,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setClientSecret(data.clientSecret);

      const s = await stripePromise;
      setStripe(s);
      const el = s.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#8B2FC9",
            colorBackground: "#ffffff",
            colorText: "#1A1A1A",
            borderRadius: "10px",
            fontFamily: "Georgia, serif",
          },
        },
      });
      setElements(el);
      setStatus("ready");
      setTimeout(() => {
        const payEl = el.create("payment");
        const container = document.getElementById("km-stripe-element");
        if (container) payEl.mount(container);
      }, 100);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function handleCardPay() {
    if (!stripe || !elements || !clientSecret) return;
    setStatus("processing");
    setError(null);
    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (confirmError) {
        setError(confirmError.message);
        setStatus("ready");
      } else if (paymentIntent?.status === "succeeded") {
        setStatus("success");
        onSuccess?.(paymentIntent.id);
      } else {
        setStatus("ready");
      }
    } catch (err) {
      setError(err.message);
      setStatus("ready");
    }
  }

  return (
    <div style={{marginTop:12}}>
      {status === "idle" && !showCardForm && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {/* Apple Pay / Google Pay — primary if available */}
          {canApplePay && (
            <button onClick={handleWalletPay} className="km-btn-press" style={{
              width:"100%",padding:"14px",fontSize:16,fontWeight:700,
              background:"#000",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
              fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}>
              <svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M17.72 7.54c-.57.66-1.5 1.17-2.42 1.09-.11-.95.35-1.96.89-2.58.57-.66 1.57-1.15 2.38-1.18.1.98-.28 1.96-.85 2.67zM18.57 8.8c-1.34-.08-2.48.76-3.12.76-.64 0-1.62-.72-2.67-.7-1.37.02-2.64.8-3.34 2.03-1.43 2.48-.37 6.15 1.02 8.16.68.99 1.49 2.09 2.55 2.05 1.02-.04 1.41-.66 2.65-.66 1.24 0 1.59.66 2.67.64 1.1-.02 1.79-.99 2.47-1.99.77-1.13 1.09-2.22 1.11-2.28-.02-.01-2.13-.82-2.15-3.24-.02-2.03 1.66-3 1.73-3.04-.94-1.4-2.41-1.55-2.92-1.59z"/></svg>
              Pay &mdash; ${fmt(amount)}
            </button>
          )}

          {/* Manual card entry */}
          <button onClick={initCardForm} className="km-btn-press" style={{
            ...btnPrimary({width:"100%",padding:"14px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:canApplePay?"transparent":"linear-gradient(135deg, #635BFF 0%, #4B45C6 100%)",
              color:canApplePay?T.accent:"#fff",
              border:canApplePay?`1.5px solid ${T.border}`:"none",
              boxShadow:canApplePay?"none":"0 4px 16px rgba(99,91,255,0.25)"}),
          }}>
            <Icon name="Lightning" size={16}/>
            {canApplePay ? "Enter card manually" : `Pay with Card — $${fmt(amount)}`}
          </button>
        </div>
      )}

      {status === "loading" && (
        <div style={{textAlign:"center",padding:"20px",color:T.dim}}>Loading payment...</div>
      )}

      {(status === "ready" || status === "processing") && showCardForm && (
        <div>
          <div id="km-stripe-element" style={{marginBottom:14,minHeight:100}}/>
          <button onClick={handleCardPay} disabled={status==="processing"} className="km-btn-press" style={{
            ...btnPrimary({width:"100%",padding:"14px",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:status==="processing"?"#999":"linear-gradient(135deg, #635BFF 0%, #4B45C6 100%)",
              boxShadow:status==="processing"?"none":"0 4px 16px rgba(99,91,255,0.25)",
              cursor:status==="processing"?"wait":"pointer"}),
          }}>
            {status === "processing" ? "Processing..." : `Pay $${fmt(amount)}`}
          </button>
          <button onClick={()=>{setShowCardForm(false);setStatus("idle");onCancel?.();}} className="km-btn-press" style={{
            ...btnGhost(false,{width:"100%",marginTop:8,padding:"10px",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}),
          }}>
            Cancel
          </button>
        </div>
      )}

      {status === "success" && (
        <div style={{textAlign:"center",padding:"16px"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:T.greenBg,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
            <Icon name="Check" size={24} color={T.green}/>
          </div>
          <div style={{fontSize:16,fontWeight:700,color:T.green}}>Payment Successful</div>
          <div style={{fontSize:13,color:T.dim,marginTop:4}}>${fmt(amount)} charged</div>
        </div>
      )}

      {error && (
        <div style={{padding:"10px 14px",background:T.redBg,borderRadius:8,border:`1px solid ${T.red}20`,marginTop:8,fontSize:13,color:T.red}}>
          {error}
        </div>
      )}
    </div>
  );
}
