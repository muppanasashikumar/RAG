import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

type ChatThemeToggleProps = {
  collapsed: boolean;
};

export function ChatThemeToggle({ collapsed }: ChatThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDarkTheme = theme === "dark";
  const themeLabel = `Switch to ${isDarkTheme ? "light" : "dark"} mode`;

  if (collapsed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggleTheme}
        aria-label={themeLabel}
        title={themeLabel}
      >
        {isDarkTheme ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="mb-3 w-full justify-start gap-2"
      onClick={toggleTheme}
      aria-label={themeLabel}
      title={themeLabel}
    >
      {isDarkTheme ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
      {themeLabel}
    </Button>
  );
}
