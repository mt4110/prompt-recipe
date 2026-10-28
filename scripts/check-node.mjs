import { pathToFileURL } from 'node:url';
export function nodeVersionError(version) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 18) ? null
    : `prompt-recipe requires Node.js >=22.18.0 (current: ${version}). Run nvm install && nvm use in this repository.`;
}
export function requireSupportedNode() {
  const error = nodeVersionError(process.versions.node);
  if (error) { console.error(error); process.exit(1); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) requireSupportedNode();
