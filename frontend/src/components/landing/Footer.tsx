import BrandWordmark from "@/components/branding/BrandWordmark";
import { Link } from "react-router-dom";

const links = {
  Platform: [
    { name: "Marketplace", href: "/login" },
    { name: "Services", href: "/#services" },
    { name: "Farmer Signup", href: "/signup" },
    { name: "Company Signup", href: "/company-register" },
  ],
  Company: [
    { name: "About", href: "/about" },
    { name: "Why AgriLink X", href: "/about" },
    { name: "Partner With Us", href: "mailto:officialagrilinkx@gmail.com?subject=Partnership%20Request" },
    { name: "Contact Team", href: "mailto:officialagrilinkx@gmail.com" },
  ],
  Resources: [
    { name: "Get Started", href: "/signup" },
    { name: "Company Onboarding", href: "/company-register" },
    { name: "Login", href: "/login" },
    { name: "Help & Support", href: "mailto:officialagrilinkx@gmail.com?subject=Support%20Request" },
  ],
  Legal: [
    { name: "Privacy Request", href: "mailto:officialagrilinkx@gmail.com?subject=Privacy%20Request" },
    { name: "Terms Enquiry", href: "mailto:officialagrilinkx@gmail.com?subject=Terms%20Enquiry" },
    { name: "Cookies & Data", href: "mailto:officialagrilinkx@gmail.com?subject=Cookie%20Policy%20Request" },
  ],
};

const socialLinks = [
  { name: "Twitter", href: "https://twitter.com/AgriLinkX" },
  { name: "LinkedIn", href: "https://linkedin.com/company/agrilinkx" },
  { name: "Instagram", href: "https://instagram.com/agrilinkx" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-foreground text-primary-foreground border-t border-primary-foreground/10 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-[80%] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="container px-6 py-16 md:px-8 lg:py-20 lg:pt-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-6 lg:gap-8">

          {/* Brand Info */}
          <div className="lg:col-span-2 pr-4 md:pr-12">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-glow-emerald">
                <span className="font-display text-lg font-bold text-primary-foreground">A</span>
              </div>
              <BrandWordmark className="text-xl text-primary-foreground" />
            </div>
            <p className="mb-8 max-w-sm text-sm leading-relaxed text-primary-foreground/70">
              AgriLink X helps farmers, buyers, and agricultural companies move from scattered conversations to clear trade, trusted partnerships, and faster growth.
            </p>
            <div className="flex flex-col gap-3 text-sm text-primary-foreground/70">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                </span>
                <a href="mailto:officialagrilinkx@gmail.com" className="transition-colors hover:text-primary break-all">
                  officialagrilinkx@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </span>
                <a href="tel:0793900080" className="transition-colors hover:text-primary">
                  0793 900 080
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                </span>
                <p>Kakamega, Kenya</p>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4 lg:col-span-4 mt-8 lg:mt-0">
            {Object.entries(links).map(([category, items]) => (
              <div key={category}>
                <h4 className="mb-6 font-display text-sm font-semibold tracking-widest uppercase text-primary-foreground">{category}</h4>
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li key={item.name}>
                      {item.href.startsWith("http") || item.href.startsWith("mailto:") ? (
                        <a href={item.href} className="text-sm font-medium text-primary-foreground/55 transition-all hover:text-primary hover:translate-x-1 inline-block">
                          {item.name}
                        </a>
                      ) : (
                        <Link to={item.href} className="text-sm font-medium text-primary-foreground/55 transition-all hover:text-primary hover:translate-x-1 inline-block">
                          {item.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-20 flex flex-col items-center justify-between gap-6 border-t border-primary-foreground/10 pt-8 md:flex-row">
          <p className="text-sm text-primary-foreground/45 text-center md:text-left">
            © {year} AgriLink X. Built in Kakamega, Kenya for a smarter agricultural economy.
          </p>

          <div className="flex items-center gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="referrer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/[0.03] text-primary-foreground/50 transition-all hover:bg-primary hover:text-primary-foreground hover:-translate-y-1"
                aria-label={social.name}
              >
                <span className="text-xs font-semibold">{social.name[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
