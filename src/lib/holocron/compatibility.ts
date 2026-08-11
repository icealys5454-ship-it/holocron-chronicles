// Port of @holocron/compatibility and @holocron/config.

export interface CompatibilityResult {
  id: string;
  pass: boolean;
}

export const qualificationPolicy = Object.freeze({
  abiMajor: 1,
  compatibilityMinimum: 95,
  determinismRequired: true,
  stateRoundTripRequired: true,
  regressionBudget: 0,
  productionLaunchRequiresSignedAttestation: true,
});

export function compatibilityScore(results: CompatibilityResult[]): number {
  if (!results.length) return 0;
  return Math.round((results.filter((r) => r.pass).length * 100) / results.length);
}

export function classifyCompatibility(score: number): string {
  if (score >= 95) return "release-qualified";
  if (score >= 80) return "playable";
  if (score >= 60) return "major-issues";
  return "failed";
}

export function compareBuilds(base: CompatibilityResult[], candidate: CompatibilityResult[]) {
  const current = new Map(candidate.map((r) => [r.id, r]));
  const regressions: string[] = [];
  for (const old of base) {
    const next = current.get(old.id);
    if (old.pass && next && !next.pass) regressions.push(old.id);
  }
  return { pass: regressions.length === 0, regressions };
}
