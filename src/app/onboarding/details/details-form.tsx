"use client";

import { useState, useTransition } from "react";

import {
  AvatarCropper,
  type AvatarOwner,
  AvatarSection,
} from "@/components/profile/avatar-editor";
import { LinksEditor } from "@/components/profile/links-editor";
import { QuoteField } from "@/components/profile/quote-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { completeProfileDetails } from "./actions";

type Mode = "onboarding-step-2" | "ra-required";

const COPY: Record<Mode, { title: string; description: string }> = {
  "onboarding-step-2": {
    title: "Make it yours",
    description:
      "Step 2 of 2 · All optional. Other members see these in the Member Directory once you're approved.",
  },
  "ra-required": {
    title: "One more thing",
    description:
      "We now keep every member's RA number on file. Add yours to continue — the rest is optional.",
  },
};

export default function DetailsForm({
  mode,
  profile,
  initialQuote,
  initialLinks,
  maxLinks,
}: {
  mode: Mode;
  profile: AvatarOwner;
  initialQuote: string;
  initialLinks: string[];
  maxLinks: number;
}) {
  const askRa = mode === "ra-required";
  const [raNumber, setRaNumber] = useState("");
  const [quote, setQuote] = useState(initialQuote);
  const [links, setLinks] = useState<string[]>(
    initialLinks.length > 0 ? initialLinks : [""],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Crop step: set while the member frames a freshly picked image.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const submit = (values: { quote: string; links: string[] }) => {
    setError(null);
    startTransition(async () => {
      const result = await completeProfileDetails({
        raNumber: askRa ? raNumber : undefined,
        ...values,
      });
      // A successful action redirects server-side; we only get here on error.
      if (result?.error) setError(result.error);
    });
  };

  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const copy = COPY[mode];

  if (cropSrc) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-serif text-3xl text-primary">
            Frame your picture
          </CardTitle>
          <CardDescription className="font-sans">
            Drag to move, slide to zoom.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 font-sans">
          <AvatarCropper
            src={cropSrc}
            onCancel={closeCropper}
            onSaved={closeCropper}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="font-serif text-3xl text-primary">
          {copy.title}
        </CardTitle>
        <CardDescription className="font-sans">
          {copy.description}
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ quote, links });
        }}
      >
        <CardContent className="my-4 flex flex-col gap-6 font-sans">
          {askRa ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="raNumber">RA number</Label>
                <Input
                  id="raNumber"
                  required
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={20}
                  aria-describedby="raNumber-hint"
                  className="font-mono uppercase"
                  value={raNumber}
                  onChange={(e) => setRaNumber(e.target.value)}
                />
                <p id="raNumber-hint" className="text-xs text-muted-foreground">
                  Your SRM registration number: RA followed by 13 digits. It
                  can't be changed later.
                </p>
              </div>
              <Separator />
            </>
          ) : null}

          <AvatarSection profile={profile} onPicked={setCropSrc} />
          <QuoteField id="details-quote" value={quote} onChange={setQuote} />
          <LinksEditor links={links} max={maxLinks} onChange={setLinks} />

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex gap-2">
          {askRa ? null : (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isPending}
              // Skip keeps whatever is already saved (a picture uploads on its own).
              onClick={() =>
                submit({ quote: initialQuote, links: initialLinks })
              }
            >
              Skip
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending ? <Spinner /> : null}
            {askRa ? "Continue" : "Finish"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
