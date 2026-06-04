import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type Props = {
  itemCount: number;
  total: number;
};

export function CartSummary({ itemCount, total }: Props) {
  return (
    <div className="w-full rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-background/60 xl:max-w-xs">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Cart Overview
      </p>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{itemCount} items</p>
      <p className="mt-1 text-sm text-muted-foreground">
        KES {total.toLocaleString()} estimated total with delivery.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/dashboard/cart">Open Cart</Link>
        </Button>
        <Button asChild className="rounded-xl">
          <Link to="/dashboard/orders">Orders</Link>
        </Button>
      </div>
    </div>
  );
}
