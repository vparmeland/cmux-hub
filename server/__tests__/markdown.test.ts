import { test, expect, describe } from "bun:test";
import { renderMarkdown } from "../markdown.ts";

describe("renderMarkdown", () => {
  test("renders GitHub-style markdown", () => {
    const html = renderMarkdown("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n", "README.md");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<table>");
  });

  test("strips scripts and event handlers but keeps layout HTML", () => {
    const html = renderMarkdown(
      '<p align="center"><b>Hi</b></p>\n\n<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>',
      "README.md",
    );
    expect(html).toContain('<p align="center"><b>Hi</b></p>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  test("rewrites relative images written as raw HTML", () => {
    const html = renderMarkdown('<img src="logo.png" alt="Logo" width="150">', "README.md");
    expect(html).toContain('src="/api/file/raw?path=logo.png"');
    expect(html).toContain('width="150"');
  });

  test("drops in-page anchor links, which would clash with hash routing", () => {
    const html = renderMarkdown('<a href="#readme-top">back to top</a>', "README.md");
    expect(html).toContain("<a>back to top</a>");
  });

  test("does not render javascript: links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))", "README.md");
    expect(html).not.toContain('href="javascript:');
  });

  test("loads relative images through the raw file endpoint", () => {
    const html = renderMarkdown("![logo](../img/logo.png)", "docs/guide/README.md");
    expect(html).toContain('src="/api/file/raw?path=docs%2Fimg%2Flogo.png"');
  });

  test("opens relative links in the file browser", () => {
    const html = renderMarkdown("[setup](./setup.md#install)", "docs/README.md");
    expect(html).toContain(`href="#/files/${encodeURIComponent("docs/setup.md")}"`);
  });

  test("leaves paths that escape the repository untouched", () => {
    const html = renderMarkdown("![x](../../outside.png)", "README.md");
    expect(html).toContain('src="../../outside.png"');
  });

  test("opens external links in a new tab", () => {
    const html = renderMarkdown("[gh](https://github.com)", "README.md");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
