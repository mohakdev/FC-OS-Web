// Pure text transforms behind the Canon markdown toolbar. Each takes the
// textarea's value + selection and returns the next value + selection, so the
// editor can apply them and the tests can pin them without a DOM.

export type EditState = { value: string; start: number; end: number };

export type InlineMark = "**" | "_" | "~~" | "`";

export type Block = "bullet" | "ordered" | "task" | "quote" | "h2" | "h3";

export type TextStyle = "normal" | "h2" | "h3";

// Order matters: a task item also looks like a bullet.
const BLOCK_PATTERNS: [Block, RegExp][] = [
  ["task", /^[-*+] \[[ xX]\] /],
  ["bullet", /^[-*+] /],
  ["ordered", /^\d+[.)] /],
  ["quote", /^> ?/],
  ["h3", /^#{3,6} /],
  ["h2", /^#{1,2} /],
];

function splitPrefix(line: string): {
  indent: string;
  kind: Block | null;
  prefix: string;
  rest: string;
} {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const body = line.slice(indent.length);
  for (const [kind, re] of BLOCK_PATTERNS) {
    const m = body.match(re);
    if (m) {
      return { indent, kind, prefix: m[0], rest: body.slice(m[0].length) };
    }
  }
  return { indent, kind: null, prefix: "", rest: body };
}

const prefixFor = (kind: Block, n: number) =>
  ({
    bullet: "- ",
    ordered: `${n}. `,
    task: "- [ ] ",
    quote: "> ",
    h2: "## ",
    h3: "### ",
  })[kind];

/** Wrap the selection in `mark`, or unwrap it if it's already wrapped. */
export function toggleWrap(s: EditState, mark: InlineMark): EditState {
  const { value, start, end } = s;
  const m = mark.length;
  const sel = value.slice(start, end);

  // Selection includes the markers: **bold** → bold
  if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(m, -m);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  // Markers sit just outside the selection: **[bold]** → bold
  if (
    value.slice(start - m, start) === mark &&
    value.slice(end, end + m) === mark
  ) {
    return {
      value: value.slice(0, start - m) + sel + value.slice(end + m),
      start: start - m,
      end: end - m,
    };
  }

  // Nothing selected: drop in a pair and park the caret between them.
  if (start === end) {
    return {
      value: value.slice(0, start) + mark + mark + value.slice(end),
      start: start + m,
      end: start + m,
    };
  }

  // Keep surrounding spaces outside the markers; `**word **` isn't bold.
  const lead = sel.match(/^\s*/)?.[0].length ?? 0;
  const trail = sel.match(/\s*$/)?.[0].length ?? 0;
  if (lead === sel.length) return s;
  const core = sel.slice(lead, sel.length - trail);
  const a = start + lead;
  return {
    value:
      value.slice(0, a) + mark + core + mark + value.slice(a + core.length),
    start: a + m,
    end: a + m + core.length,
  };
}

/** Start/end offsets of the whole lines the selection touches. */
function lineRange({ value, start, end }: EditState) {
  // A drag that ends at the very start of the next line shouldn't grab it.
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", last);
  return { from, to: nl === -1 ? value.length : nl };
}

function rewriteLines(
  s: EditState,
  map: (lines: string[]) => string[],
): EditState {
  const { from, to } = lineRange(s);
  const before = s.value.slice(from, to);
  const lines = before.split("\n");
  const next = map(lines);
  const after = next.join("\n");
  const value = s.value.slice(0, from) + after + s.value.slice(to);

  if (lines.length === 1) {
    // Shift the caret/selection by how much the prefix grew or shrank,
    // never letting it land inside the new prefix.
    const oldPre = before.length - splitPrefix(before).rest.length;
    const newPre = after.length - splitPrefix(after).rest.length;
    const delta = newPre - oldPre;
    const floor = from + newPre;
    const start = Math.max(floor, s.start + delta);
    return { value, start, end: Math.max(start, s.end + delta) };
  }
  return { value, start: from, end: from + after.length };
}

/**
 * Turn every selected line into `kind` (bullet, numbered, checklist, quote,
 * heading). If they all already are, turn them back into plain lines. Any
 * other list/quote/heading prefix is replaced, so prefixes never stack.
 */
export function toggleBlock(s: EditState, kind: Block): EditState {
  return rewriteLines(s, (lines) => {
    const parts = lines.map(splitPrefix);
    const filled = parts.filter((p) => p.prefix || p.rest.trim());
    const targets = filled.length ? filled : parts;
    const removing = targets.every((p) => p.kind === kind);
    let n = 0;
    return parts.map((p, i) => {
      const blank = !p.prefix && !p.rest.trim();
      if (blank && filled.length) return lines[i];
      if (removing) return p.indent + p.rest;
      n += 1;
      return p.indent + prefixFor(kind, n) + p.rest;
    });
  });
}

/** "Text style" menu: make the selected lines normal text or a heading. */
export function setTextStyle(s: EditState, style: TextStyle): EditState {
  return rewriteLines(s, (lines) =>
    lines.map((line) => {
      const p = splitPrefix(line);
      if (style === "normal") {
        return p.kind === "h2" || p.kind === "h3" ? p.indent + p.rest : line;
      }
      if (!p.prefix && !p.rest.trim() && lines.length > 1) return line;
      return p.indent + prefixFor(style, 1) + p.rest;
    }),
  );
}

/** The text style of the line holding the caret, for the menu's checkmark. */
export function currentTextStyle(s: EditState): TextStyle {
  const from = s.value.lastIndexOf("\n", s.start - 1) + 1;
  const nl = s.value.indexOf("\n", from);
  const kind = splitPrefix(
    s.value.slice(from, nl === -1 ? undefined : nl),
  ).kind;
  return kind === "h2" || kind === "h3" ? kind : "normal";
}

/** Add `https://` when someone types a bare domain like `example.com`. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || /^[/#?]/.test(url)) return url;
  return `https://${url}`;
}

/** Replace the selection with `[text](url)` and put the caret after it. */
export function insertLink(
  s: EditState,
  text: string,
  rawUrl: string,
): EditState {
  const url = normalizeUrl(rawUrl);
  const label = (text.trim() || url).replace(/[[\]]/g, "\\$&");
  const target = /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, "")}>` : url;
  const link = `[${label}](${target})`;
  const value = s.value.slice(0, s.start) + link + s.value.slice(s.end);
  const caret = s.start + link.length;
  return { value, start: caret, end: caret };
}
