import type { CDPSession, Page } from "@playwright/test";

/** A platform authenticator with user verification, as on a phone or laptop. */
export async function addAuthenticator(page: Page): Promise<{ cdp: CDPSession; id: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, id: authenticatorId };
}

export async function removeAuthenticator(a: { cdp: CDPSession; id: string }) {
  await a.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: a.id });
}
