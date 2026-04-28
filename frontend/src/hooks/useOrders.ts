import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

const ORDERS_CACHE_TTL_MS = 15_000;

type OrdersSnapshot = {
  sellingOrders: Order[];
  buyingOrders: Order[];
  fetchedAt: number;
};

const ordersCache = new Map<string, OrdersSnapshot>();

export type Order = {
  id: string;
  product_id: string;
  buyer_id: string;
  farmer_id: string;
  quantity: number;
  unit: string;
  total_price: number;
  delivery_fee: number;
  delivery_distance_km?: number | null;
  delivery_base_fee?: number | null;
  delivery_rate_per_km?: number | null;
  inter_county_surcharge?: number | null;
  delivery_mode?: "county_office_pickup" | string | null;
  pickup_county?: string | null;
  pickup_office_label?: string | null;
  delivery_disclaimer?: string | null;
  status: OrderStatus;
  payment_method: string | null;
  payment_ref: string | null;
  payment_status: OrderPaymentStatus;
  merchant_request_id?: string | null;
  checkout_request_id?: string | null;
  payment_error?: string | null;
  paid_at?: string | null;
  payment_verification_started_at?: string | null;
  payment_verified_at?: string | null;
  escrow_amount?: number | null;
  agrilink_commission_rate?: number | null;
  agrilink_commission_amount?: number | null;
  seller_payout_amount?: number | null;
  payout_status?: string | null;
  escrow_received_at?: string | null;
  delivery_proof_photo_url?: string | null;
  delivery_proof_geo_lat?: number | null;
  delivery_proof_geo_lng?: number | null;
  delivery_proof_submitted_at?: string | null;
  delivery_proof_submitted_by?: string | null;
  delivery_proof_note?: string | null;
  buyer_delivery_otp_requested_at?: string | null;
  buyer_delivery_otp_expires_at?: string | null;
  buyer_delivery_otp_verified_at?: string | null;
  buyer_delivery_otp_attempts?: number | null;
  delivery_signoff_status?: "pending_proof" | "pending_buyer_confirmation" | "confirmed" | "disputed" | "waived_by_admin" | string | null;
  dispute_reason?: string | null;
  dispute_opened_at?: string | null;
  dispute_opened_by?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolution_note?: string | null;
  dispute_deadline_at?: string | null;
  official_verified_at?: string | null;
  official_verified_by?: string | null;
  official_note?: string | null;
  payout_released_at?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: { name: string; image_emoji: string | null; cover_image_url: string | null } | null;
  buyer_profile?: { full_name: string | null; county?: string | null } | null;
  farmer_profile?: { full_name: string | null; county?: string | null } | null;
};

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
export type OrderPaymentStatus = "unpaid" | "initiated" | "pending_confirmation" | "paid" | "failed";

type OrderRow = Omit<Order, "product" | "buyer_profile" | "farmer_profile">;

async function hydrateOrders(rows: OrderRow[]) {
  if (!rows.length) return [] as Order[];

  const productIds = Array.from(new Set(rows.map((order) => order.product_id)));
  const userIds = Array.from(new Set(rows.flatMap((order) => [order.buyer_id, order.farmer_id])));

  const [{ data: products, error: productsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("products").select("id, name, image_emoji, cover_image_url").in("id", productIds),
    supabase.from("profiles").select("user_id, full_name, county").in("user_id", userIds),
  ]);

  if (productsError) throw productsError;
  if (profilesError) throw profilesError;

  const productsById = new Map((products ?? []).map((product) => [product.id, product]));
  const profilesByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return rows.map((order) => ({
    ...order,
    product: productsById.get(order.product_id)
        ? {
          name: productsById.get(order.product_id)!.name,
          image_emoji: productsById.get(order.product_id)!.image_emoji,
          cover_image_url: productsById.get(order.product_id)!.cover_image_url,
        }
      : null,
    buyer_profile: profilesByUserId.get(order.buyer_id)
      ? {
        full_name: profilesByUserId.get(order.buyer_id)!.full_name,
        county: profilesByUserId.get(order.buyer_id)!.county,
      }
      : null,
    farmer_profile: profilesByUserId.get(order.farmer_id)
      ? {
        full_name: profilesByUserId.get(order.farmer_id)!.full_name,
        county: profilesByUserId.get(order.farmer_id)!.county,
      }
      : null,
  }));
}

async function loadOrdersFromSupabase(userId: string) {
  const [{ data: sellingRows, error: sellingError }, { data: buyingRows, error: buyingError }] = await Promise.all([
    supabase.from("orders").select("*").eq("farmer_id", userId).order("created_at", { ascending: false }),
    supabase.from("orders").select("*").eq("buyer_id", userId).order("created_at", { ascending: false }),
  ]);

  if (sellingError) throw sellingError;
  if (buyingError) throw buyingError;

  const [sellingOrders, buyingOrders] = await Promise.all([
    hydrateOrders((sellingRows ?? []) as OrderRow[]),
    hydrateOrders((buyingRows ?? []) as OrderRow[]),
  ]);

  return { sellingOrders, buyingOrders };
}

export function useOrders() {
  const { user } = useAuth();
  const [sellingOrders, setSellingOrders] = useState<Order[]>([]);
  const [buyingOrders, setBuyingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!user) {
      setSellingOrders([]);
      setBuyingOrders([]);
      setLoading(false);
      return;
    }

    const cached = ordersCache.get(user.id);
    if (!force && cached && Date.now() - cached.fetchedAt < ORDERS_CACHE_TTL_MS) {
      setSellingOrders(cached.sellingOrders);
      setBuyingOrders(cached.buyingOrders);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [sellingData, buyingData] = await Promise.all([
        apiFetch<Order[]>("/orders/selling"),
        apiFetch<Order[]>("/orders/buying"),
      ]);
      setSellingOrders(sellingData);
      setBuyingOrders(buyingData);
      ordersCache.set(user.id, {
        sellingOrders: sellingData,
        buyingOrders: buyingData,
        fetchedAt: Date.now(),
      });
    } catch (error) {
      console.error("Failed to load orders from API, falling back to Supabase", error);
      try {
        const fallbackData = await loadOrdersFromSupabase(user.id);
        setSellingOrders(fallbackData.sellingOrders);
        setBuyingOrders(fallbackData.buyingOrders);
        ordersCache.set(user.id, {
          sellingOrders: fallbackData.sellingOrders,
          buyingOrders: fallbackData.buyingOrders,
          fetchedAt: Date.now(),
        });
      } catch (fallbackError) {
        console.error("Failed to load orders from Supabase", fallbackError);
        toast.error("Failed to load orders");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const placeOrder = async (payload: {
    product_id: string;
    quantity: number;
    unit: string;
    delivery_distance_km?: number;
    pickup_county?: string;
    delivery_fee?: number;
    notes?: string;
  }) => {
    if (!user) return null;
    try {
      const createdOrder = await apiFetch<Order>("/orders", {
        method: "POST",
        body: payload as unknown as BodyInit,
      });
      toast.success("Order placed successfully!");
      await load(true);
      return createdOrder;
    } catch (error) {
      toast.error("Order failed: " + (error as Error).message);
      return null;
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await apiFetch<Order>(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: { status } as unknown as BodyInit,
      });
      toast.success(`Order ${status}`);
      await load(true);
      return true;
    } catch (error) {
      toast.error("Failed to update status: " + (error as Error).message);
      return false;
    }
  };

  const initiateMpesaPayment = async (orderId: string, phoneNumber: string) => {
    try {
      const data = await apiFetch<{ message: string }>("/payments/orders/" + orderId + "/mpesa", {
        method: "POST",
        body: { phoneNumber } as unknown as BodyInit,
      });
      toast.success(data.message || "M-Pesa prompt sent to your phone");
      await load(true);
      return true;
    } catch (error) {
      toast.error("Payment failed to start: " + (error as Error).message);
      return false;
    }
  };

  const refreshMpesaPaymentStatus = async (orderId: string) => {
    try {
      const data = await apiFetch<{ payment_status: string; resultDesc: string }>("/payments/orders/" + orderId + "/mpesa-status");
      if (data.payment_status === "paid") {
        toast.success("Payment confirmed");
      } else if (data.payment_status === "failed") {
        toast.error(data.resultDesc || "Payment failed");
      } else {
        toast.message(data.resultDesc || "Payment status updated");
      }
      await load(true);
      return true;
    } catch (error) {
      toast.error("Failed to check payment status: " + (error as Error).message);
      return false;
    }
  };

  const submitDeliveryProof = async (
    orderId: string,
    payload: { proof_photo_url: string; proof_geo_lat?: number; proof_geo_lng?: number; proof_note?: string },
  ) => {
    try {
      await apiFetch<Order>(`/orders/${orderId}/delivery-proof`, {
        method: "PATCH",
        body: payload as unknown as BodyInit,
      });
      toast.success("Delivery proof submitted.");
      await load(true);
      return true;
    } catch (error) {
      toast.error("Failed to submit delivery proof: " + (error as Error).message);
      return false;
    }
  };

  const requestDeliveryOtp = async (orderId: string) => {
    try {
      const data = await apiFetch<{ otp_code: string; otp_expires_at: string }>(`/orders/${orderId}/delivery-otp/request`, {
        method: "POST",
      });
      toast.success(`Delivery OTP generated (expires ${new Date(data.otp_expires_at).toLocaleString()}).`);
      await load(true);
      return data;
    } catch (error) {
      toast.error("Failed to request delivery OTP: " + (error as Error).message);
      return null;
    }
  };

  const verifyDeliveryOtp = async (orderId: string, otp_code: string) => {
    try {
      await apiFetch<{ message: string }>(`/orders/${orderId}/delivery-otp/verify`, {
        method: "POST",
        body: { otp_code } as unknown as BodyInit,
      });
      toast.success("Delivery confirmed.");
      await load(true);
      return true;
    } catch (error) {
      toast.error("Failed to verify delivery OTP: " + (error as Error).message);
      return false;
    }
  };

  const raiseDeliveryDispute = async (orderId: string, reason: string) => {
    try {
      await apiFetch<Order>(`/orders/${orderId}/dispute`, {
        method: "POST",
        body: { reason } as unknown as BodyInit,
      });
      toast.success("Dispute submitted.");
      await load(true);
      return true;
    } catch (error) {
      toast.error("Failed to submit dispute: " + (error as Error).message);
      return false;
    }
  };

  return {
    sellingOrders,
    buyingOrders,
    loading,
    placeOrder,
    updateOrderStatus,
    initiateMpesaPayment,
    refreshMpesaPaymentStatus,
    submitDeliveryProof,
    requestDeliveryOtp,
    verifyDeliveryOtp,
    raiseDeliveryDispute,
    refetch: load,
  };
}
