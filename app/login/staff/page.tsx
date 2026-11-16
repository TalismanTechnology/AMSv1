import { staffSignInMode, warnIfAdminsLockedOut } from "@/lib/auth/admin-google-only";
import { StaffLoginForm } from "./staff-login-form";

export default function StaffLoginPage() {
  // Read on the server so GOOGLE_SIGNIN_ENABLED / ADMIN_GOOGLE_ONLY need no
  // NEXT_PUBLIC_ build variable (a change still takes a redeploy on Vercel).
  warnIfAdminsLockedOut();
  return <StaffLoginForm mode={staffSignInMode()} />;
}
