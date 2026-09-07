import { motion } from "framer-motion";
import {
  Banknote,
  CloudSun,
  LineChart,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";

const serviceGroups = [
  {
    icon: Sprout,
    title: "Farmer Services",
    description: "Mobile-first tools that help farmers and producers plan, sell, price, and manage daily work.",
    items: [
      "Access to retailers, wholesalers, exporters, and consumers",
      "Digital advisory tools for crops, poultry, livestock, dairy, and field support",
      "Fair pricing signals and stronger market access",
      "Farm, flock, herd, and storage support with weather updates in the mobile app",
    ],
  },
  {
    icon: Store,
    title: "Marketplace & Trade",
    description: "Direct commerce channels for produce, eggs, dairy, livestock, inputs, and repeat buyers.",
    items: [
      "Farmers and suppliers connect directly with verified buyers",
      "E-commerce workflows for agricultural products and services",
      "Wholesale and B2B sales channels",
      "Residential and retail distribution models",
    ],
  },
  {
    icon: Truck,
    title: "Logistics & Supply Chain",
    description: "Operational visibility from pickup planning through storage, dispatch, and final delivery.",
    items: [
      "Transportation coordination for agricultural goods and inputs",
      "Cold-chain and storage solution support",
      "Real-time logistics tracking for buyers and suppliers",
      "Dispatch workflows for transport partners",
    ],
  },
  {
    icon: Banknote,
    title: "Financial Services",
    description: "Embedded financial access designed around verified production, trade, and repayment behavior.",
    items: [
      "Microloans and agricultural financing",
      "Insurance services for farming risks",
      "Green credit opportunities for farmers and agribusinesses",
      "Repayment pathways linked to successful sales",
    ],
  },
  {
    icon: LineChart,
    title: "Agricultural Intelligence",
    description: "GMCIS and AI-assisted insight for climate, markets, research, and African agriculture.",
    items: [
      "Geospatial and climate insights through GMCIS",
      "AI advisory briefs for crops, poultry, livestock, dairy, and logistics decisions",
      "Research and expert analysis on African agriculture",
      "Think tank articles on food systems, digital agriculture, and agricultural finance",
      "Market signals that support better production, pricing, and sales decisions",
    ],
  },
];

const highlights = [
  { icon: ShoppingCart, label: "Direct buyer channels" },
  { icon: Warehouse, label: "Storage and cold-chain support" },
  { icon: ShieldCheck, label: "Insurance and secured trade" },
  { icon: CloudSun, label: "Weather and climate intelligence" },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function ServicesSection() {
  return (
    <section id="services" className="scroll-mt-20 bg-muted/40 py-24 md:scroll-mt-24 md:py-32">
      <div className="container">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-sm font-semibold uppercase tracking-widest text-accent">
              Platform Services
            </span>
            <h2 className="mt-3 text-3xl font-display font-bold leading-tight text-foreground md:text-5xl">
              One operating layer for{" "}
              <span className="text-gradient-gold">farm services, trade, and intelligence</span>
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              AgriLink X brings farmer support, digital commerce, logistics, finance, and agricultural insight into
              one connected platform for crops, poultry, eggs, livestock, dairy, inputs, and African food systems.
            </p>
          </motion.div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {highlights.map((highlight) => (
              <motion.div
                key={highlight.label}
                variants={item}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-border/80 bg-background/80 px-4 py-3 shadow-[0_14px_35px_-32px_rgba(15,23,42,0.45)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <highlight.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold leading-6 text-foreground">
                  {highlight.label}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {serviceGroups.map((group) => (
            <motion.article
              key={group.title}
              variants={item}
              className="flex min-h-[380px] flex-col rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,246,0.92))] p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_24px_54px_-34px_rgba(21,128,61,0.22)] sm:p-7"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-primary/10 text-primary">
                <group.icon className="h-7 w-7" />
              </div>
              <h3 className="font-display text-xl font-semibold leading-8 text-foreground">
                {group.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {group.description}
              </p>
              <ul className="mt-6 space-y-3">
                {group.items.map((service) => (
                  <li key={service} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
