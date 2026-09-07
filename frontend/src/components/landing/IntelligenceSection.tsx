import { motion } from "framer-motion";
import farmerImg from "@/assets/farmer-tablet.png";

const insights = [
  { commodity: "Eggs", trend: "+18%", demand: "High", price: "KES 420/tray" },
  { commodity: "Tomatoes", trend: "+23%", demand: "High", price: "KES 85/kg" },
  { commodity: "Milk", trend: "+9%", demand: "Moderate", price: "KES 62/L" },
  { commodity: "Broilers", trend: "+14%", demand: "Rising", price: "KES 520/bird" },
];

const intelligenceTools = [
  "GMCIS geo-mapping for farm, climate, logistics, and market visibility",
  "AI advisory briefs for crops, poultry, eggs, livestock, dairy, and storage decisions",
  "Research briefs on African food systems and digital agriculture",
  "Agricultural finance analysis for lenders, farmers, and agribusinesses",
];

export default function IntelligenceSection() {
  return (
    <section id="intelligence" className="scroll-mt-20 overflow-hidden bg-background py-24 md:scroll-mt-24 md:py-32">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-sm font-semibold tracking-widest uppercase text-accent">
              GMCIS Intelligence
            </span>
            <h2 className="text-3xl md:text-5xl font-display font-bold mt-3 mb-6 text-foreground">
              Geospatial Decisions,{" "}
              <span className="text-gradient-gold">Bigger Profits</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              The Geo-Mapping and Climate Intelligence System connects field, flock, herd, climate, logistics,
              market demand, and expert analysis so farmers and agribusinesses can plan with stronger evidence.
            </p>

            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {intelligenceTools.map((tool) => (
                <div key={tool} className="flex gap-3 rounded-2xl border border-border bg-card/80 p-4">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <p className="text-sm leading-6 text-muted-foreground">{tool}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="p-4 border-b border-border bg-muted/50">
                <span className="text-sm font-semibold text-foreground">Live Market Trends</span>
                <span className="ml-2 text-xs text-muted-foreground">Updated 5 min ago</span>
              </div>
              <div className="divide-y divide-border">
                {insights.map((item) => (
                  <div key={item.commodity} className="flex items-center justify-between p-4">
                    <span className="font-medium text-foreground text-sm">{item.commodity}</span>
                    <span
                      className={`text-sm font-semibold ${
                        item.trend.startsWith("+") ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {item.trend}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {item.demand}
                    </span>
                    <span className="text-sm font-mono text-muted-foreground">{item.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative flex justify-center"
          >
            <div className="relative">
              <div className="absolute -inset-8 rounded-full bg-primary/5 blur-3xl" />
              <img
                src={farmerImg}
                alt="Farmer using AgriLink X on a tablet"
                loading="lazy"
                decoding="async"
                className="relative w-full max-w-[400px] md:max-w-[480px] drop-shadow-2xl animate-float"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
