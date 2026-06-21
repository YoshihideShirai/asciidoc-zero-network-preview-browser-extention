import { getSettings, saveSettings } from './storage';
import { normalizeGitLabHosts } from './gitlab-hosts';

const hostsTextarea = document.querySelector<HTMLTextAreaElement>('#allowed-hosts');
const gitlabHostsTextarea = document.querySelector<HTMLTextAreaElement>('#allowed-gitlab-hosts');
const saveButton = document.querySelector<HTMLButtonElement>('#save');
const saveReturnButton = document.querySelector<HTMLButtonElement>('#save-return');
const returnLink = document.querySelector<HTMLAnchorElement>('#return-link');
const status = document.querySelector<HTMLElement>('#status');
const returnTo = getReturnTo();

void load();
setupReturnActions();

async function load(): Promise<void> {
  const settings = await getSettings();
  if (hostsTextarea) {
    hostsTextarea.value = settings.allowedPreviewHosts.join('\n');
  }
  if (gitlabHostsTextarea) {
    gitlabHostsTextarea.value = settings.allowedGitLabHosts.join('\n');
  }
}

saveButton?.addEventListener('click', () => {
  void save();
});

saveReturnButton?.addEventListener('click', () => {
  void save().then(() => {
    if (returnTo) {
      location.assign(returnTo);
    }
  });
});

async function save(): Promise<void> {
  await saveSettings({
    allowedPreviewHosts: (hostsTextarea?.value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    allowedGitLabHosts: normalizeGitLabHosts((gitlabHostsTextarea?.value || '').split(/\r?\n/)),
  });

  if (status) {
    status.textContent = 'Saved.';
    window.setTimeout(() => {
      status.textContent = '';
    }, 1800);
  }
}

function setupReturnActions(): void {
  if (!returnTo) {
    return;
  }

  if (returnLink) {
    returnLink.href = returnTo;
    returnLink.hidden = false;
  }
  if (saveReturnButton) {
    saveReturnButton.hidden = false;
  }
}

function getReturnTo(): string | undefined {
  const value = new URL(location.href).searchParams.get('returnTo');
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || url.pathname.split('/').pop() !== 'viewer.html') {
      return undefined;
    }
    return `${url.pathname.split('/').pop()}${url.search}`;
  } catch {
    return undefined;
  }
}
