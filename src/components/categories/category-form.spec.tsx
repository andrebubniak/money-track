import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";
import type { CategoryValues } from "@/lib/validations/category";

const { createCategory, updateCategory, replace, refresh, invalidateOptions } = vi.hoisted(
  () => ({
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    invalidateOptions: vi.fn(),
  }),
);

vi.mock("@/lib/actions/categories", () => ({
  createCategory,
  updateCategory,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

// The real hook needs a QueryClient and would refetch; this spec only
// cares that a successful save asks the cached option lists to drop.
vi.mock("@/hooks/use-async-options", () => ({
  useInvalidateAsyncOptions: () => invalidateOptions,
}));

// The icon picker is exercised in full in icon-picker.spec.tsx. Here it is
// reduced to a single button that reports a fixed icon key, so these tests
// stay about the form's own behavior — wiring, submission, and error
// handling — not the picker's search/grid UI.
vi.mock("@/components/categories/icon-picker", () => ({
  IconPicker: ({ value, onChange }: { value: string; onChange: (icon: string) => void }) => (
    <button type="button" onClick={() => onChange("pizza")} data-current-icon={value}>
      mock icon picker
    </button>
  ),
}));

import { CategoryForm } from "@/components/categories/category-form";

const defaultValues: CategoryValues = { name: "", icon: "house", description: "" };

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name/i), "Groceries");
}

describe("CategoryForm", () => {
  beforeEach(() => {
    createCategory.mockReset();
    updateCategory.mockReset();
    replace.mockReset();
    refresh.mockReset();
    invalidateOptions.mockReset();
    createCategory.mockResolvedValue({ success: true });
    updateCategory.mockResolvedValue({ success: true });
  });

  it("blocks submission and never calls the action when the name is too short", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await user.type(screen.getByLabelText(/^name/i), "ab");
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText("Name must be at least 3 characters.")).toBeInTheDocument();
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("calls createCategory with the form values in create mode", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith(
        { name: "Groceries", icon: "house", description: undefined },
        "en-US",
      );
    });
    expect(updateCategory).not.toHaveBeenCalled();
  });

  // A category saved here is expected in the transaction form's category
  // field on the very next click; without this the field keeps serving its
  // cached page and the new category is simply missing.
  it("drops the cached option lists after a successful save", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await waitFor(() => expect(invalidateOptions).toHaveBeenCalled());
  });

  it("leaves the cached option lists alone when the save fails", async () => {
    createCategory.mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(invalidateOptions).not.toHaveBeenCalled();
  });

  it("forwards the active locale, not a hardcoded one", async () => {
    const user = userEvent.setup();
    // Rendered in pt-BR specifically so this fails if the locale is ever
    // hardcoded or dropped. The action cannot resolve its own locale — see
    // the header comment in `src/lib/actions/categories.ts` — so a wrong
    // value here means a Brazilian user reads English error messages.
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />, "pt-BR");

    await user.type(screen.getByLabelText(/^nome/i), "Groceries");
    await user.click(screen.getByRole("button", { name: /criar categoria/i }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith(expect.anything(), "pt-BR");
    });
  });

  it("calls updateCategory with the category id in edit mode, never createCategory", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <CategoryForm mode="edit" categoryId="cat_123" defaultValues={defaultValues} />,
    );

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith(
        "cat_123",
        { name: "Groceries", icon: "house", description: undefined },
        "en-US",
      );
    });
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("redirects to the categories list on success", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/categories"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the server error string directly, with no further translation", async () => {
    const user = userEvent.setup();
    createCategory.mockResolvedValue({ success: false, error: "You already have 50 categories." });
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have 50 categories.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("updates the form's icon value when the icon picker reports a new selection", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /mock icon picker/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith(
        { name: "Groceries", icon: "pizza", description: undefined },
        "en-US",
      );
    });
  });

  it("disables the submit button and shows the in-progress label while submitting", async () => {
    const user = userEvent.setup();
    createCategory.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<CategoryForm mode="create" defaultValues={defaultValues} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByRole("button", { name: /creating…/i })).toBeDisabled();
  });

  it("shows the saving label in edit mode while submitting", async () => {
    const user = userEvent.setup();
    updateCategory.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(
      <CategoryForm mode="edit" categoryId="cat_123" defaultValues={defaultValues} />,
    );

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("button", { name: /saving…/i })).toBeDisabled();
  });
});
