import { cn } from "@/lib/utils";

type BrandWordmarkProps = {
  className?: string;
  xClassName?: string;
};

export default function BrandWordmark({ className, xClassName }: BrandWordmarkProps) {
  return (
    <span className={cn("font-display font-bold leading-none", className)}>
      AgriLink<span className={cn("text-gradient-gold", xClassName)}> X</span>
    </span>
  );
}
