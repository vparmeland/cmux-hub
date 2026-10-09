import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import path from "node:path";
import { rawFileUrl } from "../src/lib/file-types.ts";

// Raw HTML is allowed (READMEs rely on it for logos and badges) because the
// output is sanitized below before it reaches the cmux-hub origin.
const md = new MarkdownIt({ html: true, linkify: true });

const isRelative = (url: string) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

/** Repository path for a URL relative to the markdown file, or null if it leaves the repo. */
function resolveInRepo(url: string, mdPath: string): string | null {
  let clean: string;
  try {
    clean = decodeURIComponent(url.split(/[?#]/)[0] ?? "");
  } catch {
    return null; // malformed %-escape
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(mdPath), clean));
  return resolved.startsWith("../") || resolved === ".." ? null : resolved;
}

/**
 * Render a repository markdown file to sanitized HTML (GitHub-like allowlist).
 * Relative images load through the raw file endpoint, relative links open in
 * the file browser, external links open in a new tab. In-page "#anchor" links
 * are dropped because the app uses the URL hash for routing.
 */
export function renderMarkdown(source: string, mdPath: string): string {
  return sanitizeHtml(md.render(source), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "details",
      "summary",
      "picture",
      "source",
    ],
    allowedAttributes: {
      "*": ["align", "title"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      source: ["srcset", "media"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        const target = isRelative(src) ? resolveInRepo(src, mdPath) : null;
        return { tagName, attribs: target ? { ...attribs, src: rawFileUrl(target) } : attribs };
      },
      a: (tagName, attribs) => {
        const { href = "", ...rest } = attribs;
        if (href.startsWith("#")) return { tagName, attribs: rest };
        if (isRelative(href)) {
          const target = resolveInRepo(href, mdPath);
          return {
            tagName,
            attribs: target ? { ...rest, href: `#/files/${encodeURIComponent(target)}` } : rest,
          };
        }
        return {
          tagName,
          attribs: { ...rest, href, target: "_blank", rel: "noopener noreferrer" },
        };
      },
    },
  });
}
