import { ReactNode, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "../store/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme((state) => state.theme);
  const setTheme = useTheme((state) => state.setTheme);

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="theme min-h-[100dvh] bg-background text-foreground">
        {children}
      </div>
    </TooltipProvider>
  );
}
