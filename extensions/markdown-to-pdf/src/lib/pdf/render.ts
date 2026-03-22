import { writeFile } from "node:fs/promises";
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentLayoutOptions, FontChoice, ThemePalette } from "../types";
import { parseMarkdownBlocks, type InlineStyle, type PdfBlock, type StyledSegment } from "./markdown-model";

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const h = hex.replace("#", "");
  return rgb(
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  );
}

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
};

function resolvePdfFonts(font: FontChoice): {
  regular: StandardFonts;
  bold: StandardFonts;
  italic: StandardFonts;
  boldItalic: StandardFonts;
} {
  switch (font) {
    case "times":
      return {
        regular: StandardFonts.TimesRoman,
        bold: StandardFonts.TimesRomanBold,
        italic: StandardFonts.TimesRomanItalic,
        boldItalic: StandardFonts.TimesRomanBoldItalic,
      };
    case "courier":
      return {
        regular: StandardFonts.Courier,
        bold: StandardFonts.CourierBold,
        italic: StandardFonts.CourierOblique,
        boldItalic: StandardFonts.CourierBoldOblique,
      };
    default:
      return {
        regular: StandardFonts.Helvetica,
        bold: StandardFonts.HelveticaBold,
        italic: StandardFonts.HelveticaOblique,
        boldItalic: StandardFonts.HelveticaBoldOblique,
      };
  }
}

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_LIST_INDENT = 24;
const PDF_QUOTE_INDENT = 14;

const FONT_FALLBACKS: Record<string, string> = {
  "✓": "[x]",
  "✔": "[x]",
  "✗": "[ ]",
  "❌": "[x]",
  "┌": "+",
  "┐": "+",
  "└": "+",
  "┘": "+",
  "├": "+",
  "┤": "+",
  "┬": "+",
  "┴": "+",
  "┼": "+",
  "─": "-",
  "│": "|",
  "╔": "+",
  "╗": "+",
  "╚": "+",
  "╝": "+",
  "╠": "+",
  "╣": "+",
  "╦": "+",
  "╩": "+",
  "╬": "+",
  "═": "=",
  "║": "|",
  "—": "-",
  "–": "-",
  "…": "...",
  "◄": "<",
  "►": ">",
  "▲": "^",
  "▼": "v",
  "→": "->",
  "←": "<-",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
};

type RenderState = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: PdfFonts;
  layout: DocumentLayoutOptions;
};

export async function renderPdf({
  sourceContent,
  layout,
  outputPath,
  title,
}: {
  sourceContent: string;
  layout: DocumentLayoutOptions;
  outputPath: string;
  title: string;
}): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setProducer("Raycast Markdown to Docs");

  const fontSet = resolvePdfFonts(layout.font);
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(fontSet.regular),
    bold: await pdfDoc.embedFont(fontSet.bold),
    italic: await pdfDoc.embedFont(fontSet.italic),
    boldItalic: await pdfDoc.embedFont(fontSet.boldItalic),
    mono: await pdfDoc.embedFont(StandardFonts.Courier),
  };

  const state: RenderState = {
    pdfDoc,
    page: pdfDoc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]),
    y: PDF_PAGE_HEIGHT - layout.margins.top,
    fonts,
    layout,
  };

  const blocks = parseMarkdownBlocks(sourceContent);
  for (const block of blocks) {
    renderMarkdownBlock(state, block);
  }

  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, Buffer.from(pdfBytes));
}

function renderMarkdownBlock(state: RenderState, block: PdfBlock): void {
  const bodyFontSize = state.layout.fontSize;

  if (block.kind === "heading") {
    const headingSize = headingFontSize(block.level, bodyFontSize);
    const segments = block.segments.map((segment) => ({
      text: segment.text,
      style: { ...segment.style, bold: true },
    }));

    drawStyledParagraph(state, {
      segments,
      x: blockBaseX(state, block.quoteDepth, 0),
      quoteDepth: block.quoteDepth,
      indentDepth: 0,
      fontSize: headingSize,
      lineGap: 3,
      paragraphGap: block.level <= 2 ? 10 : 7,
      forceColor: hexToRgb(state.layout.theme.headingColor),
    });
    return;
  }

  if (block.kind === "paragraph") {
    drawStyledParagraph(state, {
      segments: block.segments,
      x: blockBaseX(state, block.quoteDepth, block.indentDepth),
      quoteDepth: block.quoteDepth,
      indentDepth: block.indentDepth,
      fontSize: bodyFontSize,
      lineGap: 3,
      paragraphGap: 4,
    });
    return;
  }

  if (block.kind === "list_item") {
    drawListItem(state, block);
    return;
  }

  if (block.kind === "code") {
    drawCodeBlock(state, block.code, block.quoteDepth, block.indentDepth, Math.max(8, bodyFontSize - 2));
    return;
  }

  if (block.kind === "rule") {
    drawHorizontalRule(state, block.quoteDepth, block.indentDepth);
    return;
  }

  if (block.kind === "table") {
    drawTableBlock(state, block);
  }
}

function headingFontSize(level: number, bodyFontSize: number): number {
  const scaleByLevel: Record<number, number> = {
    1: 2.0,
    2: 1.64,
    3: 1.45,
    4: 1.27,
    5: 1.18,
    6: 1.09,
  };
  const ratio = scaleByLevel[level] ?? scaleByLevel[6];
  return Math.max(bodyFontSize + 1, Math.round(bodyFontSize * ratio));
}

function blockBaseX(state: RenderState, quoteDepth: number, indentDepth: number): number {
  const leftMargin = state.layout.margins.left;
  const listOffset = Math.max(0, indentDepth) * PDF_LIST_INDENT;
  const quoteOffset = Math.max(0, quoteDepth) * PDF_QUOTE_INDENT;
  return leftMargin + listOffset + quoteOffset;
}

function drawListItem(state: RenderState, block: Extract<PdfBlock, { kind: "list_item" }>): void {
  const bodyFontSize = state.layout.fontSize;
  const x = blockBaseX(state, block.quoteDepth, Math.max(0, block.listDepth - 1));
  const markerText = `${block.marker} `;
  const markerFont = state.fonts.regular;
  const safeMarkerText = sanitizeForFont(markerText, markerFont);
  const markerWidth = safeTextWidth(markerText, markerFont, bodyFontSize);
  const availableWidth = Math.max(120, PDF_PAGE_WIDTH - state.layout.margins.right - (x + markerWidth));
  const lines = layoutStyledLines(block.segments, state.fonts, bodyFontSize, availableWidth, false);
  const lineHeight = Math.max(bodyFontSize + 1, (bodyFontSize + 3) * state.layout.lineSpacing);

  if (lines.length === 0) {
    return;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    ensureVerticalSpace(state, lineHeight);
    const yTop = state.y;

    drawQuoteGuides(state, block.quoteDepth, Math.max(0, block.listDepth - 1), yTop, lineHeight);

    if (lineIndex === 0) {
      state.page.drawText(safeMarkerText, {
        x,
        y: yTop - bodyFontSize,
        font: markerFont,
        size: bodyFontSize,
        color: hexToRgb(state.layout.theme.bodyText),
      });
    }

    drawStyledLineRuns(state, lines[lineIndex], x + markerWidth, yTop - bodyFontSize, bodyFontSize);
    state.y -= lineHeight;
  }

  state.y -= 3;
}

function drawCodeBlock(
  state: RenderState,
  code: string,
  quoteDepth: number,
  indentDepth: number,
  fontSize: number,
): void {
  drawPreformattedBlock(state, code, quoteDepth, indentDepth, fontSize);
}

function segmentsWidth(segments: StyledSegment[], fonts: PdfFonts, fontSize: number): number {
  let total = 0;
  for (const seg of segments) {
    total += safeTextWidth(seg.text, fontForStyle(seg.style, fonts), fontSize);
  }
  return total;
}

function truncateSegments(
  segments: StyledSegment[],
  maxWidth: number,
  fonts: PdfFonts,
  fontSize: number,
): StyledSegment[] {
  let remaining = maxWidth;
  const result: StyledSegment[] = [];

  for (const seg of segments) {
    const font = fontForStyle(seg.style, fonts);
    const fullWidth = safeTextWidth(seg.text, font, fontSize);

    if (fullWidth <= remaining) {
      result.push(seg);
      remaining -= fullWidth;
      continue;
    }

    // Truncate this segment character by character
    let truncated = "";
    const ellipsis = "...";
    const ellipsisWidth = safeTextWidth(ellipsis, font, fontSize);

    for (const char of seg.text) {
      const next = truncated + char;
      if (safeTextWidth(next, font, fontSize) + ellipsisWidth > remaining) {
        break;
      }
      truncated = next;
    }

    result.push({ text: truncated + ellipsis, style: seg.style });
    break;
  }

  return result;
}

function drawTableBlock(state: RenderState, block: Extract<PdfBlock, { kind: "table" }>): void {
  const { headerRows, bodyRows, columnCount, quoteDepth, indentDepth } = block;
  const allRows = [...headerRows, ...bodyRows];
  if (allRows.length === 0 || columnCount === 0) {
    return;
  }

  const x = blockBaseX(state, quoteDepth, indentDepth);
  const availableWidth = Math.max(120, PDF_PAGE_WIDTH - state.layout.margins.right - x);
  const cellPadX = 6;
  const cellPadY = 4;
  const borderWidth = 0.5;
  const bodyFontSize = state.layout.fontSize;

  // Measure natural column widths from styled content
  const measureWidths = (fontSize: number): number[] => {
    const widths = Array.from({ length: columnCount }, () => 0);
    for (const row of allRows) {
      for (let col = 0; col < columnCount; col += 1) {
        const cellSegments = row[col] ?? [];
        // Measure with both regular and bold styles for header sizing
        const normalWidth = segmentsWidth(cellSegments, state.fonts, fontSize);
        const boldSegments = cellSegments.map((s) => ({ text: s.text, style: { ...s.style, bold: true } }));
        const boldWidth = segmentsWidth(boldSegments, state.fonts, fontSize);
        widths[col] = Math.max(widths[col], normalWidth, boldWidth);
      }
    }
    return widths;
  };

  let naturalWidths = measureWidths(bodyFontSize);

  // Auto-fit font size if table is too wide
  let fontSize = bodyFontSize;
  const minFontSize = 7;
  const totalNatural = naturalWidths.reduce((sum, w) => sum + w, 0) + columnCount * cellPadX * 2;
  if (totalNatural > availableWidth && fontSize > minFontSize) {
    const scale = Math.max(minFontSize / fontSize, availableWidth / totalNatural);
    fontSize = Math.max(minFontSize, Math.floor(fontSize * scale * 2) / 2);
    naturalWidths = measureWidths(fontSize);
  }

  // Distribute column widths proportionally to fill available width
  const totalContentWidth = naturalWidths.reduce((sum, w) => sum + w, 0);
  const totalPadding = columnCount * cellPadX * 2;
  const columnWidths: number[] = [];

  if (totalContentWidth + totalPadding <= availableWidth) {
    const leftover = availableWidth - totalContentWidth - totalPadding;
    for (let col = 0; col < columnCount; col += 1) {
      const share = totalContentWidth > 0 ? naturalWidths[col] / totalContentWidth : 1 / columnCount;
      columnWidths.push(naturalWidths[col] + leftover * share);
    }
  } else {
    const targetContent = availableWidth - totalPadding;
    for (let col = 0; col < columnCount; col += 1) {
      const share = totalContentWidth > 0 ? naturalWidths[col] / totalContentWidth : 1 / columnCount;
      columnWidths.push(Math.max(10, targetContent * share));
    }
  }

  const rowHeight = fontSize + cellPadY * 2 + 2;
  const tableWidth = columnWidths.reduce((sum, w) => sum + w + cellPadX * 2, 0);
  const t = state.layout.theme;
  const headerColor = hexToRgb(t.headerBg);
  const altRowColor = hexToRgb(t.altRowBg);
  const borderColor = hexToRgb(t.borderColor);
  const headerTextColor = hexToRgb(t.headerText);

  const headerCount = headerRows.length;

  for (let rowIndex = 0; rowIndex < allRows.length; rowIndex += 1) {
    const row = allRows[rowIndex];
    const isHeader = rowIndex < headerCount;

    ensureVerticalSpace(state, rowHeight);
    drawQuoteGuides(state, quoteDepth, indentDepth, state.y, rowHeight);

    const yTop = state.y;
    const yBottom = yTop - rowHeight;
    let cellX = x;

    // Row background
    let bgColor: ReturnType<typeof rgb> | undefined;
    if (isHeader) {
      bgColor = headerColor;
    } else if ((rowIndex - headerCount) % 2 === 1) {
      bgColor = altRowColor;
    }

    if (bgColor) {
      state.page.drawRectangle({
        x,
        y: yBottom,
        width: tableWidth,
        height: rowHeight,
        color: bgColor,
      });
    }

    // Draw cells
    for (let col = 0; col < columnCount; col += 1) {
      const cellWidth = columnWidths[col] + cellPadX * 2;
      const cellSegments = row[col] ?? [];
      const maxTextWidth = columnWidths[col];

      // Apply header bold styling
      let styledSegments = isHeader
        ? cellSegments.map((s) => ({ text: s.text, style: { ...s.style, bold: true } }))
        : cellSegments;

      // Truncate if needed
      if (segmentsWidth(styledSegments, state.fonts, fontSize) > maxTextWidth) {
        styledSegments = truncateSegments(styledSegments, maxTextWidth, state.fonts, fontSize);
      }

      const cellY = yBottom + cellPadY + 1;
      drawStyledLineRuns(
        state,
        styledSegments,
        cellX + cellPadX,
        cellY,
        fontSize,
        isHeader ? headerTextColor : undefined,
      );

      // Vertical cell border (right side)
      if (col < columnCount - 1) {
        state.page.drawLine({
          start: { x: cellX + cellWidth, y: yTop },
          end: { x: cellX + cellWidth, y: yBottom },
          thickness: borderWidth,
          color: borderColor,
        });
      }

      cellX += cellWidth;
    }

    // Horizontal border below row
    const lineColor = isHeader ? hexToRgb(t.headerText) : borderColor;
    const lineThickness = isHeader ? 1 : borderWidth;
    state.page.drawLine({
      start: { x, y: yBottom },
      end: { x: x + tableWidth, y: yBottom },
      thickness: lineThickness,
      color: lineColor,
    });

    // Top border for first row
    if (rowIndex === 0) {
      state.page.drawLine({
        start: { x, y: yTop },
        end: { x: x + tableWidth, y: yTop },
        thickness: borderWidth,
        color: borderColor,
      });
    }

    // Left and right outer borders
    state.page.drawLine({
      start: { x, y: yTop },
      end: { x, y: yBottom },
      thickness: borderWidth,
      color: borderColor,
    });
    state.page.drawLine({
      start: { x: x + tableWidth, y: yTop },
      end: { x: x + tableWidth, y: yBottom },
      thickness: borderWidth,
      color: borderColor,
    });

    state.y -= rowHeight;
  }

  state.y -= 8;
}

function drawPreformattedBlock(
  state: RenderState,
  text: string,
  quoteDepth: number,
  indentDepth: number,
  fontSize: number,
): void {
  const x = blockBaseX(state, quoteDepth, indentDepth);
  const availableWidth = Math.max(120, PDF_PAGE_WIDTH - state.layout.margins.right - x);
  const paddingX = 5;
  const paddingY = 4;
  const lineHeight = Math.max(fontSize + 1, (fontSize + 4) * state.layout.lineSpacing);

  const rawLines = layoutMonospaceLines(text, state.fonts.mono, fontSize, availableWidth - paddingX * 2);
  const lines = rawLines.map((line) => sanitizeForFont(line, state.fonts.mono));
  const contentWidth = lines.reduce(
    (maxWidth, line) => Math.max(maxWidth, safeTextWidth(line, state.fonts.mono, fontSize)),
    0,
  );
  const boxWidth = Math.min(availableWidth, Math.max(40, contentWidth + paddingX * 2));

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const availableVertical = state.y - state.layout.margins.bottom;
    const maxLinesThisPage = Math.max(1, Math.floor((availableVertical - paddingY * 2) / lineHeight));
    const chunkLines = lines.slice(lineIndex, lineIndex + maxLinesThisPage);
    const chunkHeight = paddingY * 2 + chunkLines.length * lineHeight;

    ensureVerticalSpace(state, chunkHeight);
    const yTop = state.y;
    drawQuoteGuides(state, quoteDepth, indentDepth, yTop, chunkHeight);

    state.page.drawRectangle({
      x: x - 3,
      y: yTop - chunkHeight + 1,
      width: boxWidth + 6,
      height: chunkHeight - 1,
      color: hexToRgb(state.layout.theme.codeBg),
      borderColor: hexToRgb(state.layout.theme.borderColor),
      borderWidth: 0.5,
    });

    let cursorY = yTop - paddingY - fontSize;
    for (const line of chunkLines) {
      state.page.drawText(line, {
        x: x + paddingX - 1,
        y: cursorY,
        font: state.fonts.mono,
        size: fontSize,
        color: hexToRgb(state.layout.theme.bodyText),
      });
      cursorY -= lineHeight;
    }

    state.y -= chunkHeight + 6;
    lineIndex += chunkLines.length;
  }
}

function drawHorizontalRule(state: RenderState, quoteDepth: number, indentDepth: number): void {
  ensureVerticalSpace(state, 12);
  const x = blockBaseX(state, quoteDepth, indentDepth);
  const width = PDF_PAGE_WIDTH - state.layout.margins.right - x;
  const yLine = state.y - 6;

  drawQuoteGuides(state, quoteDepth, indentDepth, state.y, 12);
  state.page.drawLine({
    start: { x, y: yLine },
    end: { x: x + width, y: yLine },
    color: hexToRgb(state.layout.theme.borderColor),
    thickness: 1,
  });
  state.y -= 12;
}

function drawQuoteGuides(
  state: RenderState,
  quoteDepth: number,
  indentDepth: number,
  yTop: number,
  lineHeight: number,
): void {
  if (quoteDepth <= 0) {
    return;
  }

  const listOffset = Math.max(0, indentDepth) * PDF_LIST_INDENT;
  const startX = state.layout.margins.left + listOffset;

  for (let depth = 0; depth < quoteDepth; depth += 1) {
    const x = startX + depth * PDF_QUOTE_INDENT + 4;
    state.page.drawLine({
      start: { x, y: yTop - lineHeight + 2 },
      end: { x, y: yTop - 2 },
      color: hexToRgb(state.layout.theme.borderColor),
      thickness: 1,
    });
  }
}

function drawStyledParagraph(
  state: RenderState,
  options: {
    segments: StyledSegment[];
    x: number;
    quoteDepth: number;
    indentDepth: number;
    fontSize: number;
    lineGap: number;
    paragraphGap: number;
    forceColor?: ReturnType<typeof rgb>;
  },
): void {
  const availableWidth = Math.max(120, PDF_PAGE_WIDTH - state.layout.margins.right - options.x);
  const lines = layoutStyledLines(options.segments, state.fonts, options.fontSize, availableWidth, false);
  const lineHeight = Math.max(options.fontSize + 1, (options.fontSize + options.lineGap) * state.layout.lineSpacing);

  if (lines.length === 0) {
    return;
  }

  for (const line of lines) {
    ensureVerticalSpace(state, lineHeight);
    const yTop = state.y;
    drawQuoteGuides(state, options.quoteDepth, options.indentDepth, yTop, lineHeight);
    drawStyledLineRuns(state, line, options.x, yTop - options.fontSize, options.fontSize, options.forceColor);
    state.y -= lineHeight;
  }

  state.y -= options.paragraphGap;
}

function drawStyledLineRuns(
  state: RenderState,
  runs: StyledSegment[],
  x: number,
  y: number,
  fontSize: number,
  forceColor?: ReturnType<typeof rgb>,
): void {
  let cursorX = x;

  for (const run of runs) {
    if (!run.text) {
      continue;
    }

    const font = fontForStyle(run.style, state.fonts);
    const color = run.style.link
      ? colorForStyle(run.style, state.layout.theme)
      : (forceColor ?? colorForStyle(run.style, state.layout.theme));
    const safeRunText = sanitizeForFont(run.text, font);
    const width = safeTextWidth(run.text, font, fontSize);

    if (run.style.code) {
      state.page.drawRectangle({
        x: cursorX - 1.5,
        y: y - 1,
        width: width + 3,
        height: fontSize + 2.5,
        color: hexToRgb(state.layout.theme.codeBg),
        borderColor: hexToRgb(state.layout.theme.borderColor),
        borderWidth: 0.4,
      });
    }

    state.page.drawText(safeRunText, {
      x: cursorX,
      y,
      font,
      size: fontSize,
      color,
    });

    if (run.style.strike) {
      state.page.drawLine({
        start: { x: cursorX, y: y + fontSize * 0.38 },
        end: { x: cursorX + width, y: y + fontSize * 0.38 },
        thickness: 0.6,
        color,
      });
    }

    if (run.style.link) {
      state.page.drawLine({
        start: { x: cursorX, y: y - 0.8 },
        end: { x: cursorX + width, y: y - 0.8 },
        thickness: 0.6,
        color,
      });

      addLinkAnnotation(state, {
        url: run.style.link,
        x: cursorX,
        y,
        width,
        height: fontSize + 2,
      });
    }

    cursorX += width;
  }
}

function addLinkAnnotation(
  state: RenderState,
  { url, x, y, width, height }: { url: string; x: number; y: number; width: number; height: number },
): void {
  const normalizedUrl = url.trim();
  if (!normalizedUrl || width <= 0 || height <= 0) {
    return;
  }

  const context = state.pdfDoc.context;
  const annotationDict = context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y - 1, x + width, y + height],
    Border: [0, 0, 0],
    A: context.obj({
      S: "URI",
      URI: PDFString.of(normalizedUrl),
    }),
  });

  const annotationRef = context.register(annotationDict);
  state.page.node.addAnnot(annotationRef);
}

function fontForStyle(style: InlineStyle, fonts: PdfFonts): PDFFont {
  if (style.code) {
    return fonts.mono;
  }
  if (style.bold && style.italic) {
    return fonts.boldItalic;
  }
  if (style.bold) {
    return fonts.bold;
  }
  if (style.italic) {
    return fonts.italic;
  }
  return fonts.regular;
}

function colorForStyle(style: InlineStyle, theme: ThemePalette): ReturnType<typeof rgb> {
  if (style.link) {
    return hexToRgb(theme.linkColor);
  }
  if (style.code) {
    return hexToRgb(theme.bodyText);
  }
  return hexToRgb(theme.bodyText);
}

function ensureVerticalSpace(state: RenderState, height: number): void {
  if (state.y - height >= state.layout.margins.bottom) {
    return;
  }

  state.page = state.pdfDoc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
  state.y = PDF_PAGE_HEIGHT - state.layout.margins.top;
}

function layoutStyledLines(
  segments: StyledSegment[],
  fonts: PdfFonts,
  fontSize: number,
  maxWidth: number,
  preserveSpaces: boolean,
): StyledSegment[][] {
  const lines: StyledSegment[][] = [[]];
  let currentWidth = 0;

  const addNewLine = (): void => {
    lines.push([]);
    currentWidth = 0;
  };

  const pushRun = (text: string, style: InlineStyle): void => {
    if (!text) {
      return;
    }

    const currentLine = lines[lines.length - 1];
    const previous = currentLine[currentLine.length - 1];
    if (previous && stylesEqual(previous.style, style)) {
      previous.text += text;
    } else {
      currentLine.push({ text, style: { ...style } });
    }

    currentWidth += safeTextWidth(text, fontForStyle(style, fonts), fontSize);
  };

  const fitChunk = (chunk: string, style: InlineStyle): [string, string] => {
    if (chunk.length === 0) {
      return ["", ""];
    }

    let candidate = "";
    for (const char of chunk) {
      const next = `${candidate}${char}`;
      const width = safeTextWidth(next, fontForStyle(style, fonts), fontSize);
      if (width > maxWidth) {
        break;
      }
      candidate = next;
    }

    if (!candidate) {
      candidate = chunk[0];
    }

    return [candidate, chunk.slice(candidate.length)];
  };

  const appendChunk = (chunk: string, style: InlineStyle, canTrimLeadingSpace: boolean): void => {
    let remaining = chunk;

    while (remaining.length > 0) {
      if (canTrimLeadingSpace && currentWidth === 0 && /^\s+$/.test(remaining)) {
        return;
      }

      const font = fontForStyle(style, fonts);
      const width = safeTextWidth(remaining, font, fontSize);
      if (currentWidth + width <= maxWidth) {
        pushRun(remaining, style);
        return;
      }

      if (currentWidth > 0) {
        addNewLine();
        continue;
      }

      const [fit, rest] = fitChunk(remaining, style);
      pushRun(fit, style);
      remaining = rest;
      if (remaining.length > 0) {
        addNewLine();
      }
    }
  };

  for (const segment of segments) {
    const style = segment.style;
    const rawLines = segment.text.split("\n");

    for (let rawLineIndex = 0; rawLineIndex < rawLines.length; rawLineIndex += 1) {
      const rawLine = rawLines[rawLineIndex];

      if (preserveSpaces) {
        for (const char of rawLine) {
          appendChunk(char, style, false);
        }
      } else {
        const chunks = rawLine.split(/(\s+)/).filter((chunk) => chunk.length > 0);
        for (const chunk of chunks) {
          appendChunk(chunk, style, true);
        }
      }

      if (rawLineIndex < rawLines.length - 1) {
        addNewLine();
      }
    }
  }

  while (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  return lines;
}

function layoutMonospaceLines(code: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const rows = code.replace(/\t/g, "  ").split(/\r?\n/);
  const lines: string[] = [];

  const fitRow = (row: string): [string, string] => {
    if (!row) {
      return ["", ""];
    }

    let candidate = "";
    for (const char of row) {
      const next = `${candidate}${char}`;
      if (safeTextWidth(next, font, fontSize) > maxWidth) {
        break;
      }
      candidate = next;
    }

    if (!candidate) {
      candidate = row[0];
    }

    return [candidate, row.slice(candidate.length)];
  };

  for (const row of rows) {
    if (row.length === 0) {
      lines.push("");
      continue;
    }

    let remaining = row;
    while (remaining.length > 0) {
      const [fit, rest] = fitRow(remaining);
      lines.push(fit);
      remaining = rest;
    }
  }

  return lines.length > 0 ? lines : [""];
}

function safeTextWidth(text: string, font: PDFFont, fontSize: number): number {
  return font.widthOfTextAtSize(sanitizeForFont(text, font), fontSize);
}

function sanitizeForFont(text: string, font: PDFFont): string {
  let normalized = "";

  for (const char of text) {
    const replacement = FONT_FALLBACKS[char] ?? char;
    if (canEncode(font, replacement)) {
      normalized += replacement;
      continue;
    }

    if (canEncode(font, char)) {
      normalized += char;
      continue;
    }

    normalized += "?";
  }

  return normalized;
}

function canEncode(font: PDFFont, value: string): boolean {
  try {
    font.encodeText(value);
    return true;
  } catch {
    return false;
  }
}

function stylesEqual(a: InlineStyle, b: InlineStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code && a.link === b.link;
}
