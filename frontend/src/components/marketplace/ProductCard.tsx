import { motion } from "framer-motion";
import { BadgeCheck, Heart, MapPin, ShoppingCart, Star, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/hooks/useProducts";
import { getProductCounty } from "./utils";

type Props = {
  product: Product;
  index: number;
  distanceLabel?: string | null;
  onOpen: (product: Product) => void;
  onToggleLike: (productId: string) => void;
  onQuickAdd: (product: Product, quantity: number) => void;
};

export function ProductCard({
  product, index, distanceLabel,
  onOpen, onToggleLike, onQuickAdd,
}: Props) {
  const productCounty = getProductCounty(product);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group overflow-hidden rounded-[1.5rem] border border-border/70 bg-white/85 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]"
    >
      <button
        type="button"
        onClick={() => onOpen(product)}
        className="block w-full text-left"
      >
        <div className="relative">
          {product.cover_image_url ? (
            <>
              <img
                src={product.cover_image_url}
                alt={product.name}
                className="aspect-[4/3] max-h-36 w-full bg-slate-950 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 to-transparent" />
              <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                {product.video_url ? <Video className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                Tap to view and watch
              </div>
            </>
          ) : product.video_url ? (
            <>
              <video
                src={product.video_url}
                muted
                playsInline
                preload="metadata"
                className="aspect-[4/3] max-h-36 w-full bg-slate-950 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 to-transparent" />
              <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <Video className="h-3.5 w-3.5" />
                Tap to view and watch
              </div>
            </>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_42%),linear-gradient(135deg,rgba(236,253,245,1),rgba(255,255,255,0.92))] text-7xl">
              {product.image_emoji || "Farm"}
            </div>
          )}
        </div>

        <div className="space-y-2.5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="line-clamp-2 font-display text-base font-bold leading-snug text-foreground">
                {product.name}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">{product.category}</p>
            </div>
            {product.is_organic && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Organic
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{productCounty || "Unknown county"}</span>
          </div>

          {distanceLabel && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {distanceLabel}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-emerald-600" />
            <span>{product.profiles?.full_name || "Verified farmer"}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span>{product.average_rating ? product.average_rating.toFixed(1) : "New"}</span>
            <span>({product.ratings_count} ratings)</span>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-[1rem] bg-muted/50 p-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Price</p>
              <p className="mt-1 font-display text-base font-bold text-primary">KES {product.price_per_unit}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Unit</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{product.unit}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Stock</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{product.stock}</p>
            </div>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 px-3 pb-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl px-3"
          onClick={() => onToggleLike(product.id)}
        >
          <Heart className={`h-4 w-4 ${product.liked_by_me ? "fill-rose-500 text-rose-500" : ""}`} />
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => onQuickAdd(product, 1)}
        >
          <ShoppingCart className="mr-2 h-4 w-4" /> Add
        </Button>
        <Button
          onClick={() => onOpen(product)}
          className="rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Buy Now
        </Button>
      </div>
    </motion.article>
  );
}
