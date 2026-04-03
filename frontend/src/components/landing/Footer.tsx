import BrandWordmark from "@/components/branding/BrandWordmark";
import { Link } from "react-router-dom";

const links = {
  Product: [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "Mobile App", href: "#" },
  ],
  Company: [
    { name: "About", href: "/about" },
    { name: "Careers", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Press", href: "#" },
  ],
  Resources: [
    { name: "Documentation", href: "#" },
    { name: "Help Center", href: "#" },
    { name: "Community", href: "/dashboard/community" },
    { name: "Partners", href: "#" },
  ],
  Legal: [
    { name: "Privacy", href: "#" },
    { name: "Terms", href: "#" },
    { name: "Cookie Policy", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-foreground text-primary-foreground py-16">
      <div className="container">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold">A</span>
              </div>
              <BrandWordmark className="text-lg text-primary-foreground" />
            </div>
            <p className="text-sm text-primary-foreground/60 leading-relaxed mb-6">
              The intelligent agricultural commerce platform connecting Africa's farmers to global markets.
            </p>
            <div className="space-y-3">
              <a href="mailto:officialagrilinkx@gmail.com" className="flex items-center gap-2 text-sm text-primary-foreground/50 hover:text-primary-foreground/80 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                officialagrilinkx@gmail.com
              </a>
              <a href="tel:0793900080" className="flex items-center gap-2 text-sm text-primary-foreground/50 hover:text-primary-foreground/80 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                0793 900 080
              </a>
            </div>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-display font-semibold text-sm mb-4">{category}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.name}>
                    {item.href.startsWith('#') || item.href.startsWith('http') ? (
                      <a href={item.href} className="text-sm text-primary-foreground/50 hover:text-primary-foreground/80 transition-colors">
                        {item.name}
                      </a>
                    ) : (
                      <Link to={item.href} className="text-sm text-primary-foreground/50 hover:text-primary-foreground/80 transition-colors">
                        {item.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-primary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-primary-foreground/40">
            Copyright 2026 AgriLink X. All rights reserved. Made with tonny in Kakamega
          </p>
        
          <div className="flex gap-6">
            {[
              { name: "Twitter", href: "https://twitter.com/AgriLinkX" },
              { name: "LinkedIn", href: "https://linkedin.com/company/agrilinkx" },
              { name: "Instagram", href: "https://instagram.com/agrilinkx" }
            ].map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noreferrer" className="text-xs text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors">
                {s.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
