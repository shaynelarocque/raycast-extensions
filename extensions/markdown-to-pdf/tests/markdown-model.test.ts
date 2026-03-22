import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownBlocks } from "../src/lib/pdf/markdown-model";

test("parses task list markers for unordered lists", () => {
  const blocks = parseMarkdownBlocks("- [x] done\n- [ ] todo");
  const items = blocks.filter((block) => block.kind === "list_item");

  assert.equal(items.length, 2);
  assert.equal(items[0].marker, "[x]");
  assert.equal(items[1].marker, "[ ]");
  assert.equal(items[0].segments.map((segment) => segment.text).join(""), "done");
  assert.equal(items[1].segments.map((segment) => segment.text).join(""), "todo");
});

test("keeps checkbox literals inside ordered list items", () => {
  const blocks = parseMarkdownBlocks("1. [x] done");
  const items = blocks.filter((block) => block.kind === "list_item");

  assert.equal(items.length, 1);
  assert.equal(items[0].marker, "1.");
  assert.equal(items[0].segments.map((segment) => segment.text).join(""), "[x] done");
});

test("preserves links in table cells as styled segments", () => {
  const md = `| Name | Link |\n|------|------|\n| Foo | [Example](https://example.com) |`;
  const blocks = parseMarkdownBlocks(md);
  const table = blocks.find((b) => b.kind === "table");
  assert.ok(table && table.kind === "table");

  const bodyRow = table.bodyRows[0];
  assert.ok(bodyRow);
  const linkCell = bodyRow[1];
  assert.ok(linkCell);

  const linkSegment = linkCell.find((s) => s.style.link);
  assert.ok(linkSegment, "table cell should contain a segment with a link");
  assert.equal(linkSegment.style.link, "https://example.com");
  assert.equal(linkSegment.text, "Example");
});

test("tracks nested unordered items under ordered items", () => {
  const markdown = `1. First item\n   - nested a\n   - nested b\n2. Second item`;
  const blocks = parseMarkdownBlocks(markdown);
  const items = blocks.filter((block) => block.kind === "list_item");

  assert.deepEqual(
    items.map((item) => ({ marker: item.marker, depth: item.listDepth })),
    [
      { marker: "1.", depth: 1 },
      { marker: "•", depth: 2 },
      { marker: "•", depth: 2 },
      { marker: "2.", depth: 1 },
    ],
  );
});
