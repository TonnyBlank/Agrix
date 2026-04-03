import { motion } from "framer-motion";
import { Banknote, Handshake, Search, UserPlus } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Sign Up in 60 Seconds",
    description: "Farmer or buyer - verify with your ID and phone number, then get instant access.",
  },
  {
    icon: Search,
    step: "02",
    title: "Discover & Connect",
    description: "Browse AI-curated listings or post what you need so supply and demand meet faster.",
  },
  {
    icon: Handshake,
    step: "03",
    title: "Secure the Deal",
    description: "Smart escrow securely holds platform funds until buyer delivery verification via digital signature.",
  },
  {
    icon: Banknote,
    step: "04",
    title: "Get Paid Instantly",
    description: "Once delivery is confirmed, funds move to the farmer without middlemen or delays.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-muted/50 py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-widest text-accent">
            Simple Process
          </span>
          <h2 className="mt-3 mb-4 text-3xl font-display font-bold text-foreground md:text-5xl">
            From Farm to Market in <span className="text-gradient-gold">4 Steps</span>
          </h2>
          <p className="mx-auto max-w-3xl text-lg leading-8 text-muted-foreground">
            A clear step-by-step flow makes it easier to scan how sign-up, matching, delivery, and payment fit together.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative flex min-h-[260px] flex-col rounded-[1.85rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,246,0.92))] p-6 text-left shadow-[0_18px_45px_-38px_rgba(15,23,42,0.42)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_24px_50px_-34px_rgba(21,128,61,0.2)] sm:p-7"
            >
              <span className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground shadow-sm">
                {step.step}
              </span>

              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-primary/10 transition-colors group-hover:bg-primary/15">
                <step.icon className="h-8 w-8 text-primary" />
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Step {step.step}
              </p>
              <h3 className="mt-4 font-display text-xl font-semibold leading-8 text-foreground">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
