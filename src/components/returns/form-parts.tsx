export const control =
  "mt-2 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
export const human = (s: string) => s.toLowerCase().replaceAll("_", " ");
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
