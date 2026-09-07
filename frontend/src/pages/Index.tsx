import { useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import ServicesSection from "@/components/landing/ServicesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import IntelligenceSection from "@/components/landing/IntelligenceSection";
import CropSpotlightSection from "@/components/landing/CropSpotlightSection";
import MicroLoansSection from "@/components/landing/MicroLoansSection";
import PricingSection from "@/components/landing/PricingSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function Index() {
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);

      if (!id) return;

      const target = document.getElementById(id);

      if (!target) return;

      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
      });
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);

    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <ServicesSection />
      <HowItWorksSection />
      <IntelligenceSection />
      <CropSpotlightSection />
      <MicroLoansSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
