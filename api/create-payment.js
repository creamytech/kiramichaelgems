// Vercel serverless function — creates a Stripe PaymentIntent
// POST /api/create-payment { amount: 3972 } (amount in cents)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: "Stripe not configured" });

  try {
    const { amount, currency = "usd", description = "KM Gems", customer_name, customer_email } = req.body;

    if (!amount || amount < 50) return res.status(400).json({ error: "Amount must be at least $0.50" });

    // Create PaymentIntent via Stripe API directly (no SDK needed server-side)
    const params = new URLSearchParams({
      amount: String(Math.round(amount)),
      currency,
      description,
      "payment_method_types[]": "card",
      "metadata[source]": "km-gems-app",
    });
    if (customer_name) params.append("metadata[customer]", customer_name);
    if (customer_email) params.append("receipt_email", customer_email);

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    return res.status(200).json({
      clientSecret: data.client_secret,
      paymentIntentId: data.id,
      amount: data.amount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
