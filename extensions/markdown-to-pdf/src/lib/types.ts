export type InputFormat = "markdown";

export const OUTPUT_FORMATS = ["pdf"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const FONT_CHOICES = ["helvetica", "times", "courier"] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

export type NumericInput = number | string;

export type DocumentMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ThemePalette = {
  name: string;
  accent: string;
  text: string;
  surface: string;
  headingColor: string;
  linkColor: string;
  headerBg: string;
  headerText: string;
  borderColor: string;
  codeBg: string;
  altRowBg: string;
  bodyText: string;
};

export const BUILTIN_THEME_NAMES = ["default", "minimal", "executive", "ocean", "warm"] as const;
export type BuiltinThemeName = (typeof BUILTIN_THEME_NAMES)[number];

export const BUILTIN_THEMES: Record<BuiltinThemeName, { accent: string; text: string; surface: string }> = {
  default: { accent: "#2563eb", text: "#111827", surface: "#f8fafc" },
  minimal: { accent: "#374151", text: "#1f2937", surface: "#f9fafb" },
  executive: { accent: "#1e3a5f", text: "#1a1a2e", surface: "#f8f7f4" },
  ocean: { accent: "#0891b2", text: "#134e4a", surface: "#f0fdfa" },
  warm: { accent: "#b91c1c", text: "#292524", surface: "#fefce8" },
};

export type DocumentLayoutOptions = {
  font: FontChoice;
  fontSize: number;
  lineSpacing: number;
  margins: DocumentMargins;
  theme: ThemePalette;
};

export type ConvertContentInput = {
  content: string;
  outputFormat?: OutputFormat | string;
  font?: FontChoice | string;
  fontSize?: NumericInput;
  lineSpacing?: NumericInput;
  marginTop?: NumericInput;
  marginRight?: NumericInput;
  marginBottom?: NumericInput;
  marginLeft?: NumericInput;
  theme?: string;
  fileName?: string;
  outputDirectory?: string;
};

export type ConvertContentResult = {
  outputPath: string;
  outputFormat: OutputFormat;
  inputFormat: InputFormat;
  font: FontChoice;
  fontSize: number;
  lineSpacing: number;
  margins: DocumentMargins;
  theme: string;
  bytes: number;
};
