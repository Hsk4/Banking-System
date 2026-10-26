"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { ApiError, login } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/card";

type FieldName = "email" | "password";

/** Validate one field and return its message, if any. */
function validateField(name: FieldName, value: string): string | undefined {
  if (name === "email") {
    if (!value.trim()) return "Enter your email address";
    return /^\S+@\S+\.\S+$/.test(value)
      ? undefined
      : "Enter a valid email address";
  }
  return value ? undefined : "Enter your password";
}

/**
 * - Login form
 * Email + password, show/hide toggle, server errors in a destructive alert
 * above the button (never a toast), and a disabled form while pending.
 */
export function LoginForm() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});

  /** Validate once the field is left, not on every keystroke. */
  function onBlur(name: FieldName) {
    const value = name === "email" ? email : password;
    setFieldErrors((current) => ({
      ...current,
      [name]: validateField(name, value),
    }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const next = {
      email: validateField("email", email),
      password: validateField("password", password),
    };
    setFieldErrors(next);
    if (next.email || next.password) return;

    setPending(true);
    try {
      const response = await login({ email: email.trim(), password });
      signIn(response.user);
      router.replace("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : errorMessage(caught),
      );
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">
        Welcome back
      </h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Sign in to your accounts
      </p>

      <form
        onSubmit={onSubmit}
        // only clear the server message once the user is editing again
        onChange={error ? () => setError(null) : undefined}
        className="mt-6 space-y-4"
        noValidate
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            onBlur={() => onBlur("email")}
          />
          <FieldError id="email-error" visible>
            {fieldErrors.email}
          </FieldError>
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              invalid={Boolean(fieldErrors.password)}
              disabled={pending}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  password: undefined,
                }));
              }}
              onBlur={() => onBlur("password")}
              className="pr-11"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={pending}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <FieldError id="password-error" visible>
            {fieldErrors.password}
          </FieldError>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" fullWidth disabled={pending}>
          {pending ? (
            <>
              <Spinner /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href="/register"
          className="font-medium text-primary hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
