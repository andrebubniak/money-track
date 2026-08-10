import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const { signUpEmail, replace, refresh } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { RegisterForm } from "@/components/auth/register-form";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
  await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
  await user.type(screen.getByLabelText(/^password$/i), "Hunter2hunter2");
  await user.type(screen.getByLabelText(/confirm password/i), "Hunter2hunter2");
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    replace.mockReset();
    refresh.mockReset();
    signUpEmail.mockResolvedValue({ error: null });
  });

  it("shows an error for every empty field", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RegisterForm />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Name must be at least 2 characters.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm your password.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("reports a password mismatch on the confirmation field", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
    await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Hunter2hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "something-else");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a password under eight characters", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
    await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("submits name, email and password but never the confirmation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signUpEmail).toHaveBeenCalledWith({
        name: "Ana Bubniak",
        email: "ana@example.com",
        password: "Hunter2hunter2",
      });
    });
  });

  it("redirects to the dashboard on success", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the duplicate-account error", async () => {
    const user = userEvent.setup();
    // This must stay USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, the code
    // better-auth's sign-up route actually throws (sign-up.mjs:208) — a
    // mock of the shorter, admin-plugin-only USER_ALREADY_EXISTS is what
    // hid the real mapping bug that the registration e2e test caught.
    signUpEmail.mockResolvedValue({
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    renderWithIntl(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the generic error when the call throws instead of returning one", async () => {
    const user = userEvent.setup();
    signUpEmail.mockRejectedValue(new Error("network down"));
    renderWithIntl(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("disables the button while the request is in flight", async () => {
    const user = userEvent.setup();
    signUpEmail.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("button", { name: /creating account/i })).toBeDisabled();
  });
});
