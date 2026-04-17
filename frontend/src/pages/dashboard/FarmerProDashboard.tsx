import { ArrowRight, Brain, CreditCard, Mic, Package, Search, TrendingUp, Truck, Waves } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/hooks/useAuth";

const proSignals = [
  { label: "Demand forecast", value: "+23%", note: "Tomatoes in nearby counties", icon: TrendingUp, tone: "bg-emerald-500/10 text-emerald-700" },
  { label: "AI crop advice", value: "2", note: "Fresh recommendations ready", icon: Brain, tone: "bg-violet-500/10 text-violet-700" },
  { label: "Logistics flow", value: "3", note: "Deliveries need coordination", icon: Truck, tone: "bg-sky-500/10 text-sky-700" },
  { label: "Credit posture", value: "Good", note: "Micro-loan readiness is improving", icon: CreditCard, tone: "bg-amber-500/10 text-amber-700" },
];

export default function FarmerProDashboard() {
  const { profile, user } = useAuth();
  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    "Farmer";
  const firstName = displayName.split(" ")[0];

  return (
    <DashboardShell title="Farmer Pro Preview">
      <section className="mb-8 rounded-[2rem] border border-violet-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_34%),linear-gradient(135deg,rgba(250,250,255,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(99,102,241,0.28)]">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex rounded-full border border-violet-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Preview Only
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-foreground">A smarter operating desk for {firstName}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              The Pro concept is built around momentum: demand signals, AI guidance, delivery coordination, and finance readiness all working from the same screen.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/dashboard/analytics" className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Open analytics
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/dashboard/micro-loans" className="inline-flex items-center rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                Review financing
              </Link>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-violet-200/70 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">What makes Pro different</p>
            <div className="mt-4 space-y-3">
              {[
                "Demand and pricing hints should appear before the farmer decides what to push to market.",
                "AI and crop intelligence should guide timing, not just diagnose issues after the fact.",
                "Logistics and financing need to feel connected to actual sales momentum.",
              ].map((item) => (
                <div key={item} className="rounded-xl bg-background px-4 py-3 text-sm text-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        {proSignals.map((signal) => (
          <div key={signal.label} className="rounded-[1.4rem] border border-border bg-card p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${signal.tone}`}>
              <signal.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{signal.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{signal.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{signal.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[1.6rem] border border-border bg-card p-6">
          <h3 className="font-display text-xl font-bold text-foreground">Pro control lanes</h3>
          <p className="mt-1 text-sm text-muted-foreground">A Pro dashboard should feel like an operating system for a growing farm business.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              { title: "Market intelligence", detail: "Surface crop demand, margin pressure, and timing opportunities.", icon: TrendingUp },
              { title: "AI workflow", detail: "Blend crop scanner, recommendations, and reminders into one lane.", icon: Brain },
              { title: "Priority discovery", detail: "Push the farmer higher in search and match with stronger buyers.", icon: Search },
              { title: "Voice and field tools", detail: "Make the workflow lighter while the farmer is still on the move.", icon: Mic },
            ].map((item) => (
              <div key={item.title} className="rounded-[1.2rem] bg-background p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-4 font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.96))] p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12">
            <Waves className="h-6 w-6 text-emerald-700" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold text-foreground">Flow of the Pro experience</h3>
          <div className="mt-5 space-y-3">
            {[
              "Sense market movement",
              "Adjust listings and pricing",
              "Coordinate delivery and fulfillment",
              "Use platform activity to unlock stronger financing",
            ].map((step, index) => (
              <div key={step} className="flex items-start gap-3 rounded-xl bg-white/80 px-4 py-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </div>
                <p className="text-sm text-foreground">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-white/80 p-4">
            <p className="font-medium text-foreground">Mockup note</p>
            <p className="mt-1 text-sm text-muted-foreground">This preview is intentionally more operational and less promotional than the old dormant version.</p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
