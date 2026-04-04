export const config = { runtime: "edge" };

// Florida county sales tax rates (state 6% + county surtax)
// Source: Florida Dept of Revenue 2026
const FL_COUNTIES = {
  "alachua":7.5,"baker":7.5,"bay":7.5,"bradford":7.5,"brevard":7.5,
  "broward":7.0,"calhoun":7.5,"charlotte":7.0,"citrus":7.0,"clay":7.5,
  "collier":7.0,"columbia":7.0,"desoto":7.5,"dixie":7.0,"duval":7.5,
  "escambia":7.5,"flagler":7.5,"franklin":7.5,"gadsden":7.5,"gilchrist":7.0,
  "glades":7.0,"gulf":7.5,"hamilton":7.5,"hardee":7.5,"hendry":7.0,
  "hernando":7.0,"highlands":7.5,"hillsborough":8.5,"holmes":7.5,"indian river":7.0,
  "jackson":7.5,"jefferson":7.5,"lafayette":7.0,"lake":7.0,"lee":7.0,
  "leon":7.5,"levy":7.0,"liberty":7.5,"madison":7.5,"manatee":7.0,
  "marion":7.0,"martin":7.0,"miami-dade":7.0,"monroe":7.5,"nassau":7.5,
  "okaloosa":7.0,"okeechobee":7.5,"orange":6.5,"osceola":7.5,"palm beach":7.0,
  "pasco":7.5,"pinellas":7.5,"polk":7.5,"putnam":7.5,"santa rosa":7.0,
  "sarasota":7.0,"seminole":7.0,"st. johns":7.0,"st. lucie":7.5,
  "sumter":7.0,"suwannee":7.5,"taylor":7.5,"union":7.5,"volusia":7.0,
  "wakulla":7.5,"walton":7.0,"washington":7.5,
};

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "s-maxage=3600",
  };

  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: "lat and lon required" }), { status: 400, headers });
  }

  try {
    // Reverse geocode using free Nominatim API
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { "User-Agent": "KMGems/1.0" } }
    );
    if (!geoRes.ok) throw new Error("Geocode failed");
    const geo = await geoRes.json();

    const state = geo.address?.state || "";
    const county = (geo.address?.county || "").replace(/ county$/i, "").toLowerCase();
    const city = geo.address?.city || geo.address?.town || geo.address?.village || "";

    if (!state.toLowerCase().includes("florida")) {
      return new Response(JSON.stringify({
        state, county: geo.address?.county, city,
        taxRate: 0, note: "Not in Florida — no FL sales tax applies",
      }), { headers });
    }

    const rate = FL_COUNTIES[county] || 6.0; // Default to state rate if county not found

    return new Response(JSON.stringify({
      state: "Florida", county: geo.address?.county || county, city,
      taxRate: rate, stateTax: 6.0, countySurtax: +(rate - 6).toFixed(1),
      note: `FL ${rate}% (6% state + ${+(rate-6).toFixed(1)}% ${geo.address?.county || county} surtax)`,
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, taxRate: 6.0, note: "Defaulting to FL 6% state rate" }), { status: 200, headers });
  }
}
