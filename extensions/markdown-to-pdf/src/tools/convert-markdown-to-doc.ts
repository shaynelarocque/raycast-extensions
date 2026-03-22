import type { Tool } from "@raycast/api";
import { convertContent } from "../lib/conversion";

type Input = {
  /**
   * Markdown content to convert.
   */
  content: string;

  /**
   * Optional document font family.
   * Supported values: helvetica, times, courier.
   */
  font?: "helvetica" | "times" | "courier";

  /**
   * Optional base font size in points.
   * Supported range: 8 to 18.
   */
  fontSize?: number;

  /**
   * Optional line spacing multiplier.
   * Supported range: 1.0 to 2.4.
   */
  lineSpacing?: number;

  /**
   * Optional page margin top in points.
   * Supported range: 24 to 120.
   */
  marginTop?: number;

  /**
   * Optional page margin right in points.
   * Supported range: 24 to 120.
   */
  marginRight?: number;

  /**
   * Optional page margin bottom in points.
   * Supported range: 24 to 120.
   */
  marginBottom?: number;

  /**
   * Optional page margin left in points.
   * Supported range: 24 to 120.
   */
  marginLeft?: number;

  /**
   * Optional color theme.
   * Built-in themes: default, minimal, executive, ocean, warm.
   * The user may also have a custom theme configured in extension preferences.
   */
  theme?: string;

  /**
   * Optional file name for the generated file (without extension).
   */
  fileName?: string;

  /**
   * Optional output directory.
   * Uses ~/Downloads when omitted.
   */
  outputDirectory?: string;
};

export default async function convertMarkdownToDoc(input: Input) {
  const result = await convertContent(input);

  return {
    status: "success",
    outputPath: result.outputPath,
    outputFormat: result.outputFormat,
    inputFormat: result.inputFormat,
    font: result.font,
    fontSize: result.fontSize,
    lineSpacing: result.lineSpacing,
    margins: result.margins,
    theme: result.theme,
    bytes: result.bytes,
    message: `Created PDF file at ${result.outputPath}`,
  };
}

export const confirmation: Tool.Confirmation<Input> = async (params: Input) => {
  return {
    message: "This will generate a PDF file on disk.",
    info: [
      { name: "Font", value: params.font ?? "helvetica" },
      { name: "Font Size", value: String(params.fontSize ?? 11) },
      { name: "Line Spacing", value: String(params.lineSpacing ?? 1.27) },
      {
        name: "Margins (T R B L)",
        value: `${params.marginTop ?? 56} ${params.marginRight ?? 56} ${params.marginBottom ?? 56} ${params.marginLeft ?? 56}`,
      },
      { name: "Theme", value: params.theme ?? "default" },
      { name: "File Name", value: params.fileName ?? "auto-generated" },
      { name: "Output Directory", value: params.outputDirectory ?? "~/Downloads" },
    ],
  };
};
