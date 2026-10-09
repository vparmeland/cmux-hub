import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.ts";
import { imageType, rawFileUrl } from "../lib/file-types.ts";

type FileData = Awaited<ReturnType<typeof api.getFile>>;

type Props = {
  /** Repository-relative path of a directory or file; "" is the repository root. */
  path: string;
  repoName: string;
  onOpen: (path: string) => void;
};

/** Immediate sub-directories and files of `dir` ("" = root), each sorted by name. */
function listDir(files: string[], dir: string) {
  const prefix = dir ? `${dir}/` : "";
  const dirs = new Set<string>();
  const entries: string[] = [];
  for (const f of files) {
    if (!f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) entries.push(f);
    else dirs.add(prefix + rest.slice(0, slash));
  }
  return { dirs: [...dirs].sort(), files: entries.sort() };
}

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

const ROW =
  "flex items-center gap-2 w-full text-left px-4 py-1.5 text-[11.9px] border-t border-[#30363d] first:border-t-0 hover:bg-[#161b22]";

export function FilesView({ path, repoName, onOpen }: Props) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<FileData | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    api
      .getFiles()
      .then((r) => setFiles(r.files))
      .catch((e: Error) => setListError(e.message));
    api
      .getDiffFiles()
      .then((r) => setChanged(new Set(r.files)))
      .catch(() => {});
  }, []);

  const isFile = files?.includes(path) ?? false;
  const isImage = isFile && imageType(path) !== undefined;

  useEffect(() => {
    setFile(null);
    setFileError(null);
    setQuery("");
    setShowCode(false);
    if (!isFile || isImage) return;
    let cancelled = false;
    api
      .getFile(path)
      .then((r) => !cancelled && setFile(r))
      .catch((e: Error) => !cancelled && setFileError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path, isFile, isImage]);

  const listing = useMemo(
    () => (files && !isFile ? listDir(files, path) : null),
    [files, path, isFile],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q && files ? files.filter((f) => f.toLowerCase().includes(q)).slice(0, 200) : null;
  }, [files, query]);

  const hasChanges = (p: string) =>
    changed.has(p) || [...changed].some((c) => c.startsWith(`${p}/`));
  const marker = (p: string) =>
    hasChanges(p) && (
      <span className="text-[#d29922]" title="Uncommitted changes">
        ●
      </span>
    );

  const segments = path ? path.split("/") : [];
  const notFound =
    files !== null &&
    !isFile &&
    path !== "" &&
    listing?.dirs.length === 0 &&
    listing.files.length === 0;

  let body: React.ReactNode;
  if (listError) {
    body = <p className="p-6 text-[11.9px] text-red-400">{listError}</p>;
  } else if (files === null) {
    body = <p className="p-6 text-[11.9px] text-[#848d97]">Loading...</p>;
  } else if (matches) {
    body =
      matches.length === 0 ? (
        <p className="p-6 text-[11.9px] text-[#848d97]">No matching files.</p>
      ) : (
        matches.map((f) => (
          <button key={f} className={ROW} onClick={() => onOpen(f)}>
            <span className="font-mono text-[#adbac7] truncate">{f}</span>
            {marker(f)}
          </button>
        ))
      );
  } else if (notFound) {
    body = <p className="p-6 text-[11.9px] text-red-400">No such file or folder: {path}</p>;
  } else if (listing) {
    body = (
      <>
        {path && (
          <button className={ROW} onClick={() => onOpen(segments.slice(0, -1).join("/"))}>
            <span className="w-4 text-[#848d97]">↰</span>
            <span className="text-[#58a6ff]">..</span>
          </button>
        )}
        {listing.dirs.map((d) => (
          <button key={d} className={ROW} onClick={() => onOpen(d)}>
            <span className="w-4 text-[#848d97]">▸</span>
            <span className="text-[#58a6ff]">{basename(d)}</span>
            {marker(d)}
          </button>
        ))}
        {listing.files.map((f) => (
          <button key={f} className={ROW} onClick={() => onOpen(f)}>
            <span className="w-4" />
            <span className="text-[#c9d1d9]">{basename(f)}</span>
            {marker(f)}
          </button>
        ))}
      </>
    );
  } else if (isImage) {
    body = (
      <div className="p-6 flex justify-center bg-[#161b22]">
        <img src={rawFileUrl(path)} alt={path} className="max-w-full" />
      </div>
    );
  } else if (fileError) {
    body = <p className="p-6 text-[11.9px] text-red-400">{fileError}</p>;
  } else if (!file) {
    body = <p className="p-6 text-[11.9px] text-[#848d97]">Loading...</p>;
  } else if (file.reason) {
    body = (
      <p className="p-6 text-[11.9px] text-[#848d97]">
        {file.reason === "binary" ? "Binary file" : "File too large to display"} (
        {file.size.toLocaleString()} bytes)
      </p>
    );
  } else if (file.html && !showCode) {
    body = (
      <article
        className="markdown-body markdown-doc px-8 py-6"
        // Rendered server-side by markdown-it with raw HTML disabled
        dangerouslySetInnerHTML={{ __html: file.html }}
      />
    );
  } else {
    body = (
      <table className="w-full border-collapse">
        <tbody>
          {file.tokenLines?.map((tokens, i) => (
            <tr key={i} className="font-mono text-[11.9px] leading-5">
              <td className="w-12 text-right pr-3 pl-2 select-none align-top text-[10.2px] text-[#848d97]">
                {i + 1}
              </td>
              <td className="px-3 whitespace-pre-wrap break-all text-[#adbac7]">
                {tokens.map((t, j) => (
                  <span key={j} style={t.color ? { color: t.color } : undefined}>
                    {t.content}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div data-testid="files-view" className="pt-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-3">
        <nav
          aria-label="File path"
          className="flex-1 min-w-0 flex flex-wrap items-center gap-1 text-[13.6px]"
        >
          <button
            className="font-semibold text-[#58a6ff] hover:underline"
            onClick={() => onOpen("")}
          >
            {repoName}
          </button>
          {segments.map((seg, i) => {
            const target = segments.slice(0, i + 1).join("/");
            const last = i === segments.length - 1;
            return (
              <React.Fragment key={target}>
                <span className="text-[#848d97]">/</span>
                {last ? (
                  <span className="font-semibold text-[#c9d1d9]">{seg}</span>
                ) : (
                  <button className="text-[#58a6ff] hover:underline" onClick={() => onOpen(target)}>
                    {seg}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Go to file"
          aria-label="Go to file"
          className="w-56 px-2 py-1 text-[11.9px] bg-[#0d1117] border border-[#30363d] rounded-md text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
        />
      </div>
      <div className="border border-[#30363d] rounded-md overflow-hidden">
        {isFile && !matches && file?.content != null && (
          <div className="flex items-center gap-3 bg-[#161b22] border-b border-[#30363d] px-4 py-2 text-[10.2px] text-[#848d97]">
            {file.html && (
              <div
                role="group"
                aria-label="View mode"
                className="flex border border-[#30363d] rounded-md overflow-hidden"
              >
                {(["Preview", "Code"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={showCode === (mode === "Code")}
                    onClick={() => setShowCode(mode === "Code")}
                    className={`px-3 py-1 ${showCode === (mode === "Code") ? "bg-[#30363d] text-[#c9d1d9]" : "hover:text-[#c9d1d9]"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
            <span>
              {file.tokenLines?.length ?? 0} lines · {file.size.toLocaleString()} bytes
            </span>
          </div>
        )}
        {body}
      </div>
    </div>
  );
}
