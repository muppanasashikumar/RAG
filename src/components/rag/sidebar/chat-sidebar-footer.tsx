import { UserButton } from "@clerk/nextjs";
import { ChatThemeToggle } from "./chat-theme-toggle";

type ChatSidebarFooterProps = {
  collapsed: boolean;
  userLabel: string;
  userInitial: string;
};

export function ChatSidebarFooter({
  collapsed,
  userLabel,
  userInitial,
}: ChatSidebarFooterProps) {
  if (collapsed) {
    return (
      <div className="mt-auto flex justify-center border-t pt-3">
        <div className="flex flex-col items-center gap-2">
          <ChatThemeToggle collapsed />
          <UserButton
            appearance={{
              elements: {
                avatarBox: "size-8",
              },
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {userInitial.toUpperCase()}
          </div>
          <p className="truncate text-sm font-medium" title={userLabel}>
            {userLabel}
          </p>
        </div>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-9",
            },
          }}
        />
      </div>
      <ChatThemeToggle collapsed={false} />
      {/* <p className="text-xs text-muted-foreground">Open your profile menu to sign out.</p> */}
    </div>
  );
}
