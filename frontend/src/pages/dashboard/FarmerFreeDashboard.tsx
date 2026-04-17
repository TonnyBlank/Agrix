import { ArrowRight, Bell, CalendarDays, Coins, Package, ScanLine, Sprout, TrendingUp, Users } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/hooks/useAuth";

const quickStats = [
  { label: "Listings used", value: "3 / 10", note: "Free plan visibility this month", icon: Package, tone: "bg-emerald-500/10 text-emerald-700" },
  { label: "Buyer messages", value: "4", note: "Open conversations waiting for follow-up", icon: Users, tone: "bg-sky-500/10 text-sky-700" },
  { label: "Price alerts", value: "3", note: "Live crop movement notices", icon: Bell, tone: "bg-amber-500/10 text-amber-700" },
  { label: "Weekly momentum", value: "+12%", note: "Marketplace activity vs last week", icon: TrendingUp, tone: "bg-violet-500/10 text-violet-700" },
];

const nextSteps = [
  "Publish one more clean listing with better product details and pricing.",
  "Reply to buyer messages within the same day to keep orders moving.",
  "Use crop calendar and scanner tools to stay ahead without needing Pro yet.",
];

export default function FarmerFreeDashboard() {
  const { profile, user } = useAuth();
  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    "Farmer";
  const firstName = displayName.split(" ")[0];

  return (
    <DashboardShell title="Farmer Free Preview">
      <section className="mb-8 rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(250,204,21,0.12),_transparent_34%),linear-gradient(135deg,rgba(248,255,251,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(16,185,129,0.28)]">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex rounded-full border border-emerald-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Preview Only
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-foreground">A lighter command center for {firstName}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This mockup is designed for the free farmer plan: fewer distractions, clear trading basics, and simple nudges toward the actions that matter most before upgrading.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/dashboard/products" className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Add listing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/dashboard/upgrade" className="inline-flex items-center rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                See Pro upgrade
              </Link>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-200/70 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Free Plan Priorities</p>
            <div className="mt-4 space-y-3">
              {nextSteps.map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-xl bg-background px-3 py-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </div>
                  <p className="text-sm text-foreground">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        {quickStats.map((stat) => (
          <div key={stat.label} className="rounded-[1.4rem] border border-border bg-card p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${stat.tone}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[1.6rem] border border-border bg-card p-6">
          <h3 className="font-display text-xl font-bold text-foreground">Core tools in the free workspace</h3>
          <p className="mt-1 text-sm text-muted-foreground">The free dashboard should emphasize only what helps a small farmer trade better without overwhelming them.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              { title: "Listings", detail: "Add and update produce for marketplace discovery.", icon: Package },
              { title: "Crop scanner", detail: "Use quick field checks when crop issues show up.", icon: ScanLine },
              { title: "Calendar", detail: "Track important farm tasks and timing windows.", icon: CalendarDays },
              { title: "Price watch", detail: "See simple crop movement and market pressure signals.", icon: Coins },
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

        <section className="rounded-[1.6rem] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.96))] p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/12">
            <Sprout className="h-6 w-6 text-amber-700" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold text-foreground">Upgrade path preview</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Instead of hard-selling, this preview shows what naturally becomes useful next: more listings, better analytics, stronger financing signals, and deeper supplier discovery.
          </p>
          <div className="mt-5 space-y-3">
            {["Unlimited product listings", "Loan readiness and credit signals", "Deeper analytics and demand hints"].map((line) => (
              <div key={line} className="rounded-xl bg-white/80 px-4 py-3 text-sm text-foreground">
                {line}
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
