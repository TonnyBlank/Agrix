import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";

export default function DashboardRedirect() {
  const { loading, role } = useAuth();
  const navigate = useNavigate();
  const [resolvingCompanyRedirect, setResolvingCompanyRedirect] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    const resolveRedirect = async () => {
      if (role === "admin") {
        navigate("/dashboard/admin", { replace: true });
        return;
      }

      if (role === "company") {
        navigate("/dashboard/company", { replace: true });
        return;
      }

      setResolvingCompanyRedirect(true);

      try {
        await apiFetch("/companies/me");
        if (!cancelled) {
          navigate("/dashboard/company", { replace: true });
        }
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) {
          console.error("Failed to resolve company redirect:", error);
        }
      } finally {
        if (!cancelled) {
          setResolvingCompanyRedirect(false);
        }
      }

      if (cancelled) return;

      if (role === "farmer_pro" || role === "company") {
        navigate("/dashboard/pro", { replace: true });
        return;
      }

      navigate("/dashboard/free", { replace: true });
    };

    void resolveRedirect();

    return () => {
      cancelled = true;
    };
  }, [loading, navigate, role]);

  if (loading || resolvingCompanyRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return null;
}
