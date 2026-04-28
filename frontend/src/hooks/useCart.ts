import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { buildDeliveryQuote } from "@/lib/deliveryPricing";

const CART_CHANGED_EVENT = "agrilink:cart-changed";
const CART_CACHE_TTL_MS = 10_000;

type CartSnapshot = {
  items: CartItem[];
  fetchedAt: number;
};

const cartCache = new Map<string, CartSnapshot>();

function notifyCartChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

export type CartItem = {
  id: string;
  buyer_id: string;
  product_id: string;
  quantity: number;
  unit: string;
  notes: string | null;
  selected_for_checkout: boolean;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    name: string;
    category: string | null;
    unit: string;
    price_per_unit: number;
    stock: number;
    is_available: boolean;
    image_emoji: string | null;
    cover_image_url: string | null;
  } | null;
  farmer_profile: {
    full_name: string | null;
    county: string | null;
  } | null;
};

type AddCartItemPayload = {
  product_id: string;
  quantity: number;
  unit?: string;
  notes?: string;
};

type UpdateCartItemPayload = {
  quantity?: number;
  unit?: string;
  notes?: string;
  selected_for_checkout?: boolean;
};

export function useCart() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const cached = cartCache.get(user.id);
    if (!force && cached && Date.now() - cached.fetchedAt < CART_CACHE_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<CartItem[]>("/cart");
      setItems(data);
      cartCache.set(user.id, { items: data, fetchedAt: Date.now() });
    } catch (error) {
      console.error("Failed to load cart", error);
      toast.error("Failed to load cart");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleCartChanged = () => {
      void load(true);
    };

    window.addEventListener(CART_CHANGED_EVENT, handleCartChanged);
    return () => window.removeEventListener(CART_CHANGED_EVENT, handleCartChanged);
  }, [load]);

  const addItem = async (payload: AddCartItemPayload) => {
    if (!user) {
      toast.error("Please sign in first.");
      return null;
    }

    try {
      const created = await apiFetch<CartItem>("/cart", {
        method: "POST",
        body: payload as unknown as BodyInit,
      });
      notifyCartChanged();
      return created;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add item to cart.");
      return null;
    }
  };

  const updateItem = async (itemId: string, payload: UpdateCartItemPayload) => {
    try {
      const updated = await apiFetch<CartItem>(`/cart/${itemId}`, {
        method: "PATCH",
        body: payload as unknown as BodyInit,
      });
      notifyCartChanged();
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update cart item.");
      return null;
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await apiFetch<{ success: boolean }>(`/cart/${itemId}`, {
        method: "DELETE",
      });
      notifyCartChanged();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove cart item.");
      return false;
    }
  };

  const totals = useMemo(() => {
    const selectedItems = items.filter((item) => item.selected_for_checkout !== false);
    const subtotal = selectedItems.reduce((sum, item) => {
      const unitPrice = Number(item.product?.price_per_unit || 0);
      return sum + unitPrice * Number(item.quantity || 0);
    }, 0);
    const estimatedDelivery = selectedItems.reduce((sum, item) => {
      const quote = buildDeliveryQuote({
        buyerCounty: profile?.county || null,
        sellerCounty: item.farmer_profile?.county || null,
      });
      return sum + quote.feeKes;
    }, 0);
    return {
      subtotal,
      estimatedDelivery,
      total: subtotal + estimatedDelivery,
      itemCount: items.length,
      selectedCount: selectedItems.length,
    };
  }, [items, profile?.county]);

  return {
    items,
    loading,
    totals,
    addItem,
    updateItem,
    removeItem,
    refetch: load,
  };
}
