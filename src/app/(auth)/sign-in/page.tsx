import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/auth/constants";

export const metadata: Metadata = { title: "Sign in · Quotebook" };

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to see your requests and quotes.</p>
      </div>
      <AuthForm mode="sign-in" next={next ? safeNext(next) : undefined} />
    </div>
  );
}
