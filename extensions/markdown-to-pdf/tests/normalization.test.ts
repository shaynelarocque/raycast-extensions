import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { convertContent } from "../src/lib/conversion";
import { looksLikeHtmlInput } from "../src/lib/markdown";
import {
  getUniqueOutputPath,
  normalizeFileName,
  normalizeFontChoice,
  normalizeLayoutOptions,
  resolveOutputDirectory,
} from "../src/lib/normalization";

test("normalizes font aliases", () => {
  assert.equal(normalizeFontChoice("sans"), "helvetica");
  assert.equal(normalizeFontChoice("serif"), "times");
  assert.equal(normalizeFontChoice("monospace"), "courier");
});

test("normalizes layout options with defaults and overrides", () => {
  const defaults = normalizeLayoutOptions({ content: "x", outputFormat: "pdf" });
  assert.equal(defaults.fontSize, 11);
  assert.equal(defaults.lineSpacing, 1.27);
  assert.deepEqual(defaults.margins, { top: 56, right: 56, bottom: 56, left: 56 });

  const custom = normalizeLayoutOptions({
    content: "x",
    outputFormat: "pdf",
    fontSize: "12",
    lineSpacing: "1.5",
    marginTop: 40,
    marginRight: 50,
    marginBottom: 60,
    marginLeft: 70,
  });

  assert.equal(custom.fontSize, 12);
  assert.equal(custom.lineSpacing, 1.5);
  assert.deepEqual(custom.margins, { top: 40, right: 50, bottom: 60, left: 70 });
});

test("rejects out-of-range layout options", () => {
  assert.throws(() => normalizeLayoutOptions({ content: "x", outputFormat: "pdf", lineSpacing: 0.7 }), /lineSpacing/);
  assert.throws(() => normalizeLayoutOptions({ content: "x", outputFormat: "pdf", marginLeft: 8 }), /marginLeft/);
});

test("sanitizes unsafe file names", () => {
  assert.equal(normalizeFileName("../../my:bad*file?.pdf"), "my-bad-file-");
});

test("expands home directory in output path", () => {
  const resolved = resolveOutputDirectory("~/Downloads");
  assert.equal(resolved, path.join(os.homedir(), "Downloads"));
});

test("generates unique output paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "md-docs-test-"));
  try {
    const first = getUniqueOutputPath(tempDir, "sample", "pdf");
    await writeFile(first, "a", "utf8");
    const second = getUniqueOutputPath(tempDir, "sample", "pdf");
    assert.notEqual(first, second);
    assert.match(path.basename(second), /^sample-1\.pdf$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("detects html-looking input", () => {
  assert.equal(looksLikeHtmlInput("<div>Hello</div>"), true);
  assert.equal(looksLikeHtmlInput("# Markdown\n\n- item"), false);
});

test("convertContent rejects html input", async () => {
  await assert.rejects(
    () =>
      convertContent({
        content: "<html><body>hi</body></html>",
        outputFormat: "pdf",
      }),
    /HTML input is no longer supported/,
  );
});

test("pdf output includes interactive link annotations", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "md-docs-link-test-"));
  try {
    const result = await convertContent({
      content: "[OpenAI](https://openai.com)",
      outputFormat: "pdf",
      outputDirectory: tempDir,
      fileName: "links",
    });

    const pdfBytes = await readFile(result.outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const firstPage = pdfDoc.getPages()[0];
    const annots = firstPage.node.Annots();

    assert.ok(annots, "expected PDF annotations");
    assert.ok(annots.size() > 0, "expected at least one annotation");

    const firstAnnot = annots.lookup(0, PDFDict);
    const action = firstAnnot.lookup(PDFName.of("A"), PDFDict);
    const uri = action.lookup(PDFName.of("URI"), PDFString, PDFHexString);

    assert.equal(uri.decodeText(), "https://openai.com");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("convertContent accepts advanced layout options", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "md-docs-layout-test-"));
  try {
    const result = await convertContent({
      content: "# Title\n\nParagraph",
      outputFormat: "pdf",
      outputDirectory: tempDir,
      font: "times",
      fontSize: 12,
      lineSpacing: 1.4,
      marginTop: 48,
      marginRight: 52,
      marginBottom: 56,
      marginLeft: 60,
      fileName: "layout",
    });

    assert.equal(result.font, "times");
    assert.equal(result.fontSize, 12);
    assert.equal(result.lineSpacing, 1.4);
    assert.deepEqual(result.margins, {
      top: 48,
      right: 52,
      bottom: 56,
      left: 60,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
