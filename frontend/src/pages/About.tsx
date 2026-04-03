import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { motion } from "framer-motion";

export default function About() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-16">
        <div className="container max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <span className="text-sm font-semibold uppercase tracking-widest text-accent">
              Our Mission
            </span>
            <h1 className="mt-4 mb-6 text-4xl font-display font-bold text-foreground md:text-5xl lg:text-6xl">
              About <span className="text-gradient-gold">AgriLink X</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              We are building the intelligent agricultural commerce platform to connect Africa's farmers to global markets, empowering them with technology, fair trade, and financial resources.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-24"
          >
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold font-display mb-6 text-foreground">Empowering the African Farmer</h2>
                <p className="text-muted-foreground mb-4 leading-relaxed text-lg">
                  For too long, smallholder farmers have been disadvantaged by fragmented supply chains, lack of access to credit, and limited market visibility. AgriLink X bridges this gap by offering a transparent, secure, and AI-driven ecosystem.
                </p>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  Our platform functions as an escrow-backed marketplace, an intelligent crop diagnostic tool, and a micro-financing hub, all rolled into one intuitive mobile-first experience.
                </p>
              </div>
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_24px_54px_-24px_rgba(21,128,61,0.2)] ring-1 ring-border shadow-primary/10">
                <div className="absolute inset-0 border-[4px] border-white/20 rounded-[2.5rem] z-10 pointer-events-none mix-blend-overlay"></div>
                <img 
                  src="https://images.unsplash.com/photo-1595841696677-6489ff3f8cd1?auto=format&fit=crop&q=80" 
                  alt="African farmer in field" 
                  className="w-full h-full object-cover aspect-[4/3] hover:scale-105 transition-transform duration-[1.5s] ease-out"
                />
              </div>
            </div>

            <div className="relative py-20 text-center">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] md:w-full h-[150%] md:h-full max-w-4xl bg-[radial-gradient(ellipse_at_center,rgba(21,128,61,0.08)_0%,rgba(transparent)_70%)] pointer-events-none -z-10 blur-xl"></div>
              
              <div className="relative z-10 flex flex-col items-center px-4">
                <span className="flex items-center gap-4 text-xs font-bold uppercase tracking-[0.2em] text-primary/80 mb-8">
                  <span className="h-[2px] w-8 bg-primary/20 rounded-full"></span>
                  The Future
                  <span className="h-[2px] w-8 bg-primary/20 rounded-full"></span>
                </span>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold font-display mb-10 text-foreground tracking-tight">
                  Our <span className="text-gradient-gold">Vision</span>
                </h2>
                <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-[1.7] text-balance">
                  We envision a thriving agricultural ecosystem across Africa where technology eliminates the barriers between the farm and the market. By providing the digital tools to maximize yield, guarantee fair pricing, and unlock unprecedented access to credit, we are empowering a new generation of agribusinesses to grow sustainably without relying on exploitative middlemen.
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto pb-12 mt-12">
              <div className="bg-primary/5 rounded-[2rem] p-8 border border-primary/10 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-[1rem] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-xl font-bold font-display mb-3 text-foreground">Email Us</h3>
                <a href="mailto:officialagrilinkx@gmail.com" className="text-muted-foreground hover:text-primary transition-colors text-sm md:text-base">officialagrilinkx@gmail.com</a>
              </div>
              <div className="bg-primary/5 rounded-[2rem] p-8 border border-primary/10 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-[1rem] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <h3 className="text-xl font-bold font-display mb-3 text-foreground">Call Us</h3>
                <a href="tel:0793900080" className="text-muted-foreground hover:text-primary transition-colors font-medium">0793 900 080</a>
              </div>
              <div className="bg-primary/5 rounded-[2rem] p-8 border border-primary/10 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-[1rem] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <h3 className="text-xl font-bold font-display mb-3 text-foreground">Location</h3>
                <p className="text-muted-foreground">Kakamega, Kenya</p>
              </div>
            </div>

            <div className="text-center max-w-2xl mx-auto pb-12">
              <h3 className="text-2xl font-bold font-display mb-4">Join the Movement</h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Whether you're a farmer looking to expand, a buyer searching for quality produce, or an investor passionate about agriculture—there is a place for you on AgriLink X.
              </p>
              <a href="/signup" className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-10 py-3 shadow-[0_10px_30px_-10px_rgba(21,128,61,0.5)] hover:shadow-[0_15px_35px_-10px_rgba(21,128,61,0.6)] hover:-translate-y-0.5 transition-all">
                Get Started Today
              </a>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
