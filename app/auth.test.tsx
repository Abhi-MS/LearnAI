import React, { forwardRef, useImperativeHandle } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate from "./auth-gate";
import AuthButton from "./auth-button";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("../lib/supabase-browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: mocks }),
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: forwardRef(function MockTurnstile(
    { onSuccess, onExpire }: { onSuccess: (token: string) => void; onExpire: () => void },
    ref: React.ForwardedRef<{ reset: () => void }>,
  ) {
    useImperativeHandle(ref, () => ({ reset: mocks.reset }));
    return (
      <div>
        <button type="button" onClick={() => onSuccess("captcha-token")}>Verify CAPTCHA</button>
        <button type="button" onClick={onExpire}>Expire CAPTCHA</button>
      </div>
    );
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.signInAnonymously.mockResolvedValue({ data: { session: {} }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("guest authentication", () => {
  it("requires a fresh CAPTCHA token and passes it to Supabase", async () => {
    render(<AuthGate><p>App</p></AuthGate>);
    const guest = await screen.findByRole("button", { name: "Continue as guest" });
    expect(guest).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Verify CAPTCHA" }));
    expect(guest).toBeEnabled();
    fireEvent.click(guest);
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "captcha-token" } }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalled());
    expect(guest).toBeDisabled();
  });

  it("clears expired tokens and reports guest sign-in failures", async () => {
    mocks.signInAnonymously.mockResolvedValueOnce({ data: { session: null }, error: new Error("Guest sign-in failed") });
    render(<AuthGate><p>App</p></AuthGate>);
    const guest = await screen.findByRole("button", { name: "Continue as guest" });
    fireEvent.click(screen.getByRole("button", { name: "Verify CAPTCHA" }));
    fireEvent.click(screen.getByRole("button", { name: "Expire CAPTCHA" }));
    expect(guest).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
    fireEvent.click(screen.getByRole("button", { name: "Verify CAPTCHA" }));
    fireEvent.click(guest);
    expect(await screen.findByRole("alert")).toHaveTextContent("Guest sign-in failed");
    expect(guest).toBeDisabled();
    expect(mocks.reset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify CAPTCHA" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Guest sign-in failed");
  });

  it("keeps Google sign-in available when CAPTCHA is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    render(<AuthGate><p>App</p></AuthGate>);
    expect(await screen.findByRole("alert")).toHaveTextContent("CAPTCHA is not configured");
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Continue as guest" })).not.toBeInTheDocument();
  });

  it("warns before signing out a guest and preserves the leave hook", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { is_anonymous: true, user_metadata: {} } } });
    const onSignOutRequest = vi.fn();
    render(<AuthButton onSignOutRequest={onSignOutRequest} />);
    expect(await screen.findByText("Guest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("group", { name: "Confirm guest sign out" })).toHaveTextContent("permanently loses access");
    expect(onSignOutRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out anyway" }));
    expect(onSignOutRequest).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await act(async () => { onSignOutRequest.mock.calls[0][0](); });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
