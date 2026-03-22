import { mkdir, stat } from "node:fs/promises";
import { looksLikeHtmlInput } from "./markdown";
import {
  getUniqueOutputPath,
  normalizeFileName,
  normalizeLayoutOptions,
  resolveOutputDirectory,
} from "./normalization";
import { renderPdf } from "./pdf/render";
import type { ConvertContentInput, ConvertContentResult } from "./types";

export {
  FONT_CHOICES,
  type DocumentLayoutOptions,
  type DocumentMargins,
  type FontChoice,
  type NumericInput,
  OUTPUT_FORMATS,
  type OutputFormat,
  type InputFormat,
  type ConvertContentInput,
  type ConvertContentResult,
} from "./types";

export async function convertContent(input: ConvertContentInput): Promise<ConvertContentResult> {
  const content = input.content?.trim();
  if (!content) {
    throw new Error("`content` is required and cannot be empty.");
  }

  const legacyInputFormat = (input as { inputFormat?: unknown }).inputFormat;
  if (
    typeof legacyInputFormat === "string" &&
    legacyInputFormat.trim().length > 0 &&
    legacyInputFormat.trim().toLowerCase() !== "markdown"
  ) {
    throw new Error("Only markdown input is supported.");
  }

  if (looksLikeHtmlInput(content)) {
    throw new Error("HTML input is no longer supported. Please provide markdown content.");
  }

  const layout = normalizeLayoutOptions(input);
  const outputDirectory = resolveOutputDirectory(input.outputDirectory);
  const safeFileName = normalizeFileName(input.fileName);

  await mkdir(outputDirectory, { recursive: true });

  const outputPath = getUniqueOutputPath(outputDirectory, safeFileName, "pdf");

  await renderPdf({
    sourceContent: content,
    layout,
    outputPath,
    title: safeFileName,
  });

  const fileStats = await stat(outputPath);

  return {
    outputPath,
    outputFormat: "pdf",
    inputFormat: "markdown",
    font: layout.font,
    fontSize: layout.fontSize,
    lineSpacing: layout.lineSpacing,
    margins: layout.margins,
    theme: layout.theme.name,
    bytes: fileStats.size,
  };
}
