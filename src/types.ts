export type PreviewWidth = 'default' | 'window';

export type FullAsciiDocDiffHunk = {
  oldStart: number;
  newStart: number;
  heading?: string;
  oldSource: string;
  newSource: string;
};

export type FullAsciiDocDiffFile = {
  oldPath?: string;
  newPath?: string;
  status: string;
  hunks?: FullAsciiDocDiffHunk[];
  oldSource?: string;
  newSource?: string;
  oldSourceUrl?: string;
  newSourceUrl?: string;
  error?: string;
};

export type StoredAsciiDocSource = {
  mode?: 'source';
  source: string;
  sourceUrl?: string;
  title?: string;
  createdAt: number;
};

export type StoredFullFileDiffSource = {
  mode: 'full-file-diff';
  files: FullAsciiDocDiffFile[];
  sourceUrl?: string;
  title?: string;
  createdAt: number;
};

export type StoredSource = StoredAsciiDocSource | StoredFullFileDiffSource;

export type GitHubPullRequestRef = {
  owner: string;
  repo: string;
  pullNumber: number;
  sourceUrl?: string;
};

export type PreviewSettings = {
  previewWidth: PreviewWidth;
  allowedPreviewHosts: string[];
};

export const defaultSettings: PreviewSettings = {
  previewWidth: 'default',
  allowedPreviewHosts: [],
};

export const asciiDocFilePattern = /\.(adoc|asciidoc|asc|ad)(?:[?#].*)?$/i;
