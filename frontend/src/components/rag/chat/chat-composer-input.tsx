import type { ChatComposerInputProps } from "@/components/rag/chat/types";
import { cn } from "@/lib/utils";

export function ChatComposerInput({
  value,
  onChange,
  readOnly,
  isListening,
  idlePlaceholder,
  listeningPlaceholder,
}: ChatComposerInputProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      placeholder={isListening ? listeningPlaceholder : idlePlaceholder}
      className={cn(
        "h-12 min-w-0 flex-1 rounded-full border bg-background px-4 text-sm outline-none transition focus:ring-3 read-only:cursor-default read-only:opacity-90",
        isListening
          ? "border-destructive/35 ring-2 ring-destructive/15 focus:border-destructive/40 focus:ring-destructive/15"
          : "border-input focus:border-ring focus:ring-ring/20",
      )}
    />
  );
}
