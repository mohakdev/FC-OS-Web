"use client";

import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import {
  NAME_MAX,
  PARTICIPATION_LABEL,
  PARTICIPATIONS,
  type Participation,
  TEAM_MAX,
  TEAM_MIN,
} from "@/lib/canon/constants";
import { feeLabel, participationLabel } from "@/lib/canon/format";
import type { CanonCategoryRow } from "@/utils/canonDbActions";
import { BadgeSelect } from "./badge-select";
import type { Draft } from "./draft";
import { ghost } from "./ghost";

/** Digits-only input value → bounded int or null (empty). */
const toSize = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  return digits ? Number(digits) : null;
};

function TeamSizeInputs({
  d,
  set,
}: {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  const field = (key: "teamMin" | "teamMax", label: string) => (
    <InputGroupInput
      aria-label={label}
      inputMode="numeric"
      placeholder={key === "teamMin" ? "min" : "max"}
      value={d[key] ?? ""}
      onChange={(e) => set({ [key]: toSize(e.target.value) })}
      className="w-8 px-0 text-center text-xs"
    />
  );
  return (
    <InputGroup
      className="h-6 w-fit"
      title={`Team size, ${TEAM_MIN}–${TEAM_MAX} members`}
    >
      {field("teamMin", "Minimum team size")}
      <InputGroupText className="text-xs">–</InputGroupText>
      {field("teamMax", "Maximum team size")}
      <InputGroupAddon align="inline-end">
        <InputGroupText className="text-xs">members</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

const TITLE = "font-serif text-5xl leading-tight text-primary md:text-5xl";

export function EventHeader({
  d,
  editing,
  set,
  categories,
  categoryName,
}: {
  d: Draft;
  editing: boolean;
  set: (patch: Partial<Draft>) => void;
  categories: CanonCategoryRow[];
  categoryName: string;
}) {
  return (
    <header className="flex flex-col gap-3">
      {editing ? (
        // Textarea (field-sizing-content) so long names wrap like the H1 does.
        <Textarea
          aria-label="Event name"
          value={d.name}
          maxLength={NAME_MAX}
          rows={1}
          placeholder="Event name"
          onChange={(e) => set({ name: e.target.value.replace(/\n/g, "") })}
          className={ghost(TITLE, "resize-none")}
        />
      ) : (
        <h1 className={TITLE}>{d.name}</h1>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {editing ? (
          <>
            <BadgeSelect
              label="Category"
              variant="secondary"
              value={d.categoryId}
              onChange={(categoryId) => set({ categoryId })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <BadgeSelect
              label="Registration fee"
              variant="outline"
              value={d.isPaid ? "paid" : "free"}
              onChange={(v) => set({ isPaid: v === "paid" })}
              options={[
                { value: "free", label: "Free" },
                { value: "paid", label: "Paid" },
              ]}
            />
            {d.isPaid && (
              <InputGroup className="h-6 w-32">
                <InputGroupAddon>
                  <InputGroupText>₹</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Fee in rupees"
                  inputMode="numeric"
                  placeholder="Fee (optional)"
                  value={d.fee ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    set({ fee: digits ? Number(digits) : null });
                  }}
                  className="text-xs"
                />
              </InputGroup>
            )}
            <BadgeSelect
              label="Participation"
              variant="outline"
              value={d.participation}
              onChange={(participation: Participation) =>
                set(
                  participation === "individual"
                    ? { participation, teamMin: null, teamMax: null }
                    : // Prefill a sane default so Save isn't blocked by blanks.
                      {
                        participation,
                        teamMin: d.teamMin ?? 2,
                        teamMax: d.teamMax ?? 4,
                      },
                )
              }
              options={PARTICIPATIONS.map((p) => ({
                value: p,
                label: PARTICIPATION_LABEL[p],
              }))}
            />
            {d.participation !== "individual" && (
              <TeamSizeInputs d={d} set={set} />
            )}
          </>
        ) : (
          <>
            <Badge variant="secondary">{categoryName}</Badge>
            <Badge variant="outline">{feeLabel(d.isPaid, d.fee)}</Badge>
            <Badge variant="outline">
              {participationLabel(d.participation, d.teamMin, d.teamMax)}
            </Badge>
          </>
        )}
      </div>
    </header>
  );
}
