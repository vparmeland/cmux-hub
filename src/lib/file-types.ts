// Shared by the server (raw file endpoint) and the file browser UI.

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

const extension = (path: string) => path.slice(path.lastIndexOf(".") + 1).toLowerCase();

export const imageType = (path: string): string | undefined => IMAGE_TYPES[extension(path)];

export const isMarkdown = (path: string) => ["md", "markdown"].includes(extension(path));

export const rawFileUrl = (path: string) => `/api/file/raw?${new URLSearchParams({ path })}`;
