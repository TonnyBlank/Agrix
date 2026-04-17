import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";

import Profile from "./Profile";

export default function ProfileRoute() {
  const { role } = useAuth();

  if (role === "company") {
    return <Navigate to="/dashboard/company/settings" replace />;
  }

  return <Profile />;
}
