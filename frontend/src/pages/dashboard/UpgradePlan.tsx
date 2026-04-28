import DashboardShell from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

import { motion } from "framer-motion";
import { Check, Zap, Crown, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import MpesaPaymentDialog from "@/components/dashboard/MpesaPaymentDialog";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type SubscriptionPayment = {
  id: string;
  user_id: string;
  plan_role: AppRole;
  amount_kes: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  payment_ref: string | null;
  payment_error: string | null;
  paid_at: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const plans = [
  {
    id: "farmer_free",
    name: "Farmer Free",
    price: "KES 0",
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
    price: "KES 1,500",
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
  const [paymentDialogPlan, setPaymentDialogPlan] = useState<AppRole | null>(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [checkingPaymentId, setCheckingPaymentId] = useState<string | null>(null);
  const [pendingSubscriptionPayment, setPendingSubscriptionPayment] = useState<{ paymentId: string; planId: AppRole } | null>(null);

  useEffect(() => {
    if (paymentPhone.trim()) return;
    const defaultPhone = profile?.phone?.trim() || profile?.payout_mpesa_number?.trim() || "";
    if (defaultPhone) setPaymentPhone(defaultPhone);
  }, [paymentPhone, profile?.phone, profile?.payout_mpesa_number]);

  const pendingPlan = useMemo(() => pendingSubscriptionPayment?.planId ?? null, [pendingSubscriptionPayment]);

  const finalizePaidPlan = (data: { role?: AppRole | null; profile?: Profile | null }, fallbackRole: AppRole) => {
    if (data.profile) {
      applyProfileUpdate(data.profile);
    }
    const nextRole = (data.role || fallbackRole) as AppRole;
    setActiveRole(nextRole, { expiresAt: data.profile?.plan_expires_at ?? null });
    setPendingSubscriptionPayment(null);
    toast.success(`${plans.find((plan) => plan.id === nextRole)?.name || nextRole} is now active.`, {
      icon: <Zap className="w-4 h-4" />,
    });
    navigate(nextRole === "farmer_pro" ? "/dashboard/pro" : "/dashboard/free");
  };

  const checkSubscriptionPaymentStatus = async (paymentId: string, planId: AppRole) => {
    setCheckingPaymentId(paymentId);
    try {
      const data = await apiFetch<{
        payment_status: "pending_confirmation" | "paid" | "failed";
        resultDesc?: string;
        role?: AppRole;
        profile?: Profile;
        payment?: SubscriptionPayment;
      }>(`/payments/subscriptions/${paymentId}/mpesa-status`);

      if (data.payment_status === "paid") {
        finalizePaidPlan({ role: data.role, profile: data.profile }, planId);
        return;
      }

      if (data.payment_status === "failed") {
        setPendingSubscriptionPayment(null);
        toast.error(data.resultDesc || "Subscription payment failed. Please try again.");
        return;
      }

      toast.message(data.resultDesc || "Payment is still processing. Check again in a few seconds.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check M-Pesa payment status.");
    } finally {
      setCheckingPaymentId(null);
    }
  };

  const handleSubscriptionPaymentStart = async () => {
    if (!paymentDialogPlan) return;
    if (!paymentPhone.trim()) {
      toast.error("Enter the M-Pesa number that should receive the STK prompt.");
      return;
    }

    setUpgrading(paymentDialogPlan);
    toast.info("Sending M-Pesa prompt...", { icon: <Smartphone className="w-4 h-4" /> });

    try {
      const response = await apiFetch<{ message: string; payment: SubscriptionPayment }>("/payments/subscriptions/mpesa", {
        method: "POST",
        body: {
          planRole: paymentDialogPlan,
          phoneNumber: paymentPhone,
        },
      });
      toast.success(response.message || "M-Pesa prompt sent.");
      const paymentId = response.payment.id;
      setPendingSubscriptionPayment({ paymentId, planId: paymentDialogPlan });
      setPaymentDialogPlan(null);
      await checkSubscriptionPaymentStatus(paymentId, paymentDialogPlan);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start subscription payment.");
    } finally {
      setUpgrading(null);
    }
  };

  const handleUpgrade = async (planId: AppRole) => {
    if (planId === role) return;

    if (planId === "farmer_pro" || planId === "company") {
      setPaymentDialogPlan(planId);
      return;
    }

    setUpgrading(planId);
    toast.info("Switching your plan...", { icon: <Smartphone className="w-4 h-4" /> });

    try {
      const data = await apiFetch<{ role: AppRole; profile: Profile }>("/profiles/me/role", {
        method: "PATCH",
        body: { role: planId },
      });
      applyProfileUpdate(data.profile);
      setActiveRole(data.role, { expiresAt: data.profile.plan_expires_at });
      toast.success(`${plans.find((p) => p.id === planId)?.name ?? planId} is now active.`, {
        icon: <Zap className="w-4 h-4" />,
      });
      navigate("/dashboard/free");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not activate this plan.", {
        icon: <Smartphone className="w-4 h-4" />,
      });
    } finally {
      setUpgrading(null);
    }
  };
  const paymentDialogPlanDetails = plans.find((plan) => plan.id === paymentDialogPlan);

  return (
    <DashboardShell title="Upgrade Plan">
      <div className="mb-6 text-center">
        <h2 className="font-display text-[1.7rem] font-bold text-foreground">Choose Your Plan</h2>
        <p className="text-muted-foreground text-sm mt-2">Unlock powerful features to grow your agricultural business</p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
        {plans.map((plan, i) => {
          const isCurrent = plan.id === role;
          const isPro = plan.variant === "pro";

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative flex flex-col rounded-[1.55rem] p-5 ${
                isPro
                  ? "glass-obsidian glow-gold"
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
                  isPro ? "bg-gold-500/20" : "bg-primary/10"
                }`}>
                  <plan.icon className={`h-4 w-4 ${
                    isPro ? "text-gold-500" : "text-primary"
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
                onClick={() => {
                  if (pendingSubscriptionPayment && pendingSubscriptionPayment.planId === plan.id) {
                    void checkSubscriptionPaymentStatus(pendingSubscriptionPayment.paymentId, pendingSubscriptionPayment.planId);
                    return;
                  }
                  void handleUpgrade(plan.id);
                }}
                disabled={isCurrent || upgrading !== null || (pendingSubscriptionPayment !== null && pendingSubscriptionPayment.planId !== plan.id)}
                className={`w-full rounded-xl ${
                  isCurrent
                    ? "bg-muted text-muted-foreground cursor-default"
                    : isPro
                    ? "bg-gold-gradient text-foreground glow-gold"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {isCurrent
                  ? "Current Plan"
                  : pendingSubscriptionPayment && pendingSubscriptionPayment.planId === plan.id
                  ? checkingPaymentId === pendingSubscriptionPayment.paymentId
                    ? "Checking M-Pesa..."
                    : "Check M-Pesa"
                  : upgrading === plan.id
                  ? "Processing..."
                  : `Upgrade to ${plan.name}`}
              </Button>
              {pendingPlan === plan.id ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Payment request created. Use Check M-Pesa after approving the prompt on your phone.
                </p>
              ) : null}
              {isCurrent && profile?.plan_expires_at ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Active until {formatPlanDate(profile.plan_expires_at)}
                </p>
              ) : null}
            </motion.div>
          );
        })}
      </div>

      <MpesaPaymentDialog
        open={Boolean(paymentDialogPlan)}
        onOpenChange={(open) => !open && setPaymentDialogPlan(null)}
        title={`Pay for ${paymentDialogPlanDetails?.name || "your plan"}`}
        description="Confirm the number that should receive the M-Pesa STK prompt. Your plan activates immediately after payment is confirmed."
        amountValue={paymentDialogPlanDetails ? `${paymentDialogPlanDetails.price}${paymentDialogPlanDetails.period === "forever" ? "" : paymentDialogPlanDetails.period}` : undefined}
        referenceLabel="Subscription"
        referenceValue={paymentDialogPlanDetails ? `${paymentDialogPlanDetails.name} monthly plan` : undefined}
        phoneNumber={paymentPhone}
        onPhoneChange={setPaymentPhone}
        onConfirm={() => void handleSubscriptionPaymentStart()}
        busy={Boolean(paymentDialogPlan && upgrading === paymentDialogPlan)}
        confirmLabel="Send M-Pesa Prompt"
        confirmPendingLabel="Sending prompt..."
      />

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
