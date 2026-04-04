export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

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
  ];

  for (const s of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(s.url, {
        headers: { "User-Agent": "KMGems/1.0", "Accept": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) continue;
      const data = await r.json();
      const result = s.parse(data);
      if (result?.gold && result.gold > 500) {
        return res.status(200).json({
          gold: result.gold,
          silver: result.silver || null,
          source: result.src,
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.log(`Source ${s.url} failed:`, e.message);
      continue;
    }
  }

  return res.status(502).json({ error: "All price sources failed", ts: Date.now() });
}
