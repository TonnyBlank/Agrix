import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALL_COUNTIES_FILTER, CATEGORIES, MY_COUNTY_FILTER } from "./utils";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  countyFilter: string;
  onCountyFilterChange: (value: string) => void;
  availableCounties: string[];
  viewerCounty: string;
  filteredCount: number;
  totalCount: number;
  effectiveCountyFilter: string | null;
  isResolvingDistances: boolean;
};

export function MarketplaceFilters({
  search, onSearchChange,
  activeCategory, onCategoryChange,
  countyFilter, onCountyFilterChange,
  availableCounties, viewerCounty,
  filteredCount, totalCount,
  effectiveCountyFilter, isResolvingDistances,
}: Props) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-white/90 p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.2)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products, farmers, or county..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-12 rounded-2xl border-white/70 bg-white/80 pl-10 shadow-sm dark:border-white/10 dark:bg-card/90"
            />
          </div>

          <Select value={countyFilter} onValueChange={onCountyFilterChange}>
            <SelectTrigger className="h-12 rounded-2xl bg-white/80 shadow-sm dark:bg-card/90">
              <SelectValue placeholder="Choose county view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COUNTIES_FILTER}>All counties</SelectItem>
              {viewerCounty && (
                <SelectItem value={MY_COUNTY_FILTER}>My county ({viewerCounty})</SelectItem>
              )}
              {availableCounties.map((county) => (
                <SelectItem key={county} value={county}>{county}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => onCategoryChange(category)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                activeCategory === category
                  ? "bg-primary text-primary-foreground shadow-glow-emerald"
                  : "bg-white/80 text-muted-foreground ring-1 ring-border hover:bg-muted dark:bg-card/90 dark:hover:bg-muted/80"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{" "}
            <span className="font-semibold text-foreground">{totalCount}</span> listings
            {effectiveCountyFilter ? ` in ${effectiveCountyFilter}` : " across all counties"}.
          </p>
          <p>
            {viewerCounty
              ? isResolvingDistances
                ? "Calculating county distances..."
                : "Kilometre estimates are based on your location and seller county."
              : "Choose a county or set your own location to browse nearby produce faster."}
          </p>
        </div>
      </div>
    </section>
  );
}
