"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createEvent } from "../actions";

export function NewEventButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await createEvent();
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          router.push(`/dashboard/canon/${res.id}?edit=1`);
        })
      }
    >
      <Plus className="size-4" />
      New event
    </Button>
  );
}
