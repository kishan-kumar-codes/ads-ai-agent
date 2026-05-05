import { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { MenuIcon, MessageSquareTextIcon, TargetIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "../lib/auth-client";
import { ThemeToggle } from "./theme-toggle";
import { ToastViewport } from "./Toast";

export function Layout() {
  const { data: session, isPending } = useSession();
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="grain-overlay" />
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background/82 px-4 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="rounded-full md:hidden">
                  <MenuIcon />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-4" aria-describedby="mobile-nav-description">
                <SheetHeader>
                  <SheetTitle>AI Marketing Agent</SheetTitle>
                  <SheetDescription id="mobile-nav-description">
                    Navigate between campaign workspace sections.
                  </SheetDescription>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-2">
                  <NavItem to="/">Home</NavItem>
                  {session?.user && <NavItem to="/chat">Chats</NavItem>}
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/" className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <TargetIcon />
              </span>
              <span>AI Marketing Agent</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            <NavItem to="/">Home</NavItem>
            {session?.user && <NavItem to="/chat">Chats</NavItem>}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isPending ? (
              <Skeleton className="h-8 w-24 rounded-full" />
            ) : session?.user ? (
              <UserMenu email={userEmail} />
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" className="rounded-full">
                  <Link to="/signin">Sign in</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex-1 p-6">
        <Outlet />
      </main>
      <ToastViewport />
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "rounded-full px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function UserMenu({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className="h-9 rounded-full px-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm md:inline">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/chat">
              <MessageSquareTextIcon />
              Chats
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
