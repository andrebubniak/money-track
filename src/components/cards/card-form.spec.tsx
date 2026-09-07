import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const { createCard, updateCard, replace, refresh, invalidateOptions } = vi.hoisted(() => ({
  createCard: vi.fn(),
  updateCard: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  invalidateOptions: vi.fn(),
}));

vi.mock("@/lib/actions/cards", () => ({ createCard, updateCard }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

// The real hook needs a QueryClient and would refetch; this spec only
// cares that a successful save asks the cached option lists to drop.
vi.mock("@/hooks/use-async-options", () => ({
  useInvalidateAsyncOptions: () => invalidateOptions,
}));

import { CardForm } from "@/components/cards/card-form";

const defaultValues = { name: "" };

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name/i), "Personal Visa");
  await user.click(screen.getByRole("radio", { name: /credit/i }));
}

describe("CardForm", () => {
  beforeEach(() => {
    createCard.mockReset();
    updateCard.mockReset();
    replace.mockReset();
    refresh.mockReset();
    invalidateOptions.mockReset();
    createCard.mockResolvedValue({ success: true });
    updateCard.mockResolvedValue({ success: true });
  });

  // A card saved here is expected in the transaction form's card field on
  // the very next click, not after its cached page goes stale.
  it("drops the cached option lists after a successful save", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() => expect(invalidateOptions).toHaveBeenCalled());
  });

  it("blocks submission and never calls the action when the name is too short", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await user.type(screen.getByLabelText(/^name/i), "ab");
    await user.click(screen.getByRole("radio", { name: /credit/i }));
    await user.click(screen.getByRole("button", { name: /create card/i }));

    expect(await screen.findByText("Name must be at least 3 characters.")).toBeInTheDocument();
    expect(createCard).not.toHaveBeenCalled();
  });

  it("blocks submission and never calls the action when no type is selected", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await user.type(screen.getByLabelText(/^name/i), "Personal Visa");
    await user.click(screen.getByRole("button", { name: /create card/i }));

    expect(await screen.findByText("Choose a card type.")).toBeInTheDocument();
    expect(createCard).not.toHaveBeenCalled();
  });

  it("calls createCard with the form values in create mode", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() => {
      expect(createCard).toHaveBeenCalledWith({ name: "Personal Visa", type: "CREDIT" }, "en-US");
    });
    expect(updateCard).not.toHaveBeenCalled();
  });

  it("forwards the active locale, not a hardcoded one", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />, "pt-BR");

    await user.type(screen.getByLabelText(/^nome/i), "Visa Pessoal");
    await user.click(screen.getByRole("radio", { name: /crédito/i }));
    await user.click(screen.getByRole("button", { name: /criar cartão/i }));

    await waitFor(() => {
      expect(createCard).toHaveBeenCalledWith(expect.anything(), "pt-BR");
    });
  });

  it("calls updateCard with the card id in edit mode, never createCard", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <CardForm mode="edit" cardId="card_123" defaultValues={{ name: "", type: "DEBIT" }} />,
    );

    await user.type(screen.getByLabelText(/^name/i), "Personal Visa");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCard).toHaveBeenCalledWith(
        "card_123",
        { name: "Personal Visa", type: "DEBIT" },
        "en-US",
      );
    });
    expect(createCard).not.toHaveBeenCalled();
  });

  it("redirects to the cards list on success", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cards"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the server error string directly, with no further translation", async () => {
    const user = userEvent.setup();
    createCard.mockResolvedValue({ success: false, error: "You already have 50 cards." });
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create card/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have 50 cards.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows the in-progress label while submitting", async () => {
    const user = userEvent.setup();
    createCard.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<CardForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create card/i }));

    expect(await screen.findByRole("button", { name: /creating…/i })).toBeDisabled();
  });

  it("shows the saving label in edit mode while submitting", async () => {
    const user = userEvent.setup();
    updateCard.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(
      <CardForm mode="edit" cardId="card_123" defaultValues={{ name: "", type: "DEBIT" }} />,
    );

    await user.type(screen.getByLabelText(/^name/i), "Personal Visa");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("button", { name: /saving…/i })).toBeDisabled();
  });
});
