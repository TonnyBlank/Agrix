import DashboardShell from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

import { motion } from "framer-motion";
import { Check, Zap, Shield, Crown, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const plans = [
  {
    id: "farmer_free",
    name: "Farmer Free",
    price: "$0",
    period: "forever",
    description: "Start Smart, Grow Fast",
    features: [
      "Farm profile & product listings (10 max)",
      "Marketplace browsing",
      "Order & delivery tracking",
      "Community forum & tips",
      "Crop calendar & weather alerts",
      "Basic AI suggestions (1/week)",
      "Chat with buyers",
      "Offline mode",
    ],
    icon: Zap,
    variant: "standard" as const,
  },
  {
    id: "farmer_pro",
    name: "Farmer Pro",
    price: "$10",
    period: "/month",
    description: "Scale Your Farm, Maximize Profits",
    features: [
      "Everything in Free +",
      "Unlimited product listings",
      "Full AI crop & profit advisor",
      "AI crop disease scanner",
      "Smart logistics & delivery ETA",
      "Voice interface (Swahili + English)",
      "Real-time analytics & reports",
      "Micro-loans & credit scoring",
      "Crop insurance integration",
      "Input marketplace access",
      "Loyalty rewards program",
    ],
    icon: Crown,
    variant: "pro" as const,
  },
  {
    id: "buyer_enterprise",
    name: "Buyer Enterprise",
    price: "$50",
    period: "/month",
    description: "Secure, Predictable Supply",
    features: [
      "Everything in Pro +",
      "Bulk ordering system",
      "Contract farming agreements",
      "Predictive supply insights (AI)",
      "Escrow & M-Pesa payments",
      "Featured farmer matching",
      "Smart warehouse integration",
      "Procurement forecasting",
      "Blockchain supply traceability",
      "Exportable invoices & tax receipts",
      "Multiple buyer accounts",
    ],
    icon: Shield,
    variant: "enterprise" as const,
  },
];

function formatPlanDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function UpgradePlan() {
  const { role, profile, applyProfileUpdate, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const handleUpgrade = async (planId: AppRole) => {
    if (planId === role) return;
    setUpgrading(planId);

    toast.info("Activating your plan...", { icon: <Smartphone className="w-4 h-4" /> });

    try {
      const data = await apiFetch<{ role: AppRole; profile: Profile }>("/profiles/me/role", {
        method: "PATCH",
        body: { role: planId },
      });

      applyProfileUpdate(data.profile);
      setActiveRole(data.role, { expiresAt: data.profile.plan_expires_at });

      const planName = plans.find((p) => p.id === planId)?.name ?? planId;
      toast.success(`${planName} is now active.`, {
        icon: <Zap className="w-4 h-4" />,
      });
      navigate(
        planId === "buyer_enterprise"
          ? "/dashboard/enterprise"
          : planId === "farmer_pro"
            ? "/dashboard/pro"
            : "/dashboard/free",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not activate this plan.", {
        icon: <Smartphone className="w-4 h-4" />,
      });
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <DashboardShell title="Upgrade Plan">
      <div className="mb-6 text-center">
        <h2 className="font-display text-[1.7rem] font-bold text-foreground">Choose Your Plan</h2>
        <p className="text-muted-foreground text-sm mt-2">Unlock powerful features to grow your agricultural business</p>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((plan, i) => {
          const isCurrent = plan.id === role;
          const isPro = plan.variant === "pro";
          const isEnterprise = plan.variant === "enterprise";

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative flex flex-col rounded-[1.55rem] p-5 ${
                isPro
                  ? "glass-obsidian glow-gold"
                  : isEnterprise
                  ? "glass-steel border-steel-500/20"
                  : "bento-card"
              }`}
            >
              {isPro && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold-gradient px-4 py-1 text-[10px] font-bold text-foreground">
                  MOST POPULAR
                </div>
              )}

              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isPro ? "bg-gold-500/20" : isEnterprise ? "bg-steel-500/20" : "bg-primary/10"
                }`}>
                  <plan.icon className={`h-4 w-4 ${
                    isPro ? "text-gold-500" : isEnterprise ? "text-steel-400" : "text-primary"
                  }`} />
                </div>
                <div>
                  <h3 className={`font-display font-bold text-sm ${isPro ? "text-gold-400" : "text-foreground"}`}>{plan.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{plan.description}</p>
                </div>
              </div>

              <div className="mb-4">
                <span className={`font-display text-[1.8rem] font-bold ${isPro ? "text-gradient-gold" : "text-foreground"}`}>{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>

              <div className="mb-5 flex-1 space-y-2">
                {plan.features.map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isPro ? "text-gold-500" : "text-primary"}`} />
                    <span className="text-xs text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || upgrading !== null}
                className={`w-full rounded-xl ${
                  isCurrent
                    ? "bg-muted text-muted-foreground cursor-default"
                    : isPro
                    ? "bg-gold-gradient text-foreground glow-gold"
                    : isEnterprise
                    ? "bg-steel-gradient text-primary-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {isCurrent ? "Current Plan" : upgrading === plan.id ? "Processing..." : `Upgrade to ${plan.name}`}
              </Button>
              {isCurrent && profile?.plan_expires_at ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Active until {formatPlanDate(profile.plan_expires_at)}
                </p>
              ) : null}
            </motion.div>
          );
        })}
      </div>

      {/* Why PRO section */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mx-auto mt-10 max-w-4xl">
        <h3 className="mb-5 text-center font-display text-lg font-bold text-foreground">Why Go Pro?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: "AI Crop Advisor", desc: "Get personalized crop and profit recommendations powered by AI" },
            { title: "Disease Scanner", desc: "Instant AI diagnosis of crop diseases with 99.2% accuracy" },
            { title: "Smart Logistics", desc: "Automated delivery matching and route optimization" },
            { title: "Voice Commands", desc: "Interact using voice in Swahili and English" },
            { title: "Micro-Loans", desc: "Access financing based on your sales history" },
            { title: "Premium Analytics", desc: "Real-time sales, revenue, and market insights" },
          ].map((f, i) => (
            <div key={i} className="bento-card">
              <h4 className="font-display font-bold text-sm text-foreground mb-1">{f.title}</h4>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </DashboardShell>
  );
}
