/**
 * The single list of what the extension actually loads at runtime.
 *
 * Both `npm run zip` and `npm run check` read it: the zip so the archive holds
 * exactly this, and the check so it measures and inspects exactly what the
 * archive will hold. Kept apart from both so neither has to import the other —
 * zip.mjs runs the checks as a subprocess, so importing it would run them
 * twice.
 */
export const PAYLOAD = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'blocked.html',
  'blocked.css',
  'blocked.js',
  'summary.html',
  'summary.css',
  'summary.js',
  'assets',
  'icons',
  'src',
  '_locales'
];

/** True for a repo-relative path that the archive includes. */
export function isPayload(file) {
  return PAYLOAD.some(entry => file === entry || file.startsWith(`${entry}/`));
}

/**
 * Paths that are deliberately absent from the archive. Anything in the repo
 * that is neither payload nor listed here is a file someone added at the root
 * and forgot to declare — the failure being guarded against is a zip that is
 * missing a script the extension needs.
 */
export const NOT_SHIPPED = [
  /^tools\//,
  /^docs\//,
  /^store\//,
  /^dist\//,
  /\.md$/,
  /^LICENSE$/,
  /^package(-lock)?\.json$/,
  // Repository metadata: .gitignore, .gitattributes, .github/, .editorconfig.
  /^\./
];
