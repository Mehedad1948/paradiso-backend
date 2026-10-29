// Text to match literally inside a LIKE/ILIKE pattern: "100%" must not match
// every title containing "100".
export const escapeLike = (text: string): string =>
  text.replace(/[\\%_]/g, '\\$&');
