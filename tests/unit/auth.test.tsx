import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isAllowedEmail, isDemoEmail } from "@/lib/auth/allowlist";
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

  test("accepts the demo email when DEMO_USER_EMAIL is set", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isAllowedEmail("  Demo@Marathon.INVALID ")).toBe(true);
  });

  test("rejects the demo email when DEMO_USER_EMAIL is unset", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "");
    expect(isAllowedEmail("demo@marathon.invalid")).toBe(false);
  });
});

describe("isDemoEmail", () => {
  test("matches DEMO_USER_EMAIL case-insensitively, trimmed", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isDemoEmail("  Demo@Marathon.INVALID ")).toBe(true);
  });

  test("never matches the owner email", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isDemoEmail("max.allaire@gmail.com")).toBe(false);
  });

  test("matches nothing when DEMO_USER_EMAIL is unset", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "");
    expect(isDemoEmail("demo@marathon.invalid")).toBe(false);
    expect(isDemoEmail("")).toBe(false);
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
