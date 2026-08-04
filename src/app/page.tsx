import Link from "next/link";

import { HeroBackground } from "@/components/theme/hero-background";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { getAuthState } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

const HomePage = async () => {
  const authState = await getAuthState();
  const isSignedIn = authState.kind !== "unauthenticated";

  return (
    <main className="relative flex h-svh max-h-svh flex-1 overflow-hidden bg-background">
      <HeroBackground />
      <ThemeSelector variant="floating" />
      <div className="relative z-10 flex w-full items-center justify-center flex-col mb-40">
        <div className="max-w-xl rounded-2xl font-serif text-9xl tracking-tight">
          FC OS
        </div>
        <div className="flex items-center gap-4 font-serif mt-6">
          {isSignedIn ? (
            <Link
              href={"/dashboard"}
              className="text-xl px-5 py-1 backdrop-blur-xs rounded-xl border border-white/10 shadow-2xl"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href={"/login"}
                className="text-xl px-5 py-1 backdrop-blur-xs rounded-xl border border-white/10 shadow-2xl"
              >
                Log In
              </Link>
              <Link
                href={"/login"}
                className="text-xl px-5 py-1 backdrop-blur-xs rounded-xl border border-white/10 shadow-2xl"
              >
                Request Access
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default HomePage;
