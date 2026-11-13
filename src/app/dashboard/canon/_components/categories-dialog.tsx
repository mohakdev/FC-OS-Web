"use client";

import { Check, Pencil, Tags, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CanonCategoryRow } from "@/utils/canonDbActions";
import {
  type ActionResult,
  addCategory,
  removeCategory,
  renameCategory,
} from "../actions";

export function CategoriesDialog({
  categories,
}: {
  categories: CanonCategoryRow[];
}) {
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) toast.error(res.error);
      else onOk?.();
    });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags className="size-4" />
          Categories
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Event categories</DialogTitle>
          <DialogDescription>
            A category in use by an event can be renamed but not deleted.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {editing?.id === c.id ? (
                <>
                  <Input
                    autoFocus
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ id: c.id, name: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        run(
                          () => renameCategory(c.id, editing.name),
                          () => setEditing(null),
                        );
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => renameCategory(c.id, editing.name),
                        () => setEditing(null),
                      )
                    }
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel"
                    onClick={() => setEditing(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Rename ${c.name}`}
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${c.name}`}
                    disabled={pending}
                    onClick={() => run(() => removeCategory(c.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addCategory(newName),
              () => setNewName(""),
            );
          }}
        >
          <Input
            placeholder="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={pending || !newName.trim()}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
