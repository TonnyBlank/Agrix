import { Link } from "react-router-dom";
import { Building2, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type CompanySetupRequiredProps = {
  title: string;
  description?: string;
};

export default function CompanySetupRequired({
  title,
  description = "Your account still needs a company profile before this section can load. Finish the company setup first, then come back here.",
}: CompanySetupRequiredProps) {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
          <Building2 className="h-5 w-5 text-amber-700" />
        </div>
        <div className="max-w-2xl">
          <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/dashboard/company">
              Complete company setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
