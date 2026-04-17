import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Crosshair, Edit3, MapPin, Package, Ruler, Shield, Sprout, Tractor, Trees, Video, Wheat } from "lucide-react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FarmMap from "@/components/dashboard/FarmMap";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useMyProducts } from "@/hooks/useProducts";
import { apiFetch } from "@/lib/api";
import { countyOptions, findCountyForSubCounty, findCountyOption, subCountyOptions } from "@/lib/kenyaLocations";
import { toast } from "sonner";

const farmChecklist = [
  { key: "county", label: "Location added" },
  { key: "farm_size", label: "Farm size recorded" },
  { key: "main_crops", label: "Main crops listed" },
  { key: "farm_type", label: "Farm type selected" },
  { key: "irrigation_type", label: "Irrigation method added" },
  { key: "bio", label: "Farm story written" },
  { key: "operations", label: "Operations details added" },
];

const farmSizeOptions = ["Under 1 Acre", "1-3 Acres", "4-10 Acres", "11-25 Acres", "26-50 Acres", "50+ Acres"];
const cropOptions = ["Maize", "Beans", "Tomatoes", "Potatoes", "Onions", "Cabbage", "Spinach", "Kale", "Avocado", "Bananas", "Coffee", "Tea", "Rice", "Wheat", "Dairy Feed"];
const farmTypeOptions = [
  { value: "subsistence", label: "Subsistence" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed", label: "Mixed" },
  { value: "livestock", label: "Livestock" },
  { value: "horticulture", label: "Horticulture" },
  { value: "agroforestry", label: "Agroforestry" },
];
const irrigationOptions = [
  { value: "rainfed", label: "Rainfed" },
  { value: "drip", label: "Drip" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "canal", label: "Canal" },
  { value: "none", label: "None" },
];

function formatStoredLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCoordinateValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function MyFarm() {
  const { profile, applyProfileUpdate } = useAuth();
  const { products } = useMyProducts();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [subCounty, setSubCounty] = useState<string>(() => localStorage.getItem("farm_sub_county") || "");
  const [formData, setFormData] = useState({
    county: "",
    farm_size: "",
    main_crops: "",
    custom_crops: "",
    bio: "",
    sub_county: "",
    farm_type: "",
    irrigation_type: "",
    soil_type: "",
    years_farming: "",
    cooperative_name: "",
    has_storage: false,
    has_transport: false,
    farm_gps_lat: "",
    farm_gps_lng: "",
  });
  const bioCharacterLimit = 50;
  const savedFarmCoordinates = useMemo(() => {
    const lat = parseCoordinateValue(profile?.farm_gps_lat);
    const lng = parseCoordinateValue(profile?.farm_gps_lng);
    return lat === null || lng === null ? null : { lat, lng };
  }, [profile?.farm_gps_lat, profile?.farm_gps_lng]);
  const editFarmCoordinates = useMemo(() => {
    const lat = parseCoordinateValue(formData.farm_gps_lat);
    const lng = parseCoordinateValue(formData.farm_gps_lng);
    return lat === null || lng === null ? null : { lat, lng };
  }, [formData.farm_gps_lat, formData.farm_gps_lng]);

  const profileCompletion = useMemo(() => {
    const checks = {
      county: Boolean(profile?.county),
      farm_size: Boolean(profile?.farm_size),
      main_crops: Boolean(profile?.main_crops?.length),
      farm_type: Boolean(profile?.farm_type),
      irrigation_type: Boolean(profile?.irrigation_type),
      bio: Boolean(profile?.bio),
      operations: Boolean(
        (profile?.years_farming ?? null) !== null ||
          profile?.has_storage ||
          profile?.has_transport ||
          profile?.cooperative_name,
      ),
    };

    const completed = Object.values(checks).filter(Boolean).length;
    return {
      checks,
      completed,
      percent: Math.round((completed / farmChecklist.length) * 100),
    };
  }, [profile]);

  const farmInsights = useMemo(() => {
    const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
    const videoListings = products.filter((product) => product.video_url).length;
    const categories = new Set(products.map((product) => product.category).filter(Boolean));

    return {
      totalListings: products.length,
      totalStock,
      videoListings,
      categories: categories.size,
    };
  }, [products]);

  const inferredCounty = useMemo(() => findCountyForSubCounty(subCounty), [subCounty]);
  const resolvedCounty = profile?.county || inferredCounty || "";
  const topCrops = useMemo(() => profile?.main_crops?.slice(0, 5) ?? [], [profile]);
  const locationDisplay = useMemo(
    () => [subCounty, resolvedCounty].filter(Boolean).join(", ") || "Location not set",
    [resolvedCounty, subCounty],
  );
  const allTrustSignalsComplete = profileCompletion.completed === farmChecklist.length;

  const heroStats = useMemo(
    () => [
      {
        key: "completion",
        icon: CheckCircle2,
        label: "Profile Complete",
        value: `${profileCompletion.percent}%`,
        note: `${profileCompletion.completed}/${farmChecklist.length} essentials saved`,
      },
      {
        key: "listings",
        icon: Package,
        label: "Live Listings",
        value: `${farmInsights.totalListings}`,
        note: `${farmInsights.totalStock} stock units listed`,
      },
      {
        key: "videos",
        icon: Video,
        label: "Video Proof",
        value: `${farmInsights.videoListings}`,
        note: farmInsights.videoListings > 0 ? "Buyers can verify freshness faster" : "Add product videos to build more trust",
      },
    ],
    [farmInsights, profileCompletion],
  );

  const overviewCards = useMemo(
    () => [
      {
        key: "location",
        icon: MapPin,
        label: "Farm Area",
        value: locationDisplay,
        note: "This is the first location view buyers now see.",
      },
      {
        key: "size",
        icon: Ruler,
        label: "Farm Size",
        value: profile?.farm_size || "Not set",
        note: "Helps buyers understand your supply capacity.",
      },
      {
        key: "crops",
        icon: Wheat,
        label: "Main Crops",
        value: profile?.main_crops?.length ? `${profile.main_crops.length} crop types` : "Not set",
        note: profile?.main_crops?.join(", ") || "Add crops to show what your farm specializes in.",
      },
      {
        key: "readiness",
        icon: Shield,
        label: "Buyer Readiness",
        value: profileCompletion.percent >= 75 ? "Buyer ready" : "Needs details",
        note: `${profileCompletion.completed} of ${farmChecklist.length} trust signals are complete.`,
      },
    ],
    [locationDisplay, profile, profileCompletion],
  );

  const operationCards = useMemo(
    () => [
      {
        key: "farm_type",
        icon: Tractor,
        label: "Farm Type",
        value: formatStoredLabel(profile?.farm_type),
        note: "Shows your production model at a glance.",
      },
      {
        key: "irrigation",
        icon: Shield,
        label: "Irrigation",
        value: formatStoredLabel(profile?.irrigation_type),
        note: "Helps buyers understand water reliability and seasonality.",
      },
      {
        key: "soil",
        icon: Trees,
        label: "Soil Type",
        value: profile?.soil_type || "Not set",
        note: "Useful when buyers care about growing conditions.",
      },
      {
        key: "experience",
        icon: Sprout,
        label: "Experience",
        value:
          (profile?.years_farming ?? null) !== null && (profile?.years_farming ?? undefined) !== undefined
            ? `${profile?.years_farming} years`
            : "Not set",
        note: "A quick signal of how long you have been farming.",
      },
    ],
    [profile],
  );

  const infrastructureItems = useMemo(
    () => [
      {
        key: "storage",
        label: "Storage",
        value: profile?.has_storage ? "Available" : "Not added",
      },
      {
        key: "transport",
        label: "Transport",
        value: profile?.has_transport ? "Available" : "Not added",
      },
      {
        key: "cooperative",
        label: "Co-operative",
        value: profile?.cooperative_name || "Not added",
      },
    ],
    [profile],
  );

  const identityRows = useMemo(
    () => [
      {
        key: "county",
        label: "County",
        value: resolvedCounty || "Not set",
      },
      {
        key: "sub_county",
        label: "Sub-county",
        value: subCounty || "Not set",
      },
      {
        key: "gps",
        label: "Farm GPS",
        value: savedFarmCoordinates ? `${savedFarmCoordinates.lat.toFixed(5)}, ${savedFarmCoordinates.lng.toFixed(5)}` : "Not set",
      },
      {
        key: "farm_size",
        label: "Farm size",
        value: profile?.farm_size || "Not set",
      },
      {
        key: "farm_type",
        label: "Farm type",
        value: formatStoredLabel(profile?.farm_type),
      },
      {
        key: "irrigation_type",
        label: "Irrigation",
        value: formatStoredLabel(profile?.irrigation_type),
      },
    ],
    [profile, resolvedCounty, savedFarmCoordinates, subCounty],
  );

  const handleEdit = () => {
    setFormData({
      county: profile?.county || inferredCounty || "",
      farm_size: profile?.farm_size || "",
      main_crops: (profile?.main_crops || []).filter((crop) => cropOptions.includes(crop)).join(", "),
      custom_crops: (profile?.main_crops || []).filter((crop) => !cropOptions.includes(crop)).join(", "),
      bio: profile?.bio || "",
      sub_county: localStorage.getItem("farm_sub_county") || "",
      farm_type: profile?.farm_type || "",
      irrigation_type: profile?.irrigation_type || "",
      soil_type: profile?.soil_type || "",
      years_farming:
        (profile?.years_farming ?? null) !== null && (profile?.years_farming ?? undefined) !== undefined
          ? String(profile?.years_farming)
          : "",
      cooperative_name: profile?.cooperative_name || "",
      has_storage: Boolean(profile?.has_storage),
      has_transport: Boolean(profile?.has_transport),
      farm_gps_lat: profile?.farm_gps_lat !== null && profile?.farm_gps_lat !== undefined ? String(profile.farm_gps_lat) : "",
      farm_gps_lng: profile?.farm_gps_lng !== null && profile?.farm_gps_lng !== undefined ? String(profile.farm_gps_lng) : "",
    });
    setIsEditOpen(true);
  };

  const updateFarmCoordinates = (coordinates: { lat: number; lng: number }) => {
    setFormData((current) => ({
      ...current,
      farm_gps_lat: coordinates.lat.toFixed(6),
      farm_gps_lng: coordinates.lng.toFixed(6),
    }));
  };

  const handleCaptureGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("GPS is not supported on this device or browser.");
      return;
    }

    setIsCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateFarmCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsCapturingGps(false);
        toast.success("Live farm GPS captured. Save changes to record it.");
      },
      (error) => {
        setIsCapturingGps(false);
        toast.error(error.message || "Unable to capture your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    const normalizedSubCounty = formData.sub_county.trim();
    const normalizedCounty = findCountyOption(formData.county) || formData.county.trim() || findCountyForSubCounty(normalizedSubCounty) || "";
    const normalizedYears = formData.years_farming.trim();
    const normalizedGpsLat = parseCoordinateValue(formData.farm_gps_lat);
    const normalizedGpsLng = parseCoordinateValue(formData.farm_gps_lng);

    localStorage.setItem("farm_sub_county", normalizedSubCounty);
    setSubCounty(normalizedSubCounty);

    if (formData.bio.trim().length > bioCharacterLimit) {
      toast.error(`About your farm must be ${bioCharacterLimit} characters or less.`);
      setIsSaving(false);
      return;
    }

    if (normalizedYears) {
      const parsedYears = Number(normalizedYears);
      if (!Number.isInteger(parsedYears) || parsedYears < 0) {
        toast.error("Years farming must be a whole number starting from 0.");
        setIsSaving(false);
        return;
      }
    }

    if (normalizedGpsLat === null || normalizedGpsLng === null) {
      toast.error("Capture the real farm GPS location before saving.");
      setIsSaving(false);
      return;
    }

    try {
      const selectedCrops = formData.main_crops
        .split(",")
        .map((crop) => crop.trim())
        .filter(Boolean);
      const customCrops = formData.custom_crops
        .split(",")
        .map((crop) => crop.trim())
        .filter(Boolean);

      const updatedProfile = await apiFetch<typeof profile>("/profiles/me", {
        method: "PATCH",
        body: {
          county: normalizedCounty || null,
          farm_size: formData.farm_size || null,
          main_crops: [...new Set([...selectedCrops, ...customCrops])],
          bio: formData.bio.trim() || null,
          farm_type: formData.farm_type || null,
          irrigation_type: formData.irrigation_type || null,
          soil_type: formData.soil_type.trim() || null,
          years_farming: normalizedYears ? Number(normalizedYears) : null,
          cooperative_name: formData.cooperative_name.trim() || null,
          has_storage: formData.has_storage,
          has_transport: formData.has_transport,
          farm_gps_lat: normalizedGpsLat,
          farm_gps_lng: normalizedGpsLng,
        } as unknown as BodyInit,
      });

      if (updatedProfile) {
        applyProfileUpdate(updatedProfile);
      }

      toast.success("Farm profile updated successfully!");
      setIsEditOpen(false);
    } catch (error) {
      toast.error("Failed to update profile: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const availableSubCounties = useMemo(() => {
    const matchedCounty = findCountyOption(formData.county);
    return matchedCounty ? subCountyOptions[matchedCounty] || [] : [];
  }, [formData.county]);

  const selectedCropValues = useMemo(
    () =>
      formData.main_crops
        .split(",")
        .map((crop) => crop.trim())
        .filter(Boolean),
    [formData.main_crops],
  );

  const toggleCrop = (crop: string) => {
    const nextSelected = selectedCropValues.includes(crop)
      ? selectedCropValues.filter((item) => item !== crop)
      : [...selectedCropValues, crop];

    setFormData((current) => ({
      ...current,
      main_crops: nextSelected.join(", "),
    }));
  };

  return (
    <DashboardShell title="My Farm">
      <div className="space-y-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[1.6rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.99))] shadow-[0_20px_50px_-32px_rgba(16,185,129,0.3)] dark:border-emerald-500/20 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),linear-gradient(135deg,rgba(10,24,18,0.96),rgba(15,23,42,0.98))]"
        >
          <div className="border-b border-emerald-100/80 px-4 py-3.5 dark:border-emerald-500/10 sm:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <Tractor className="h-4 w-4" />
                  <span className="text-sm font-semibold uppercase tracking-[0.2em]">Farm Command</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    Live Area Map
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-foreground dark:border-emerald-500/20 dark:bg-background/60">
                    {locationDisplay}
                  </span>
                  <span className="rounded-full border border-border bg-white/80 px-3 py-1 text-xs font-semibold text-muted-foreground dark:bg-background/60">
                    {profile?.farm_size || "Add farm size"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="rounded-[1.15rem] bg-white/85 px-3 py-2 shadow-sm ring-1 ring-emerald-100 dark:bg-background/70 dark:ring-emerald-500/20">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Buyer Readiness</p>
                  <p className="mt-1 font-display text-[1.35rem] font-bold text-foreground">{profileCompletion.percent}%</p>
                </div>
                <Button onClick={handleEdit} className="h-10 rounded-[1.15rem] bg-emerald-600 px-4 text-white hover:bg-emerald-700">
                  <Edit3 className="mr-2 h-4 w-4" /> Update Farm
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1.2fr)_20rem]">
            <div className="space-y-4">
              <FarmMap
                location={resolvedCounty}
                subCounty={subCounty}
                coordinates={savedFarmCoordinates}
                heightClassName="h-[280px] sm:h-[320px] lg:h-[360px]"
              />

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {heroStats.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.key}
                      className="rounded-[1.25rem] border border-white/80 bg-white/85 p-3 shadow-sm dark:border-white/10 dark:bg-background/60"
                    >
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <Icon className="h-4 w-4" />
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      </div>
                      <p className="mt-1.5 font-display text-[1.4rem] font-bold text-foreground">{item.value}</p>
                      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{item.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.35rem] border border-white/80 bg-white/90 p-3.5 shadow-sm dark:border-white/10 dark:bg-background/60">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Farm Command Center</p>
                      <p className="mt-1.5 font-display text-[1.5rem] font-bold text-foreground">{resolvedCounty || "County not set"}</p>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                        {subCounty
                          ? `Buyers will see ${[subCounty, resolvedCounty].filter(Boolean).join(", ")} on your farm map and farm profile.`
                          : "Add the county and sub-county you want buyers to see first on your farm profile."}
                      </p>
                    </div>
                    <Button onClick={handleEdit} variant="outline" className="h-9 rounded-xl px-3">
                      <Edit3 className="mr-2 h-4 w-4" /> Edit
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {profileCompletion.percent >= 75 ? "Buyer Ready" : "Needs Details"}
                    </span>
                    <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground">
                      {profile?.farm_size || "Add farm size"}
                    </span>
                    <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground">
                      {formatStoredLabel(profile?.farm_type)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-foreground">
                    {identityRows.map((item) => (
                      <div key={item.key} className="flex items-center justify-between rounded-[1rem] bg-muted/40 px-3 py-2">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-4"
          >
            <div className="rounded-[1.55rem] border border-border/70 bg-white/90 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
              <div className="mb-4">
                <h3 className="font-display text-[1.35rem] font-bold text-foreground">Farm Overview</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your production summary sits here so buyers can understand what you grow and how you farm.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overviewCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.key} className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                        </div>
                      </div>
                      {item.key === "readiness" && !allTrustSignalsComplete ? (
                        <div className="mt-3">
                          <span className="inline-flex max-w-full rounded-2xl bg-amber-100 px-3 py-2 text-sm font-semibold leading-5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            {item.note}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_18rem]">
                <div className="grid gap-3">
                  <div className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Crop Focus</p>
                        <p className="mt-1 text-sm text-muted-foreground">Show buyers exactly what your farm specializes in.</p>
                      </div>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-foreground dark:bg-background/80">
                        {profile?.main_crops?.length || 0} crop types
                      </span>
                    </div>

                    {!!topCrops.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {topCrops.map((crop) => (
                          <span
                            key={crop}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            {crop}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Add your main crops so the page shows exactly what your farm specializes in.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Farm Story</p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {profile?.bio || "Add a short farm story that explains your growing methods, consistency, and what makes your produce special."}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Infrastructure</p>
                  <p className="mt-1 text-sm text-muted-foreground">Storage, transport, and co-operative support at a glance.</p>

                  <div className="mt-3 space-y-2">
                    {infrastructureItems.map((item) => (
                      <div key={item.key} className="rounded-[1rem] bg-white/85 px-3 py-2 dark:bg-background/70">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.55rem] border border-border/70 bg-white/90 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
              <div className="mb-4">
                <h3 className="font-display text-[1.25rem] font-bold text-foreground">Farm Operations</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Water access, soil, farm type, and experience are grouped together here.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {operationCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.key} className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            <div className="rounded-[1.55rem] border border-border/70 bg-white/90 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
              <h3 className="font-display text-[1.1rem] font-bold text-foreground">Farm Readiness</h3>
              <p className="mt-1 text-sm text-muted-foreground">Complete these items to make your farm profile stronger.</p>

              <div className="mt-3 space-y-2">
                {farmChecklist.map((item) => {
                  const complete = profileCompletion.checks[item.key as keyof typeof profileCompletion.checks];

                  return (
                    <div key={item.key} className="flex items-center justify-between rounded-[1rem] bg-muted/35 px-3 py-2">
                      <span className="text-[13px] font-medium text-foreground">{item.label}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {complete ? "Done" : "Missing"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.55rem] border border-border/70 bg-white/90 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
              <h3 className="font-display text-[1.1rem] font-bold text-foreground">Listing Summary</h3>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div className="rounded-[1rem] bg-muted/40 p-3 text-center">
                  <Package className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-1.5 font-display text-[1.25rem] font-bold text-foreground">{farmInsights.totalListings}</p>
                  <p className="text-xs text-muted-foreground">Products</p>
                </div>
                <div className="rounded-[1rem] bg-muted/40 p-3 text-center">
                  <Video className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-1.5 font-display text-[1.25rem] font-bold text-foreground">{farmInsights.videoListings}</p>
                  <p className="text-xs text-muted-foreground">With Video</p>
                </div>
                <div className="rounded-[1rem] bg-muted/40 p-3 text-center">
                  <Trees className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-1.5 font-display text-[1.25rem] font-bold text-foreground">{farmInsights.categories}</p>
                  <p className="text-xs text-muted-foreground">Categories</p>
                </div>
                <div className="rounded-[1rem] bg-muted/40 p-3 text-center">
                  <Sprout className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-1.5 font-display text-[1.25rem] font-bold text-foreground">{farmInsights.totalStock}</p>
                  <p className="text-xs text-muted-foreground">Stock Units</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.55rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.94))] dark:shadow-[0_18px_40px_-24px_rgba(16,185,129,0.25)]">
              <h3 className="font-display text-[1.1rem] font-bold text-foreground">What Buyers Want</h3>
              <div className="mt-2.5 space-y-2 text-sm text-muted-foreground">
                <p>Keep your county and farm size filled in so your profile feels trustworthy.</p>
                <p>Add clear crop names, irrigation details, and farming experience so buyers know how you operate.</p>
                <p>Storage, transport, and product videos all help buyers judge reliability faster.</p>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Edit Farm Profile</DialogTitle>
            <DialogDescription>Update your farm details to build trust with buyers.</DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Location</p>
              <p className="text-sm text-muted-foreground">Where the farm is and the size buyers should see.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="county">County</Label>
                <select
                  id="county"
                  value={findCountyOption(formData.county) ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    const nextSubCounties = subCountyOptions[value] ?? [];
                    setFormData((current) => ({
                      ...current,
                      county: value,
                      sub_county: nextSubCounties.includes(current.sub_county) ? current.sub_county : "",
                    }));
                  }}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Choose county</option>
                  {countyOptions.map((county) => (
                    <option key={county} value={county}>
                      {county}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Choose the county where the farm is located.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_county">Sub-County</Label>
                <select
                  id="sub_county"
                  value={availableSubCounties.includes(formData.sub_county) ? formData.sub_county : ""}
                  onChange={(event) => setFormData({ ...formData, sub_county: event.target.value })}
                  disabled={!formData.county || !availableSubCounties.length}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{formData.county ? "Choose sub-county" : "Select county first"}</option>
                  {availableSubCounties.map((subCountyOption) => (
                    <option key={subCountyOption} value={subCountyOption}>
                      {subCountyOption}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {availableSubCounties.length
                    ? "Sub-counties update automatically from the county you choose."
                    : "Choose a county first to load its sub-counties."}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-[1.4rem] border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Farm GPS Verification</p>
                <p className="text-sm text-muted-foreground">
                  Stand on the farm, tap the GPS button, or click the map to record the real farm location before saving.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" onClick={handleCaptureGps} disabled={isCapturingGps} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                  <Crosshair className="mr-2 h-4 w-4" />
                  {isCapturingGps ? "Capturing GPS..." : "Use My Current GPS"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData((current) => ({ ...current, farm_gps_lat: "", farm_gps_lng: "" }))}
                  className="rounded-xl"
                >
                  Clear GPS
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="farm_gps_lat">Latitude</Label>
                  <Input
                    id="farm_gps_lat"
                    value={formData.farm_gps_lat}
                    onChange={(event) => setFormData((current) => ({ ...current, farm_gps_lat: event.target.value }))}
                    placeholder="-0.123456"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="farm_gps_lng">Longitude</Label>
                  <Input
                    id="farm_gps_lng"
                    value={formData.farm_gps_lng}
                    onChange={(event) => setFormData((current) => ({ ...current, farm_gps_lng: event.target.value }))}
                    placeholder="36.123456"
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.25rem]">
                <FarmMap
                  location={formData.county || resolvedCounty}
                  subCounty={formData.sub_county || subCounty}
                  coordinates={editFarmCoordinates}
                  editable
                  onSelectCoordinates={updateFarmCoordinates}
                  heightClassName="h-[240px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The marker follows your saved GPS point. If GPS misses the exact spot, click the map at the farm to correct it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="farm_size">Farm Size</Label>
              <select
                id="farm_size"
                value={formData.farm_size}
                onChange={(event) => setFormData({ ...formData, farm_size: event.target.value })}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Choose farm size</option>
                {farmSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 pt-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Production</p>
              <p className="text-sm text-muted-foreground">What you grow and how you describe the farm.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="main_crops">Main Crops</Label>
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                {cropOptions.map((crop) => (
                  <label
                    key={crop}
                    className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm dark:bg-background/70"
                  >
                    <Checkbox checked={selectedCropValues.includes(crop)} onCheckedChange={() => toggleCrop(crop)} />
                    <span className="font-medium text-foreground">{crop}</span>
                  </label>
                ))}
              </div>

              <Input
                id="main_crops"
                value={formData.custom_crops}
                onChange={(e) => setFormData({ ...formData, custom_crops: e.target.value })}
                placeholder="Type other crops not listed, separated by commas"
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Use the checkboxes for common crops, and type any extra crops here.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="soil_type">Soil Type</Label>
                <Input
                  id="soil_type"
                  value={formData.soil_type}
                  onChange={(e) => setFormData({ ...formData, soil_type: e.target.value })}
                  placeholder="Loam, clay, sandy..."
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="years_farming">Years Farming</Label>
                <Input
                  id="years_farming"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.years_farming}
                  onChange={(e) => setFormData({ ...formData, years_farming: e.target.value })}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">About your farm</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value.slice(0, bioCharacterLimit) })}
                placeholder="Short farm summary..."
                className="resize-none rounded-xl"
                maxLength={bioCharacterLimit}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {formData.bio.length}/{bioCharacterLimit} characters
              </p>
            </div>

            <div className="space-y-1 pt-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operations</p>
              <p className="text-sm text-muted-foreground">How the farm runs across seasons and production cycles.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="farm_type">Farm Type</Label>
                <select
                  id="farm_type"
                  value={formData.farm_type}
                  onChange={(event) => setFormData({ ...formData, farm_type: event.target.value })}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Choose farm type</option>
                  {farmTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="irrigation_type">Irrigation Type</Label>
                <select
                  id="irrigation_type"
                  value={formData.irrigation_type}
                  onChange={(event) => setFormData({ ...formData, irrigation_type: event.target.value })}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Choose irrigation type</option>
                  {irrigationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-[1.4rem] border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Infrastructure</p>
                <p className="text-sm text-muted-foreground">The support systems that help you fulfill orders reliably.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cooperative_name">Co-operative Name</Label>
                <Input
                  id="cooperative_name"
                  value={formData.cooperative_name}
                  onChange={(e) => setFormData({ ...formData, cooperative_name: e.target.value })}
                  placeholder="Optional co-operative or farmer group"
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-3 text-sm dark:bg-background/70">
                  <Checkbox
                    checked={formData.has_storage}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_storage: checked === true })}
                  />
                  <span className="font-medium text-foreground">I have storage</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-3 text-sm dark:bg-background/70">
                  <Checkbox
                    checked={formData.has_transport}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_transport: checked === true })}
                  />
                  <span className="font-medium text-foreground">I have transport</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="rounded-xl">
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
