export type FooterInfo = {
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  /** Relative time, computed on the server when the page was opened. */
  ago: string;
};

export function EventFooter({ info }: { info: FooterInfo }) {
  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
      <span>
        <span className="font-medium">Created at:</span> {info.createdAt}
      </span>
      <span>
        <span className="font-medium">Last updated by:</span>{" "}
        {info.updatedBy ?? "Unknown"} at {info.updatedAt} ({info.ago})
      </span>
    </footer>
  );
}
