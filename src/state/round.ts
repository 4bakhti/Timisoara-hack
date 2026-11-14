/** A user-testing round label from the address: letters, digits and dashes, 1–20 characters. */
const ROUND = /^[A-Za-z0-9-]{1,20}$/;

export function roundLabel(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first !== undefined && ROUND.test(first) ? first : undefined;
}
