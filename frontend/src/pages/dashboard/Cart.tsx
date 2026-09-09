import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoaderCircle, ShieldCheck, ShoppingBag, ShoppingCart, Store, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import MpesaPaymentDialog from "@/components/dashboard/MpesaPaymentDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartItem } from "@/hooks/useCart";
import { apiFetch } from "@/lib/api";
import { getApproxDistanceKm, normalizeLocationName } from "@/lib/locationDistance";
import { buildDeliveryQuote } from "@/lib/deliveryPricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CheckoutOrder = {
  id: string;
  product_id: string;
  total_price: number;
  delivery_fee: number;
};

function canCheckout(item: CartItem) {
  if (!item.product) return false;
  if (!item.product.is_available) return false;
  return Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.product.stock);
}

function formatDistanceLabel(distanceKm: number, sameCounty: boolean) {
  if (sameCounty) return "Same county";
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export default function Cart() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { items, loading, updateItem, removeItem } = useCart();

  const [quantityByItemId, setQuantityByItemId] = useState<Record<string, string>>({});
  const [selectedByItemId, setSelectedByItemId] = useState<Record<string, boolean>>({});
  const [distanceByCounty, setDistanceByCounty] = useState<Record<string, number | null>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [isBulkSelecting, setIsBulkSelecting] = useState(false);
  const [isCheckingOutSelected, setIsCheckingOutSelected] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const buyerCounty = profile?.county?.trim() || "";
  const buyerSubCounty = typeof window !== "undefined" ? window.localStorage.getItem("farm_sub_county") || "" : "";
  const buyerLocation = [buyerSubCounty, buyerCounty].filter(Boolean).join(", ");

  const sellerCounties = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => item.farmer_profile?.county?.trim())
            .filter((county): county is string => Boolean(county)),
        ),
      ),
    [items],
  );

  useEffect(() => {
    setQuantityByItemId((current) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        next[item.id] = current[item.id] ?? String(item.quantity);
      }
      return next;
    });

    setSelectedByItemId((current) => {
      const next: Record<string, boolean> = {};
      for (const item of items) {
        next[item.id] = current[item.id] ?? item.selected_for_checkout !== false;
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (paymentPhone.trim()) return;
    const defaultPhone = profile?.phone?.trim() || profile?.payout_mpesa_number?.trim();
    if (defaultPhone) setPaymentPhone(defaultPhone);
  }, [paymentPhone, profile?.phone, profile?.payout_mpesa_number]);

  useEffect(() => {
    let cancelled = false;

    const loadDistances = async () => {
      if (!buyerLocation || !sellerCounties.length) {
        setDistanceByCounty({});
        return;
      }

      const entries = await Promise.all(
        sellerCounties.map(async (county) => {
          const distance = await getApproxDistanceKm(buyerLocation, county);
          return [normalizeLocationName(county), distance] as const;
        }),
      );

      if (cancelled) return;

      setDistanceByCounty(
        entries.reduce<Record<string, number | null>>((accumulator, [key, distance]) => {
          accumulator[key] = distance;
          return accumulator;
        }, {}),
      );
    };

    void loadDistances();

    return () => {
      cancelled = true;
    };
  }, [buyerLocation, sellerCounties]);

  const checkoutableItems = useMemo(() => items.filter((item) => canCheckout(item)), [items]);

  const deliveryQuoteByItemId = useMemo(() => {
    const quoteById: Record<string, ReturnType<typeof buildDeliveryQuote>> = {};

    for (const item of items) {
      const sellerCounty = item.farmer_profile?.county || null;
      const distanceKey = sellerCounty ? normalizeLocationName(sellerCounty) : "";
      quoteById[item.id] = buildDeliveryQuote({
        buyerCounty: buyerCounty || null,
        sellerCounty,
        distanceKm: distanceKey ? distanceByCounty[distanceKey] ?? null : null,
      });
    }

    return quoteById;
  }, [items, buyerCounty, distanceByCounty]);

  const selectedCheckoutableItems = useMemo(
    () => checkoutableItems.filter((item) => selectedByItemId[item.id]),
    [checkoutableItems, selectedByItemId],
  );

  const selectedSummary = useMemo(() => {
    const subtotal = selectedCheckoutableItems.reduce((sum, item) => {
      const unitPrice = Number(item.product?.price_per_unit || 0);
      return sum + unitPrice * Number(item.quantity || 0);
    }, 0);
    const deliveryTotal = selectedCheckoutableItems.reduce(
      (sum, item) => sum + Number(deliveryQuoteByItemId[item.id]?.feeKes || 0),
      0,
    );

    return {
      subtotal,
      deliveryTotal,
      total: subtotal + deliveryTotal,
    };
  }, [selectedCheckoutableItems, deliveryQuoteByItemId]);

  const allReadySelected = checkoutableItems.length > 0 && checkoutableItems.every((item) => selectedByItemId[item.id]);

  const setItemSelected = async (item: CartItem, selected: boolean) => {
    setSelectedByItemId((current) => ({ ...current, [item.id]: selected }));

    const updated = await updateItem(item.id, { selected_for_checkout: selected });
    if (!updated) {
      setSelectedByItemId((current) => ({ ...current, [item.id]: !selected }));
      return;
    }
  };

  const toggleSelectAllReady = async () => {
    if (!checkoutableItems.length) return;

    const nextSelected = !allReadySelected;
    setIsBulkSelecting(true);
    setSelectedByItemId((current) => {
      const next = { ...current };
      for (const item of checkoutableItems) {
        next[item.id] = nextSelected;
      }
      return next;
    });

    for (const item of checkoutableItems) {
      const currentSelected = Boolean(selectedByItemId[item.id]);
      if (currentSelected === nextSelected) continue;
      await updateItem(item.id, { selected_for_checkout: nextSelected });
    }

    setIsBulkSelecting(false);
  };

  const saveQuantity = async (item: CartItem) => {
    const raw = quantityByItemId[item.id] ?? String(item.quantity);
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }

    if (item.product && parsed > Number(item.product.stock)) {
      toast.error(`Only ${item.product.stock} ${item.product.unit} available right now.`);
      return;
    }

    if (parsed === Number(item.quantity)) {
      return;
    }

    setBusyItemId(item.id);
    const updated = await updateItem(item.id, { quantity: parsed });
    if (updated) {
      toast.success("Cart quantity updated.");
    }
    setBusyItemId(null);
  };

  const removeCartItem = async (itemId: string) => {
    setBusyItemId(itemId);
    const removed = await removeItem(itemId);
    if (removed) {
      toast.success("Item removed from cart.");
    }
    setBusyItemId(null);
  };

  const checkoutItem = async (item: CartItem): Promise<CheckoutOrder | null> => {
    if (!item.product) {
      toast.error("This item can no longer be checked out because the product is unavailable.");
      return null;
    }

    if (!canCheckout(item)) {
      toast.error("This item cannot be checked out. Please adjust quantity or remove it.");
      return null;
    }

    if (!selectedByItemId[item.id]) {
      toast.error("Mark this item first before checkout.");
      return null;
    }

    const deliveryQuote = deliveryQuoteByItemId[item.id];

    try {
      const createdOrder = await apiFetch<CheckoutOrder>("/orders", {
        method: "POST",
        body: {
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit: item.unit || item.product.unit,
          delivery_distance_km: deliveryQuote.distanceKm,
          pickup_county: deliveryQuote.pickupCounty,
          notes: item.notes,
        } as unknown as BodyInit,
      });

      const removed = await removeItem(item.id);
      if (!removed) {
        toast.error("Order created, but cart cleanup failed. Remove that cart item manually to avoid duplicate checkout.");
      }
      return createdOrder;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create order from cart item.");
      return null;
    }
  };

  const verifyStartedPayments = async (orders: CheckoutOrder[]) => {
    await new Promise((resolve) => window.setTimeout(resolve, 10_000));

    const results = await Promise.allSettled(
      orders.map((order) =>
        apiFetch<{ payment_status: string }>(`/payments/orders/${order.id}/mpesa-status`),
      ),
    );
    const paidCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.payment_status === "paid",
    ).length;

    if (paidCount) {
      toast.success(`${paidCount} checkout payment${paidCount === 1 ? "" : "s"} confirmed.`);
    }
  };

  const checkoutAndPaySelectedItems = async () => {
    if (!selectedCheckoutableItems.length) {
      toast.error("Select at least one ready item before checkout.");
      return;
    }

    setIsCheckingOutSelected(true);
    let failureCount = 0;
    const createdOrders: CheckoutOrder[] = [];

    for (const item of selectedCheckoutableItems) {
      const createdOrder = await checkoutItem(item);
      if (createdOrder) {
        createdOrders.push(createdOrder);
      } else {
        failureCount += 1;
      }
    }

    const paymentResults = await Promise.allSettled(
      createdOrders.map((order) =>
        apiFetch<{ message: string }>(`/payments/orders/${order.id}/mpesa`, {
          method: "POST",
          body: { phoneNumber: paymentPhone },
        }),
      ),
    );
    const paymentStartedOrders = createdOrders.filter(
      (_, index) => paymentResults[index]?.status === "fulfilled",
    );
    const paymentFailureCount = createdOrders.length - paymentStartedOrders.length;

    setIsCheckingOutSelected(false);
    setPaymentDialogOpen(false);

    if (paymentStartedOrders.length) {
      toast.success(
        `${paymentStartedOrders.length} M-Pesa prompt${paymentStartedOrders.length === 1 ? "" : "s"} sent. Approve the prompt${paymentStartedOrders.length === 1 ? "" : "s"} on your phone.`,
      );
      void verifyStartedPayments(paymentStartedOrders);
      void navigate("/dashboard/orders");
    }

    if (failureCount) {
      toast.error(`${failureCount} item${failureCount === 1 ? "" : "s"} could not be checked out.`);
    }

    if (paymentFailureCount) {
      const message = `${paymentFailureCount} order${paymentFailureCount === 1 ? "" : "s"} was created but no M-Pesa prompt could be sent. Cancel the unpaid order from Orders, then add the product to Cart to try again.`;
      setCheckoutError(message);
      toast.error(message);
    }
  };

  return (
    <DashboardShell title="Cart">
      <div className="space-y-6">
        <section className="rounded-[1.6rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.95))] p-5 shadow-[0_18px_34px_-24px_rgba(16,185,129,0.32)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80">Marketplace Cart</p>
              <h2 className="font-display text-2xl font-bold text-foreground">Review your cart and checkout in one simple flow</h2>
              <p className="text-sm text-muted-foreground">Select the items you want, confirm the total, and complete M-Pesa checkout here.</p>
            </div>
            <div className="grid w-full max-w-md grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Items</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">{items.length}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Selected</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">{selectedCheckoutableItems.length}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Subtotal</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">KES {selectedSummary.subtotal.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Total</p>
                <p className="mt-1 font-display text-xl font-bold text-primary">KES {selectedSummary.total.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.2rem] border border-emerald-200/70 bg-emerald-50/70 p-4 shadow-[0_16px_28px_-24px_rgba(16,185,129,0.24)]">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-foreground">Secure checkout</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                You pay into AgriLink escrow. The seller is paid only after delivery is confirmed. Pickup happens through your AgriLink county office.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-border/70 bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.2)] dark:bg-card/90">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {selectedCheckoutableItems.length} selected of {checkoutableItems.length} checkout-ready item{checkoutableItems.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">Unavailable items are flagged. Ready items can be checked out together.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/dashboard/marketplace">
                  <Store className="mr-2 h-4 w-4" /> Continue Shopping
                </Link>
              </Button>
              <Button variant="outline" className="rounded-xl" disabled={!checkoutableItems.length || isBulkSelecting} onClick={() => void toggleSelectAllReady()}>
                {isBulkSelecting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                {allReadySelected ? "Clear Selection" : "Select All"}
              </Button>
              <Button
                className="rounded-xl"
                disabled={!selectedCheckoutableItems.length || isCheckingOutSelected}
                onClick={() => {
                  setCheckoutError(null);
                  setPaymentDialogOpen(true);
                }}
              >
                {isCheckingOutSelected ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingBag className="mr-2 h-4 w-4" />}
                Checkout & Pay
              </Button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[1.4rem] border border-border bg-white/85 p-6 text-sm text-muted-foreground dark:bg-card/90">Loading your cart...</div>
        ) : !items.length ? (
          <div className="rounded-[1.6rem] border border-dashed border-border bg-white/85 py-16 text-center dark:bg-card/90">
            <ShoppingCart className="mx-auto mb-3 h-11 w-11 text-muted-foreground" />
            <h3 className="font-display text-xl font-bold text-foreground">Your cart is empty</h3>
            <p className="mt-2 text-sm text-muted-foreground">Add products from marketplace and they will appear here.</p>
            <Button asChild className="mt-5 rounded-xl">
              <Link to="/dashboard/marketplace">Browse Marketplace</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => {
              const product = item.product;
              const unavailableReason = !product
                ? "Product no longer exists."
                : !product.is_available
                  ? "Product is not currently available."
                  : Number(item.quantity) > Number(product.stock)
                    ? `Quantity exceeds stock (${product.stock} ${product.unit}).`
                    : null;

              const itemBusy = busyItemId === item.id;
              const lineTotal = Number(product?.price_per_unit || 0) * Number(item.quantity || 0);
              const deliveryQuote = deliveryQuoteByItemId[item.id];
              const lineTotalWithDelivery = lineTotal + Number(deliveryQuote?.feeKes || 0);

              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`rounded-[1.3rem] border p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.2)] dark:bg-card/90 ${
                    selectedByItemId[item.id] && canCheckout(item)
                      ? "border-emerald-300 bg-emerald-50/45"
                      : "border-border/70 bg-white/90"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <label className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={Boolean(selectedByItemId[item.id])}
                          disabled={!canCheckout(item) || itemBusy}
                          onChange={(event) => void setItemSelected(item, event.target.checked)}
                        />
                      </label>

                      {product?.cover_image_url ? (
                        <img src={product.cover_image_url} alt={product.name} className="h-20 w-20 rounded-2xl border border-border/70 object-cover" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/70 bg-muted text-2xl">
                          {product?.image_emoji || "Farm"}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-display text-lg font-bold text-foreground">{product?.name || "Unavailable product"}</h3>
                          <Badge variant="outline" className="rounded-full text-[10px]">{product?.category || "Marketplace"}</Badge>
                          {unavailableReason ? (
                            <Badge variant="outline" className="rounded-full border-destructive/40 text-[10px] text-destructive">Needs attention</Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-full border-emerald-300 text-[10px] text-emerald-700">Ready</Badge>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Seller: {item.farmer_profile?.full_name || "Farmer"}
                          {item.farmer_profile?.county ? ` • ${item.farmer_profile.county}` : ""}
                        </p>

                        <p className="mt-2 text-xs text-muted-foreground">
                          Unit price: KES {Number(product?.price_per_unit || 0).toLocaleString()} • Stock: {product?.stock ?? 0} {product?.unit || item.unit}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Delivery estimate: KES {Number(deliveryQuote?.feeKes || 0).toLocaleString()} • {deliveryQuote ? formatDistanceLabel(deliveryQuote.distanceKm, deliveryQuote.sameCounty) : "Distance pending"}
                        </p>

                        {deliveryQuote?.pickupOfficeLabel ? (
                          <p className="mt-1 text-xs text-muted-foreground">Pickup office: {deliveryQuote.pickupOfficeLabel}</p>
                        ) : null}

                        {unavailableReason ? <p className="mt-2 text-xs font-medium text-destructive">{unavailableReason}</p> : null}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[150px_auto_auto] sm:items-end">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quantity</p>
                        <Input
                          type="number"
                          min="1"
                          value={quantityByItemId[item.id] ?? String(item.quantity)}
                          onChange={(event) =>
                            setQuantityByItemId((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          className="h-10 rounded-xl"
                        />
                      </div>
                      <Button variant="outline" className="h-10 rounded-xl" disabled={itemBusy} onClick={() => void saveQuantity(item)}>
                        {itemBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Update
                      </Button>
                      <Button variant="outline" className="h-10 rounded-xl text-destructive hover:text-destructive" disabled={itemBusy} onClick={() => void removeCartItem(item.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Line total: KES {lineTotal.toLocaleString()} • Payable with delivery: KES {lineTotalWithDelivery.toLocaleString()}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {selectedByItemId[item.id] && canCheckout(item) ? "Selected for checkout" : "Select this item to include it"}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
      <MpesaPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (open) setCheckoutError(null);
        }}
        title="Complete cart checkout"
        description={
          selectedCheckoutableItems.length > 1
            ? "Your selected items create separate product orders. M-Pesa will send one prompt for each order, and each must be approved on your phone."
            : "Confirm the number that should receive the M-Pesa prompt for this cart checkout."
        }
        amountValue={`KES ${selectedSummary.total.toLocaleString()}`}
        referenceLabel="Checkout"
        referenceValue={`${selectedCheckoutableItems.length} item${selectedCheckoutableItems.length === 1 ? "" : "s"} selected`}
        phoneNumber={paymentPhone}
        onPhoneChange={setPaymentPhone}
        onConfirm={() => void checkoutAndPaySelectedItems()}
        confirmLabel="Place Order & Pay"
        confirmPendingLabel="Creating orders..."
        busy={isCheckingOutSelected}
        errorMessage={checkoutError}
      />
    </DashboardShell>
  );
}
