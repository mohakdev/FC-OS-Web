import { describe, expect, test } from "bun:test";
import {
  currentTextStyle,
  type EditState,
  insertLink,
  normalizeUrl,
  setTextStyle,
  toggleBlock,
  toggleWrap,
} from "./markdown-edit";

/** Build a state from a string with `[` `]` marking the selection (`|` = caret). */
function st(marked: string): EditState {
  if (marked.includes("|")) {
    const start = marked.indexOf("|");
    return { value: marked.replace("|", ""), start, end: start };
  }
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { value: marked.replace("[", "").replace("]", ""), start, end };
}

/** Render a state back with the same markers, for readable assertions. */
function show({ value, start, end }: EditState): string {
  if (start === end) return `${value.slice(0, start)}|${value.slice(start)}`;
  return `${value.slice(0, start)}[${value.slice(start, end)}]${value.slice(end)}`;
}

describe("toggleWrap", () => {
  test("wraps and unwraps a selection", () => {
    const bold = toggleWrap(st("say [hi] now"), "**");
    expect(show(bold)).toBe("say **[hi]** now");
    expect(show(toggleWrap(bold, "**"))).toBe("say [hi] now");
  });

  test("unwraps when the markers are inside the selection", () => {
    expect(show(toggleWrap(st("say [**hi**] now"), "**"))).toBe("say [hi] now");
  });

  test("keeps surrounding spaces outside the markers", () => {
    expect(show(toggleWrap(st("say[ hi ]now"), "_"))).toBe("say _[hi]_ now");
  });

  test("empty selection inserts a pair and toggles it back off", () => {
    const pair = toggleWrap(st("a |b"), "~~");
    expect(show(pair)).toBe("a ~~|~~b");
    expect(show(toggleWrap(pair, "~~"))).toBe("a |b");
  });

  test("whitespace-only selection is left alone", () => {
    const s = st("a[  ]b");
    expect(toggleWrap(s, "`")).toEqual(s);
  });
});

describe("toggleBlock", () => {
  test("adds and removes a bullet on the caret line", () => {
    const on = toggleBlock(st("one\ntw|o"), "bullet");
    expect(show(on)).toBe("one\n- tw|o");
    expect(show(toggleBlock(on, "bullet"))).toBe("one\ntw|o");
  });

  test("numbers every selected line in order", () => {
    const out = toggleBlock(st("[a\nb\nc]"), "ordered");
    expect(out.value).toBe("1. a\n2. b\n3. c");
  });

  test("replaces another prefix instead of stacking", () => {
    expect(toggleBlock(st("1. a\n2. |b"), "bullet").value).toBe("1. a\n- b");
    expect(toggleBlock(st("[1. a\n2. b]"), "bullet").value).toBe("- a\n- b");
    expect(toggleBlock(st("[- a\n- b]"), "task").value).toBe(
      "- [ ] a\n- [ ] b",
    );
  });

  test("a checklist toggles back to plain lines", () => {
    const value = "- [x] a\n- [ ] b";
    const s = { value, start: 0, end: value.length };
    expect(toggleBlock(s, "task").value).toBe("a\nb");
  });

  test("skips blank lines between selected lines", () => {
    expect(toggleBlock(st("[a\n\nb]"), "quote").value).toBe("> a\n\n> b");
  });

  test("an empty line gets the prefix so you can start typing", () => {
    expect(show(toggleBlock(st("|"), "bullet"))).toBe("- |");
  });

  test("a drag ending at the next line's start doesn't grab it", () => {
    expect(toggleBlock(st("[a\n]b"), "bullet").value).toBe("- a\nb");
  });
});

describe("text style", () => {
  test("sets, switches and clears headings", () => {
    const h2 = setTextStyle(st("Ti|tle"), "h2");
    expect(show(h2)).toBe("## Ti|tle");
    expect(currentTextStyle(h2)).toBe("h2");
    const h3 = setTextStyle(h2, "h3");
    expect(show(h3)).toBe("### Ti|tle");
    expect(currentTextStyle(h3)).toBe("h3");
    const plain = setTextStyle(h3, "normal");
    expect(show(plain)).toBe("Ti|tle");
    expect(currentTextStyle(plain)).toBe("normal");
  });

  test("normal leaves list items alone", () => {
    expect(setTextStyle(st("- it|em"), "normal").value).toBe("- item");
  });
});

describe("links", () => {
  test("normalizeUrl adds https only to bare domains", () => {
    expect(normalizeUrl(" example.com ")).toBe("https://example.com");
    expect(normalizeUrl("http://x.io")).toBe("http://x.io");
    expect(normalizeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(normalizeUrl("/dashboard")).toBe("/dashboard");
  });

  test("insertLink replaces the selection and parks the caret after", () => {
    expect(show(insertLink(st("see [docs] here"), "docs", "example.com"))).toBe(
      "see [docs](https://example.com)| here",
    );
  });

  test("insertLink falls back to the URL as text and escapes brackets", () => {
    expect(insertLink(st("|"), " ", "x.io").value).toBe(
      "[https://x.io](https://x.io)",
    );
    expect(insertLink(st("|"), "a [b]", "x.io").value).toBe(
      "[a \\[b\\]](https://x.io)",
    );
  });

  test("insertLink wraps URLs with spaces in angle brackets", () => {
    expect(insertLink(st("|"), "f", "x.io/a b").value).toBe(
      "[f](<https://x.io/a b>)",
    );
  });
});
