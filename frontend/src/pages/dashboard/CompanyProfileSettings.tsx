import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  Settings2,
  ShieldCheck,
  SunMoon,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

type CompanyProfile = {
  id: string;
  company_name: string;
  company_type: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  registration_number: string | null;
  tax_id: string | null;
  bio: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  headquarters_location: string | null;
  service_areas: string[] | null;
  certifications: string[] | null;
  verification_status?: "pending" | "approved" | "rejected" | "suspended";
  verified?: boolean;
};

const companyTypeOptions = [
  { value: "input_supplier", label: "Input Supplier" },
  { value: "aggregator", label: "Aggregator" },
  { value: "logistics", label: "Logistics Provider" },
  { value: "processor", label: "Processor" },
  { value: "buyer", label: "Corporate Buyer" },
  { value: "exporter", label: "Exporter" },
  { value: "retailer", label: "Retailer" },
  { value: "other", label: "Other" },
];

const initialForm = {
  company_name: "",
  company_type: "other",
  email: "",
  phone: "",
  website: "",
  registration_number: "",
  tax_id: "",
  bio: "",
  logo_url: "",
  cover_image_url: "",
  headquarters_location: "",
  service_areas: "",
  certifications: "",
};

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTone(status: CompanyProfile["verification_status"]) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50/80 text-emerald-700";
    case "pending":
      return "border-sky-200 bg-sky-50/80 text-sky-700";
    case "rejected":
      return "border-red-200 bg-red-50/80 text-red-700";
    case "suspended":
      return "border-amber-200 bg-amber-50/80 text-amber-700";
    default:
      return "border-border bg-background text-foreground";
  }
}

export default function CompanyProfileSettings() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [activeSection, setActiveSection] = useState<"company" | "contact" | "security" | "settings">("company");
  const [form, setForm] = useState(initialForm);
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [companyMeta, setCompanyMeta] = useState<Pick<CompanyProfile, "verification_status" | "verified">>({
    verification_status: "pending",
    verified: false,
  });
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "company" || section === "contact" || section === "security" || section === "settings") {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    void apiFetch<{ company: CompanyProfile }>("/companies/me")
      .then(({ company }) => {
        setMissingCompanyProfile(false);
        setCompanyMeta({
          verification_status: company.verification_status || "pending",
          verified: company.verified || false,
        });
        setForm({
          company_name: company.company_name || "",
          company_type: company.company_type || "other",
          email: company.email || "",
          phone: company.phone || "",
          website: company.website || "",
          registration_number: company.registration_number || "",
          tax_id: company.tax_id || "",
          bio: company.bio || "",
          logo_url: company.logo_url || "",
          cover_image_url: company.cover_image_url || "",
          headquarters_location: company.headquarters_location || "",
          service_areas: (company.service_areas || []).join(", "),
          certifications: (company.certifications || []).join(", "),
        });
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setMissingCompanyProfile(true);
          return;
        }
        toast.error(error instanceof Error ? error.message : "Failed to load company profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const parsedServiceAreas = useMemo(() => splitCommaList(form.service_areas), [form.service_areas]);
  const parsedCertifications = useMemo(() => splitCommaList(form.certifications), [form.certifications]);

  const readinessItems = useMemo(
    () => [
      { label: "Company identity", ready: Boolean(form.company_name.trim() && form.company_type.trim() && form.bio.trim()) },
      { label: "Business records", ready: Boolean(form.registration_number.trim() && form.tax_id.trim()) },
      { label: "Contact details", ready: Boolean(form.email.trim() && form.phone.trim()) },
      { label: "Operating coverage", ready: Boolean(form.headquarters_location.trim() && parsedServiceAreas.length) },
      { label: "Brand media", ready: Boolean(form.logo_url.trim() || form.cover_image_url.trim()) },
    ],
    [
      form.bio,
      form.company_name,
      form.company_type,
      form.cover_image_url,
      form.email,
      form.headquarters_location,
      form.logo_url,
      form.phone,
      form.registration_number,
      form.tax_id,
      parsedServiceAreas.length,
    ],
  );

  const profileCompletion = readinessItems.filter((item) => item.ready).length;

  const handleSave = async (section: "company" | "contact") => {
    if (section === "company") {
      if (!form.company_name.trim()) {
        toast.error("Complete the company name before saving company details.");
        return;
      }

      if (!form.company_type.trim()) {
        toast.error("Complete the company type before saving company details.");
        return;
      }

      if (!form.bio.trim()) {
        toast.error("Complete the company bio before saving company details.");
        return;
      }

      if (!form.registration_number.trim()) {
        toast.error("Complete the registration number before saving company details.");
        return;
      }

      if (!form.tax_id.trim()) {
        toast.error("Complete the tax ID before saving company details.");
        return;
      }

      if (!form.certifications.trim()) {
        toast.error("Complete the certifications field before saving company details.");
        return;
      }
    }

    if (section === "contact") {
      if (!form.email.trim()) {
        toast.error("Complete the company email before saving contact details.");
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        toast.error("Enter a valid company email address.");
        return;
      }

      if (!form.phone.trim()) {
        toast.error("Complete the phone number before saving contact details.");
        return;
      }

      if (!form.website.trim()) {
        toast.error("Complete the website before saving contact details.");
        return;
      }

      if (!form.headquarters_location.trim()) {
        toast.error("Complete the headquarters field before saving contact details.");
        return;
      }

      if (!parsedServiceAreas.length) {
        toast.error("Complete the service areas before saving contact details.");
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch("/companies/me", {
        method: "PATCH",
        body: {
          company_name: form.company_name.trim(),
          company_type: form.company_type.trim() || "other",
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          website: normalizeWebsite(form.website),
          registration_number: form.registration_number.trim() || null,
          tax_id: form.tax_id.trim() || null,
          bio: form.bio.trim() || null,
          logo_url: form.logo_url.trim() || null,
          cover_image_url: form.cover_image_url.trim() || null,
          headquarters_location: form.headquarters_location.trim() || null,
          service_areas: parsedServiceAreas.length ? parsedServiceAreas : [],
          certifications: parsedCertifications,
        },
      });
      toast.success(section === "company" ? "Company details saved." : "Contact details saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update company profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.password || passwordForm.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.password });
    setIsChangingPassword(false);

    if (error) {
      toast.error(error.message || "Failed to change password");
      return;
    }

    setPasswordForm({ password: "", confirmPassword: "" });
    toast.success("Password updated successfully!");
  };

  const sectionItems = [
    { id: "company", label: "Company Details", icon: Building2 },
    { id: "contact", label: "Contact Details", icon: Phone },
    { id: "security", label: "Change Password", icon: KeyRound },
    { id: "settings", label: "App Settings", icon: Settings2 },
  ] as const;

  if (missingCompanyProfile) {
    return (
      <DashboardShell title="Company Profile">
        <CompanySetupRequired title="Set up your company profile before editing company settings" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Company Profile">
      <div className="space-y-6">
        <section className="rounded-[1.9rem] border border-sky-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.1),_transparent_34%),linear-gradient(135deg,rgba(239,246,255,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(14,165,233,0.28)]">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="inline-flex rounded-full border border-sky-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                Company Settings
              </div>
              <h2 className="mt-4 font-display text-3xl font-bold text-foreground">Manage the company profile with the right structure</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Keep the business identity, contact details, password, and app preferences in one clear settings flow.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-sky-200/70 bg-white/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile Readiness</p>
                  <p className="mt-2 font-display text-3xl font-bold text-foreground">
                    {profileCompletion} / {readinessItems.length}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Important company setup areas completed.</p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(companyMeta.verification_status)}`}>
                  {companyMeta.verification_status || "pending"}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {readinessItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                      {item.ready ? "ready" : "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading company profile...</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[270px_1fr]">
            <aside className="rounded-2xl border border-border bg-card p-0 overflow-hidden">
              {sectionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm font-semibold transition-colors last:border-b-0 ${
                    activeSection === item.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </aside>

            <div className="space-y-6">
              {activeSection === "company" && (
                <section className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10">
                      <Building2 className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">Company Details</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Manage the business identity and the public company profile.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company name</Label>
                      <Input id="company_name" value={form.company_name} onChange={(event) => updateField("company_name", event.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company_type">Company type</Label>
                      <select
                        id="company_type"
                        value={form.company_type}
                        onChange={(event) => updateField("company_type", event.target.value)}
                        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      >
                        {companyTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio">Company bio</Label>
                      <Textarea
                        id="bio"
                        rows={5}
                        value={form.bio}
                        onChange={(event) => updateField("bio", event.target.value)}
                        placeholder="Tell users what the company does and why they should trust it."
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="registration_number">Registration number</Label>
                        <Input id="registration_number" value={form.registration_number} onChange={(event) => updateField("registration_number", event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tax_id">Tax ID</Label>
                        <Input id="tax_id" value={form.tax_id} onChange={(event) => updateField("tax_id", event.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="certifications">Certifications</Label>
                      <Input
                        id="certifications"
                        value={form.certifications}
                        onChange={(event) => updateField("certifications", event.target.value)}
                        placeholder="Organic, KEPHIS, HACCP"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="logo_url">Logo URL</Label>
                        <Input id="logo_url" value={form.logo_url} onChange={(event) => updateField("logo_url", event.target.value)} placeholder="https://..." />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cover_image_url">Cover image URL</Label>
                        <Input id="cover_image_url" value={form.cover_image_url} onChange={(event) => updateField("cover_image_url", event.target.value)} placeholder="https://..." />
                      </div>
                    </div>

                    <div className="rounded-[1.2rem] border border-sky-200/70 bg-sky-50/80 p-4 text-sm text-sky-900">
                      This section is for the company profile itself: name, identity, documents, certifications, and public business presentation.
                    </div>

                    <Button type="button" className="w-full rounded-xl sm:w-fit" disabled={saving} onClick={() => void handleSave("company")}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Saving..." : "Save company details"}
                    </Button>
                  </div>
                </section>
              )}

              {activeSection === "contact" && (
                <section className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10">
                      <Phone className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">Contact Details</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Keep the company email, phone number, website, and operating footprint current.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">Company email</Label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} className="pl-9" placeholder="company@example.com" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone number</Label>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="phone" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className="pl-9" placeholder="+2547..." />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <div className="relative">
                        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="website" value={form.website} onChange={(event) => updateField("website", event.target.value)} className="pl-9" placeholder="www.company.co.ke" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="headquarters_location">Headquarters</Label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="headquarters_location"
                          value={form.headquarters_location}
                          onChange={(event) => updateField("headquarters_location", event.target.value)}
                          className="pl-9"
                          placeholder="Nairobi, Kenya"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="service_areas">Service areas</Label>
                      <Textarea
                        id="service_areas"
                        rows={4}
                        value={form.service_areas}
                        onChange={(event) => updateField("service_areas", event.target.value)}
                        placeholder="Nakuru, Nairobi, Uasin Gishu"
                      />
                    </div>

                    <div className="rounded-[1.2rem] border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
                      Contact details should always include both a company email and phone number so farmers, buyers, and admins can reach the business quickly.
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Verification Snapshot</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">{companyMeta.verification_status || "pending"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{companyMeta.verified ? "Trusted company profile" : "Limited until approved"}</p>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(companyMeta.verification_status)}`}>
                          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                          {companyMeta.verification_status || "pending"}
                        </div>
                      </div>
                    </div>

                    <Button type="button" className="w-full rounded-xl sm:w-fit" disabled={saving} onClick={() => void handleSave("contact")}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Saving..." : "Save contact details"}
                    </Button>
                  </div>
                </section>
              )}

              {activeSection === "security" && (
                <section className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
                      <KeyRound className="h-5 w-5 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">Change Password</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Update the password used to protect the company account.</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="space-y-2">
                      <Label>New Password</Label>
                      <Input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm Password</Label>
                      <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="rounded-xl" />
                    </div>
                    <Button onClick={() => void handleChangePassword()} disabled={isChangingPassword} className="w-full rounded-xl sm:w-fit">
                      {isChangingPassword ? "Updating..." : "Update Password"}
                    </Button>
                  </div>
                </section>
              )}

              {activeSection === "settings" && (
                <section className="rounded-2xl border border-border bg-card p-6">
                  <div className="overflow-hidden rounded-[1.45rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,253,248,0.92))] p-5 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                          <SunMoon className="h-3.5 w-3.5" />
                          Display Preferences
                        </div>
                        <h3 className="mt-3 font-display text-[1.45rem] font-bold text-foreground">App Settings</h3>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                          Adjust the app experience for the company team on this device.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:w-[260px]">
                        <div className="rounded-[1.2rem] border border-white/60 bg-white/75 p-3.5 shadow-sm dark:border-white/10 dark:bg-background/60">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Best For</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">Bright offices</p>
                          <p className="mt-1 text-sm text-muted-foreground">Use light mode for daytime review and admin work.</p>
                        </div>
                        <div className="rounded-[1.2rem] border border-white/60 bg-white/75 p-3.5 shadow-sm dark:border-white/10 dark:bg-background/60">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Best For</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">Late sessions</p>
                          <p className="mt-1 text-sm text-muted-foreground">Use dark mode during longer procurement or reporting sessions.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <ThemeToggle />
                  </div>

                  <div className="mt-6 rounded-[1.2rem] border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Company app settings are kept separate from company details so profile data and device preferences do not get mixed together.
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl bg-background p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <UserCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-3 font-medium text-foreground">Identity</p>
                    <p className="mt-1 text-sm text-muted-foreground">A complete company profile makes the business look credible and ready to trade.</p>
                  </div>
                  <div className="rounded-xl bg-background p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-3 font-medium text-foreground">Reachability</p>
                    <p className="mt-1 text-sm text-muted-foreground">Email and phone number should always be present so communication never stalls.</p>
                  </div>
                  <div className="rounded-xl bg-background p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Settings2 className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-3 font-medium text-foreground">Control</p>
                    <p className="mt-1 text-sm text-muted-foreground">Password and app settings stay separate so the company account is easier to manage safely.</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
