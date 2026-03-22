import MarkdownIt from "markdown-it";

export const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

export function looksLikeHtmlInput(content: string): boolean {
  const trimmed = content.trim();

  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return true;
  }

  if (/^<(head|body|div|section|article|main|table|ul|ol|li|p|h[1-6]|blockquote|pre)\b/i.test(trimmed)) {
    return true;
  }

  return /^<([a-z][a-z0-9-]*)(\s[^>]*)?>[\s\S]*<\/\1>\s*$/i.test(trimmed);
}
