import { Search } from "lucide-react";
import type { RefObject } from "react";

type ChatSearchInputProps = {
  value: string;
  placeholder: string;
  inputClassName: string;
  wrapperClassName?: string;
  iconClassName: string;
  onChange: (nextQuery: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function ChatSearchInput({
  value,
  placeholder,
  inputClassName,
  wrapperClassName,
  iconClassName,
  onChange,
  inputRef,
}: ChatSearchInputProps) {
  return (
    <label className={wrapperClassName}>
      <Search className={iconClassName} />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
    </label>
  );
}
