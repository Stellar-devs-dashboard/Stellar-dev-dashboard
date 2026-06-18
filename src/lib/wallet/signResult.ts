export function parseWalletSignResult(
  result: string | { error?: string; signedXDR?: string }
): string {
  if (typeof result === 'string') return result;
  if (result?.error) throw new Error(result.error);
  return result?.signedXDR ?? '';
}
