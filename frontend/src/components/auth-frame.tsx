import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="relative isolate -m-6 min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 lg:px-10">
      <div className="surface-grid absolute inset-0 text-foreground/30 [mask-image:linear-gradient(90deg,transparent,black_18%,black_72%,transparent)]" />
      <div className="absolute right-[-12rem] top-10 size-[34rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
      <div className="absolute bottom-[-10rem] left-[18vw] size-[24rem] rounded-full bg-foreground/[0.04] blur-3xl dark:bg-primary/10" />

      <div className="relative mx-auto grid min-h-[calc(100dvh-8rem)] max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="order-2 hidden lg:block">
          <div className="animate-float-slow ml-auto max-w-xl rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-[0_30px_90px_-50px_rgba(19,118,255,0.45)] backdrop-blur">
            <div className="rounded-[1.5rem] border border-border bg-background/80 p-6">
              <div className="mb-10 flex items-center justify-between">
                <Badge variant="secondary" className="rounded-full">
                  Live workspace
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  47.2 ms
                </span>
              </div>
              <div className="grid grid-cols-[1fr_0.65fr] gap-4">
                <Metric label="Spend drift" value="-12.4%" />
                <Metric label="Signal lift" value="+8.7%" />
                <div className="col-span-2 rounded-2xl border border-border bg-card p-4">
                  <div className="mb-4 h-2 w-28 rounded-full bg-primary/70" />
                  <div className="flex flex-col gap-2">
                    <div className="h-2 w-full rounded-full bg-muted" />
                    <div className="h-2 w-5/6 rounded-full bg-muted" />
                    <div className="h-2 w-2/3 rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 max-w-md animate-fade-up lg:max-w-lg">
          <Badge variant="outline" className="mb-5 rounded-full border-primary/30 text-primary">
            {eyebrow}
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tighter text-foreground md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-[42ch] text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className="mt-8 rounded-[2rem] border border-border/80 bg-card/85 p-5 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.45)] backdrop-blur dark:bg-card/80">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}
