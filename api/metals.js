export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600"); // 5 min CDN cache

  const APIS = [
    {
      url: "https://data-asg.goldprice.org/dbXRates/USD",
      parse: (d) => {
        const item = (d.items || [])[0];
        return item ? { gold: item.xauPrice, silver: item.xagPrice } : null;
      },
    },
    {
      url: "https://api.metals.live/v1/spot",
      parse: (d) => {
        const s = Array.isArray(d) ? d[0] : d;
        return (s?.gold || s?.Gold) ? { gold: s.gold || s.Gold, silver: s.silver || s.Silver } : null;
      },
    },
  ];

  for (const api of APIS) {
    try {
      const r = await fetch(api.url, {
        headers: { "User-Agent": "KiramichaelGems/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const result = api.parse(data);
      if (result?.gold && result.gold > 100) {
        return res.status(200).json({
          gold: result.gold,
          silver: result.silver || null,
          source: api.url.split("/")[2],
          ts: Date.now(),
        });
      }
    } catch { continue; }
  }

  res.status(502).json({ error: "All price sources unavailable" });
}
