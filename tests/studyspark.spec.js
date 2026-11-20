// End-to-end tests for StudySpark. Gemini responses are mocked by intercepting
// generateContent requests, so no real AI calls (or App Check token) are needed.
const { test, expect } = require("@playwright/test");

const FLASHCARDS = Array.from({ length: 6 }, (_, i) => ({
  front: `Card ${i + 1} front`,
  back: `Card ${i + 1} back`
}));
const QUIZ = Array.from({ length: 5 }, (_, i) => ({
  question: `Question ${i + 1}?`,
  options: ["Right", "Wrong A", "Wrong B", "Wrong C"],
  answerIndex: 0,
  explanation: `Explanation ${i + 1}`
}));
const SUMMARY = "Mocked summary of the study text.";

async function mockGemini(page) {
  const calls = [];
  await page.route("**/*:generateContent*", async (route) => {
    const body = route.request().postData() || "";
    let text = SUMMARY;
    if (body.includes("flashcards")) text = JSON.stringify(FLASHCARDS);
    else if (body.includes("multiple-choice")) text = JSON.stringify(QUIZ);
    calls.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }]
      })
    });
  });
  return calls;
}

// Simulates Chrome builds where the Prompt API exists but availability() never settles.
async function hangOnDeviceCheck(page) {
  await page.addInitScript(() => {
    window.LanguageModel = {
      availability: () => new Promise(() => {}),
      create: () => new Promise(() => {})
    };
  });
}

async function useDemoConfig(page) {
  await page.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.STUDYSPARK_FIREBASE_CONFIG = {
        apiKey: "REPLACE_ME", authDomain: "REPLACE_ME", projectId: "REPLACE_ME",
        storageBucket: "REPLACE_ME", messagingSenderId: "REPLACE_ME", appId: "REPLACE_ME"
      };
      window.STUDYSPARK_CLOUD_MODEL = "gemini-3.5-flash-lite";
      window.STUDYSPARK_RECAPTCHA_SITE_KEY = "";`
    })
  );
}

async function generate(page, mode) {
  await page.getByRole("button", { name: "Load sample text" }).click();
  if (mode) await page.locator("#inferenceMode").selectOption(mode);
  await page.locator("#generateBtn").click();
}

async function expectStudySet(page, timeout = 5_000) {
  await expect(page.locator("#summaryText")).toHaveText(SUMMARY, { timeout });
  await expect(page.locator(".flashcard")).toHaveCount(6);
  await expect(page.locator(".quiz-q")).toHaveCount(5);
  await expect(page.locator("#generateBtn")).toBeEnabled();
}

test.describe("demo mode", () => {
  test("shows labelled sample output", async ({ page }) => {
    await useDemoConfig(page);
    await page.goto("/");
    await expect(page.locator("#modeBadge")).toHaveText("Demo mode");
    await expect(page.locator("#demoBanner")).toBeVisible();
    await generate(page);
    await expect(page.locator(".flashcard")).toHaveCount(6);
    await expect(page.locator(".quiz-q")).toHaveCount(5);
    await expect(page.locator(".sample-tag:visible")).toHaveCount(3);
  });

  test("rejects too-short input", async ({ page }) => {
    await useDemoConfig(page);
    await page.goto("/");
    await page.locator("#studyText").fill("too short");
    await page.locator("#generateBtn").click();
    await expect(page.locator("#status")).toHaveClass(/error/);
    await expect(page.locator("#summarySection")).toBeHidden();
  });
});

test.describe("live mode (mocked Gemini)", () => {
  test("cloud only renders a study set; flashcards flip and quiz scores", async ({ page }) => {
    await mockGemini(page);
    await page.goto("/");
    await expect(page.locator("#modeBadge")).toHaveText("Live — Firebase AI Logic");
    await generate(page, "ONLY_IN_CLOUD");
    await expectStudySet(page);
    await expect(page.locator("#status")).toHaveText("Done — generated live with Firebase AI Logic.");

    const card = page.locator(".flashcard").first();
    await card.click();
    await expect(card).toHaveClass(/flipped/);

    const questions = page.locator(".quiz-q");
    await questions.nth(0).getByRole("button", { name: "Right" }).click();
    await questions.nth(1).getByRole("button", { name: "Right" }).click();
    await questions.nth(2).getByRole("button", { name: "Wrong A" }).click();
    await page.getByRole("button", { name: "Check answers" }).click();
    await expect(page.locator("#quizScore")).toHaveText("You scored 2 / 5");
    await expect(page.locator(".quiz-option.wrong")).toHaveCount(1);
  });

  test("prefer on-device without the Prompt API uses cloud", async ({ page }) => {
    await page.addInitScript(() => { delete window.LanguageModel; });
    await mockGemini(page);
    await page.goto("/");
    await generate(page, "PREFER_ON_DEVICE");
    await expectStudySet(page);
  });
});

test.describe("hanging on-device availability check", () => {
  for (const mode of ["PREFER_ON_DEVICE", "PREFER_IN_CLOUD"]) {
    test(`${mode} falls back to cloud after the timeout`, async ({ page }) => {
      await hangOnDeviceCheck(page);
      await mockGemini(page);
      await page.goto("/");
      const started = Date.now();
      await generate(page, mode);
      await expectStudySet(page, 15_000);
      expect(Date.now() - started).toBeLessThan(15_000);
      await expect(page.locator("#status")).toContainText(
        "on-device check timed out after 5 s, so cloud Gemini was used"
      );
    });
  }

  test("ONLY_ON_DEVICE fails with a clear error instead of hanging", async ({ page }) => {
    await hangOnDeviceCheck(page);
    const calls = await mockGemini(page);
    await page.goto("/");
    await generate(page, "ONLY_ON_DEVICE");
    await expect(page.locator("#status")).toHaveClass(/error/, { timeout: 15_000 });
    await expect(page.locator("#status")).toContainText("did not respond within 5 s");
    await expect(page.locator("#generateBtn")).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  test("switching to cloud only after a timeout works without reload", async ({ page }) => {
    await hangOnDeviceCheck(page);
    await mockGemini(page);
    await page.goto("/");
    await generate(page, "ONLY_ON_DEVICE");
    await expect(page.locator("#status")).toHaveClass(/error/, { timeout: 15_000 });
    await page.locator("#inferenceMode").selectOption("ONLY_IN_CLOUD");
    await page.locator("#generateBtn").click();
    await expectStudySet(page);
    await expect(page.locator("#status")).toHaveText("Done — generated live with Firebase AI Logic.");
  });
});
