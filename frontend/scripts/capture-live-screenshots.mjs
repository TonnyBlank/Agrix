import { chromium } from "playwright";

const appUrl = "https://agri-link-nexus.base44.app";
const email = process.env.AGRILINK_CAPTURE_EMAIL;
const password = process.env.AGRILINK_CAPTURE_PASSWORD;

if (!email || !password) {
  throw new Error("Set AGRILINK_CAPTURE_EMAIL and AGRILINK_CAPTURE_PASSWORD.");
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
];

const routes = [
  { name: "home", path: "/" },
  { name: "farm", path: "/farm" },
  { name: "my-products", path: "/my-products" },
  { name: "marketplace", path: "/marketplace" },
  { name: "calendar", path: "/calendar" },
  { name: "performance", path: "/performance" },
  { name: "loans", path: "/loans" },
  { name: "messages", path: "/messages" },
  { name: "scanner", path: "/scanner" },
  { name: "cart", path: "/cart" },
  { name: "orders", path: "/orders" },
  { name: "notifications", path: "/notifications" },
  { name: "profile", path: "/profile" },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    await page.screenshot({
      path: `screenshots/live-app/${viewport.name}-00-login.png`,
      fullPage: true,
    });

    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
    await settle(page);

    for (const [index, route] of routes.entries()) {
      await page.goto(`${appUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await settle(page);
      const sequence = String(index + 1).padStart(2, "0");
      await page.screenshot({
        path: `screenshots/live-app/${viewport.name}-${sequence}-${route.name}.png`,
        fullPage: true,
      });
      console.log(`${viewport.name}: ${route.path}`);
    }

    await context.close();
  }
} finally {
  await browser.close();
}
