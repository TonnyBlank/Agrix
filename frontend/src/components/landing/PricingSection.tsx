import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const plans = [
  {
    name: "Farmer Free",
    tagline: "Start Small, Grow Smart",
    price: "Free",
    subtitle: "Forever free",
    features: [
      { text: "Basic farm profile & up to 5 listings/month", included: true },
      { text: "AI-driven price guidance", included: true },
      { text: "Community tips & market alerts", included: true },
      { text: "Limited buyer chat (10 messages/month)", included: true },
      { text: "Offline mode - sync when back online", included: true },
      { text: "Secure escrow platform payments", included: true },
      { text: "AI Crop Scanner", included: false },
      { text: "Flexible micro-loans", included: false },
      { text: "Micro-loans & in-kind repayment", included: false },
    ],
    cta: "Start Free",
    featured: false,
  },
  {
    name: "Farmer Pro",
    tagline: "Scale Your Farm, Maximize Profits",
    price: "$12",
    subtitle: "/month",
    features: [
      { text: "Unlimited product listings", included: true },
      { text: "AI Crop & Profit Advisor dashboard", included: true },
      { text: "Predict demand & optimize planting", included: true },
      { text: "Priority in buyer search results", included: true },
      { text: "Platform Trust System - secure loans", included: true },
      { text: "Real-time sales analytics & revenue trends", included: true },
      { text: "Voice-assisted interface (Swahili)", included: true },
      { text: "Micro-loans & in-kind repayment logic", included: true },
      { text: "Dynamic Marketplace access", included: true },
    ],
    cta: "Go Pro",
    featured: true,
  },
  {
    name: "Buyer Enterprise",
    tagline: "Secure, Predictable Supply",
    price: "$75",
    subtitle: "/month",
    features: [
      { text: "Search farmers by crop, location, profile", included: true },
      { text: "Advance volume orders", included: true },
      { text: "Bulk order management & coordination", included: true },
      { text: "Marketplace & performance dashboard", included: true },
      { text: "Featured farmer listings (priority match)", included: true },
      { text: "Automated Secure Escrow system", included: true },
      { text: "Digital voucher disbursements", included: true },
      { text: "Verified farmers access only", included: true },
      { text: "Dedicated account manager", included: true },
    ],
    cta: "Contact Sales",
    featured: false,
  },
];

export default function PricingSection() {
  const { role, user } = useAuth();

  return (
    <section id="pricing" className="bg-muted/50 py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-widest text-accent">
            Pricing
          </span>
          <h2 className="mt-3 mb-4 text-3xl font-display font-bold text-foreground md:text-5xl">
            Simple, <span className="text-gradient-gold">Fair Pricing</span>
          </h2>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Free for farmers to start. Only pay when you grow.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan, index) => {
            let ctaText = plan.cta;
            let ctaLink = user ? "/dashboard" : "/signup";
            let isDisabled = false;

            if (plan.name === "Farmer Free") {
              if (role === "farmer_free") {
                ctaText = "Current Plan";
                ctaLink = "/dashboard/free";
                isDisabled = true;
              } else if (user) {
                ctaText = "Open Dashboard";
                ctaLink = "/dashboard";
              }
            }

            if (plan.name === "Farmer Pro") {
              if (!user) {
                ctaLink = "/signup";
              } else if (role === "farmer_pro") {
                ctaText = "Current Plan";
                ctaLink = "/dashboard/pro";
                isDisabled = true;
              } else {
                ctaText = "Upgrade to Pro";
                ctaLink = "/dashboard/upgrade";
              }
            }

            if (plan.name === "Buyer Enterprise") {
              if (!user) {
                ctaLink = "/signup";
              } else if (role === "buyer_enterprise") {
                ctaText = "Current Plan";
                ctaLink = "/dashboard/enterprise";
                isDisabled = true;
              } else {
                ctaText = "Upgrade Plan";
                ctaLink = "/dashboard/upgrade";
              }
            }

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                id={plan.name === "Buyer Enterprise" ? "buyer-enterprise" : undefined}
                className={`relative flex h-full flex-col rounded-[1.9rem] p-8 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.35)] ${
                  plan.featured
                    ? "border-2 border-primary bg-primary text-primary-foreground md:scale-[1.02]"
                    : "border border-border bg-card/95"
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold-gradient px-4 py-1 text-xs font-bold text-foreground">
                    Most Popular
                  </span>
                )}

                <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                <p className={`mt-2 text-sm leading-6 ${plan.featured ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                  {plan.tagline}
                </p>

                <div className="mb-6 mt-4">
                  <span className="text-4xl font-display font-bold">{plan.price}</span>
                  <span className={`ml-1 text-sm ${plan.featured ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                    {plan.subtitle}
                  </span>
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-3 text-[15px] leading-6">
                      {feature.included ? (
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? "text-agri-gold-400" : "text-primary"}`} />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          feature.included
                            ? plan.featured
                              ? "text-primary-foreground/90"
                              : "text-foreground"
                            : "text-muted-foreground/50 line-through"
                        }
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`h-12 w-full rounded-xl font-semibold ${
                    plan.featured ? "bg-gold-gradient text-foreground hover:opacity-90" : ""
                  }`}
                  variant={plan.featured ? "default" : "outline"}
                  disabled={isDisabled}
                  asChild={!isDisabled}
                >
                  {isDisabled ? <span>{ctaText}</span> : <Link to={ctaLink}>{ctaText}</Link>}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
