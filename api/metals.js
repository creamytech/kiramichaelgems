export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  // Try multiple sources — the first one that works wins
  const attempts = [];

  // Source 1: Yahoo Finance (most reliable, no API key)
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d", {
        headers: { "User-Agent": "Mozilla/5.0" },
      }),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d&range=1d", {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => null),
    ]);
    if (goldRes.ok) {
      const gd = await goldRes.json();
      const gold = gd?.chart?.result?.[0]?.meta?.regularMarketPrice;
      let silver = null;
      if (silverRes?.ok) {
        const sd = await silverRes.json();
        silver = sd?.chart?.result?.[0]?.meta?.regularMarketPrice;
      }
      if (gold && gold > 500) {
        return res.status(200).json({ gold, silver, source: "yahoo", ts: Date.now() });
      }
    }
    attempts.push("yahoo: no valid price");
  } catch (e) { attempts.push("yahoo: " + e.message); }

  // Source 2: goldprice.org
  try {
    const r = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (r.ok) {
      const d = await r.json();
      const item = (d.items || [])[0];
      if (item?.xauPrice && item.xauPrice > 500) {
        return res.status(200).json({ gold: item.xauPrice, silver: item.xagPrice || null, source: "goldprice.org", ts: Date.now() });
      }
    }
    attempts.push("goldprice: no valid data");
  } catch (e) { attempts.push("goldprice: " + e.message); }

  // Source 3: metals.live
  try {
    const r = await fetch("https://api.metals.live/v1/spot", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (r.ok) {
      const d = await r.json();
      const s = Array.isArray(d) ? d[0] : d;
      if (s?.gold && s.gold > 500) {
        return res.status(200).json({ gold: s.gold, silver: s.silver || null, source: "metals.live", ts: Date.now() });
      }
    }
    attempts.push("metals.live: no valid data");
  } catch (e) { attempts.push("metals.live: " + e.message); }

  return res.status(502).json({ error: "All sources failed", attempts, ts: Date.now() });
}
