import { defaultSettings, type PreviewSettings, type StoredSource } from './types';
import { normalizeGitLabHosts } from './gitlab-hosts';

const sourcePrefix = 'source:';
const settingsKey = 'settings';

export async function saveSource(source: StoredSource): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await chrome.storage.session.set({ [`${sourcePrefix}${id}`]: source });
  return id;
}

export async function readSource(id: string): Promise<StoredSource | undefined> {
  const key = `${sourcePrefix}${id}`;
  const result = await chrome.storage.session.get(key);
  return result[key] as StoredSource | undefined;
}

export async function getSettings(): Promise<PreviewSettings> {
  const result = await chrome.storage.sync.get(settingsKey);
  const value = result[settingsKey] as Partial<PreviewSettings> | undefined;

  return {
    allowedPreviewHosts: Array.isArray(value?.allowedPreviewHosts)
      ? value.allowedPreviewHosts.filter((host) => typeof host === 'string')
      : defaultSettings.allowedPreviewHosts,
    allowedGitLabHosts: Array.isArray(value?.allowedGitLabHosts)
      ? normalizeGitLabHosts(value.allowedGitLabHosts.filter((host) => typeof host === 'string'))
      : defaultSettings.allowedGitLabHosts,
  };
}

export async function saveSettings(settings: PreviewSettings): Promise<void> {
  await chrome.storage.sync.set({ [settingsKey]: settings });
}
