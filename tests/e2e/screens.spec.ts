import { expect, test } from "@playwright/test";

// RTL, reduced motion, mobile and visual snapshots of the public screens.
test("html is Arabic RTL", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("reduced motion: welcome renders its final state immediately, no loops", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const stage = page.locator(".welcome-desktop");
  // Final frame: every word fully visible, wink pose shown, CTA present.
  const words = stage.locator('[data-a="word"]');
  await expect(words).toHaveCount(6);
  for (const op of await words.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))) expect(op).toBe("1");
  expect(await stage.locator('[data-a="poseB"]').evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) === Infinity).length,
  );
  expect(running).toBe(0);
  await expect(page.getByRole("status")).toHaveAttribute("aria-label", "أهلًا يا صديقي، أنا هنا لمساعدتك.");
  await expect(page).toHaveScreenshot("welcome-desktop-final.png");
  await ctx.close();
});

test("welcome plays on every visit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".welcome")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".welcome")).toBeVisible();
});

test("Esc skips the welcome animation; CTA leads to login", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Escape");
  await expect(page.locator(".welcome")).toHaveAttribute("data-done", "true");
  await page.locator(".welcome-desktop").getByRole("link", { name: "الدخول إلى لوحتك" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

for (const [name, viewport, scheme] of [
  ["login-desktop-dark", { width: 1280, height: 800 }, "dark"],
  ["login-desktop-light", { width: 1280, height: 800 }, "light"],
  ["login-mobile-dark", { width: 390, height: 844 }, "dark"],
] as const) {
  test(`snapshot: ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "الدخول إلى لوحتك" })).toBeVisible();
    // No horizontal scrolling on mobile.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page).toHaveScreenshot(`${name}.png`);
    await ctx.close();
  });
}

test("welcome on mobile: stage fits, no horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator(".welcome-mobile")).toBeVisible();
  await expect(page.locator(".welcome-desktop")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page).toHaveScreenshot("welcome-mobile-final.png");
  await ctx.close();
});

test("security headers are present", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("unknown page → 404 page", async ({ page }) => {
  const r = await page.goto("/no-such-page");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "هذه الصفحة غير موجودة" })).toBeVisible();
});

test("admin pages require an admin session", async ({ page }) => {
  for (const p of ["/admin/clients", "/admin/clients/00000000-0000-0000-0000-000000000000", "/admin/security"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/admin\/(login|setup)$/);
  }
});
