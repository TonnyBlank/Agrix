import type { Product } from "@/hooks/useProducts";
import { normalizeLocationName } from "@/lib/locationDistance";

export const CATEGORIES = ["All", "Vegetables", "Fruits", "Grains", "Dairy", "Poultry", "Herbs"] as const;
export const ALL_COUNTIES_FILTER = "__all_counties__";
export const MY_COUNTY_FILTER = "__my_county__";

export function getProductCounty(product: Product) {
  return product.location || product.profiles?.county || null;
}

export function isSameCounty(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = normalizeLocationName(left);
  const b = normalizeLocationName(right);
  return Boolean(a && b && a === b);
}
