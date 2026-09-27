// Parsed from "Mike Charlie Co. — Shipping Rate Matrix" (J&T Express / SPX Express only —
// Maxim rows intentionally excluded per Lois's instruction).
//
// Weight tiers are the same shape everywhere: 0–0.5kg, 0.5–3kg, 3–5kg.
// A few regions have a separate REMOTE rate for specific named areas.
//
// Structure: each entry is a shipping option a customer can pick as their region.
// `remoteOf` links a remote-area entry back to its non-remote counterpart's group,
// purely for organizing the dropdown (e.g. showing them together).

const SHIPPING_RATES = [
  // ---- MIMAROPA ----
  { id: "romblon", label: "Romblon", tiers: [110, 140, 170] },
  { id: "marinduque_mindoro", label: "Marinduque / Mindoro Occidental / Mindoro Oriental", tiers: [100, 130, 170] },
  { id: "palawan", label: "Palawan", tiers: [80, 110, 170] },

  // ---- WESTERN VISAYAS ----
  { id: "guimaras", label: "Guimaras", tiers: [110, 140, 170] },
  { id: "iloilo_capiz_antique_aklan", label: "Iloilo City / Iloilo Province / Capiz / Antique / Aklan", tiers: [90, 105, 120] },

  // ---- DAVAO ----
  { id: "davao", label: "Davao Region", tiers: [100, 130, 170] },

  // ---- BICOL ----
  { id: "bicol_non_remote", label: "Bicol — Albay, Camarines Norte, Camarines Sur, Catanduanes, Masbate, Sorsogon", tiers: [100, 130, 170] },
  { id: "bicol_remote", label: "Bicol (remote) — Mercedes, Caramoan, Claveria, San Fernando, San Jacinto, San Pascual, Monreal, Magallanes", tiers: [110, 140, 170] },

  // ---- NCR ----
  { id: "ncr", label: "NCR (Metro Manila)", tiers: [100, 125, 170] },

  // ---- CAGAYAN VALLEY ----
  { id: "cagayan_valley", label: "Cagayan / Isabela / Nueva Vizcaya / Quirino", tiers: [100, 130, 170] },

  // ---- CENTRAL VISAYAS ----
  { id: "central_visayas_non_remote", label: "Cebu City / Cebu Province / Bohol / Negros Oriental", tiers: [90, 105, 120] },
  { id: "central_visayas_remote", label: "Central Visayas (remote) — Santa Fe, Bantayan, Pilar, San Francisco, Tudela, Madridejos, Poro, Calape, Getafe, Pres. Carlos P. Garcia", tiers: [110, 140, 170] },

  // ---- CALABARZON ----
  { id: "calabarzon", label: "Cavite / Laguna / Batangas / Rizal / Quezon", tiers: [100, 130, 170] },

  // ---- SOCCSKSARGEN ----
  { id: "soccsksargen", label: "South Cotabato / Cotabato / Sultan Kudarat / Sarangani", tiers: [100, 130, 170] },

  // ---- CENTRAL LUZON ----
  { id: "central_luzon", label: "Aurora / Bataan / Bulacan / Nueva Ecija / Pampanga / Tarlac / Zambales", tiers: [100, 125, 170] },

  // ---- ARMM ----
  { id: "armm_lanao_maguindanao", label: "Lanao del Sur / Maguindanao", tiers: [100, 130, 170] },
  { id: "armm_basilan_sulu_tawitawi", label: "Basilan / Sulu / Tawi-Tawi", tiers: [110, 140, 170] },
];

// Weight tier boundaries shared by every region (in kg)
const WEIGHT_TIERS = [
  { max: 0.5, index: 0, label: "0–0.5kg" },
  { max: 3, index: 1, label: "0.5–3kg" },
  { max: 5, index: 2, label: "3–5kg" },
];

/**
 * Get the shipping fee for a given region id and total order weight (kg).
 * Returns null if the weight exceeds the table's top tier (5kg) — that's a
 * signal to flag the order for manual shipping quote rather than guess.
 */
function getShippingRate(regionId, totalWeightKg) {
  const region = SHIPPING_RATES.find(r => r.id === regionId);
  if (!region) return null;

  const tier = WEIGHT_TIERS.find(t => totalWeightKg <= t.max);
  if (!tier) return null; // over 5kg — needs manual quote

  return region.tiers[tier.index];
}
