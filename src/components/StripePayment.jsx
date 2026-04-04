import { useState, useEffect } from "react";
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

  // Don't render if Stripe isn't configured
  if (!stripeKey) return null;

  const amountCents = Math.round(amount * 100);

  async function initPayment() {
    setStatus("loading");
    setError(null);
    try {
      // Create PaymentIntent on server
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

      // Load Stripe
      const s = await stripePromise;
      setStripe(s);

      // Create Payment Element
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

      // Mount after next tick
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

  async function handlePay() {
    if (!stripe || !elements || !clientSecret) return;
    setStatus("processing");
    setError(null);

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
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
      {status === "idle" && (
        <button onClick={initPayment} className="km-btn-press" style={{
          ...btnPrimary({width:"100%",padding:"14px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            background:"linear-gradient(135deg, #635BFF 0%, #4B45C6 100%)",boxShadow:"0 4px 16px rgba(99,91,255,0.25)"}),
        }}>
          <Icon name="Lightning" size={18}/>Pay with Card &mdash; ${fmt(amount)}
        </button>
      )}

      {status === "loading" && (
        <div style={{textAlign:"center",padding:"20px",color:T.dim}}>
          Loading payment form...
        </div>
      )}

      {(status === "ready" || status === "processing") && (
        <div>
          <div id="km-stripe-element" style={{marginBottom:14,minHeight:100}}/>
          <button onClick={handlePay} disabled={status==="processing"} className="km-btn-press" style={{
            ...btnPrimary({width:"100%",padding:"14px",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:status==="processing"?"#999":"linear-gradient(135deg, #635BFF 0%, #4B45C6 100%)",
              boxShadow:status==="processing"?"none":"0 4px 16px rgba(99,91,255,0.25)",
              cursor:status==="processing"?"wait":"pointer"}),
          }}>
            {status === "processing" ? "Processing..." : `Pay $${fmt(amount)}`}
          </button>
          <button onClick={onCancel} className="km-btn-press" style={{
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
          <div style={{fontSize:16,fontWeight:700,color:T.green}}>Card Payment Successful</div>
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
