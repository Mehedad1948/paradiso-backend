// Leave invalid values intact so IsBoolean rejects them instead of coercing truthiness.
export function queryBoolean({ value }: { value: unknown }) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
