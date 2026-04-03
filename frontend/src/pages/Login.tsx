import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandWordmark from "@/components/branding/BrandWordmark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        toast({
          title: "Login failed",
          description:
            error.message.toLowerCase().includes("invalid login credentials")
              ? "Incorrect email or password. If you do not have an account yet, please sign up first."
              : error.message,
          variant: "destructive",
        });
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.toLowerCase().includes("fetch")
            ? "Could not reach Supabase. Check your internet connection, project URL, and anon key."
            : err.message
          : "An unexpected error occurred. Please try again.";

      console.error("[login] signInWithPassword failed:", err);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left - form */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-lg">A</span>
            </div>
            <BrandWordmark className="text-xl text-foreground" />
          </div>

          <h1 className="text-2xl font-display font-bold text-foreground mt-6 mb-1">Welcome back</h1>
          <p className="text-muted-foreground mb-8">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Sign up free
            </Link>
          </p>
        </div>
      </div>

      {/* Right - decorative */}
      <div className="hidden lg:flex flex-1 bg-hero-gradient items-center justify-center p-12">
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-display font-bold text-primary-foreground mb-4">
            Farm Smarter. Earn More.
          </h2>
          <p className="text-agri-green-200/70 text-lg">
            Join 10,000+ farmers and buyers transforming agriculture across Kenya.
          </p>
        </div>
      </div>
    </div>
  );
}
