// SPX / J&T standard shipping rates. Source: "SPX/JNT Shipping Rates" (Shipping_Rates.xlsx, Nov 2026),
// which replaces the older 3-tier matrix. International (free shipping) is not offered here.
//
// Each region has its own weight tiers: { max: upper bound in kg (inclusive), fee: PHP }.
// The last tier is open-ended (Infinity), so any weight gets a rate and nothing needs a manual quote.
// `lbc: true` marks regions where customers may also choose LBC (see LBC_TIERS below).

const SHIPPING_RATES = [
  { id: "ilocos_ilocos_norte", label: "Ilocos — Ilocos Norte, Ilocos Sur, La Union, Pangasinan",
    tiers: [{ max: 2.1, fee: 120 }, { max: 3.1, fee: 150 }, { max: 4.1, fee: 215 }, { max: 5, fee: 250 }, { max: 6, fee: 300 }, { max: Infinity, fee: 500 }] },
  { id: "iloilo_capiz_antique_aklan", label: "Iloilo City / Iloilo Province / Capiz / Antique / Aklan",
    tiers: [{ max: 0.5, fee: 90 }, { max: 3, fee: 105 }, { max: 5, fee: 120 }, { max: 6, fee: 450 }, { max: 7, fee: 515 }, { max: 8, fee: 580 }, { max: 9, fee: 650 }, { max: Infinity, fee: 720 }] },
  { id: "marinduque_mindoro", label: "Marinduque / Mindoro Occidental / Mindoro Oriental",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 440 }, { max: 7, fee: 515 }, { max: 8, fee: 585 }, { max: Infinity, fee: 660 }] },
  { id: "cordillera_abra", label: "Cordillera — Abra, Benguet, Ifugao, Kalinga",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 120 }, { max: 5, fee: 160 }, { max: 6, fee: 440 }, { max: 7, fee: 510 }, { max: Infinity, fee: 580 }] },
  { id: "central_visayas_non_remote", label: "Cebu City / Cebu Province / Bohol / Negros Oriental",
    tiers: [{ max: 0.5, fee: 90 }, { max: 3, fee: 105 }, { max: 5, fee: 120 }, { max: 6, fee: 450 }, { max: 7, fee: 515 }, { max: 8, fee: 580 }, { max: 9, fee: 650 }, { max: Infinity, fee: 720 }] },
  { id: "palawan", label: "Palawan", lbc: true,
    tiers: [{ max: 1, fee: 120 }, { max: 3, fee: 150 }, { max: 5, fee: 370 }, { max: 6, fee: 490 }, { max: 7, fee: 560 }, { max: Infinity, fee: 630 }] },
  { id: "cordillera_apayao_remote", label: "Cordillera (remote) — Apayao, Mountain Province",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: Infinity, fee: 590 }] },
  { id: "bicol_remote", label: "Bicol (remote) — Mercedes, Caramoan, Claveria, San Fernando, San Jacinto, San Pascual, Monreal, Magallanes",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: 8, fee: 590 }, { max: 9, fee: 650 }, { max: Infinity, fee: 720 }] },
  { id: "davao", label: "Davao Region",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 440 }, { max: 7, fee: 515 }, { max: 8, fee: 590 }, { max: Infinity, fee: 660 }] },
  { id: "calabarzon", label: "Cavite / Laguna / Batangas / Rizal / Quezon",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 440 }, { max: 7, fee: 510 }, { max: Infinity, fee: 580 }] },
  { id: "caraga_surigao_del_norte_remote", label: "Caraga (remote) — Surigao del Norte — Dapa, Del Carmen, San Benito, Santa Monica, Burgos, General Luna, Pilar, San Isidro, Socorro; Dinagat Islands",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: Infinity, fee: 590 }] },
  { id: "central_luzon", label: "Aurora / Bataan / Bulacan / Nueva Ecija / Pampanga / Tarlac / Zambales",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 125 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 515 }, { max: Infinity, fee: 580 }] },
  { id: "central_visayas_remote", label: "Central Visayas (remote) — Santa Fe, Bantayan, Pilar, San Francisco, Tudela, Madridejos, Poro, Calape, Getafe, Pres. Carlos P. Garcia",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 525 }, { max: Infinity, fee: 595 }] },
  { id: "armm_basilan_sulu_tawitawi", label: "Basilan / Sulu / Tawi-Tawi",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: Infinity, fee: 590 }] },
  { id: "guimaras", label: "Guimaras",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: Infinity, fee: 590 }] },
  { id: "bicol_non_remote", label: "Bicol — Albay, Camarines Norte, Camarines Sur, Catanduanes, Masbate, Sorsogon",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 445 }, { max: 7, fee: 515 }, { max: Infinity, fee: 590 }] },
  { id: "armm_lanao_maguindanao", label: "Lanao del Sur / Maguindanao",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 445 }, { max: 7, fee: 515 }, { max: Infinity, fee: 580 }] },
  { id: "eastern_visayas_biliran", label: "Eastern Visayas — Biliran, Leyte, Southern Leyte, Eastern Samar, Northern Samar, Western Samar",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 115 }, { max: 5, fee: 130 }, { max: 6, fee: 440 }, { max: 7, fee: 510 }, { max: Infinity, fee: 580 }] },
  { id: "zamboanga_peninsula_zamboanga_del_norte", label: "Zamboanga Peninsula — Zamboanga del Norte, Zamboanga del Sur, Zamboanga Sibugay",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 125 }, { max: 5, fee: 170 }, { max: 6, fee: 440 }, { max: 7, fee: 510 }, { max: Infinity, fee: 580 }] },
  { id: "northern_mindanao_bukidnon", label: "Northern Mindanao — Bukidnon, Lanao del Norte, Misamis Occidental, Misamis Oriental",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 140 }, { max: 4, fee: 215 }, { max: 5, fee: 240 }, { max: 6, fee: 255 }, { max: Infinity, fee: 350 }] },
  { id: "romblon", label: "Romblon",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: 8, fee: 590 }, { max: Infinity, fee: 680 }] },
  { id: "caraga_agusan_del_norte", label: "Caraga — Agusan del Norte, Agusan del Sur, Surigao del Norte, Surigao del Sur",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 120 }, { max: 5, fee: 160 }, { max: 6, fee: 440 }, { max: 7, fee: 510 }, { max: Infinity, fee: 580 }] },
  { id: "northern_mindanao_camiguin_remote", label: "Northern Mindanao (remote) — Camiguin",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 4, fee: 215 }, { max: 5, fee: 450 }, { max: 6, fee: 500 }, { max: Infinity, fee: 600 }] },
  { id: "cagayan_valley", label: "Cagayan / Isabela / Nueva Vizcaya / Quirino",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 445 }, { max: 7, fee: 515 }, { max: Infinity, fee: 580 }] },
  { id: "soccsksargen", label: "South Cotabato / Cotabato / Sultan Kudarat / Sarangani",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 130 }, { max: 5, fee: 170 }, { max: 6, fee: 445 }, { max: 7, fee: 515 }, { max: Infinity, fee: 580 }] },
  { id: "eastern_visayas_eastern_samar_remote", label: "Eastern Visayas (remote) — Eastern Samar — Arteche, Jipapad, San Policarpo; Northern Samar — Catubig, Gamay, Lapinig, Las Navas, Palapag",
    tiers: [{ max: 0.5, fee: 110 }, { max: 3, fee: 140 }, { max: 5, fee: 170 }, { max: 6, fee: 450 }, { max: 7, fee: 520 }, { max: Infinity, fee: 590 }] },
  { id: "ncr", label: "NCR (Metro Manila)",
    tiers: [{ max: 0.5, fee: 100 }, { max: 3, fee: 125 }, { max: 5, fee: 170 }, { max: 6, fee: 445 }, { max: 7, fee: 515 }, { max: Infinity, fee: 590 }] },
];

// Siquijor uses the same rates as Central Visayas (Cebu / Bohol / Negros Oriental).
SHIPPING_RATES.push({ id: "siquijor", label: "Siquijor",
  tiers: SHIPPING_RATES.find(r => r.id === "central_visayas_non_remote").tiers.map(t => ({ ...t })) });

// Region lists (checkout, saved addresses, admin) show in alphabetical order. Lookups use the id, so order does not affect rates.
SHIPPING_RATES.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

// Partner orders only: the box and paddings add weight to the final shipping weight.
// Added automatically; partners are not shown it.
//   product weight up to 3 kg  -> nothing added
//   over 3 kg, under 5 kg      -> +0.4 kg
//   5 kg and up                -> +0.7 kg
function partnerPackingKg(productWeightKg) {
  const w = Number(productWeightKg || 0);
  if (w >= 5) return 0.7;
  if (w > 3) return 0.4;
  return 0;
}

/**
 * Shipping fee for a region id and total order weight (kg). Returns null only if the region is unknown.
 */
function getShippingRate(regionId, totalWeightKg) {
  const region = SHIPPING_RATES.find(r => r.id === regionId);
  if (!region) return null;
  const w = Math.round(Number(totalWeightKg || 0) * 1000) / 1000;
  const tier = region.tiers.find(t => w <= t.max);
  return tier ? tier.fee : null;
}


/* LBC (Palawan only). Rates from Lois, Nov 2026. Priced on the product weight alone:
   the box and padding add-on (partnerPackingKg) is NOT added for LBC. Above 19 kg there is no listed rate (null),
   so the fee is typed in by hand on the invoice. */
const LBC_TIERS = [{ max: 1, fee: 240 }, { max: 3, fee: 290 }, { max: 5, fee: 500 }, { max: 10, fee: 770 }, { max: 19, fee: 1200 }];
function getLbcRate(productWeightKg) {
  const w = Math.round(Number(productWeightKg || 0) * 1000) / 1000;
  const t = LBC_TIERS.find(x => w <= x.max);
  return t ? t.fee : null;
}


/* Courier tracking pages. J&T and LBC always use the same page, so it is filled in automatically.
   SPX has a different link for every parcel: Lois pastes it in when she ships, and the SPX home page is only a fallback. */
const COURIER_TRACK = {
  spx: { name: 'SPX', page: 'https://spx.ph/', fixed: false },
  jnt: { name: 'J&T', page: 'https://www.jtexpress.ph/track-and-trace', fixed: true },
  lbc: { name: 'LBC', page: 'https://www.lbcexpress.com/track/', fixed: true }
};
function courierTrackUrl(type, link) {
  const c = COURIER_TRACK[type]; if (!c) return /^https?:\/\/\S+$/i.test(String(link || '').trim()) ? String(link).trim() : '';
  if (c.fixed) return c.page;
  return /^https?:\/\/\S+$/i.test(String(link || '').trim()) ? String(link).trim() : c.page;
}
