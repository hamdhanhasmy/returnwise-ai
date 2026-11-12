export async function paymentCommand<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ??
        "Request could not be verified. Reconcile the transaction before retrying.",
    );
  return result as T;
}
