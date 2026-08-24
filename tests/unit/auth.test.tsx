import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { SignInScreen } from "@/components/auth/SignInScreen";

afterEach(cleanup);

const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: { signInWithOtp, verifyOtp },
  }),
}));

describe("isAllowedEmail", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_EMAIL", "max.allaire@gmail.com");
  });

  test("matches case-insensitively, trimmed", () => {
    expect(isAllowedEmail("  Max.Allaire@GMAIL.com ")).toBe(true);
  });

  test("rejects any other address", () => {
    expect(isAllowedEmail("someone.else@gmail.com")).toBe(false);
  });

  test("rejects when ALLOWED_EMAIL is unset", () => {
    vi.stubEnv("ALLOWED_EMAIL", "");
    expect(isAllowedEmail("max.allaire@gmail.com")).toBe(false);
  });
});

describe("SignInScreen", () => {
  beforeEach(() => {
    signInWithOtp.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  test("renders the email step first", () => {
    render(<SignInScreen checkAllowedEmail={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByLabelText("EMAIL")).toBeInTheDocument();
    expect(screen.queryByLabelText("CODE")).not.toBeInTheDocument();
  });

  test("allowlisted email advances to the code step and calls signInWithOtp", async () => {
    render(<SignInScreen checkAllowedEmail={vi.fn().mockResolvedValue(true)} />);
    fireEvent.change(screen.getByLabelText("EMAIL"), { target: { value: "max.allaire@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "SEND CODE" }));

    await waitFor(() => expect(screen.getByLabelText("CODE")).toBeInTheDocument());
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "max.allaire@gmail.com",
      options: { shouldCreateUser: true },
    });
  });

  test("submitting a code calls verifyOtp with email, token, and type email", async () => {
    render(<SignInScreen checkAllowedEmail={vi.fn().mockResolvedValue(true)} />);
    fireEvent.change(screen.getByLabelText("EMAIL"), { target: { value: "max.allaire@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "SEND CODE" }));
    await waitFor(() => expect(screen.getByLabelText("CODE")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("CODE"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "VERIFY" }));

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: "max.allaire@gmail.com",
        token: "123456",
        type: "email",
      }),
    );
  });

  test("non-allowlisted email shows inline error and never calls signInWithOtp", async () => {
    render(<SignInScreen checkAllowedEmail={vi.fn().mockResolvedValue(false)} />);
    fireEvent.change(screen.getByLabelText("EMAIL"), { target: { value: "nope@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "SEND CODE" }));

    expect(await screen.findByText("NOT AUTHORIZED FOR THIS APP")).toBeInTheDocument();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
