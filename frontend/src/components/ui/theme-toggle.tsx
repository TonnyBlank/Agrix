import { cn } from "@/lib/utils";
import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themeOptions = [
  {
    id: "light",
    label: "Light",
    description: "Bright surfaces for daytime work and cleaner contrast outdoors.",
    icon: Sun,
    shellClassName: "bg-[linear-gradient(180deg,#f8faf7,#eef6f1)] border-emerald-100",
    panelClassName: "bg-white border-emerald-100",
    accentClassName: "bg-emerald-500/10 text-emerald-700",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Lower glare for night use and longer review sessions.",
    icon: Moon,
    shellClassName: "bg-[linear-gradient(180deg,#10211a,#192b24)] border-white/10",
    panelClassName: "bg-[#18241f] border-white/10",
    accentClassName: "bg-amber-400/10 text-amber-200",
  },
] as const;

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = (theme === "system" ? resolvedTheme : theme) ?? "light";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border bg-background/80 px-4 py-3 dark:bg-background/50">
        <div>
          <p className="text-sm font-semibold text-foreground">Current theme</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {mounted ? `${activeTheme === "dark" ? "Dark" : "Light"} mode is active on this device.` : "Loading theme preference..."}
          </p>
        </div>
        <div className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {mounted ? activeTheme : "Loading"}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {themeOptions.map((option) => {
          const selected = mounted && activeTheme === option.id;
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              aria-pressed={selected}
              className={cn(
                "group rounded-[1.75rem] border p-4 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-primary bg-primary/5 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.45)]"
                  : "border-border bg-background/70 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background dark:bg-background/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl border",
                      option.id === "light"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-white/10 bg-[#1a2822] text-amber-200",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold text-foreground">{option.label}</p>
                    <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{option.description}</p>
                  </div>
                </div>
                <div
                  className={cn(
                    "inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[11px] font-semibold uppercase tracking-[0.16em]",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {selected ? <Check className="h-3.5 w-3.5" /> : option.label}
                </div>
              </div>

              <div className={cn("mt-5 overflow-hidden rounded-[1.35rem] border p-4", option.shellClassName)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-2.5 w-2.5 rounded-full", option.id === "light" ? "bg-emerald-300" : "bg-emerald-400")} />
                    <div className={cn("h-2.5 w-2.5 rounded-full", option.id === "light" ? "bg-gold-300" : "bg-amber-300")} />
                    <div className={cn("h-2.5 w-2.5 rounded-full", option.id === "light" ? "bg-red-200" : "bg-rose-300")} />
                  </div>
                  <div className={cn("rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]", option.accentClassName)}>
                    Preview
                  </div>
                </div>

                <div className={cn("mt-4 rounded-[1.1rem] border p-3", option.panelClassName)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={cn("h-2.5 w-24 rounded-full", option.id === "light" ? "bg-slate-200" : "bg-white/15")} />
                      <div className={cn("mt-2 h-2.5 w-16 rounded-full", option.id === "light" ? "bg-slate-100" : "bg-white/10")} />
                    </div>
                    <div className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", option.id === "light" ? "bg-emerald-100 text-emerald-700" : "bg-emerald-500/15 text-emerald-200")}>
                      Active field view
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className={cn("rounded-2xl border p-3", option.id === "light" ? "border-emerald-100 bg-[#f6fbf8]" : "border-white/10 bg-[#20322a]")}>
                      <div className={cn("h-2.5 w-12 rounded-full", option.id === "light" ? "bg-emerald-200" : "bg-emerald-500/40")} />
                      <div className={cn("mt-3 h-10 rounded-xl", option.id === "light" ? "bg-white" : "bg-[#15211c]")} />
                    </div>
                    <div className={cn("rounded-2xl border p-3", option.id === "light" ? "border-emerald-100 bg-[#f6fbf8]" : "border-white/10 bg-[#20322a]")}>
                      <div className={cn("h-2.5 w-10 rounded-full", option.id === "light" ? "bg-gold-200" : "bg-amber-400/30")} />
                      <div className={cn("mt-3 h-10 rounded-xl", option.id === "light" ? "bg-[#eef6f1]" : "bg-[#111a16]")} />
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
