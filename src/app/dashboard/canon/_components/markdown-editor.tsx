"use client";

import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Strikethrough,
  TextQuote,
} from "lucide-react";
import {
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Block,
  currentTextStyle,
  type EditState,
  type InlineMark,
  insertLink,
  setTextStyle,
  type TextStyle,
  toggleBlock,
  toggleWrap,
} from "@/lib/canon/markdown-edit";
import { ghost } from "./ghost";
import { Markdown } from "./markdown";

const STYLES: { value: TextStyle; label: string }[] = [
  { value: "normal", label: "Normal text" },
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
];

const MARKS: {
  mark: InlineMark;
  icon: LucideIcon;
  label: string;
  key?: string;
}[] = [
  { mark: "**", icon: Bold, label: "Bold", key: "B" },
  { mark: "_", icon: Italic, label: "Italic", key: "I" },
  { mark: "~~", icon: Strikethrough, label: "Strikethrough" },
];

const LISTS: { block: Block; icon: LucideIcon; label: string }[] = [
  { block: "bullet", icon: List, label: "Bulleted list" },
  { block: "ordered", icon: ListOrdered, label: "Numbered list" },
  { block: "task", icon: ListChecks, label: "Checklist" },
];

// Tooltip content only mounts on the client (on hover), so reading the
// platform here can't cause a hydration mismatch.
const modKey = () =>
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";

function Shortcut({ k }: { k: string }) {
  return (
    <KbdGroup>
      <Kbd>{modKey()}</Kbd>
      <Kbd>{k}</Kbd>
    </KbdGroup>
  );
}

/** Icon button with a tooltip. Keeps focus (and the selection) in the textarea. */
function ToolButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: ComponentProps<typeof Button>["onClick"];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={label}
          aria-keyshortcuts={
            shortcut ? `Control+${shortcut} Meta+${shortcut}` : undefined
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} {shortcut && <Shortcut k={shortcut} />}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Markdown textarea with a Docs-style toolbar and a Write / Preview switch,
 * so members can format phase details without knowing markdown syntax.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [style, setStyle] = useState<TextStyle>("normal");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  // Selection to replace when the link form submits; the textarea is blurred then.
  const linkSel = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // Menu/popover choices are applied once they close and focus is back in
  // the textarea; editing while a menu still traps focus would be dropped.
  const pending = useRef<((s: EditState) => EditState) | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const id = useId();

  const read = (): EditState | null => {
    const ta = ref.current;
    if (!ta) return null;
    return { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd };
  };

  /**
   * Write `next` into the textarea as a single native edit so Ctrl+Z undoes
   * a toolbar action. Only the changed span is replaced.
   */
  const apply = (next: EditState) => {
    const ta = ref.current;
    if (!ta) return;
    const prev = ta.value;
    let p = 0;
    while (
      p < prev.length &&
      p < next.value.length &&
      prev[p] === next.value[p]
    )
      p++;
    let q = 0;
    while (
      q < prev.length - p &&
      q < next.value.length - p &&
      prev[prev.length - 1 - q] === next.value[next.value.length - 1 - q]
    )
      q++;
    const insert = next.value.slice(p, next.value.length - q);

    ta.focus();
    ta.setSelectionRange(p, prev.length - q);
    // execCommand is deprecated but still the only way to edit a textarea
    // while keeping the browser's undo stack. It fires `input`, so React's
    // onChange runs as if the user typed.
    const ok =
      prev === next.value ||
      (insert
        ? document.execCommand("insertText", false, insert)
        : document.execCommand("delete"));
    if (!ok || ta.value !== next.value) {
      onChange(next.value);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(next.start, next.end);
      });
    } else {
      ta.setSelectionRange(next.start, next.end);
    }
    setStyle(currentTextStyle(next));
  };

  const run = (fn: (s: EditState) => EditState) => {
    const s = read();
    if (s) apply(fn(s));
  };

  const openLink = () => {
    const s = read();
    if (!s) return;
    linkSel.current = { start: s.start, end: s.end };
    const sel = s.value.slice(s.start, s.end).trim();
    const looksLikeUrl = /^(https?:\/\/|www\.)\S+$/i.test(sel);
    setLinkText(looksLikeUrl ? "" : sel);
    setLinkUrl(looksLikeUrl ? sel : "");
    setLinkOpen(true);
  };

  const submitLink = (e: FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const { start, end } = linkSel.current;
    pending.current = (s) =>
      insertLink({ value: s.value, start, end }, linkText, linkUrl);
    setLinkOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") run((s) => toggleWrap(s, "**"));
    else if (k === "i") run((s) => toggleWrap(s, "_"));
    else if (k === "k") openLink();
    else return;
    e.preventDefault();
  };

  const syncStyle = () => {
    const s = read();
    if (s) setStyle(currentTextStyle(s));
  };

  /** On menu/popover close: put focus back and apply the pending choice. */
  const refocus = (e: Event) => {
    e.preventDefault();
    const fn = pending.current;
    pending.current = null;
    if (fn) run(fn);
    else ref.current?.focus();
  };

  return (
    <Tabs defaultValue="write" className="gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TabsList variant="line" className="h-7!">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="write" className="flex flex-col gap-2">
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex flex-wrap items-center gap-1 text-muted-foreground"
        >
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 font-normal"
                    aria-label="Text style"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {STYLES.find((s) => s.value === style)?.label}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Text style</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" onCloseAutoFocus={refocus}>
              <DropdownMenuRadioGroup
                value={style}
                onValueChange={(v) => {
                  pending.current = (s) => setTextStyle(s, v as TextStyle);
                }}
              >
                {STYLES.map((s) => (
                  <DropdownMenuRadioItem
                    key={s.value}
                    value={s.value}
                    className={
                      s.value === "h2"
                        ? "text-base font-semibold"
                        : s.value === "h3"
                          ? "font-semibold"
                          : undefined
                    }
                  >
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator
            orientation="vertical"
            className="mx-1 h-4 data-vertical:self-center"
          />

          <ButtonGroup>
            {MARKS.map((m) => (
              <ToolButton
                key={m.mark}
                icon={m.icon}
                label={m.label}
                shortcut={m.key}
                onClick={() => run((s) => toggleWrap(s, m.mark))}
              />
            ))}
          </ButtonGroup>

          <Separator
            orientation="vertical"
            className="mx-1 h-4 data-vertical:self-center"
          />

          <ButtonGroup>
            {LISTS.map((l) => (
              <ToolButton
                key={l.block}
                icon={l.icon}
                label={l.label}
                onClick={() => run((s) => toggleBlock(s, l.block))}
              />
            ))}
          </ButtonGroup>

          <Separator
            orientation="vertical"
            className="mx-1 h-4 data-vertical:self-center"
          />

          <ButtonGroup>
            <Popover
              open={linkOpen}
              onOpenChange={(open) => (open ? openLink() : setLinkOpen(false))}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Link"
                      aria-keyshortcuts="Control+K Meta+K"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <Link2 className="size-3.5" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  Link <Shortcut k="K" />
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                align="start"
                className="w-72"
                onCloseAutoFocus={refocus}
                onOpenAutoFocus={(e) => {
                  // Jump to whichever field still needs filling in.
                  e.preventDefault();
                  (linkText && !linkUrl
                    ? urlInput
                    : textInput
                  ).current?.focus();
                }}
              >
                <form onSubmit={submitLink} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-text`}>Text to show</Label>
                    <Input
                      ref={textInput}
                      id={`${id}-text`}
                      value={linkText}
                      placeholder="e.g. Registration form"
                      onChange={(e) => setLinkText(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-url`}>Link</Label>
                    <Input
                      id={`${id}-url`}
                      value={linkUrl}
                      placeholder="example.com"
                      ref={urlInput}
                      inputMode="url"
                      onChange={(e) => setLinkUrl(e.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                    Insert link
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <ToolButton
              icon={TextQuote}
              label="Quote"
              onClick={() => run((s) => toggleBlock(s, "quote"))}
            />
            <ToolButton
              icon={Code}
              label="Code"
              onClick={() => run((s) => toggleWrap(s, "`"))}
            />
          </ButtonGroup>
        </div>

        <Textarea
          ref={ref}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onSelect={syncStyle}
          className={ghost("min-h-16 resize-none text-sm md:text-sm")}
        />
      </TabsContent>

      <TabsContent value="preview" className="min-h-16">
        {value.trim() ? (
          <Markdown>{value}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to preview yet.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
