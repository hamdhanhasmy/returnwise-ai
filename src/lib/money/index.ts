export const MAX_DEMO_MINOR = 100_000n;

export function parseUsd(value: string): bigint {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value))
    throw new Error("Use a USD decimal string with exactly two decimal places");
  const amount = BigInt(value.replace(".", ""));
  if (amount > MAX_DEMO_MINOR) throw new Error("Amount exceeds demo limit");
  return amount;
}

export function formatUsd(minor: bigint): string {
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? "−" : ""}$${(absolute / 100n).toLocaleString("en-US")}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
