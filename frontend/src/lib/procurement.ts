export const PROCUREMENT_REQUEST_STATUSES = ["open", "paused", "closed"] as const;
export type ProcurementRequestStatus = (typeof PROCUREMENT_REQUEST_STATUSES)[number];

export const PROCUREMENT_RESPONSE_STATUSES = ["submitted", "accepted", "rejected", "withdrawn"] as const;
export type ProcurementResponseStatus = (typeof PROCUREMENT_RESPONSE_STATUSES)[number];

export function formatProcurementStatusLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function procurementResponseBadgeClass(status: string) {
  switch (status) {
    case "accepted":
      return "bg-emerald-500/10 text-emerald-700";
    case "rejected":
      return "bg-rose-500/10 text-rose-700";
    case "withdrawn":
      return "bg-amber-500/10 text-amber-700";
    default:
      return "bg-slate-500/10 text-slate-700";
  }
}

export function procurementBudgetFitLabel(value: string | null | undefined) {
  if (value === "within_budget") return "Within budget";
  if (value === "over_budget") return "Over budget";
  if (value === "below_budget") return "Below budget";
  return "No budget limit";
}

export function procurementSignalLabel(value: string | null | undefined) {
  if (value === "best_value") return "Best value";
  if (value === "over_budget") return "Budget risk";
  if (value === "aggressive_pricing") return "Aggressive price";
  return "Market rate";
}
