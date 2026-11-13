/** Validates raw numeric policy inputs. Thresholds must be non-negative numbers. */
export function validatePolicy(raw: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v.trim() === "") errors[k] = "Enter a value.";
    else if (!Number.isFinite(Number(v))) errors[k] = "Enter a number.";
    else if (Number(v) < 0) errors[k] = "Thresholds can't be negative.";
  }
  return errors;
}
