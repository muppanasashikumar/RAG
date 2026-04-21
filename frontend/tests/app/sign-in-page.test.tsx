import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => (
    <div
      data-testid="clerk-signin"
      data-path={props.path as string}
      data-routing={props.routing as string}
      data-redirect={props.forceRedirectUrl as string}
    />
  ),
}));

import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

describe("SignInPage", () => {
  it("renders the Clerk <SignIn> widget with path routing and a home redirect", () => {
    render(<SignInPage />);
    const widget = screen.getByTestId("clerk-signin");
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute("data-path", "/sign-in");
    expect(widget).toHaveAttribute("data-routing", "path");
    expect(widget).toHaveAttribute("data-redirect", "/");
  });
});
