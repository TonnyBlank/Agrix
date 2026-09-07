import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const ID_VERIFICATION_CACHE_TTL_MS = 15_000;

type VerificationSnapshot = {
  verification: IDVerification | null;
  fetchedAt: number;
};

const verificationCache = new Map<string, VerificationSnapshot>();

export type VerificationStatus = "unverified" | "pending" | "pending_review" | "verified" | "rejected";

export type IDVerification = {
  id?: string;
  user_id?: string;
  doc_url?: string | null;
  front_doc_url?: string | null;
  back_doc_url?: string | null;
  status: VerificationStatus;
  reviewer_note?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
};

export function useIdVerification() {
  const { user } = useAuth();
  const [verification, setVerification] = useState<IDVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!user) {
      setVerification(null);
      setLoading(false);
      return;
    }

    const cached = verificationCache.get(user.id);
    if (!force && cached && Date.now() - cached.fetchedAt < ID_VERIFICATION_CACHE_TTL_MS) {
      setVerification(cached.verification);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<IDVerification>("/id-verification");
      setVerification(data);
      verificationCache.set(user.id, { verification: data, fetchedAt: Date.now() });
    } catch (error) {
      console.error("Failed to load ID verification from API, falling back to Supabase", error);
      try {
        const { data, error: fallbackError } = await supabase
          .from("id_verifications")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (fallbackError) throw fallbackError;

        const normalized: IDVerification = data
          ? {
              ...data,
              status: (data.status as VerificationStatus) || "unverified",
            }
          : { status: "unverified" as const };

        setVerification(normalized);
        verificationCache.set(user.id, { verification: normalized, fetchedAt: Date.now() });
      } catch (fallbackError) {
        console.error("Failed to load ID verification from Supabase", fallbackError);
        toast.error("Failed to load verification status");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadDocuments = async (frontFile: File, backFile: File) => {
    const formData = new FormData();
    formData.append("front_side", frontFile);
    formData.append("back_side", backFile);

    setUploading(true);
    try {
      const data = await apiFetch<IDVerification>("/id-verification/upload", {
        method: "POST",
        body: formData,
      });
      setVerification(data);
      if (user) {
        verificationCache.set(user.id, { verification: data, fetchedAt: Date.now() });
      }
      toast.success("ID documents uploaded successfully!");
    } catch (error) {
      toast.error("Failed to upload ID documents");
    } finally {
      setUploading(false);
    }
  };

  return {
    verification,
    loading,
    uploading,
    uploadDocuments,
    refetch: load,
  };
}
