import { RotateCcw } from "lucide-react";
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${inverse ? "text-white" : "text-foreground"}`}
    >
      <span
        className={`flex size-8 items-center justify-center rounded-lg ${inverse ? "bg-white/15" : "bg-primary text-primary-foreground"}`}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
      </span>
      <span>
        ReturnWise
        <span
          className={`ml-1 text-[10px] font-medium ${inverse ? "text-white/60" : "text-muted-foreground"}`}
        >
          AI
        </span>
      </span>
    </span>
  );
}
