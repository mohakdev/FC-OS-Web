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
import { participationLabel } from "@/lib/canon/format";
import type { CanonCategoryRow } from "@/utils/canonDbActions";
import type { Draft } from "./draft";
import { FeeBadge } from "./fee-badge";
import { ghost } from "./ghost";
import { OptionSelect } from "./option-select";

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
  const field = (key: "teamMin" | "teamMax", prefix: string, label: string) => (
    <InputGroup className="h-7 w-20">
      <InputGroupAddon>
        <InputGroupText className="text-xs">{prefix}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={label}
        inputMode="numeric"
        value={d[key] ?? ""}
        onChange={(e) => set({ [key]: toSize(e.target.value) })}
        className="text-xs"
      />
    </InputGroup>
  );
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Team size, ${TEAM_MIN}–${TEAM_MAX} members`}
    >
      {field("teamMin", "Min", "Minimum team size")}
      {field("teamMax", "Max", "Maximum team size")}
      <span className="text-xs text-muted-foreground">members</span>
    </div>
  );
}

const TITLE = "font-serif text-5xl leading-tighter text-primary md:text-5xl";

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
            <OptionSelect
              label="Category"
              value={d.categoryId}
              onChange={(categoryId) => set({ categoryId })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <OptionSelect
              label="Registration fee"
              value={d.isPaid ? "paid" : "free"}
              onChange={(v) => set({ isPaid: v === "paid" })}
              options={[
                { value: "free", label: "Free" },
                { value: "paid", label: "Paid" },
              ]}
            />
            {d.isPaid && (
              <InputGroup className="h-7 w-28">
                <InputGroupAddon>
                  <InputGroupText>₹</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Fee in rupees (leave empty if not decided)"
                  inputMode="numeric"
                  placeholder="TBD"
                  value={d.fee ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    set({ fee: digits ? Number(digits) : null });
                  }}
                  className="text-xs"
                />
              </InputGroup>
            )}
            <OptionSelect
              label="Participation"
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
            <Badge variant="default">{categoryName}</Badge>
            <FeeBadge isPaid={d.isPaid} fee={d.fee} />
            <Badge variant="info">
              {participationLabel(d.participation, d.teamMin, d.teamMax)}
            </Badge>
          </>
        )}
      </div>
    </header>
  );
}
