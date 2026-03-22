import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BUILTIN_THEME_NAMES,
  BUILTIN_THEMES,
  type BuiltinThemeName,
  FONT_CHOICES,
  type ConvertContentInput,
  type DocumentLayoutOptions,
  type FontChoice,
  type NumericInput,
  type ThemePalette,
} from "./types";

const DEFAULT_OUTPUT_DIRECTORY = path.join(os.homedir(), "Downloads");
const DEFAULT_FONT_SIZE = 11;
const DEFAULT_LINE_SPACING = 1.27;
const DEFAULT_MARGIN = 56;

export function normalizeFontChoice(rawFont?: string): FontChoice {
  if (!rawFont) {
    return "helvetica";
  }

  const normalized = rawFont.trim().toLowerCase();
  if (FONT_CHOICES.includes(normalized as FontChoice)) {
    return normalized as FontChoice;
  }

  if (normalized === "sans" || normalized === "sans-serif") {
    return "helvetica";
  }
  if (normalized === "serif") {
    return "times";
  }
  if (normalized === "mono" || normalized === "monospace") {
    return "courier";
  }

  throw new Error(`Unsupported font "${rawFont}". Use one of: ${FONT_CHOICES.join(", ")}.`);
}

export function resolveOutputDirectory(rawDirectory?: string): string {
  const trimmed = rawDirectory?.trim();
  if (!trimmed) {
    return DEFAULT_OUTPUT_DIRECTORY;
  }

  const homeExpanded = trimmed.replace(/^~(?=$|[/\\])/, os.homedir());
  return path.resolve(homeExpanded);
}

export function normalizeLayoutOptions(input: ConvertContentInput): DocumentLayoutOptions {
  return {
    font: normalizeFontChoice(input.font),
    fontSize: normalizeNumberOption(input.fontSize, "fontSize", {
      defaultValue: DEFAULT_FONT_SIZE,
      min: 8,
      max: 18,
    }),
    lineSpacing: normalizeNumberOption(input.lineSpacing, "lineSpacing", {
      defaultValue: DEFAULT_LINE_SPACING,
      min: 1,
      max: 2.4,
    }),
    margins: {
      top: normalizeNumberOption(input.marginTop, "marginTop", {
        defaultValue: DEFAULT_MARGIN,
        min: 24,
        max: 120,
      }),
      right: normalizeNumberOption(input.marginRight, "marginRight", {
        defaultValue: DEFAULT_MARGIN,
        min: 24,
        max: 120,
      }),
      bottom: normalizeNumberOption(input.marginBottom, "marginBottom", {
        defaultValue: DEFAULT_MARGIN,
        min: 24,
        max: 120,
      }),
      left: normalizeNumberOption(input.marginLeft, "marginLeft", {
        defaultValue: DEFAULT_MARGIN,
        min: 24,
        max: 120,
      }),
    },
    theme: resolveTheme(input.theme),
  };
}

export function resolveTheme(rawTheme?: string): ThemePalette {
  const name = rawTheme?.trim().toLowerCase() || "default";

  // Check built-in themes
  if (BUILTIN_THEME_NAMES.includes(name as BuiltinThemeName)) {
    const base = BUILTIN_THEMES[name as BuiltinThemeName];
    return buildPalette(name, base.accent, base.text, base.surface);
  }

  // Check custom theme from preferences
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPreferenceValues } = require("@raycast/api");
    const prefs = getPreferenceValues<{
      customThemeName?: string;
      customAccentColor?: string;
      customTextColor?: string;
      customSurfaceColor?: string;
    }>();

    const customName = prefs.customThemeName?.trim().toLowerCase();
    if (customName && customName === name) {
      const accent = normalizeHexColor(prefs.customAccentColor, "#2563eb");
      const text = normalizeHexColor(prefs.customTextColor, "#111827");
      const surface = normalizeHexColor(prefs.customSurfaceColor, "#f8fafc");
      return buildPalette(customName, accent, text, surface);
    }
  } catch {
    // Preferences unavailable (e.g., in tests) — fall through to default
  }

  // Fallback to default
  const base = BUILTIN_THEMES.default;
  return buildPalette("default", base.accent, base.text, base.surface);
}

function buildPalette(name: string, accent: string, text: string, surface: string): ThemePalette {
  return {
    name,
    accent,
    text,
    surface,
    headingColor: accent,
    linkColor: accent,
    headerBg: blendHex(accent, "#ffffff", 0.88),
    headerText: darkenHex(accent, 0.3),
    borderColor: blendHex(accent, "#d0d0d0", 0.6),
    codeBg: surface,
    altRowBg: blendHex(surface, "#f5f5f5", 0.5),
    bodyText: text,
  };
}

function normalizeHexColor(raw: string | undefined, fallback: string): string {
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function blendHex(color: string, target: string, amount: number): string {
  const [r1, g1, b1] = parseHex(color);
  const [r2, g2, b2] = parseHex(target);
  return toHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

function darkenHex(color: string, amount: number): string {
  const [r, g, b] = parseHex(color);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

export function normalizeFileName(rawFileName?: string): string {
  const fallback = timestampedFallbackName();
  const baseName = path.basename((rawFileName ?? fallback).trim() || fallback);
  const withoutExtension = baseName.replace(/\.[a-z0-9]+$/i, "");

  const sanitized = withoutExtension
    .split("")
    .map((char) => (isInvalidFileNameChar(char) ? "-" : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized || /^\.+$/.test(sanitized)) {
    return "document";
  }

  return sanitized.slice(0, 80);
}

export function getUniqueOutputPath(directory: string, baseName: string, extension: OutputFormat): string {
  let counter = 0;

  while (true) {
    const suffix = counter === 0 ? "" : `-${counter}`;
    const candidate = path.join(directory, `${baseName}${suffix}.${extension}`);
    if (!existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function normalizeNumberOption(
  rawValue: NumericInput | undefined,
  fieldName: string,
  range: { defaultValue: number; min: number; max: number },
): number {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return range.defaultValue;
  }

  const numericValue =
    typeof rawValue === "number" ? rawValue : Number.parseFloat(String(rawValue).trim().replace(",", "."));

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid ${fieldName} value "${rawValue}". Expected a number.`);
  }

  if (numericValue < range.min || numericValue > range.max) {
    throw new Error(`Invalid ${fieldName} value "${rawValue}". Supported range: ${range.min} to ${range.max}.`);
  }

  return numericValue;
}

function timestampedFallbackName(): string {
  return `document-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function isInvalidFileNameChar(char: string): boolean {
  if (!char) {
    return false;
  }

  const code = char.charCodeAt(0);
  if (code >= 0 && code <= 31) {
    return true;
  }

  return /[<>:"/\\|?*]/.test(char);
}
