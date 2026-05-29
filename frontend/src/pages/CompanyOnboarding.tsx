import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle, Building2, MapPin, Globe, Phone, Star, TrendingUp, ShieldCheck, Mail } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { apiFetch, ApiError } from "@/lib/api";
import { isValidKenyanPhone, normalizeKenyanPhone, sanitizePhoneInput } from "@/lib/inputSanitizers";

const TESTIMONIALS = [
  {
    author: "James Mburu",
    role: "Supply Chain Director",
    company: "Rift Valley Processors",
    rating: 5,
    text: "Before AgriLink X, we struggled with inconsistent sourcing. Now we access verified farmers and close deals in half the time. It has completely transformed our supply chain.",
  },
  {
    author: "Sarah Ochieng",
    role: "Operations Head",
    company: "Nairobi Fresh Exports",
    rating: 5,
    text: "The platform's visibility into farmer harvest schedules is a gamechanger. Our logistics are now fully optimized and we've reduced post-harvest losses significantly.",
  },
  {
    author: "David Kimani",
    role: "CEO",
    company: "Highland Inputs Ltd",
    rating: 5,
    text: "Being a verified partner has increased our inbound leads by 40%. Farmers inherently trust companies they see on AgriLink X.",
  }
];

const VERIFIED_COMPANIES = [
  "Twiga Foods", "Kenya Seed Company", "FarmWorks", "SunCulture", "Apollo Agriculture", "Copia Global"
];

export default function CompanyOnboarding() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    company_name: "",
    company_type: "input_supplier",
    registration_number: "",
    tax_id: "",
    phone: "",
    email: user?.email || "",
    website: "",
    headquarters_location: "",
    bio: "",
    service_areas: [] as string[],
    certifications: [],
  });
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.email) return;
    setFormData((current) => (current.email ? current : { ...current, email: user.email ?? "" }));
  }, [user?.email]);

  const companyTypes = [
    { value: "input_supplier", label: "Input Supplier (Seeds, Fertilizer, etc)" },
    { value: "aggregator", label: "Aggregator (Bulk Buyer)" },
    { value: "logistics", label: "Logistics Provider" },
    { value: "processor", label: "Processor (Value Addition)" },
    { value: "buyer", label: "Corporate Buyer" },
    { value: "other", label: "Other" },
  ];

  const kenyaCounties = [
    "Nairobi", "Mombasa", "Kiambu", "Nakuru", "Nyeri", "Kisumu", "Machakos", "Kitale",
    "Eldoret", "Uasin Gishu", "Isiolo", "Garissa", "Turkana", "West Pokot", "Samburu",
    "Laikipia", "Embu", "Tharaka-Nithi", "Makueni", "Kajiado", "Muranga", "Nandi",
    "Baringo", "Elgeyo-Marakwet", "Trans-Nzoia", "Kericho", "Bomet", "Kakamega", "Bungoma",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      if (name === "service_areas") {
        setFormData((prev) => ({
          ...prev,
          service_areas: checked
            ? [...prev.service_areas, value]
            : prev.service_areas.filter((area) => area !== value),
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === "phone" ? sanitizePhoneInput(value) : value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!formData.company_name.trim()) throw new Error("Company name is required.");
      if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        throw new Error("Enter a valid company email address or leave it blank for now.");
      }
      if (formData.phone.trim() && !isValidKenyanPhone(formData.phone)) {
        throw new Error("Enter a valid Kenyan phone number like 0712345678 or +254712345678.");
      }

      const normalizedPhone = formData.phone.trim() ? normalizeKenyanPhone(formData.phone) : "";

      const subject = encodeURIComponent(`Enterprise Verification Request - ${formData.company_name.trim()}`);
      const body = encodeURIComponent(
        `Please find the details for our Enterprise Verification Request below:\n\n` +
        `Company Name: ${formData.company_name.trim()}\n` +
        `Company Type: ${formData.company_type}\n` +
        `Location: ${formData.headquarters_location.trim() || 'N/A'}\n` +
        `Phone: ${normalizedPhone || 'N/A'}\n` +
        `Business Email: ${formData.email.trim()}\n` +
        `Tax ID: ${formData.tax_id.trim() || 'N/A'}\n` +
        `Registration No: ${formData.registration_number.trim() || 'N/A'}\n` +
        `Website: ${formData.website.trim() || 'N/A'}\n` +
        `Service Areas: ${formData.service_areas.length > 0 ? formData.service_areas.join(', ') : 'N/A'}\n\n` +
        `Kindly assist with the verification process.`
      );

      // Open user's default email client
      window.location.href = `mailto:officialagrilinkx@gmail.com?subject=${subject}&body=${body}`;

      setSubmitted(true);
      window.scrollTo({ top: document.getElementById('verification-form')?.offsetTop, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-4 py-3.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all";
  const labelClasses = "block text-sm font-semibold text-foreground mb-2";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-32 pb-16">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          
          {/* Header Section (Like About) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <span className="text-sm font-semibold uppercase tracking-widest text-accent">
              Enterprise Network
            </span>
            <h1 className="mt-4 mb-6 text-4xl font-display font-bold text-foreground md:text-5xl lg:text-6xl">
              Scale your Agribusiness with <span className="text-gradient-gold">AgriLink X</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto text-balance">
              Join the fastest growing agricultural marketplace. Source directly from verified farmers, expand your logistics operations, and completely digitize your procurement pipeline.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-24"
          >
            {/* Feature Split with Image */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold font-display mb-6 text-foreground">Direct Access to 10,000+ Farmers</h2>
                <p className="text-muted-foreground mb-4 leading-relaxed text-lg">
                  Cut out the middlemen and source exactly what you need. By registering your company on AgriLink X, you gain immediate, transparent access to a trusted pool of crop producers across Kenya.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="bg-primary/5 rounded-[1.5rem] p-6 border border-primary/10 flex flex-col items-start transition-transform hover:-translate-y-1">
                    <ShieldCheck className="w-8 h-8 text-primary mb-4" />
                    <h4 className="font-bold text-foreground text-lg mb-1">Verified Data</h4>
                    <p className="text-sm text-muted-foreground">Every farmer is strictly verified</p>
                  </div>
                  <div className="bg-blue-500/5 rounded-[1.5rem] p-6 border border-blue-500/10 flex flex-col items-start transition-transform hover:-translate-y-1">
                    <TrendingUp className="w-8 h-8 text-blue-500 mb-4" />
                    <h4 className="font-bold text-foreground text-lg mb-1">Streamlined</h4>
                    <p className="text-sm text-muted-foreground">Digital CRM & procurement</p>
                  </div>
                </div>
              </div>
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_24px_54px_-24px_rgba(21,128,61,0.2)] ring-1 ring-border shadow-primary/10">
                <div className="absolute inset-0 border-[4px] border-white/20 rounded-[2.5rem] z-10 pointer-events-none mix-blend-overlay"></div>
                <img 
                  src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80" 
                  alt="Agricultural produce and logistics" 
                  className="w-full h-full object-cover aspect-[4/3] hover:scale-105 transition-transform duration-[1.5s] ease-out bg-muted"
                />
              </div>
            </div>

            {/* Social Proof / Verified Companies */}
            <div className="relative py-12 text-center border-y border-border/50">
              <span className="flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-[0.2em] text-primary/80 mb-8">
                <span className="h-[2px] w-8 bg-primary/20 rounded-full"></span>
                Trusted By Industry Leaders
                <span className="h-[2px] w-8 bg-primary/20 rounded-full"></span>
              </span>
              <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                {VERIFIED_COMPANIES.map(company => (
                  <span key={company} className="font-display font-bold text-2xl md:text-3xl tracking-tight text-foreground/80 hover:text-primary transition-colors cursor-default">{company}</span>
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div>
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold font-display text-foreground tracking-tight">What our partners say</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {TESTIMONIALS.map((testimonial, idx) => (
                  <div key={idx} className="bg-primary/5 rounded-[2rem] p-8 border border-primary/10 flex flex-col justify-between transition-transform hover:-translate-y-1 relative">
                    <div>
                      <div className="flex gap-1 mb-4">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <p className="text-foreground/90 italic mb-8 leading-relaxed text-sm md:text-base">"{testimonial.text}"</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white font-bold shrink-0">
                        {testimonial.author.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{testimonial.author}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.role}, <br/><span className="font-medium">{testimonial.company}</span></p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Form Area */}
            <div className="relative pt-12 pb-20" id="verification-form">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl bg-[radial-gradient(ellipse_at_center,rgba(21,128,61,0.08)_0%,rgba(transparent)_70%)] pointer-events-none -z-10 blur-xl"></div>
               
               <div className="max-w-4xl mx-auto">
                 {submitted ? (
                    // SUCCESS STATE
                    <div className="bg-card rounded-[2.5rem] border border-border shadow-[0_16px_48px_-8px_rgba(0,0,0,0.1)] p-10 md:p-16 text-center shadow-primary/5">
                      <div className="w-24 h-24 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8">
                         <CheckCircle className="w-12 h-12 text-emerald-500" />
                      </div>
                      <h2 className="text-3xl font-bold font-display mb-4 text-foreground">Application Received</h2>
                      <p className="text-muted-foreground mb-8 text-lg max-w-2xl mx-auto">
                        Thank you for your interest in partnering with AgriLink X. Our Enterprise team will review your application and respond in less than 24 hours to finalize your verified status.
                      </p>
                      <Link to="/" className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-base font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-10 shadow-[0_10px_30px_-10px_rgba(21,128,61,0.5)] hover:-translate-y-0.5">
                        Return to Homepage
                      </Link>
                    </div>
                 ) : !showForm ? (
                    // PRE-FORM CTA PORTAL
                    <div className="bg-card rounded-[2.5rem] border border-border shadow-[0_16px_48px_-8px_rgba(0,0,0,0.1)] p-10 md:p-16 text-center shadow-primary/5">
                      <div className="w-24 h-24 bg-primary/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8 relative">
                         <div className="absolute inset-0 bg-primary/20 rounded-[1.5rem] animate-ping opacity-50"></div>
                         <Building2 className="w-12 h-12 text-primary relative z-10" />
                      </div>
                      <h2 className="text-3xl md:text-4xl font-bold font-display mb-4 text-foreground tracking-tight">Ready to Verify your Company?</h2>
                      <p className="text-muted-foreground mb-10 text-lg max-w-2xl mx-auto leading-relaxed text-balance">
                        To maintain a secure ecosystem, we require all partners to have a standard farmer account before requesting enterprise verification.
                      </p>

                      <button 
                         onClick={() => setShowForm(true)}
                         className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-lg font-medium transition-all focus-visible:outline-none bg-primary text-primary-foreground hover:bg-primary/90 h-14 px-12 shadow-[0_10px_30px_-10px_rgba(21,128,61,0.5)] hover:shadow-[0_15px_35px_-10px_rgba(21,128,61,0.6)] hover:-translate-y-0.5 mb-8"
                      >
                        Request Enterprise Verification
                      </button>

                      <div className="pt-8 border-t border-border/50 max-w-xl mx-auto">
                        <p className="text-foreground font-medium mb-3">Haven't joined as a Farmer yet?</p>
                        <p className="text-sm text-muted-foreground mb-4">You must have a basic account before you can verify an enterprise.</p>
                        <Link to="/signup" className="text-primary font-semibold hover:underline">
                          Create your Free Farmer Account first
                        </Link>
                      </div>
                    </div>
                 ) : (
                    // THE FORM
                    <div className="bg-card rounded-[2.5rem] border border-border shadow-[0_16px_48px_-8px_rgba(0,0,0,0.1)] overflow-hidden shadow-primary/5">
                      <div className="bg-primary/5 px-8 py-8 border-b border-border">
                        <h2 className="text-2xl font-bold font-display text-foreground mb-3 flex items-center gap-3">
                          <Building2 className="w-7 h-7 text-primary" />
                          Request Enterprise Verification
                        </h2>
                        <p className="text-muted-foreground text-[15px] leading-relaxed mb-3">
                          If you have an account as a Farmer, please submit your company details below so our team can officially verify your Enterprise status.
                        </p>
                        <div className="bg-background border-l-4 border-l-primary rounded-r-lg p-4 mt-2">
                          <p className="text-foreground font-medium text-sm flex items-center gap-2">
                            <Mail className="w-4 h-4 text-primary" />
                            Use the exact Email Address you used to create your main account.
                          </p>
                        </div>
                      </div>
                      
                      <div className="p-8 md:p-10">
                        <form onSubmit={handleSubmit} className="space-y-6">
                          {error && (
                            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground text-sm font-medium flex items-center gap-3">
                              <span className="font-bold flex-shrink-0 w-6 h-6 bg-destructive/20 rounded-full flex items-center justify-center">!</span>
                              {error}
                            </div>
                          )}

                          <div className="grid md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                              <label className={labelClasses}>Company Name <span className="text-destructive">*</span></label>
                              <input
                                type="text"
                                name="company_name"
                                value={formData.company_name}
                                onChange={handleChange}
                                placeholder="E.g., Rift Valley Processors Ltd."
                                className={inputClasses}
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className={labelClasses}>Company Type <span className="text-destructive">*</span></label>
                              <select
                                name="company_type"
                                value={formData.company_type}
                                onChange={handleChange}
                                className={inputClasses}
                              >
                                {companyTypes.map((type) => (
                                  <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className={labelClasses}>Headquarters / Location</label>
                              <div className="relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                                <select
                                  name="headquarters_location"
                                  value={formData.headquarters_location}
                                  onChange={handleChange}
                                  className={`${inputClasses} pl-12`}
                                >
                                  <option value="">Select HQ County</option>
                                  {kenyaCounties.map((county) => (
                                    <option key={county} value={county}>{county}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            
                            <div>
                              <label className={labelClasses}>Phone</label>
                              <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                                <input
                                  type="tel"
                                  name="phone"
                                  value={formData.phone}
                                  onChange={handleChange}
                                  inputMode="tel"
                                  placeholder="+254 7XX XXX XXX"
                                  className={`${inputClasses} pl-12`}
                                />
                              </div>
                            </div>

                            <div className="md:col-span-2 my-2 border-t border-border/50"></div>

                            <div className="md:col-span-2">
                              <label className={labelClasses}>Business Email <span className="text-destructive">*</span></label>
                              <div className="relative mb-2">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                                <input
                                  type="email"
                                  name="email"
                                  value={formData.email}
                                  onChange={handleChange}
                                  placeholder="contact@company.com"
                                  className={`${inputClasses} pl-12`}
                                  required
                                />
                              </div>
                              <p className="text-xs text-primary/80 font-medium">
                                * Important: Please use the exact same email address you used to create your main account.
                              </p>
                            </div>

                            <div>
                              <label className={labelClasses}>Tax ID (KRA PIN)</label>
                              <input
                                type="text"
                                name="tax_id"
                                value={formData.tax_id}
                                onChange={handleChange}
                                placeholder="e.g. P0000000A"
                                className={inputClasses}
                              />
                            </div>
                            <div>
                              <label className={labelClasses}>Registration No.</label>
                              <input
                                type="text"
                                name="registration_number"
                                value={formData.registration_number}
                                onChange={handleChange}
                                placeholder="e.g. PVT-12345"
                                className={inputClasses}
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className={labelClasses}>Website</label>
                              <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                                <input
                                  type="url"
                                  name="website"
                                  value={formData.website}
                                  onChange={handleChange}
                                  placeholder="https://company.co.ke"
                                  className={`${inputClasses} pl-12`}
                                />
                              </div>
                            </div>

                            <div className="md:col-span-2 my-2 border-t border-border/50"></div>

                            <div className="md:col-span-2">
                              <label className={labelClasses}>Key Service Areas</label>
                              <p className="text-xs text-muted-foreground mb-3">Select primary counties of operation</p>
                              <div className="border border-border rounded-xl p-4 bg-background max-h-[220px] overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-3">
                                {kenyaCounties.map((county) => {
                                  const isChecked = formData.service_areas.includes(county);
                                  return (
                                    <label key={county} className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border text-sm transition-all ${isChecked ? 'bg-primary/5 border-primary text-primary font-medium shadow-[0_2px_10px_rgba(21,128,61,0.1)]' : 'border-transparent hover:bg-muted text-foreground'}`}>
                                      <input
                                        type="checkbox"
                                        name="service_areas"
                                        value={county}
                                        checked={isChecked}
                                        onChange={handleChange}
                                        className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
                                      />
                                      {county}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="pt-6 mt-4">
                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full py-4 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-lg hover:opacity-90 transition-opacity focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 shadow-[0_10px_30px_-10px_rgba(21,128,61,0.5)]"
                            >
                              {loading ? "Submitting..." : "Apply as Verified Partner"}
                            </button>
                            <p className="text-center text-sm text-muted-foreground mt-4 flex flex-col items-center justify-center gap-1">
                              <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Takes ~2 mins. Our dedicated compliance team answers in less than 24 hours.</span>
                              By applying, you agree to our Terms.
                            </p>
                          </div>
                        </form>
                      </div>
                    </div>
                 )}
               </div>
            </div>

          </motion.div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
