/**
 * Determine whether the current process is running in an interactive terminal.
 * Returns false when stdin/stdout are not TTYs, when running in a known CI
 * environment, or when the user explicitly requests non-interactive mode.
 *
 * Per D-07: checks process.stdin.isTTY && process.stdout.isTTY
 * Per D-08: checks CI, GITHUB_ACTIONS, GITLAB_CI, CODEBUILD_BUILD_ID, JENKINS_URL, TF_BUILD
 * Per D-09: non-TTY auto-degrades (returns false, caller decides behavior)
 * Per D-10: --no-interactive flag in process.argv overrides everything
 */
export function isInteractive(): boolean {
  // --no-interactive flag takes highest priority (per D-10)
  if (process.argv.includes("--no-interactive")) return false;

  // Non-TTY stdin or stdout means non-interactive (per D-07)
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

  // Known CI/automation environments — even with pseudo-TTY, not interactive (per D-08)
  const ciEnvs = [
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CODEBUILD_BUILD_ID",
    "JENKINS_URL",
    "TF_BUILD",
  ];
  for (const env of ciEnvs) {
    if (process.env[env]) return false;
  }

  return true;
}
