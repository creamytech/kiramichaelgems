import { T, fmt } from "../theme";
import Icon from "./Icons";

const squareAppId = import.meta.env.VITE_SQUARE_APP_ID || "";

function buildSquarePOSUrl({ amount, note, callbackUrl }) {
  const amountCents = Math.round(amount * 100);

  const data = {
    amount_money: {
      amount: amountCents,
      currency_code: "USD",
    },
    callback_url: callbackUrl,
    client_id: squareAppId,
    version: "1.3",
    notes: note || "",
    options: {
      supported_tender_types: ["CREDIT_CARD", "CASH", "SQUARE_GIFT_CARD", "CARD_ON_FILE"],
    },
  };

  return `square-commerce-v1://payment/create?data=${encodeURIComponent(JSON.stringify(data))}`;
}

export default function SquarePayment({ amount, description, customerName, onSuccess }) {
  if (!squareAppId) return null;

  const callbackUrl = `${window.location.origin}/square-callback`;
  const posUrl = buildSquarePOSUrl({
    amount,
    note: `${description || "KM Gems"} — ${customerName || "Customer"}`,
    callbackUrl,
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
      <a href={posUrl} style={{textDecoration:"none"}}>
        <button className="km-btn-press" style={{
          width:"100%",padding:"14px",fontSize:16,fontWeight:700,
          background:"#000",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
          fontFamily:"-apple-system, BlinkMacSystemFont, sans-serif",
        }}>
          <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
            <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="white" strokeWidth="1.5"/>
            <rect x="8" y="8" width="8" height="8" rx="1.5" fill="white"/>
          </svg>
          Tap to Pay — ${fmt(amount)}
        </button>
      </a>
      <div style={{textAlign:"center",fontSize:11,color:T.dim}}>
        Opens Square — customer taps card on your phone
      </div>
    </div>
  );
}
