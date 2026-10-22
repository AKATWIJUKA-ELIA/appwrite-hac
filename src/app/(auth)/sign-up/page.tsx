import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account · Quotebook" };

export default function SignUpPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Start a request in under a minute. No card needed.
        </p>
      </div>
      <AuthForm mode="sign-up" />
    </div>
  );
}
