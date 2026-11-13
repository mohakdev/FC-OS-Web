"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DATE_KIND_LABEL,
  DATE_KINDS,
  DATE_STATUS_META,
  DATE_STATUSES,
  type DateKind,
} from "@/lib/canon/constants";
import { formatDay } from "@/lib/canon/format";
import type { CanonDate } from "@/utils/canonDbActions";
import type { Draft } from "./draft";
import { OptionSelect } from "./option-select";

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

function RangePicker({
  value,
  onChange,
}: {
  value: CanonDate | null;
  onChange: (
    range: { startDate: string; endDate: string | null } | null,
  ) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 font-normal text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="size-4" />
            {value ? "Change dates" : "Set dates"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={value ? parseISO(value.startDate) : undefined}
            selected={
              value
                ? {
                    from: parseISO(value.startDate),
                    to: value.endDate ? parseISO(value.endDate) : undefined,
                  }
                : undefined
            }
            onSelect={(r) => {
              if (!r?.from) return onChange(null);
              const start = toIso(r.from);
              const end = r.to ? toIso(r.to) : null;
              onChange({
                startDate: start,
                endDate: end === start ? null : end,
              });
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label="Clear dates"
          onClick={() => onChange(null)}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export function DatesTable({
  d,
  editing,
  set,
}: {
  d: Draft;
  editing: boolean;
  set: (patch: Partial<Draft>) => void;
}) {
  const setKind = (kind: DateKind, value: CanonDate | null) =>
    set({ dates: { ...d.dates, [kind]: value } });

  return (
    <section aria-label="Dates" className="rounded-lg overflow-scroll">
      <Table className="">
        <TableHeader>
          <TableRow className="*:text-primary *:font-bold">
            <TableHead className="w-36">Dates</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DATE_KINDS.map((kind) => {
            const row = d.dates[kind];
            return (
              <TableRow key={kind}>
                <TableCell className="font-bold text-primary">
                  {DATE_KIND_LABEL[kind]}
                </TableCell>
                <TableCell className="tabular-nums">
                  {row ? formatDay(row.startDate) : "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      {row?.endDate && formatDay(row.endDate)}
                      <RangePicker
                        value={row}
                        onChange={(r) =>
                          setKind(
                            kind,
                            r
                              ? {
                                  kind,
                                  ...r,
                                  status: row?.status ?? "tentative",
                                }
                              : null,
                          )
                        }
                      />
                    </div>
                  ) : row ? (
                    row.endDate ? (
                      formatDay(row.endDate)
                    ) : (
                      "—"
                    )
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row &&
                    (editing ? (
                      <OptionSelect
                        label={`${DATE_KIND_LABEL[kind]} date status`}
                        value={row.status}
                        onChange={(status) => setKind(kind, { ...row, status })}
                        options={DATE_STATUSES.map((s) => ({
                          value: s,
                          label: DATE_STATUS_META[s].label,
                        }))}
                      />
                    ) : (
                      <Badge variant={DATE_STATUS_META[row.status].variant}>
                        {DATE_STATUS_META[row.status].label}
                      </Badge>
                    ))}
                  {!row && (
                    <span className="text-xs text-muted-foreground">
                      Not set
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
