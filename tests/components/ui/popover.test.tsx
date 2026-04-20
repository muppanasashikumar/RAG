import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

function Harness() {
  return (
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Recents</PopoverTitle>
          <PopoverDescription>Browse saved chats</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("does not render content before it's opened", () => {
    render(<Harness />);
    expect(screen.queryByText("Recents")).not.toBeInTheDocument();
    expect(screen.queryByText("Browse saved chats")).not.toBeInTheDocument();
  });

  it("renders the trigger with the proper slot attribute", () => {
    render(<Harness />);
    const trigger = screen.getByText("Open");
    expect(trigger).toHaveAttribute("data-slot", "popover-trigger");
  });

  it("shows content after the trigger is activated", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("Open"));
    await waitFor(() => {
      expect(screen.getByText("Recents")).toBeInTheDocument();
    });
    expect(screen.getByText("Browse saved chats")).toBeInTheDocument();
    expect(screen.getByText("Recents").closest("[data-slot='popover-title']"))
      .toBeTruthy();
  });
});
