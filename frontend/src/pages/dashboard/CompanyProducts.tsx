import { ChangeEvent, useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { sanitizeDecimalInput } from "@/lib/inputSanitizers";

const productCategoryOptions = [
  "produce",
  "inputs",
  "seedlings",
  "fertilizer",
  "equipment",
  "logistics",
  "other",
];

const productUnitOptions = ["kg", "g", "tonne", "bag", "crate", "piece", "litre", "packet"];

type CompanyProduct = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price_per_unit: number;
  unit: string;
  minimum_order_quantity: number;
  stock: number;
  image_url: string | null;
  bulk_discount_tiers: Array<Record<string, unknown>> | null;
  is_available: boolean;
  created_at: string;
};

const initialForm = {
  name: "",
  category: "other",
  description: "",
  price_per_unit: "",
  unit: "kg",
  minimum_order_quantity: "1",
  stock: "0",
  image_url: "",
  is_available: true,
};

export default function CompanyProducts() {
  const [products, setProducts] = useState<CompanyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ products: CompanyProduct[] }>("/companies/me/products");
      setProducts(data.products || []);
      setMissingCompanyProfile(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        setProducts([]);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load company products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(initialForm);
  };

  const submit = async () => {
    const pricePerUnit = Number(form.price_per_unit);
    const minimumOrderQuantity = Number(form.minimum_order_quantity);
    const stock = Number(form.stock);

    if (!form.name.trim()) {
      toast.error("Product name is required.");
      return;
    }

    if (!form.price_per_unit.trim() || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      toast.error("Enter a valid price per unit.");
      return;
    }

    if (!form.minimum_order_quantity.trim() || !Number.isFinite(minimumOrderQuantity) || minimumOrderQuantity <= 0) {
      toast.error("Enter a valid minimum order quantity.");
      return;
    }

    if (!form.stock.trim() || !Number.isFinite(stock) || stock < 0) {
      toast.error("Enter a valid stock amount.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category.trim() || "other",
        description: form.description.trim() || null,
        price_per_unit: pricePerUnit,
        unit: form.unit.trim() || "kg",
        minimum_order_quantity: minimumOrderQuantity,
        stock,
        image_url: form.image_url.trim() || null,
        is_available: form.is_available,
      };

      if (editingId) {
        await apiFetch(`/companies/me/products/${editingId}`, { method: "PATCH", body });
        toast.success("Product updated.");
      } else {
        await apiFetch("/companies/me/products", { method: "POST", body });
        toast.success("Product created.");
      }

      resetForm();
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: CompanyProduct) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      description: product.description || "",
      price_per_unit: String(product.price_per_unit),
      unit: product.unit,
      minimum_order_quantity: String(product.minimum_order_quantity || 1),
      stock: String(product.stock),
      image_url: product.image_url || "",
      is_available: product.is_available,
    });
  };

  const handleDelete = async (productId: string) => {
    try {
      await apiFetch(`/companies/me/products/${productId}`, { method: "DELETE" });
      setProducts((current) => current.filter((product) => product.id !== productId));
      toast.success("Product removed.");
      if (editingId === productId) {
        resetForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete product.");
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const data = await apiFetch<{ url: string }>("/companies/me/products/upload-image", {
        method: "POST",
        body: formData,
      });
      setForm((current) => ({ ...current, image_url: data.url }));
      toast.success("Product image uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload product image.");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <DashboardShell title="Company Products">
      {missingCompanyProfile ? (
        <CompanySetupRequired title="Set up your company profile before adding products" />
      ) : (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">{editingId ? "Edit product" : "Add company product"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Build a catalog for your company with pricing, stock, and order thresholds.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="product_name">Product name</Label>
              <Input id="product_name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product_category">Category</Label>
                <select
                  id="product_category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {productCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product_unit">Unit</Label>
                <select
                  id="product_unit"
                  value={form.unit}
                  onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {productUnitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="price_per_unit">Price per unit</Label>
                <Input
                  id="price_per_unit"
                  type="text"
                  inputMode="decimal"
                  value={form.price_per_unit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      price_per_unit: sanitizeDecimalInput(event.target.value, { maxDecimals: 2 }),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimum_order_quantity">Min order</Label>
                <Input
                  id="minimum_order_quantity"
                  type="text"
                  inputMode="decimal"
                  value={form.minimum_order_quantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      minimum_order_quantity: sanitizeDecimalInput(event.target.value, { maxDecimals: 2 }),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="text"
                  inputMode="decimal"
                  value={form.stock}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stock: sanitizeDecimalInput(event.target.value, { maxDecimals: 2 }),
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image_url">Image URL</Label>
              <Input id="image_url" type="url" value={form.image_url} onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))} />
            </div>
            <div className="space-y-3 rounded-2xl border border-dashed border-border bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Upload product image</p>
                  <p className="text-sm text-muted-foreground">Choose a JPG, PNG, or WEBP image and the form will fill the image URL automatically.</p>
                </div>
                <Label htmlFor="company-product-image-upload" className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingImage ? "Uploading..." : "Upload image"}
                </Label>
              </div>
              <input
                id="company-product-image-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void handleImageUpload(event)}
                disabled={uploadingImage}
              />
              {form.image_url ? (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <img src={form.image_url} alt={form.name || "Company product preview"} className="aspect-[4/3] max-h-56 w-full object-cover" />
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_description">Description</Label>
              <Textarea id="product_description" rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.is_available} onChange={(event) => setForm((current) => ({ ...current, is_available: event.target.checked }))} />
              Product is available for orders
            </label>
          </div>

          <div className="flex gap-3">
            <Button type="button" className="rounded-xl" disabled={saving} onClick={() => void submit()}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : editingId ? "Save product" : "Add product"}
            </Button>
            {editingId ? (
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-xl font-bold text-foreground">Catalog</h3>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} company products available for internal sales and procurement workflows.</p>
          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No company products yet. Add the first one from the form.</div>
            ) : (
              products.map((product) => (
                <div key={product.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{product.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{product.category} • {product.stock} {product.unit} in stock</p>
                      <p className="mt-1 text-sm text-foreground">KES {product.price_per_unit.toLocaleString()} / {product.unit}</p>
                      {product.description ? <p className="mt-2 text-sm text-muted-foreground">{product.description}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => handleEdit(product)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl text-destructive hover:text-destructive" onClick={() => void handleDelete(product.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  {product.image_url ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
                      <img src={product.image_url} alt={product.name} className="aspect-[4/3] max-h-48 w-full object-cover" />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      )}
    </DashboardShell>
  );
}
