"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOMAIN_IDS, DOMAIN_LABELS } from "@/lib/validation/onboarding";
import { submitOnboarding } from "./actions";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

export default function OnboardingForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [raNumber, setRaNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleDomain = (id: string, checked: boolean) => {
    setDomains((prev) =>
      checked ? [...prev, id] : prev.filter((d) => d !== id),
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitOnboarding({
        firstName,
        lastName,
        phone,
        raNumber,
        gender,
        dateOfBirth,
        domains,
      });
      // A successful action redirects server-side; we only get here on error.
      if (result?.error) setError(result.error);
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="font-serif text-3xl text-primary">
          Complete your profile
        </CardTitle>
        <CardDescription className="font-sans">
          Step 1 of 2 · Tell us a bit about yourself and the domains you want to
          join.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="my-4 flex flex-col gap-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>+91</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </InputGroup>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="raNumber">RA number</Label>
            <Input
              id="raNumber"
              required
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
              Your SRM registration number: RA followed by 13 digits.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Gender</Label>
            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <Button
                  key={g.value}
                  type="button"
                  variant={gender === g.value ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setGender(g.value)}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Domains</Label>
            <div className="grid grid-cols-2 gap-3">
              {DOMAIN_IDS.map((id) => (
                <Label
                  key={id}
                  htmlFor={`domain-${id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 font-normal",
                    domains.includes(id) && "border-primary bg-primary/5",
                  )}
                >
                  <Checkbox
                    id={`domain-${id}`}
                    checked={domains.includes(id)}
                    onCheckedChange={(checked) =>
                      toggleDomain(id, checked === true)
                    }
                  />
                  {DOMAIN_LABELS[id]}
                </Label>
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Submitting…" : "Submit application"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
