import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a phase body. react-markdown never renders raw HTML (no
 * `rehype-raw`), so user content can't inject markup or scripts.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="text-base font-semibold" {...p} />,
          h2: (p) => <h3 className="text-base font-semibold" {...p} />,
          h3: (p) => <h4 className="font-semibold" {...p} />,
          // remark-gfm marks checklists with `contains-task-list`; those get
          // checkboxes instead of bullets.
          ul: ({ className, ...p }) => (
            <ul
              className={
                className?.includes("contains-task-list")
                  ? "ml-1 list-none space-y-1"
                  : "ml-5 list-disc space-y-1"
              }
              {...p}
            />
          ),
          input: (p) => <input className="mr-2 align-middle" {...p} />,
          ol: (p) => <ol className="ml-5 list-decimal space-y-1" {...p} />,
          a: (p) => (
            <a
              className="text-primary underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          code: (p) => (
            <code className="rounded bg-muted px-1 py-0.5 text-xs" {...p} />
          ),
          blockquote: (p) => (
            <blockquote
              className="border-l-2 pl-3 text-muted-foreground italic"
              {...p}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
