export const COUNTY_PICKUP_DISCLAIMER =
  "Delivery will be made through your county AgriLink office. Please claim your produce there after payment and official confirmation.";

export const DELIVERY_BASE_FEE_KES = 50;
export const DELIVERY_RATE_PER_KM_KES = 2.5;
export const DELIVERY_INTER_COUNTY_SURCHARGE_KES = 75;
export const DELIVERY_MIN_INTER_COUNTY_DISTANCE_KM = 5;
export const DELIVERY_FALLBACK_INTER_COUNTY_DISTANCE_KM = 60;
export const DELIVERY_MAX_FEE_KES = 2500;

export function normalizeCountyName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isSameCountyName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeCountyName(left);
  const normalizedRight = normalizeCountyName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export type DeliveryQuoteInput = {
  buyerCounty?: string | null;
  sellerCounty?: string | null;
  distanceKm?: number | null;
  pickupCounty?: string | null;
};

export type DeliveryQuote = {
  sameCounty: boolean;
  distanceKm: number;
  feeKes: number;
  baseFeeKes: number;
  ratePerKmKes: number;
  interCountySurchargeKes: number;
  pickupCounty: string | null;
  pickupOfficeLabel: string | null;
  disclaimer: string;
};

export function buildDeliveryQuote(input: DeliveryQuoteInput): DeliveryQuote {
  const sameCounty = isSameCountyName(input.buyerCounty, input.sellerCounty);
  const parsedDistance = Number(input.distanceKm);
  const hasDistance = Number.isFinite(parsedDistance) && parsedDistance >= 0;

  let distanceKm = hasDistance
    ? parsedDistance
    : sameCounty
      ? 0
      : DELIVERY_FALLBACK_INTER_COUNTY_DISTANCE_KM;

  distanceKm = Math.max(distanceKm, 0);

  let interCountySurchargeKes = 0;
  if (!sameCounty) {
    distanceKm = Math.max(distanceKm, DELIVERY_MIN_INTER_COUNTY_DISTANCE_KM);
    interCountySurchargeKes = DELIVERY_INTER_COUNTY_SURCHARGE_KES;
  }

  const feeKes = Math.min(
    DELIVERY_BASE_FEE_KES + interCountySurchargeKes + (distanceKm * DELIVERY_RATE_PER_KM_KES),
    DELIVERY_MAX_FEE_KES,
  );

  const pickupCounty = (input.pickupCounty || input.buyerCounty || input.sellerCounty || "").trim() || null;

  return {
    sameCounty,
    distanceKm: Number(distanceKm.toFixed(2)),
    feeKes: Number(feeKes.toFixed(2)),
    baseFeeKes: DELIVERY_BASE_FEE_KES,
    ratePerKmKes: DELIVERY_RATE_PER_KM_KES,
    interCountySurchargeKes,
    pickupCounty,
    pickupOfficeLabel: pickupCounty ? `${pickupCounty} AgriLink County Office` : null,
    disclaimer: COUNTY_PICKUP_DISCLAIMER,
  };
}

