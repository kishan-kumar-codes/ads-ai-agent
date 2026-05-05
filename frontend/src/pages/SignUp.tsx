import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthFrame } from "../components/auth-frame";
import { signUp } from "../lib/auth-client";
import { useToast } from "../components/Toast";

export function SignUpPage() {
  const navigate = useNavigate();
  const push = useToast((s) => s.push);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordScore = getPasswordScore(password);

  function validate(): string | null {
    if (name.trim().length < 2) return "Name is too short.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.email({ email, password, name });
      if ((result as any)?.error) {
        throw new Error((result as any).error.message ?? "Sign-up failed");
      }
      push("Account created", "success");
      navigate("/chat");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-up failed";
      setError(msg);
      push(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Workspace setup"
      title="Create your account"
      description="Start with a focused workspace for campaign planning, launch QA, and AI-guided optimization decisions."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Sign up form">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Mara Vale"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="mara@atelier.media"
            />
            <FieldDescription className="flex items-center gap-1.5">
              <CheckCircle2Icon data-icon="inline-start" />
              We will keep launch notes tied to this inbox.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <PasswordStrength score={passwordScore} />
          </Field>
        </FieldGroup>
        {error && <FieldError>{error}</FieldError>}
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-px"
        >
          {loading && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          {loading ? "Creating account" : "Sign up"}
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/signin" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function getPasswordScore(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];

  return checks.filter(Boolean).length;
}

function PasswordStrength({ score }: { score: number }) {
  const labels = ["Waiting", "Basic", "Steady", "Strong", "Hardened"];
  const width = `${Math.max(score, 1) * 25}%`;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width }}
        />
      </div>
      <FieldDescription>
        Password strength: <span className="font-medium text-foreground">{labels[score]}</span>
      </FieldDescription>
    </div>
  );
}
