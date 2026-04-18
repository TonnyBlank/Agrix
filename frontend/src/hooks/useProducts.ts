import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, API_BASE_URL, apiFetch } from "@/lib/api";
import { getStoredRole } from "@/lib/subscription";
import { supabase } from "@/integrations/supabase/client";

const PRODUCTS_CHANGED_EVENT = "agrilink:products-changed";
const PRODUCTS_CACHE_TTL_MS = 15_000;

type ProductSnapshot = {
  products: Product[];
  fetchedAt: number;
};

const marketplaceProductsCache: ProductSnapshot = { products: [], fetchedAt: 0 };
const myProductsCache = new Map<string, ProductSnapshot>();

function notifyProductsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRODUCTS_CHANGED_EVENT));
}

type UploadProgressCallback = (progress: number) => void;

async function uploadMediaWithProgress(
  path: string,
  fieldName: string,
  file: File,
  onProgress?: UploadProgressCallback,
) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new ApiError("You are not signed in. Please log in and try again.", 401);
  }

  const formData = new FormData();
  formData.append(fieldName, file);

  return new Promise<{ url: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}${path}`);
    request.responseType = "json";
    request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);

    const localRole = getStoredRole(session.user.id);
    if (localRole) {
      request.setRequestHeader("X-AgriLink-Role", localRole);
    }

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    request.onerror = () => {
      reject(new ApiError("Network request failed", 0));
    };

    request.onload = () => {
      const rawResponse = request.response ?? request.responseText;

      if (request.status >= 200 && request.status < 300) {
        if (rawResponse && typeof rawResponse === "object") {
          onProgress?.(100);
          resolve(rawResponse as { url: string });
          return;
        }

        try {
          const parsed = typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
          onProgress?.(100);
          resolve(parsed as { url: string });
        } catch {
          reject(new ApiError("Invalid upload response from server", request.status));
        }
        return;
      }

      let message = `Request failed with status ${request.status}`;
      if (rawResponse && typeof rawResponse === "object") {
        const payload = rawResponse as { error?: string; message?: string };
        message = payload.error || payload.message || message;
      } else if (typeof rawResponse === "string" && rawResponse.trim()) {
        try {
          const payload = JSON.parse(rawResponse) as { error?: string; message?: string };
          message = payload.error || payload.message || message;
        } catch {
          message = rawResponse;
        }
      }

      reject(new ApiError(message, request.status));
    };

    request.send(formData);
  });
}

async function loadProfilesByUserId(userIds: string[]) {
  if (!userIds.length) return new Map<string, { full_name: string | null; county: string | null }>();

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, county")
    .in("user_id", userIds);

  if (error) throw error;

  return new Map(
    (data ?? []).map((profile) => [
      profile.user_id,
      {
        full_name: profile.full_name,
        county: profile.county,
      },
    ]),
  );
}

async function loadProductsFromSupabase(userId?: string | null) {
  let query = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("farmer_id", userId);
  } else {
    query = query.eq("is_available", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const farmerIds = Array.from(new Set((data ?? []).map((product) => product.farmer_id).filter(Boolean)));
  const profilesByUserId = await loadProfilesByUserId(farmerIds);

  return (data ?? []).map((product) => ({
    ...product,
    profiles: profilesByUserId.get(product.farmer_id) ?? null,
  })) as Product[];
}

export type Product = {
  id: string;
  farmer_id: string;
  name: string;
  category: string;
  price_per_unit: number;
  unit: string;
  stock: number;
  description: string | null;
  image_emoji: string | null;
  cover_image_url: string | null;
  video_url: string | null;
  is_organic: boolean;
  is_available: boolean;
  location: string | null;
  created_at: string;
  updated_at: string;
  likes_count: number;
  liked_by_me: boolean;
  ratings_count: number;
  average_rating: number;
  my_rating: number | null;
  profiles?: {
    full_name: string | null;
    county: string | null;
  } | null;
};

export function useMarketplaceProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!force && marketplaceProductsCache.fetchedAt && Date.now() - marketplaceProductsCache.fetchedAt < PRODUCTS_CACHE_TTL_MS) {
      setProducts(marketplaceProductsCache.products);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<Product[]>("/products");
      setProducts(data);
      marketplaceProductsCache.products = data;
      marketplaceProductsCache.fetchedAt = Date.now();
    } catch (error) {
      console.error("Failed to load marketplace products from API, falling back to Supabase", error);
      try {
        const fallbackData = await loadProductsFromSupabase();
        setProducts(fallbackData);
        marketplaceProductsCache.products = fallbackData;
        marketplaceProductsCache.fetchedAt = Date.now();
      } catch (fallbackError) {
        console.error("Failed to load marketplace products from Supabase", fallbackError);
        toast.error("Failed to load products");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleProductsChanged = () => {
      void load();
    };

    window.addEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
  }, [load]);

  const toggleLike = async (productId: string) => {
    if (!user) {
      toast.error("Please sign in to like products");
      return false;
    }

    try {
      const data = await apiFetch<{ liked: boolean; likes_count: number }>(`/products/${productId}/like`, {
        method: "POST",
      });
      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId
            ? { ...product, liked_by_me: data.liked, likes_count: data.likes_count }
            : product,
        ),
      );
      return true;
    } catch (error) {
      toast.error("Failed to update like: " + (error as Error).message);
      return false;
    }
  };

  const rateProduct = async (productId: string, rating: number) => {
    if (!user) {
      toast.error("Please sign in to rate products");
      return false;
    }

    try {
      const data = await apiFetch<{ my_rating: number; average_rating: number; ratings_count: number }>(
        `/products/${productId}/rate`,
        {
          method: "POST",
          body: { rating } as unknown as BodyInit,
        },
      );
      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId
            ? {
                ...product,
                my_rating: data.my_rating,
                average_rating: data.average_rating,
                ratings_count: data.ratings_count,
              }
            : product,
        ),
      );
      return true;
    } catch (error) {
      toast.error("Failed to rate product: " + (error as Error).message);
      return false;
    }
  };

  return { products, loading, refetch: load, toggleLike, rateProduct };
}

export function useMyProducts() {
  const { user, profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const cached = myProductsCache.get(user.id);
    if (!force && cached && Date.now() - cached.fetchedAt < PRODUCTS_CACHE_TTL_MS) {
      setProducts(cached.products);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<Product[]>("/products/mine");
      setProducts(data);
      myProductsCache.set(user.id, { products: data, fetchedAt: Date.now() });
    } catch (error) {
      console.error("Failed to load your products from API, falling back to Supabase", error);
      try {
        const fallbackData = await loadProductsFromSupabase(user.id);
        setProducts(fallbackData);
        myProductsCache.set(user.id, { products: fallbackData, fetchedAt: Date.now() });
      } catch (fallbackError) {
        console.error("Failed to load your products from Supabase", fallbackError);
        toast.error("Failed to load your products");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleProductsChanged = () => {
      void load();
    };

    window.addEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
  }, [load]);

  const addProduct = async (payload: {
    name: string;
    category: string;
    price_per_unit: number;
    unit: string;
    stock: number;
    description?: string;
    image_emoji?: string;
    cover_image_url?: string;
    video_url?: string;
    is_organic: boolean;
  }) => {
    if (!user) return false;
    try {
      await apiFetch<Product>("/products", {
        method: "POST",
        body: {
          ...payload,
          location: profile?.county || null,
        } as unknown as BodyInit,
      });
      toast.success("Listing published to marketplace!");
      notifyProductsChanged();
      // Fire-and-forget: don't block UI on list refresh
      void load(true);
      return true;
    } catch (error) {
      toast.error(`Failed to add product: ${(error as Error).message}`);
      return false;
    }
  };

  const uploadProductVideo = async (file: File, onProgress?: UploadProgressCallback) => {
    if (!user) return null;

    try {
      const data = await uploadMediaWithProgress("/products/upload-video", "video", file, onProgress);
      toast.success("Video uploaded successfully!");
      return data.url;
    } catch (error) {
      toast.error(`Failed to upload video: ${(error as Error).message}`);
      return null;
    }
  };

  const uploadProductImage = async (file: File, onProgress?: UploadProgressCallback) => {
    if (!user) return null;

    try {
      const data = await uploadMediaWithProgress("/products/upload-image", "image", file, onProgress);
      toast.success("Cover image uploaded successfully!");
      return data.url;
    } catch (error) {
      toast.error(`Failed to upload cover image: ${(error as Error).message}`);
      return null;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      await apiFetch<Product>(`/products/${id}`, {
        method: "PATCH",
        body: updates as unknown as BodyInit,
      });
      toast.success("Product updated!");
      notifyProductsChanged();
      // Fire-and-forget: don't block UI on list refresh
      void load(true);
      return true;
    } catch (error) {
      toast.error("Failed to update product");
      return false;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await apiFetch<{ success: boolean }>(`/products/${id}`, {
        method: "DELETE",
      });
      toast.success("Product deleted");
      notifyProductsChanged();
      await load(true);
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  return { products, loading, addProduct, updateProduct, deleteProduct, uploadProductVideo, uploadProductImage, refetch: load };
}
