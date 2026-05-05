import { Link } from "react-router-dom";
import { ArrowRightIcon, BarChart3Icon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "../lib/auth-client";

export function HomePage() {
  const { data } = useSession();
  return (
    <section className="relative -m-6 min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6 lg:px-10">
      <div className="surface-grid absolute inset-0 text-foreground/25 [mask-image:linear-gradient(90deg,black,transparent_76%)]" />
      <div className="absolute right-[-12rem] top-16 size-[32rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />

      <div className="relative mx-auto grid min-h-[calc(100dvh-9rem)] max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
        <div className="animate-fade-up">
          <Badge variant="outline" className="mb-5 rounded-full border-primary/30 text-primary">
            Campaign command room
          </Badge>
          <h1 className="max-w-3xl font-heading text-5xl font-semibold tracking-tighter md:text-6xl">
            AI Marketing Agent
          </h1>
          <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
            Plan, launch, and optimize Google and Meta ad campaigns through a focused
            chat interface built for operators who need clear next steps.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {data?.user ? (
              <Button asChild size="lg" className="rounded-full">
                <Link to="/chat">
                  Open chat
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="rounded-full">
                  <Link to="/signup">
                    Get started
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full">
                  <Link to="/signin">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid animate-fade-up grid-cols-1 gap-4 md:grid-cols-2 lg:translate-y-8">
          <Feature
            icon={BarChart3Icon}
            title="Pacing intelligence"
            detail="Spot budget drift before the learning window closes."
          />
          <Feature
            icon={SparklesIcon}
            title="Creative decisions"
            detail="Turn fatigue signals into the next high-confidence rotation."
          />
          <div className="md:col-span-2">
            <Feature
              icon={ShieldCheckIcon}
              title="Launch guardrails"
              detail="Convert campaign checks into crisp tasks for QA, approval, and handoff."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof BarChart3Icon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card/75 p-6 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.55)] backdrop-blur transition-transform duration-300 hover:-translate-y-1">
      <div className="mb-8 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon />
      </div>
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
