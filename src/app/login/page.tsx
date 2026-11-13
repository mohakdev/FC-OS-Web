import Image from "next/image";
import { redirect } from "next/navigation";
import Login from "@/components/Login";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { getAuthState } from "@/lib/auth/context";

// Reads the session, so it must render dynamically.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Already signed in? Don't show the login form — hand off to the dashboard,
  // whose layout cascades to /onboarding or /pending as the profile state needs.
  const state = await getAuthState();
  if (state.kind !== "unauthenticated") redirect("/dashboard");

  return (
    <div className="grid md:grid-cols-2 flex-1 relative">
      <ThemeSelector />
      <div className="relative z-10 flex flex-col items-center justify-center p-4">
        <div className="space-y-1 flex flex-col items-center md:items-start">
          <Image src={"/FCLogo.svg"} alt="FC Logo" width={40} height={20} />
          <h1 className="font-serif text-9xl">FC OS</h1>
          <p className="font-semibold">
            Plan. Orchestrate. <span className="text-primary">Operate</span>.
          </p>
        </div>
      </div>
      <div className="relative z-10 flex items-start md:items-center justify-center p-4">
        <Login />
      </div>
    </div>
  );
}
