import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import Particles from "@/components/Particles";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-10">
      <div className="absolute inset-0">
        <Particles
          particleColors={["#f5f5f5", "#22c55e", "#84cc16"]}
          particleCount={340}
          particleSpread={14}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles
          sizeRandomness={1}
          disableRotation={false}
          className="opacity-70"
        />
      </div>
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="flex flex-col items-center">
          <h1 className="font-serif text-6xl tracking-tighter sm:text-7xl">
            FC OS
          </h1>
          <p className="font-medium text-muted-foreground tracking-tighter underline">
            The Founders Club
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild size={"lg"}>
            <Link href={"/login"} className="font-serif text-xl">
              Log In
              <ArrowRightIcon />
            </Link>
          </Button>
          <Button asChild size={"lg"} variant={"outline"}>
            <Link href={"/access"} className="font-serif text-xl">
              Request Access
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
