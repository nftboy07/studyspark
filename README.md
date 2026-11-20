# ⚡ StudySpark

**Paste your study text — get flashcards, a quiz, and a one-paragraph summary. All AI runs through Firebase AI Logic, using hybrid inference: on-device Gemini Nano when available, cloud Gemini as the fallback.**

Built by **Crypto Relic** for the **BuildHybridAI — Firebase Hybrid AI Hackathon** (Devpost).

---

## The problem

Students revise from dense chapters and lecture notes, but turning raw text into good study material — flashcards, self-test questions, a tight summary — is slow, manual work. StudySpark does that transformation in one click, privately and fast, by leaning on the hybrid inference built into Firebase AI Logic.

## What it does

Paste any study text (a chapter, lecture notes, an article) and StudySpark generates:

1. **📝 A one-paragraph summary** — 80–120 words, written for last-minute revision.
2. **🃏 Six flashcards** — click to flip, front = question/term, back = answer/definition.
3. **❓ A five-question multiple-choice quiz** — with instant scoring and an explanation for every answer.

Plus a control judges rarely see elsewhere: an **inference-mode selector** that lets the user pick how Firebase AI Logic routes each request — *prefer on-device*, *prefer cloud*, *on-device only*, or *cloud only* — so the hybrid behaviour is visible and testable, not just a claim in the README.

## How the hybrid inference works

StudySpark uses the **Firebase AI Logic web SDK** (`firebase/ai`, loaded from the official Firebase CDN) with the Gemini Developer API backend:

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode }
  from "https://www.gstatic.com/firebasejs/12.5.0/firebase-ai.js";

const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,          // ← the hybrid switch
  inCloudParams: { model: "gemini-3.5-flash-lite" } // cloud model for mode-based requests
});
const result = await model.generateContent(prompt);
```

- **On-device path:** On Chrome desktop (v139+) with Gemini Nano available, the SDK serves the request locally through Chrome's built-in model (Prompt API). The text never leaves the machine — faster, offline-capable, and private.
- **Cloud fallback:** When no on-device model is available (other browsers, unsupported hardware, model not yet downloaded), the *same* `generateContent()` call is served by the cloud model configured in `config.js` (currently **Gemini 3.5 Flash-Lite**, passed via `inCloudParams`) through Firebase AI Logic. No code changes, no API key embedded in the page — Firebase AI Logic brokers the request (with App Check protecting it).
- **The other modes** map to the remaining `InferenceMode` values: `PREFER_IN_CLOUD`, `ONLY_ON_DEVICE` (throws if Nano is unavailable), and `ONLY_IN_CLOUD`.

All three features (summary, flashcards, quiz) are single-turn text generation — exactly the workload on-device inference supports — and the structured outputs (flashcards and quiz) are requested as JSON and parsed defensively in the client.

## Setup — go live in ~5 minutes

No build step. The app is plain HTML/CSS/JS.

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com).
2. **Enable AI Logic**: in the console go to **Build → AI Logic** and get started with the **Gemini Developer API** backend. (The console flow also sets up Firebase App Check enforcement for AI Logic.)
3. **Register a Web app** in the project (Project settings → *Your apps* → Web) and copy its `firebaseConfig` object.
4. **Paste the config** into [`config.js`](config.js), replacing every `REPLACE_ME` placeholder.
5. **Serve the folder** any static way:
   - `python3 -m http.server 8000` then open `http://localhost:8000`, or
   - deploy to **Firebase Hosting** (`firebase deploy --only hosting`) or **GitHub Pages**.
6. Reload — the header badge flips from *"Demo mode"* to *"Live — Firebase AI Logic"* automatically.

> Tip for seeing the on-device path: use Chrome desktop on a machine where Gemini Nano is available, keep the default *Hybrid — prefer on-device* mode, and watch the same generation succeed with the network cable metaphorically (and literally) pulled.

## Demo mode — honest disclosure

The **public demo deployment ships the project's real Firebase web config** (public-by-design values, protected by App Check + Firebase security rules), so the live site generates everything live. A **fresh clone with placeholder config values** instead runs in **demo mode**:

- A banner states plainly: *"Demo mode — connect Firebase to go live."*
- **No SDK is loaded and no AI call is made.**
- The output shown is **canned sample output** (a study set about photosynthesis), and every output section carries a *"Sample output — demo mode"* label.

Once a real Firebase config is pasted into `config.js`, demo mode switches off automatically and **all** output is generated live from the user's own text by Firebase AI Logic. Nothing in the live path is mocked: the summary, flashcards, and quiz come from three real `generateContent()` calls, and failures surface as visible errors rather than silently falling back to canned data.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and UI |
| `styles.css` | All styling (no frameworks, no external assets) |
| `config.js` | Firebase config + cloud model name (the public demo ships the real public-by-design web config; replace with placeholders to force demo mode) |
| `app.js` | Firebase AI Logic integration, demo-mode logic, rendering, quiz scoring |
| `SUBMISSION.md` | Devpost submission draft and pre-submit checklist |

## Tech

- **Firebase AI Logic** (web SDK, `firebase/ai`) — the only AI path, per the hackathon rules
- **Gemini Nano** (on-device, via Chrome's Prompt API through the SDK) + **Gemini 3.5 Flash-Lite** (cloud, via `inCloudParams`)
- Vanilla HTML/CSS/JS — no framework, no bundler, no build step
- Static hosting anywhere (Firebase Hosting / GitHub Pages / any file server)

## Privacy note

In hybrid mode with on-device inference available, study text is processed on the user's own machine. When the SDK falls back to the cloud, text is sent to Gemini via Firebase AI Logic. StudySpark itself stores nothing: no accounts, no database, no analytics — text lives only in the page.
