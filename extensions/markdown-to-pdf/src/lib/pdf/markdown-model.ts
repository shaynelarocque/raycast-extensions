import { markdown } from "../markdown";

export type InlineStyle = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link?: string;
};

export type StyledSegment = {
  text: string;
  style: InlineStyle;
};

export type PdfBlock =
  | { kind: "heading"; level: number; segments: StyledSegment[]; quoteDepth: number }
  | { kind: "paragraph"; segments: StyledSegment[]; quoteDepth: number; indentDepth: number }
  | {
      kind: "list_item";
      marker: string;
      segments: StyledSegment[];
      quoteDepth: number;
      listDepth: number;
    }
  | { kind: "code"; code: string; quoteDepth: number; indentDepth: number }
  | { kind: "rule"; quoteDepth: number; indentDepth: number }
  | {
      kind: "table";
      headerRows: StyledSegment[][][];
      bodyRows: StyledSegment[][][];
      columnCount: number;
      quoteDepth: number;
      indentDepth: number;
    };

type MarkdownToken = {
  type: string;
  tag?: string;
  content?: string;
  level: number;
  hidden?: boolean;
  children?: MarkdownToken[];
  attrs?: [string, string][];
  attrGet?: (name: string) => string | null;
};

export function parseMarkdownBlocks(source: string): PdfBlock[] {
  const tokens = markdown.parse(source, {}) as unknown as MarkdownToken[];
  const blocks: PdfBlock[] = [];

  const listStack: Array<{ ordered: boolean; next: number }> = [];
  const listItemStack: Array<{ marker: string; paragraphCount: number; depth: number; ordered: boolean }> = [];

  let quoteDepth = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    switch (token.type) {
      case "blockquote_open":
        quoteDepth += 1;
        continue;
      case "blockquote_close":
        quoteDepth = Math.max(0, quoteDepth - 1);
        continue;
      case "bullet_list_open":
        listStack.push({ ordered: false, next: 0 });
        continue;
      case "bullet_list_close":
        listStack.pop();
        continue;
      case "ordered_list_open": {
        const startValue = Number.parseInt(getTokenAttr(token, "start") ?? "1", 10);
        listStack.push({ ordered: true, next: Number.isNaN(startValue) ? 0 : startValue - 1 });
        continue;
      }
      case "ordered_list_close":
        listStack.pop();
        continue;
      case "list_item_open": {
        const activeList = listStack[listStack.length - 1];
        let marker = "•";
        if (activeList?.ordered) {
          activeList.next += 1;
          marker = `${activeList.next}.`;
        }

        listItemStack.push({
          marker,
          paragraphCount: 0,
          depth: listStack.length,
          ordered: Boolean(activeList?.ordered),
        });
        continue;
      }
      case "list_item_close":
        listItemStack.pop();
        continue;
      case "hr":
        blocks.push({ kind: "rule", quoteDepth, indentDepth: listStack.length });
        continue;
      case "fence":
      case "code_block":
        blocks.push({
          kind: "code",
          code: token.content ?? "",
          quoteDepth,
          indentDepth: listStack.length,
        });
        continue;
      case "heading_open": {
        const level = Number.parseInt((token.tag ?? "h1").replace("h", ""), 10);
        const inline = tokens[i + 1];
        blocks.push({
          kind: "heading",
          level: Number.isNaN(level) ? 1 : level,
          segments: parseInlineSegments(inline),
          quoteDepth,
        });
        i += 2;
        continue;
      }
      case "paragraph_open": {
        const inline = tokens[i + 1];
        const activeItem = listItemStack[listItemStack.length - 1];
        let segments = parseInlineSegments(inline);

        if (activeItem) {
          let marker = activeItem.marker;
          if (activeItem.paragraphCount === 0) {
            const taskList = maybeParseTaskListItem(segments, marker, activeItem.ordered);
            segments = taskList.segments;
            marker = taskList.marker;

            blocks.push({
              kind: "list_item",
              marker,
              segments,
              quoteDepth,
              listDepth: activeItem.depth,
            });
          } else {
            blocks.push({
              kind: "paragraph",
              segments,
              quoteDepth,
              indentDepth: activeItem.depth,
            });
          }
          activeItem.paragraphCount += 1;
        } else {
          blocks.push({
            kind: "paragraph",
            segments,
            quoteDepth,
            indentDepth: listStack.length,
          });
        }

        i += 2;
        continue;
      }
      case "inline": {
        const previous = tokens[i - 1];
        const activeItem = listItemStack[listItemStack.length - 1];
        if (activeItem && previous?.type === "list_item_open" && activeItem.paragraphCount === 0) {
          const parsed = maybeParseTaskListItem(parseInlineSegments(token), activeItem.marker, activeItem.ordered);
          blocks.push({
            kind: "list_item",
            marker: parsed.marker,
            segments: parsed.segments,
            quoteDepth,
            listDepth: activeItem.depth,
          });
          activeItem.paragraphCount += 1;
        }
        continue;
      }
      case "table_open": {
        const parsed = parseTableBlock(tokens, i);
        const allRows = [...parsed.headerRows, ...parsed.bodyRows];
        const columnCount = allRows.reduce((max, row) => Math.max(max, row.length), 0);
        blocks.push({
          kind: "table",
          headerRows: parsed.headerRows,
          bodyRows: parsed.bodyRows,
          columnCount,
          quoteDepth,
          indentDepth: listStack.length,
        });
        i = parsed.endIndex;
      }
    }
  }

  return blocks;
}

function parseTableBlock(
  tokens: MarkdownToken[],
  startIndex: number,
): { headerRows: StyledSegment[][][]; bodyRows: StyledSegment[][][]; endIndex: number } {
  const headerRows: StyledSegment[][][] = [];
  const bodyRows: StyledSegment[][][] = [];

  let section: "head" | "body" = "body";
  let currentRow: StyledSegment[][] | null = null;

  let i = startIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "thead_open") {
      section = "head";
      i += 1;
      continue;
    }
    if (token.type === "tbody_open") {
      section = "body";
      i += 1;
      continue;
    }
    if (token.type === "tr_open") {
      currentRow = [];
      i += 1;
      continue;
    }
    if (token.type === "tr_close" && currentRow) {
      if (section === "head") {
        headerRows.push(currentRow);
      } else {
        bodyRows.push(currentRow);
      }
      currentRow = null;
      i += 1;
      continue;
    }
    if ((token.type === "th_open" || token.type === "td_open") && currentRow) {
      const inline = tokens[i + 1];
      const segments = normalizeTableCellSegments(parseInlineSegments(inline));
      currentRow.push(segments);
      i += 1;
      continue;
    }
    if (token.type === "table_close") {
      break;
    }
    i += 1;
  }

  return { headerRows, bodyRows, endIndex: i };
}

function normalizeTableCellSegments(segments: StyledSegment[]): StyledSegment[] {
  return segments.map((s) => ({ text: s.text.replace(/\s+/g, " "), style: s.style })).filter((s) => s.text.length > 0);
}

function segmentsToText(segments: StyledSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

export function parseInlineSegments(inlineToken?: MarkdownToken): StyledSegment[] {
  if (!inlineToken || inlineToken.type !== "inline") {
    return [];
  }

  const children = inlineToken.children ?? [];
  const segments: StyledSegment[] = [];

  let boldDepth = 0;
  let italicDepth = 0;
  let strikeDepth = 0;
  const linkStack: string[] = [];

  const currentStyle = (overrides?: Partial<InlineStyle>): InlineStyle => ({
    bold: boldDepth > 0,
    italic: italicDepth > 0,
    strike: strikeDepth > 0,
    code: false,
    link: linkStack.length > 0 ? linkStack[linkStack.length - 1] : undefined,
    ...overrides,
  });

  const pushText = (text: string, style: InlineStyle) => {
    if (!text) {
      return;
    }

    const previous = segments[segments.length - 1];
    if (previous && stylesEqual(previous.style, style)) {
      previous.text += text;
    } else {
      segments.push({ text, style });
    }
  };

  for (const child of children) {
    switch (child.type) {
      case "text":
        pushText(child.content ?? "", currentStyle());
        break;
      case "softbreak":
      case "hardbreak":
        pushText("\n", currentStyle());
        break;
      case "strong_open":
        boldDepth += 1;
        break;
      case "strong_close":
        boldDepth = Math.max(0, boldDepth - 1);
        break;
      case "em_open":
        italicDepth += 1;
        break;
      case "em_close":
        italicDepth = Math.max(0, italicDepth - 1);
        break;
      case "s_open":
        strikeDepth += 1;
        break;
      case "s_close":
        strikeDepth = Math.max(0, strikeDepth - 1);
        break;
      case "link_open": {
        const href = getTokenAttr(child, "href");
        linkStack.push(href ?? "");
        break;
      }
      case "link_close":
        linkStack.pop();
        break;
      case "code_inline":
        pushText(child.content ?? "", currentStyle({ code: true }));
        break;
      case "image": {
        const alt = getTokenAttr(child, "alt") || child.content || "image";
        pushText(`[Image: ${alt}]`, currentStyle());
        break;
      }
      default:
        if (child.content) {
          pushText(child.content, currentStyle());
        }
        break;
    }
  }

  return segments;
}

function maybeParseTaskListItem(
  segments: StyledSegment[],
  fallbackMarker: string,
  ordered: boolean,
): { marker: string; segments: StyledSegment[] } {
  if (ordered || segments.length === 0) {
    return { marker: fallbackMarker, segments };
  }

  const plain = segmentsToText(segments);
  const match = plain.match(/^\s*\[(x|X| )\]\s+/);
  if (!match) {
    return { marker: fallbackMarker, segments };
  }

  const checked = match[1].toLowerCase() === "x";
  return {
    marker: checked ? "[x]" : "[ ]",
    segments: trimLeadingCharsFromSegments(segments, match[0].length),
  };
}

function trimLeadingCharsFromSegments(segments: StyledSegment[], charsToRemove: number): StyledSegment[] {
  if (charsToRemove <= 0) {
    return segments;
  }

  const result: StyledSegment[] = [];
  let remaining = charsToRemove;

  for (const segment of segments) {
    if (remaining <= 0) {
      result.push(segment);
      continue;
    }

    if (segment.text.length <= remaining) {
      remaining -= segment.text.length;
      continue;
    }

    result.push({
      text: segment.text.slice(remaining),
      style: segment.style,
    });
    remaining = 0;
  }

  return result;
}

function stylesEqual(a: InlineStyle, b: InlineStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code && a.link === b.link;
}

function getTokenAttr(token: MarkdownToken, key: string): string | undefined {
  if (typeof token.attrGet === "function") {
    return token.attrGet(key) ?? undefined;
  }

  const attrs = token.attrs ?? [];
  for (const [attrKey, attrValue] of attrs) {
    if (attrKey === key) {
      return attrValue;
    }
  }

  return undefined;
}
