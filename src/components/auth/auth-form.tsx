"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp, type AuthFormState } from "@/lib/auth/actions";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode, next }: Readonly<{ mode: Mode; next?: string }>) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "sign-in" ? signIn : signUp,
    {},
  );
  const fields = state.fields ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate>
      {mode === "sign-up" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              defaultValue={fields.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="organisation">
              Organisation <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="organisation"
              name="organisation"
              autoComplete="organization"
              defaultValue={fields.organisation}
            />
          </div>
        </>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={fields.email}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {mode === "sign-up" && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? (
          <>
            New to Quotebook?{" "}
            <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
