import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CopyTournamentLink } from "./CopyTournamentLink";

const url = "https://ggg.quest/tournaments/t_1";

it("copies the URL with visible and screen-reader success feedback", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<CopyTournamentLink url={url} />);

  const button = screen.getByRole("button", { name: "Copy tournament link" });
  button.focus();
  expect(button).toHaveFocus();
  expect(screen.queryByText(url)).not.toBeInTheDocument();
  fireEvent.click(button);

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});

it("announces clipboard failure without printing the URL", async () => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) },
  });
  render(<CopyTournamentLink url={url} />);

  fireEvent.click(screen.getByRole("button", { name: "Copy tournament link" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy tournament link");
  expect(screen.queryByText(url)).not.toBeInTheDocument();
});
