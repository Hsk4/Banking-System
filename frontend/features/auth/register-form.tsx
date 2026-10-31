"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, register } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/card";

type Fields = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const EMPTY: Fields = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

/**
 * - Register form
 * Same card as login, with inline validation on blur. Success goes straight
 * to the dashboard because registration already sets the session cookie.
 */
export function RegisterForm() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    // clear the error as soon as the user starts fixing the field
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  /** Validate a single field and store its message (if any). */
  function validateField(
    key: keyof Fields,
    values: Fields,
  ): string | undefined {
    switch (key) {
      case "name":
        return values.name.trim() ? undefined : "Enter your full name";
      case "email":
        if (!values.email) return "Enter your email address";
        return /^\S+@\S+\.\S+$/.test(values.email)
          ? undefined
          : "Enter a valid email address";
      case "password":
        return values.password.length >= 6
          ? undefined
          : "Password must be at least 6 characters";
      case "confirmPassword":
        if (!values.confirmPassword) return "Confirm your password";
        return values.confirmPassword === values.password
          ? undefined
          : "Passwords do not match";
    }
  }

  function onBlur(key: keyof Fields) {
    setErrors((current) => ({ ...current, [key]: validateField(key, fields) }));
  }

  /** "Confirm password" can only be judged once there is something to match. */
  function onConfirmBlur() {
    if (!fields.confirmPassword) {
      setErrors((current) => ({ ...current, confirmPassword: undefined }));
      return;
    }
    onBlur("confirmPassword");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const nextErrors = Object.fromEntries(
      (Object.keys(fields) as Array<keyof Fields>).map((key) => [
        key,
        validateField(key, fields),
      ]),
    ) as Partial<Fields>;
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setPending(true);
    try {
      const response = await register(fields);
      signIn(response.user, response.token);
      // a system user holds no customer accounts; the fund page is their home
      router.replace(response.user.systemUser ? "/admin/fund" : "/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : errorMessage(caught),
      );
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-center text-3xl font-medium tracking-tight">
        Create your account
      </h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        One login, one place for your balances
      </p>

      <form
        onSubmit={onSubmit}
        // only clear the server message once the user is editing again
        onChange={error ? () => setError(null) : undefined}
        className="mt-6 space-y-4"
        noValidate
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            value={fields.name}
            invalid={Boolean(errors.name)}
            disabled={pending}
            aria-describedby={errors.name ? "name-error" : undefined}
            onChange={(event) => set("name", event.target.value)}
            onBlur={() => onBlur("name")}
          />
          <FieldError id="name-error" visible>
            {errors.name}
          </FieldError>
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={fields.email}
            invalid={Boolean(errors.email)}
            disabled={pending}
            aria-describedby={errors.email ? "email-error" : undefined}
            onChange={(event) => set("email", event.target.value)}
            onBlur={() => onBlur("email")}
          />
          <FieldError id="email-error" visible>
            {errors.email}
          </FieldError>
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={fields.password}
            invalid={Boolean(errors.password)}
            disabled={pending}
            aria-describedby="password-hint"
            onChange={(event) => set("password", event.target.value)}
            onBlur={() => onBlur("password")}
          />
          <p
            id="password-hint"
            className={cn(
              "mt-1.5 text-xs",
              errors.password ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {errors.password ?? "At least 6 characters"}
          </p>
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={fields.confirmPassword}
            invalid={Boolean(errors.confirmPassword)}
            disabled={pending}
            aria-describedby={
              errors.confirmPassword ? "confirm-password-error" : undefined
            }
            onChange={(event) => set("confirmPassword", event.target.value)}
            onBlur={onConfirmBlur}
          />
          <FieldError id="confirm-password-error" visible>
            {errors.confirmPassword}
          </FieldError>
        </div>

        <Button type="submit" fullWidth disabled={pending}>
          {pending ? (
            <>
              <Spinner /> Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
