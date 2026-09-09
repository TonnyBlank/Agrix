import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandWordmark from "@/components/branding/BrandWordmark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, Eye, EyeOff, Home } from "lucide-react";
import { getPasswordRequirements, getPasswordValidationMessage, isPasswordValid } from "@/lib/passwordPolicy";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const passwordIsValid = isPasswordValid(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordValidationMessage = getPasswordValidationMessage(password);
    if (passwordValidationMessage) {
      toast({
        title: "Choose a stronger password",
        description: passwordValidationMessage,
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please make sure both password fields are the same.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      if (data.session) {
        await supabase.auth.signOut();
      }
      toast({
        title: "Account created!",
        description: "Your account was created. Please log in with your email and password to continue.",
      });
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Button asChild variant="outline" size="sm" className="mb-8 inline-flex">
            <Link to="/">
              <Home className="w-4 h-4" />
              Home
            </Link>
          </Button>

          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-lg">A</span>
            </div>
            <BrandWordmark className="text-xl text-foreground" />
          </div>

          <h1 className="text-2xl font-display font-bold text-foreground mt-6 mb-1">Create your account</h1>
          <p className="text-muted-foreground mb-8">Start your journey to smarter farming</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Kamau"
                required
              />
            </div>
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
                  placeholder="Create a strong password"
                  minLength={8}
                  autoComplete="new-password"
                  aria-describedby="password-requirements"
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
              <p className="mt-3 text-xs font-medium text-foreground">Password must contain:</p>
              <ul id="password-requirements" className="mt-2 space-y-1.5 text-xs text-muted-foreground" aria-live="polite">
                {getPasswordRequirements(password).map((requirement) => (
                  <li key={requirement.id} className={requirement.met ? "flex items-center gap-2 text-primary" : "flex items-center gap-2"}>
                    {requirement.met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    {requirement.message}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  minLength={8}
                  autoComplete="new-password"
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

            <Button type="submit" className="w-full h-12" disabled={loading || !passwordIsValid || !passwordsMatch}>
              {loading ? "Creating account..." : "Create Free Account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-hero-gradient items-center justify-center p-12">
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-display font-bold text-primary-foreground mb-4">
            Start Free. Grow Big.
          </h2>
          <p className="text-yellow-400 text-lg font-medium">
            Every farmer starts with a free account. Upgrade anytime as your business grows.
          </p>
        </div>
      </div>
    </div>
  );
}
