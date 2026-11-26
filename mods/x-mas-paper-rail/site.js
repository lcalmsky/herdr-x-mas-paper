// The ticket keys a space name carries, the repository prefixes dropped from it, and the
// Slack-thread bot's label and session folder. These are neutral defaults; tools/install.sh
// installs ${XMAS_SITE_JS:-~/.config/herdr-x-mas-paper/site.js} in this file's place when it exists.
export const SPACE_KEY = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,9}-\d{1,5})(?![0-9])/;
export const REPO_PREFIX = /^(?!)/;
export const THREAD_LABEL = "Thread bot";
export const THREAD_SESSIONS = "";
