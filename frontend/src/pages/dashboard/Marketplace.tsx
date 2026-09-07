import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, MapPin, MessageCircle, PackageCheck, ShoppingCart, Sprout, Star, Video } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useMarketplaceProducts, type Product } from "@/hooks/useProducts";
import { useOrders } from "@/hooks/useOrders";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { formatApproxDistance, getApproxDistanceKm, normalizeLocationName } from "@/lib/locationDistance";
import { buildDeliveryQuote } from "@/lib/deliveryPricing";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CartSummary } from "@/components/marketplace/CartSummary";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { ProductCard } from "@/components/marketplace/ProductCard";
import {
  ALL_COUNTIES_FILTER, MY_COUNTY_FILTER,
  getProductCounty, isSameCounty,
} from "@/components/marketplace/utils";

export default function Marketplace() {
  const { products, loading, toggleLike, rateProduct } = useMarketplaceProducts();
  const { placeOrder } = useOrders();
  const { addItem, totals: cartTotals } = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [countyFilter, setCountyFilter] = useState(ALL_COUNTIES_FILTER);
  const [hasChosenCountyFilter, setHasChosenCountyFilter] = useState(false);
  const [distanceByCounty, setDistanceByCounty] = useState<Record<string, number | null>>({});
  const [isResolvingDistances, setIsResolvingDistances] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const viewerCounty = profile?.county?.trim() || "";
  const viewerSubCounty = typeof window !== "undefined" ? window.localStorage.getItem("farm_sub_county") || "" : "";
  const viewerLocation = [viewerSubCounty, viewerCounty].filter(Boolean).join(", ");

  const availableCounties = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => getProductCounty(product)?.trim())
          .filter((county): county is string => Boolean(county)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [products]);

  const effectiveCountyFilter = useMemo(() => {
    if (countyFilter === MY_COUNTY_FILTER) {
      return viewerCounty || null;
    }

    if (countyFilter === ALL_COUNTIES_FILTER) {
      return null;
    }

    return countyFilter;
  }, [countyFilter, viewerCounty]);

  const filtered = useMemo(() => {
    const normalizedCountyFilter = normalizeLocationName(effectiveCountyFilter);

    return products
      .filter((product) => {
        const productCounty = getProductCounty(product);
        const matchSearch =
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          (product.profiles?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (productCounty || "").toLowerCase().includes(search.toLowerCase());
        const matchCategory = activeCategory === "All" || product.category === activeCategory;
        const matchCounty = !normalizedCountyFilter || normalizeLocationName(productCounty) === normalizedCountyFilter;
        return matchSearch && matchCategory && matchCounty;
      })
      .sort((left, right) => {
        const leftCounty = getProductCounty(left);
        const rightCounty = getProductCounty(right);

        if (viewerCounty) {
          const sameCountyRank = Number(isSameCounty(rightCounty, viewerCounty)) - Number(isSameCounty(leftCounty, viewerCounty));
          if (sameCountyRank !== 0) {
            return sameCountyRank;
          }

          const leftDistance = leftCounty ? distanceByCounty[normalizeLocationName(leftCounty)] ?? null : null;
          const rightDistance = rightCounty ? distanceByCounty[normalizeLocationName(rightCounty)] ?? null : null;

          if (leftDistance !== null && rightDistance !== null && leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }

          if (leftDistance !== null && rightDistance === null) {
            return -1;
          }

          if (leftDistance === null && rightDistance !== null) {
            return 1;
          }
        }

        const videoRank = Number(Boolean(right.video_url)) - Number(Boolean(left.video_url));
        if (videoRank !== 0) return videoRank;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }, [activeCategory, distanceByCounty, effectiveCountyFilter, products, search, viewerCounty]);

  const highlights = useMemo(() => {
    const nearbyListings = viewerCounty ? products.filter((product) => isSameCounty(getProductCounty(product), viewerCounty)).length : 0;
    const distanceValues = products
      .map((product) => {
        const county = getProductCounty(product);
        return county ? distanceByCounty[normalizeLocationName(county)] ?? null : null;
      })
      .filter((distance): distance is number => distance !== null);

    return {
      nearbyListings,
      counties: availableCounties.length,
      withVideo: products.filter((product) => Boolean(product.video_url)).length,
      closestDistance: distanceValues.length ? Math.min(...distanceValues) : null,
    };
  }, [availableCounties.length, distanceByCounty, products, viewerCounty]);

  const syncedSelectedProduct = useMemo(() => {
    if (!selectedProduct) return null;
    return products.find((product) => product.id === selectedProduct.id) ?? selectedProduct;
  }, [products, selectedProduct]);
  const selectedProductId = selectedProduct?.id ?? null;

  useEffect(() => {
    if (!hasChosenCountyFilter && viewerCounty) {
      setCountyFilter(MY_COUNTY_FILTER);
    }
  }, [hasChosenCountyFilter, viewerCounty]);

  useEffect(() => {
    if (!viewerCounty && countyFilter === MY_COUNTY_FILTER) {
      setCountyFilter(ALL_COUNTIES_FILTER);
    }
  }, [countyFilter, viewerCounty]);

  useEffect(() => {
    if (!selectedProduct) return;
    const nextSelected = products.find((product) => product.id === selectedProduct.id);
    if (nextSelected) {
      setSelectedProduct(nextSelected);
    }
  }, [products, selectedProduct]);

  useEffect(() => {
    if (!selectedProductId) return;
    setQuantity("1");
  }, [selectedProductId]);

  useEffect(() => {
    let cancelled = false;

    const loadDistances = async () => {
      if (!viewerLocation || !availableCounties.length) {
        setDistanceByCounty({});
        setIsResolvingDistances(false);
        return;
      }

      setIsResolvingDistances(true);
      const entries = await Promise.all(
        availableCounties.map(async (county) => [normalizeLocationName(county), await getApproxDistanceKm(viewerLocation, county)] as const),
      );

      if (cancelled) {
        return;
      }

      setDistanceByCounty(
        entries.reduce<Record<string, number | null>>((accumulator, [countyKey, distance]) => {
          accumulator[countyKey] = distance;
          return accumulator;
        }, {}),
      );
      setIsResolvingDistances(false);
    };

    void loadDistances();

    return () => {
      cancelled = true;
    };
  }, [availableCounties, viewerLocation]);

  const getProductDistanceLabel = (product: Product) => {
    const productCounty = getProductCounty(product);

    if (!viewerCounty || !productCounty) {
      return null;
    }

    if (isSameCounty(productCounty, viewerCounty)) {
      return "In your county";
    }

    return formatApproxDistance(distanceByCounty[normalizeLocationName(productCounty)] ?? null);
  };

  const parsedQuantity = Math.max(1, Number(quantity) || 1);
  const selectedProductQuote = useMemo(() => {
    if (!syncedSelectedProduct) return null;
    const productCounty = getProductCounty(syncedSelectedProduct);
    const distanceKey = productCounty ? normalizeLocationName(productCounty) : "";
    return buildDeliveryQuote({
      buyerCounty: viewerCounty || null,
      sellerCounty: productCounty || null,
      distanceKm: distanceKey ? distanceByCounty[distanceKey] ?? null : null,
    });
  }, [syncedSelectedProduct, viewerCounty, distanceByCounty]);
  const total = syncedSelectedProduct
    ? syncedSelectedProduct.price_per_unit * parsedQuantity + Number(selectedProductQuote?.feeKes || 0)
    : 0;
  const ratingChoices = [1, 2, 3, 4, 5];
  const selectedProductDistance = syncedSelectedProduct ? getProductDistanceLabel(syncedSelectedProduct) : null;

  const handleBuy = async () => {
    if (!syncedSelectedProduct) return;
    if (!user) {
      toast.error("Please sign in before placing an order.");
      return;
    }
    if (parsedQuantity > syncedSelectedProduct.stock) {
      toast.error(`Only ${syncedSelectedProduct.stock} ${syncedSelectedProduct.unit} available for this product.`);
      return;
    }
    setIsCheckingOut(true);
    const createdOrder = await placeOrder({
      product_id: syncedSelectedProduct.id,
      quantity: parsedQuantity,
      unit: syncedSelectedProduct.unit,
      delivery_distance_km: selectedProductQuote?.distanceKm,
      pickup_county: selectedProductQuote?.pickupCounty || viewerCounty || undefined,
    });

    if (createdOrder) {
      toast.success("Order created. Pay securely with M-Pesa next.");
      setSelectedProduct(null);
      setQuantity("1");
      void navigate("/dashboard/orders", { replace: false });
    }
    setIsCheckingOut(false);
  };

  const handleAddToCart = async (product: Product, quantityToAdd: number) => {
    if (!user) {
      toast.error("Please sign in before adding items to cart.");
      return false;
    }

    if (quantityToAdd <= 0) {
      toast.error("Quantity must be greater than 0.");
      return false;
    }

    if (!product.is_available || Number(product.stock) <= 0) {
      toast.error("This product is not currently available.");
      return false;
    }

    if (quantityToAdd > Number(product.stock)) {
      toast.error(`Only ${product.stock} ${product.unit} available for this product.`);
      return false;
    }

    setIsAddingToCart(true);
    const added = await addItem({
      product_id: product.id,
      quantity: quantityToAdd,
      unit: product.unit,
    });
    setIsAddingToCart(false);

    if (added) {
      toast.success("Item added to cart.");
      return true;
    }

    return false;
  };

  return (
    <DashboardShell title="Marketplace">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.99))] p-6 shadow-[0_20px_50px_-28px_rgba(16,185,129,0.38)] dark:border-emerald-500/20 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),linear-gradient(135deg,rgba(10,24,18,0.96),rgba(15,23,42,0.98))] sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Sprout className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.2em]">Location-Aware Marketplace</span>
              </div>
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
                  Shop agricultural products near you
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {viewerCounty
                    ? `Marketplace is using ${viewerLocation || viewerCounty} to show nearby sellers first and estimate delivery costs.`
                    : "Set your county in My Farm to see nearby sellers first and compare delivery costs faster."}
                </p>
                </div>
              </div>
              <CartSummary itemCount={cartTotals.itemCount} total={cartTotals.total} />
            </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/80 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-background/60">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <MapPin className="h-4 w-4" />
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Viewing From</p>
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-foreground">{viewerCounty || "All Kenya"}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {viewerCounty ? "Nearby listings are ranked higher for you." : "Add your county to unlock local-first browsing."}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/80 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-background/60">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <PackageCheck className="h-4 w-4" />
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Nearby Listings</p>
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-foreground">{viewerCounty ? highlights.nearbyListings : filtered.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {viewerCounty ? `Products currently listed in ${viewerCounty}.` : "Products currently visible in the marketplace."}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/80 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-background/60">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Video className="h-4 w-4" />
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Seller Reach</p>
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-foreground">{highlights.counties}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {viewerCounty && highlights.nearbyListings > 0
                  ? "Sellers are already available in your county."
                  : viewerCounty && highlights.closestDistance !== null
                  ? `${formatApproxDistance(highlights.closestDistance) || "Distance ready"} from the closest seller county.`
                  : `${highlights.withVideo} listings include real product video.`}
              </p>
            </div>
          </div>
        </section>

        <MarketplaceFilters
          search={search}
          onSearchChange={setSearch}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          countyFilter={countyFilter}
          onCountyFilterChange={(value) => {
            setHasChosenCountyFilter(true);
            setCountyFilter(value);
          }}
          availableCounties={availableCounties}
          viewerCounty={viewerCounty}
          filteredCount={filtered.length}
          totalCount={products.length}
          effectiveCountyFilter={effectiveCountyFilter}
          isResolvingDistances={isResolvingDistances}
        />

        {loading ? (
          <div className="bento-card text-sm text-muted-foreground">Loading marketplace products...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                distanceLabel={getProductDistanceLabel(product)}
                onOpen={setSelectedProduct}
                onToggleLike={(id) => void toggleLike(id)}
                onQuickAdd={(p, qty) => void handleAddToCart(p, qty)}
              />
            ))}

            {!filtered.length && (
              <div className="col-span-full rounded-[2rem] border border-dashed border-border bg-white/75 py-16 text-center shadow-sm dark:bg-card/80">
                <PackageCheck className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <h3 className="font-display text-xl font-bold text-foreground">No products match that view</h3>
                <p className="mt-2 text-sm text-muted-foreground">Try a different category, county, or seller name.</p>
                <p className="mt-1 text-xs text-muted-foreground">You can switch between all counties, your county, or one county from the filter above.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[2rem] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-center text-2xl">{syncedSelectedProduct?.name}</DialogTitle>
            <DialogDescription className="text-center">
              Choose quantity, add to cart, or buy now from {syncedSelectedProduct?.profiles?.full_name || "the seller"}.
            </DialogDescription>
          </DialogHeader>

          {syncedSelectedProduct && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                {syncedSelectedProduct.video_url ? (
                  <div className="mx-auto max-w-lg overflow-hidden rounded-[1.75rem] border border-border bg-slate-950 shadow-lg">
                    <video src={syncedSelectedProduct.video_url} controls className="aspect-video max-h-[240px] w-full object-contain" />
                  </div>
                ) : syncedSelectedProduct.cover_image_url ? (
                  <div className="mx-auto max-w-lg overflow-hidden rounded-[1.75rem] border border-border bg-white shadow-lg dark:bg-card dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]">
                    <img
                      src={syncedSelectedProduct.cover_image_url}
                      alt={syncedSelectedProduct.name}
                      className="aspect-video max-h-[240px] w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-[1.75rem] border border-border bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_42%),linear-gradient(135deg,rgba(236,253,245,1),rgba(255,255,255,0.92))] text-5xl font-semibold text-primary">
                    {syncedSelectedProduct.image_emoji || "Farm"}
                  </div>
                )}

                <div className="rounded-[1.5rem] border border-border bg-muted/40 p-4">
                  <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground dark:bg-background/70">{syncedSelectedProduct.category}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground dark:bg-background/70">
                      {syncedSelectedProduct.stock} {syncedSelectedProduct.unit} available
                    </span>
                    {syncedSelectedProduct.is_organic && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Organic</span>
                    )}
                    {selectedProductDistance && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {selectedProductDistance}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {syncedSelectedProduct.description || "This seller has not added a description yet, but you can message them directly before ordering."}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.75rem] border border-border bg-white p-5 shadow-sm dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Seller</p>
                      <p className="font-display text-xl font-bold text-foreground">{syncedSelectedProduct.profiles?.full_name || "Farmer"}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                      <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-muted/35 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Heart className={`h-4 w-4 ${syncedSelectedProduct.liked_by_me ? "fill-rose-500 text-rose-500" : ""}`} />
                        <span>{syncedSelectedProduct.likes_count} likes</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span>{syncedSelectedProduct.average_rating ? syncedSelectedProduct.average_rating.toFixed(1) : "New"}</span>
                        <span>({syncedSelectedProduct.ratings_count} ratings)</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => void toggleLike(syncedSelectedProduct.id)}
                      >
                        <Heart className={`mr-2 h-4 w-4 ${syncedSelectedProduct.liked_by_me ? "fill-rose-500 text-rose-500" : ""}`} />
                        {syncedSelectedProduct.liked_by_me ? "Liked" : "Like"}
                      </Button>
                      <div className="flex items-center gap-1">
                        {ratingChoices.map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => void rateProduct(syncedSelectedProduct.id, rating)}
                            className="rounded-full p-1 transition-transform hover:scale-110"
                            aria-label={`Rate ${rating} stars`}
                          >
                            <Star
                              className={`h-5 w-5 ${
                                (syncedSelectedProduct.my_rating ?? 0) >= rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium text-foreground">{getProductCounty(syncedSelectedProduct) || "Unknown county"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Distance from you</span>
                      <span className="font-medium text-foreground">
                        {viewerCounty
                          ? selectedProductDistance || (isResolvingDistances ? "Calculating..." : "Distance unavailable")
                          : "Add your county in My Farm"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Unit price</span>
                      <span className="font-medium text-foreground">KES {syncedSelectedProduct.price_per_unit}</span>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        max={syncedSelectedProduct.stock}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="rounded-xl"
                      />
                      <p className="text-xs text-muted-foreground">
                        Available stock: {syncedSelectedProduct.stock} {syncedSelectedProduct.unit}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Delivery</span>
                      <span className="font-medium text-foreground">KES {Number(selectedProductQuote?.feeKes || 0).toLocaleString()}</span>
                    </div>
                    {selectedProductQuote?.pickupOfficeLabel ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pickup office</span>
                        <span className="text-right font-medium text-foreground">{selectedProductQuote.pickupOfficeLabel}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Payment</span>
                      <span className="font-medium text-foreground">M-Pesa</span>
                    </div>
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between text-lg font-bold">
                        <span>Total</span>
                        <span className="text-primary">KES {total}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.95))] p-5 shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.28),rgba(15,23,42,0.94))]">
                    <div className="flex items-start gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80 dark:text-emerald-300/80">Safe checkout</p>
                        <h4 className="font-display text-xl font-bold text-foreground">Pay safely, then confirm delivery</h4>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Add to cart like a normal marketplace, or buy this item now. Your payment stays in AgriLink escrow until delivery is confirmed.
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 rounded-[1.25rem] border border-emerald-200/70 bg-white/85 px-4 py-3 text-sm text-muted-foreground dark:border-emerald-500/20 dark:bg-background/60">
                      Pickup is handled through the AgriLink county office flow shown at checkout.
                    </div>
                  </div>

                  <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                      variant="outline"
                      onClick={() => syncedSelectedProduct && void handleAddToCart(syncedSelectedProduct, parsedQuantity)}
                      disabled={isAddingToCart || !syncedSelectedProduct.is_available || Number(syncedSelectedProduct.stock) <= 0}
                      className="h-12 w-full rounded-xl"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {isAddingToCart ? "Adding to Cart..." : "Add to Cart"}
                    </Button>
                    <Button
                      onClick={() => void handleBuy()}
                      disabled={isCheckingOut || !syncedSelectedProduct.is_available || Number(syncedSelectedProduct.stock) <= 0}
                      className="h-12 w-full rounded-xl"
                    >
                      {isCheckingOut ? "Creating Order..." : "Buy Now"}
                    </Button>
                    <Button asChild variant="ghost" className="h-11 w-full rounded-xl">
                      <Link to="/dashboard/messages">
                        <MessageCircle className="mr-2 h-4 w-4" /> Message Seller
                      </Link>
                    </Button>
                  </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
