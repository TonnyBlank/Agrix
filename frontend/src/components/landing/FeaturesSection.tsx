import { motion } from "framer-motion";
import {
  Brain,
  TrendingUp,
  Shield,
  Camera,
  CreditCard,
  Users,
} from "lucide-react";

const features = [
  {
    icon: Camera,
    title: "AI Crop Scanner",
    description: "Upload a photo of your crops. Advanced AI instantly detects pests, diseases, and nutrient deficiencies.",
    tag: "Computer Vision",
  },
  {
    icon: TrendingUp,
    title: "Dynamic Marketplace",
    description: "List your produce directly to verified buyers. A robust e-commerce platform built for the agricultural sector.",
    tag: "Trade Direct",
  },
  {
    icon: Shield,
    title: "Secure Escrow",
    description: "Funds are held securely until digital signature delivery confirmation. Built-in logic deducts penalties if buyers refuse without cause.",
    tag: "Protection",
  },
  {
    icon: Users,
    title: "Flexible Micro-Loans",
    description: "Secure larger micro-loans by building trust through platform activity. A dedicated financial portal for your farming needs.",
    tag: "Financing",
  },
  {
    icon: Brain,
    title: "Farm Profiling",
    description: "Record detailed agricultural data—soil type, irrigation, farm size—to automatically improve your loan eligibility.",
    tag: "Smart Data",
  },
  {
    icon: CreditCard,
    title: "In-Kind Repayment",
    description: "Pay back loans with your produce! The escrow system automatically deducts repayment amounts when you sell your harvest.",
    tag: "Flexibility",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-background py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-widest text-accent">
            Revolutionary Features
          </span>
          <h2 className="mt-3 mb-4 text-3xl font-display font-bold text-foreground md:text-5xl">
            6 Features That Change <span className="text-gradient-gold">Everything</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Not just a marketplace for crops and trade, but an ecosystem that makes Kenyan agriculture
            intelligent, profitable, and connected.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={item}
              className="group relative flex min-h-[255px] flex-col rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,246,0.92))] p-7 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_24px_54px_-34px_rgba(21,128,61,0.22)] sm:min-h-[280px] sm:p-8"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-primary/10 transition-colors group-hover:bg-primary/20">
                <feature.icon className="h-7 w-7 text-primary" />
              </div>
              <span className="mb-4 inline-flex w-fit rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {feature.tag}
              </span>
              <h3 className="text-lg font-display font-semibold leading-7 text-foreground">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
