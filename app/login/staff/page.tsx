import { isGoogleSignInEnabled } from "@/lib/auth/google-sign-in";
import { StaffLoginForm } from "./staff-login-form";

export default function StaffLoginPage() {
  // Read on the server so GOOGLE_SIGNIN_ENABLED needs no NEXT_PUBLIC_ build
  // variable (a change still takes a redeploy on Vercel).
  return <StaffLoginForm googleSignInEnabled={isGoogleSignInEnabled()} />;
}
