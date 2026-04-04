export const config = { runtime: "edge" };

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
  };

  const sources = [
    {
      url: "https://data-asg.goldprice.org/dbXRates/USD",
      parse: (d) => {
        const item = (d.items || [])[0];
        return item ? { gold: item.xauPrice, silver: item.xagPrice, src: "goldprice.org" } : null;
      },
    },
    {
      url: "https://api.metals.live/v1/spot",
      parse: (d) => {
        const s = Array.isArray(d) ? d[0] : d;
        return s?.gold ? { gold: s.gold, silver: s.silver, src: "metals.live" } : null;
      },
    },
    {
      url: "https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU,XAG",
      parse: (d) => {
        if (!d.rates) return null;
        // These APIs return USD per oz as 1/rate
        const gold = d.rates.XAU ? 1 / d.rates.XAU : null;
        const silver = d.rates.XAG ? 1 / d.rates.XAG : null;
        return gold ? { gold, silver, src: "metalpriceapi" } : null;
      },
    },
  ];

  for (const s of sources) {
    try {
      const r = await fetch(s.url, {
        headers: { "User-Agent": "KMGems/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const result = s.parse(data);
      if (result?.gold && result.gold > 500) {
        return new Response(JSON.stringify({ gold: result.gold, silver: result.silver || null, source: result.src, ts: Date.now() }), { headers });
      }
    } catch { continue; }
  }

  return new Response(JSON.stringify({ error: "All sources unavailable" }), { status: 502, headers });
}
