import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthFrame } from "../components/auth-frame";
import { signIn } from "../lib/auth-client";
import { useToast } from "../components/Toast";

export function SignInPage() {
  const navigate = useNavigate();
  const push = useToast((s) => s.push);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.email({
        email,
        password,
        rememberMe: remember,
      });
      if ((result as any)?.error) {
        throw new Error((result as any).error.message ?? "Sign-in failed");
      }
      push("Signed in", "success");
      navigate("/chat");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg);
      push(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Operator access"
      title="Sign in"
      description="Return to your campaign command room with saved briefs, draft launches, and optimization threads ready to continue."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Sign in form">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="pilot@atelier.media"
            />
            <FieldDescription>Use the email tied to your workspace.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="At least 8 characters"
            />
          </Field>
          <Field orientation="horizontal" className="items-center">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <FieldLabel htmlFor="remember" className="font-normal">
              Remember me
            </FieldLabel>
          </Field>
        </FieldGroup>
        {error && <FieldError>{error}</FieldError>}
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-px"
        >
          {loading && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          {loading ? "Signing in" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}
