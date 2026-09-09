import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle,
  Clock,
  KeyRound,
  Phone,
  Save,
  Settings2,
  ShieldCheck,
  SunMoon,
  UploadCloud,
  UserCircle2,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import ThemeToggle from "@/components/ui/theme-toggle";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/hooks/useAuth";
import { useIdVerification } from "@/hooks/useIdVerification";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeKenyanPhone, sanitizeDigits, sanitizePhoneInput } from "@/lib/inputSanitizers";
import { getPasswordValidationMessage, PASSWORD_POLICY_SUMMARY } from "@/lib/passwordPolicy";

export default function Profile() {
  const { profile, refreshProfile, user, applyProfileUpdate, role } = useAuth();
  const { verification, uploading, loading, uploadDocuments } = useIdVerification();
  const [searchParams] = useSearchParams();
  const status = verification?.status || "unverified";
  const isVerificationPending = status === "pending" || status === "pending_review";

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    payout_method: profile?.payout_method || "",
    payout_mpesa_number: profile?.payout_mpesa_number || "",
    bank_name: profile?.bank_name || "",
    bank_account_name: profile?.bank_account_name || "",
    bank_account_number: profile?.bank_account_number || "",
  });
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [activeSection, setActiveSection] = useState<
    "personal" | "contact" | "payout" | "security" | "verification" | "settings"
  >("personal");
  const isAdmin = role === "admin";
  const pageTitle = isAdmin ? "Admin Profile" : "My Profile";
  const identityHeading = isAdmin ? "Admin account identity" : "Your name and profile photo for account identity.";
  const operationsHeading = isAdmin ? "Admin workspace" : "Farm Operations";
  const operationsDescription = isAdmin
    ? "Use the admin dashboard for platform oversight, loan decisions, company reviews, and transaction monitoring."
    : "Farm story, county, crops, irrigation, soil, storage, transport, and co-operative details are now managed from My Farm.";
  const operationsCtaLabel = isAdmin ? "Open Admin Dashboard" : "Open My Farm";
  const operationsHref = isAdmin ? "/dashboard/admin" : "/dashboard/farm";
  const contactDescription = isAdmin
    ? "How the platform can reach you. New phone numbers are only saved after OTP verification."
    : "How the platform can reach you. New phone numbers are only saved after OTP verification.";
  const verificationDescription = isAdmin
    ? "Identity confirmation helps protect admin access and critical workflows."
    : "Identity confirmation for trust and payouts.";
  const sectionItems = isAdmin
    ? [
        { id: "personal", label: "Personal Details", icon: UserCircle2 },
        { id: "contact", label: "Contact Details", icon: Phone },
        { id: "security", label: "Change Password", icon: KeyRound },
        { id: "settings", label: "App Settings", icon: Settings2 },
      ]
    : [
        { id: "personal", label: "Personal Details", icon: UserCircle2 },
        { id: "contact", label: "Contact Details", icon: Phone },
        { id: "payout", label: "Payout Details", icon: Wallet },
        { id: "security", label: "Change Password", icon: KeyRound },
        { id: "verification", label: "Verification", icon: ShieldCheck },
        { id: "settings", label: "App Settings", icon: Settings2 },
      ];

  const photoPreview = useMemo(() => localPhotoPreview || profile?.photo_url || "", [localPhotoPreview, profile?.photo_url]);

  const profileCompletion = useMemo(() => {
    const fields = [
      profileForm.full_name.trim(),
      profileForm.phone.trim(),
      profileForm.payout_method,
    ];

    if (profileForm.payout_method === "mpesa") {
      fields.push(profileForm.payout_mpesa_number.trim());
    }

    if (profileForm.payout_method === "bank") {
      fields.push(profileForm.bank_name.trim(), profileForm.bank_account_name.trim(), profileForm.bank_account_number.trim());
    }

    const completed = fields.filter(Boolean).length;
    return Math.max(20, Math.round((completed / fields.length) * 100));
  }, [profileForm]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (
      section === "personal" ||
      section === "contact" ||
      section === "payout" ||
      section === "security" ||
      section === "verification" ||
      section === "settings"
    ) {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isAdmin && (activeSection === "payout" || activeSection === "verification")) {
      setActiveSection("personal");
    }
  }, [activeSection, isAdmin]);

  useEffect(() => {
    setProfileForm({
      full_name: profile?.full_name || "",
      phone: profile?.phone || "",
      payout_method: profile?.payout_method || "",
      payout_mpesa_number: profile?.payout_mpesa_number || "",
      bank_name: profile?.bank_name || "",
      bank_account_name: profile?.bank_account_name || "",
      bank_account_number: profile?.bank_account_number || "",
    });
  }, [profile]);

  useEffect(() => {
    if (!pendingPhoneVerification) return;

    const normalizedProfilePhone = normalizeKenyanPhone(profile?.phone || "");
    if (normalizedProfilePhone && normalizedProfilePhone === pendingPhoneVerification) {
      setPendingPhoneVerification(null);
      setPhoneOtpCode("");
    }
  }, [pendingPhoneVerification, profile?.phone]);

  useEffect(() => {
    return () => {
      if (localPhotoPreview) {
        URL.revokeObjectURL(localPhotoPreview);
      }
    };
  }, [localPhotoPreview]);

  const buildProfilePayload = (phoneOverride?: string | null) => ({
    full_name: profileForm.full_name,
    phone: phoneOverride ?? profileForm.phone,
    payout_method: profileForm.payout_method || null,
    payout_mpesa_number: profileForm.payout_method === "mpesa" ? profileForm.payout_mpesa_number : null,
    bank_name: profileForm.payout_method === "bank" ? profileForm.bank_name : null,
    bank_account_name: profileForm.payout_method === "bank" ? profileForm.bank_account_name : null,
    bank_account_number: profileForm.payout_method === "bank" ? profileForm.bank_account_number : null,
  });

  const currentPhone = normalizeKenyanPhone(profile?.phone || "");
  const formPhone = normalizeKenyanPhone(profileForm.phone);
  const verifiedAuthPhone = normalizeKenyanPhone(user?.phone || "");
  const phoneChanged = formPhone !== currentPhone;
  const phoneVerified =
    Boolean(user?.phone_confirmed_at) &&
    Boolean(formPhone) &&
    formPhone === verifiedAuthPhone &&
    formPhone === currentPhone;

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const payload = buildProfilePayload(phoneChanged ? profile?.phone || null : formPhone || null);
      const updatedProfile = await apiFetch<typeof profile>("/profiles/me", {
        method: "PATCH",
        body: payload as unknown as BodyInit,
      });

      if (updatedProfile) {
        applyProfileUpdate(updatedProfile);
      }

      if (phoneChanged) {
        toast.success("Other profile changes were saved. Verify the new phone number with OTP to update it.");
      } else {
        toast.success("Profile updated successfully!");
      }
    } catch (error) {
      toast.error("Failed to update profile: " + (error as Error).message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    const normalizedPhone = normalizeKenyanPhone(profileForm.phone);

    if (!normalizedPhone || !normalizedPhone.startsWith("+254")) {
      toast.error("Enter a valid Kenyan phone number like 0712345678 or +254712345678.");
      return;
    }

    setIsSendingPhoneOtp(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
      if (error) throw error;

      setPendingPhoneVerification(normalizedPhone);
      setPhoneOtpCode("");
      setProfileForm((current) => ({ ...current, phone: normalizedPhone }));
      toast.success(`OTP sent to ${normalizedPhone}. Enter the code to verify this number.`);
    } catch (error) {
      toast.error((error as Error).message || "Failed to send OTP.");
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!pendingPhoneVerification) {
      toast.error("Send an OTP to your phone first.");
      return;
    }

    if (phoneOtpCode.trim().length < 6) {
      toast.error("Enter the 6-digit OTP sent to your phone.");
      return;
    }

    setIsVerifyingPhoneOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhoneVerification,
        token: phoneOtpCode.trim(),
        type: "phone_change",
      });

      if (error) throw error;

      const updatedProfile = await apiFetch<typeof profile>("/profiles/me", {
        method: "PATCH",
        body: buildProfilePayload(pendingPhoneVerification) as unknown as BodyInit,
      });

      if (updatedProfile) {
        applyProfileUpdate(updatedProfile);
      }

      await refreshProfile();
      setPendingPhoneVerification(null);
      setPhoneOtpCode("");
      toast.success("Phone number verified and saved.");
    } catch (error) {
      toast.error((error as Error).message || "Failed to verify OTP.");
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be 5MB or less.");
      event.target.value = "";
      return;
    }

    if (localPhotoPreview) {
      URL.revokeObjectURL(localPhotoPreview);
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPhotoPreview(objectUrl);

    const formData = new FormData();
    formData.append("photo", file);

    setPhotoUploading(true);
    try {
      await apiFetch("/profiles/me/photo", {
        method: "POST",
        body: formData,
      });
      toast.success("Profile photo uploaded!");
      await refreshProfile();
    } catch (error) {
      if (!user) {
        toast.error("Sign in again and try uploading the photo.");
        setLocalPhotoPreview(null);
        event.target.value = "";
        setPhotoUploading(false);
        return;
      }

      try {
        const filePath = `${user.id}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("profile-photos").upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ photo_url: publicUrlData.publicUrl })
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        toast.success("Profile photo uploaded!");
        await refreshProfile();
      } catch (fallbackError) {
        console.error("Failed to upload profile photo", fallbackError);
        toast.error("Failed to upload profile photo");
        setLocalPhotoPreview(null);
      }
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const handleUploadId = async () => {
    if (!frontFile || !backFile) {
      toast.error("Upload both front and back ID images.");
      return;
    }

    await uploadDocuments(frontFile, backFile);
    setFrontFile(null);
    setBackFile(null);
  };

  const handleChangePassword = async () => {
    const passwordValidationMessage = getPasswordValidationMessage(passwordForm.password);
    if (passwordValidationMessage) {
      toast.error(passwordValidationMessage);
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

  return (
    <DashboardShell title={pageTitle}>
      <div className="space-y-5">
        <section className="bento-card overflow-hidden">
          <div className="rounded-[1.45rem] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,253,250,0.9))] p-4 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex flex-col items-center gap-3.5 sm:flex-row sm:items-start lg:w-[320px] lg:flex-col lg:items-center">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/30">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <UserCircle2 className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <div className="text-center sm:text-left lg:text-center">
                  <h2 className="font-display text-[1.5rem] font-bold text-foreground">{profileForm.full_name || "Your Name"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{user?.email || "Signed in user"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{profileForm.phone || "Phone not set"}</p>
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handleSaveProfile()} disabled={isSavingProfile} className="rounded-xl">
                    <Save className="mr-2 h-4 w-4" />
                    {isSavingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold dark:bg-card/90 ${
                      photoUploading ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {photoUploading ? "Uploading..." : "Change Photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoUpload(e)} />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:max-w-md">
                  <div className="rounded-[1.2rem] border border-border bg-background/70 px-3 py-2.5 text-center dark:bg-background/50">
                    <p className="font-display text-lg font-bold text-foreground">{profileCompletion}%</p>
                    <p className="text-xs text-muted-foreground">Profile</p>
                  </div>
                  <div className="rounded-[1.2rem] border border-border bg-background/70 px-3 py-2.5 text-center dark:bg-background/50">
                    <p className="font-display text-lg font-bold text-foreground">{status === "verified" ? "Yes" : "No"}</p>
                    <p className="text-xs text-muted-foreground">Verified</p>
                  </div>
                  <div className="rounded-[1.2rem] border border-border bg-background/70 px-3 py-2.5 text-center dark:bg-background/50">
                    <p className="font-display text-lg font-bold text-foreground">{profileForm.payout_method || "None"}</p>
                    <p className="text-xs text-muted-foreground">Payout</p>
                  </div>
                </div>

                <div className="max-w-2xl">
                  <p className="text-sm font-semibold text-foreground">{operationsHeading}</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {operationsDescription}
                  </p>
                  <Button asChild variant="outline" className="mt-3 rounded-xl">
                    <Link to={operationsHref}>{operationsCtaLabel}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[270px_1fr]">
          <aside className="bento-card p-0 overflow-hidden">
            {sectionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id as typeof activeSection)}
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
            {activeSection === "personal" && (
              <section className="bento-card">
                <h3 className="font-display text-xl font-bold text-foreground">Personal Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">{identityHeading}</p>
                <div className="mt-5 space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/30">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <UserCircle2 className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <label
                      className={`inline-flex w-fit cursor-pointer items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold dark:bg-card/90 ${
                        photoUploading ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      {photoUploading ? "Uploading..." : "Change Photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoUpload(e)} />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="rounded-xl" />
                  </div>

                  {isAdmin ? (
                    <div className="rounded-[1.2rem] border border-sky-200/70 bg-sky-50/80 p-4 text-sm text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100">
                      Admin account settings live here. Platform oversight tools, approvals, and reporting stay inside the{" "}
                      <Link to="/dashboard/admin" className="font-semibold underline underline-offset-2">Admin Dashboard</Link>.
                    </div>
                  ) : (
                    <div className="rounded-[1.2rem] border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                      Farm details were moved out of My Profile. Use <Link to="/dashboard/farm" className="font-semibold underline underline-offset-2">My Farm</Link> for county, crops, irrigation, soil, storage, transport, and your farm story.
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSection === "contact" && (
              <section className="bento-card">
                <h3 className="font-display text-xl font-bold text-foreground">Contact Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">{contactDescription}</p>
                <div className="mt-5 grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: sanitizePhoneInput(e.target.value) })}
                      type="tel"
                      inputMode="tel"
                      placeholder="0712345678 or +254712345678"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="rounded-[1.2rem] border border-border bg-background/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Phone verification</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {phoneVerified
                            ? `Verified on ${new Date(user?.phone_confirmed_at || "").toLocaleDateString()}`
                            : pendingPhoneVerification
                              ? `OTP sent to ${pendingPhoneVerification}`
                              : "Send an OTP to confirm this number before it is used on your profile."}
                        </p>
                      </div>
                      <Badge variant="outline" className="w-fit rounded-full">
                        {phoneVerified ? "Verified" : pendingPhoneVerification ? "Pending OTP" : "Not verified"}
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleSendPhoneOtp()}
                        disabled={isSendingPhoneOtp || !profileForm.phone.trim()}
                        className="rounded-xl"
                      >
                        {isSendingPhoneOtp ? "Sending OTP..." : "Send OTP"}
                      </Button>

                      {(pendingPhoneVerification || phoneChanged) && (
                        <>
                          <Input
                            value={phoneOtpCode}
                            onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="Enter 6-digit OTP"
                            className="rounded-xl sm:max-w-[220px]"
                          />
                          <Button
                            type="button"
                            onClick={() => void handleVerifyPhoneOtp()}
                            disabled={isVerifyingPhoneOtp || phoneOtpCode.trim().length !== 6 || !pendingPhoneVerification}
                            className="rounded-xl"
                          >
                            {isVerifyingPhoneOtp ? "Verifying..." : "Verify OTP"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
                    {isAdmin ? (
                      <>
                        Need to return to oversight tools? Open the{" "}
                        <Link to="/dashboard/admin" className="font-semibold text-foreground underline underline-offset-2">Admin Dashboard</Link>.
                      </>
                    ) : (
                      <>
                        County and farm location are now edited from <Link to="/dashboard/farm" className="font-semibold text-foreground underline underline-offset-2">My Farm</Link>.
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeSection === "payout" && (
              <section className="bento-card">
                <h3 className="font-display text-xl font-bold text-foreground">Payout Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose where money should go after successful buyer payment.</p>
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label>How you receive payouts</Label>
                    <Select
                      value={profileForm.payout_method}
                      onValueChange={(value) =>
                        setProfileForm((current) => ({
                          ...current,
                          payout_method: value,
                          payout_mpesa_number: value === "mpesa" ? current.payout_mpesa_number : "",
                          bank_name: value === "bank" ? current.bank_name : "",
                          bank_account_name: value === "bank" ? current.bank_account_name : "",
                          bank_account_number: value === "bank" ? current.bank_account_number : "",
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose payout method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mpesa">M-Pesa</SelectItem>
                        <SelectItem value="bank">Bank Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {profileForm.payout_method === "mpesa" && (
                    <div className="space-y-2">
                      <Label>M-Pesa Number</Label>
                      <Input
                        value={profileForm.payout_mpesa_number}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, payout_mpesa_number: sanitizePhoneInput(e.target.value) })
                        }
                        type="tel"
                        inputMode="tel"
                        placeholder="2547XXXXXXXX"
                        className="rounded-xl"
                      />
                    </div>
                  )}

                  {profileForm.payout_method === "bank" && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Bank Name</Label>
                        <Input value={profileForm.bank_name} onChange={(e) => setProfileForm({ ...profileForm, bank_name: e.target.value })} className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>Account Name</Label>
                        <Input value={profileForm.bank_account_name} onChange={(e) => setProfileForm({ ...profileForm, bank_account_name: e.target.value })} className="rounded-xl" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Account Number</Label>
                        <Input
                          value={profileForm.bank_account_number}
                          onChange={(e) =>
                            setProfileForm({
                              ...profileForm,
                              bank_account_number: sanitizeDigits(e.target.value, { maxLength: 20 }),
                            })
                          }
                          inputMode="numeric"
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSection === "security" && (
              <section className="bento-card">
                <h3 className="font-display text-xl font-bold text-foreground">Change Password</h3>
                <p className="mt-1 text-sm text-muted-foreground">Update your account password.</p>
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} minLength={8} autoComplete="new-password" className="rounded-xl" />
                    <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_SUMMARY}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm Password</Label>
                    <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} minLength={8} autoComplete="new-password" className="rounded-xl" />
                  </div>
                  <Button onClick={() => void handleChangePassword()} disabled={isChangingPassword} className="w-full rounded-xl">
                    {isChangingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </section>
            )}

            {activeSection === "verification" && (
              <section className="bento-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-foreground">Verification</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{verificationDescription}</p>
                  </div>
                  <Badge
                    className={`w-fit rounded-full border text-xs shadow-sm ${
                      status === "verified"
                        ? "border-[#4CAF50]/30 bg-[#4CAF50]/15 text-[#4CAF50]"
                        : isVerificationPending
                          ? "border-gold-500/30 bg-gold-500/15 text-gold-500"
                          : "border-destructive/30 bg-destructive/15 text-destructive"
                    }`}
                    variant="outline"
                  >
                    {status === "verified" && <CheckCircle className="mr-1 h-3 w-3" />}
                    {isVerificationPending && <Clock className="mr-1 h-3 w-3" />}
                    {status === "unverified" && "Unverified"}
                    {status === "verified" && "Verified"}
                    {isVerificationPending && "Pending Review"}
                    {status === "rejected" && "Rejected"}
                  </Badge>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4">
                  <div className="rounded-2xl border-2 border-dashed border-border p-5">
                    <Label className="mb-2 block">Front Side</Label>
                    <Input type="file" accept="image/*,.pdf" onChange={(e) => setFrontFile(e.target.files?.[0] || null)} className="rounded-xl" />
                    {verification?.front_doc_url && <p className="mt-2 text-xs text-muted-foreground">Front side uploaded.</p>}
                  </div>
                  <div className="rounded-2xl border-2 border-dashed border-border p-5">
                    <Label className="mb-2 block">Back Side</Label>
                    <Input type="file" accept="image/*,.pdf" onChange={(e) => setBackFile(e.target.files?.[0] || null)} className="rounded-xl" />
                    {verification?.back_doc_url && <p className="mt-2 text-xs text-muted-foreground">Back side uploaded.</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {loading ? "Loading verification status..." : "Supported formats: JPG, PNG, PDF"}
                  </div>
                  <Button onClick={() => void handleUploadId()} disabled={uploading} className="rounded-xl">
                    {uploading ? "Uploading..." : "Upload ID Documents"}
                  </Button>
                </div>
              </section>
            )}

            {activeSection === "settings" && (
              <section className="bento-card">
                <div className="overflow-hidden rounded-[1.45rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,253,248,0.92))] p-5 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                        <SunMoon className="h-3.5 w-3.5" />
                        Display Preferences
                      </div>
                      <h3 className="mt-3 font-display text-[1.45rem] font-bold text-foreground">Make the app feel right for your eyes</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        Pick the mode that feels best in the field, at the market, or during late-night review. Your choice applies instantly on this device.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:w-[260px]">
                      <div className="rounded-[1.2rem] border border-white/60 bg-white/75 p-3.5 shadow-sm dark:border-white/10 dark:bg-background/60">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Best For</p>
                        <p className="mt-2 text-sm font-semibold text-foreground">Outdoor visibility</p>
                        <p className="mt-1 text-sm text-muted-foreground">Use light mode when glare and sunlight matter most.</p>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/60 bg-white/75 p-3.5 shadow-sm dark:border-white/10 dark:bg-background/60">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Best For</p>
                        <p className="mt-2 text-sm font-semibold text-foreground">Night sessions</p>
                        <p className="mt-1 text-sm text-muted-foreground">Use dark mode to reduce glare during longer sessions.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <ThemeToggle />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
