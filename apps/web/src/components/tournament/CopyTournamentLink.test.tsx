import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  fireEvent.click(button);

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});

it("clears success so another copy can be announced", async () => {
  vi.useFakeTimers();
  try {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyTournamentLink url={url} />);

    const button = screen.getByRole("button", { name: "Copy tournament link" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  } finally {
    vi.useRealTimers();
  }
});

it("ignores an earlier clipboard failure after a later copy succeeds", async () => {
  let rejectFirst!: (error: Error) => void;
  const writeText = vi
    .fn()
    .mockImplementationOnce(() => new Promise<void>((_, reject) => (rejectFirst = reject)))
    .mockResolvedValueOnce(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<CopyTournamentLink url={url} />);

  const button = screen.getByRole("button", { name: "Copy tournament link" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Link copied"));

  await act(async () => rejectFirst(new Error("First copy failed")));
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
