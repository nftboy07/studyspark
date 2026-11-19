// ─────────────────────────────────────────────────────────────────────────────
// StudySpark — app logic
//
// Every AI call in this app goes through Firebase AI Logic (the firebase/ai
// web module). In hybrid mode the SDK runs Gemini Nano ON-DEVICE (Chrome
// desktop, via the Prompt API) when available and falls back to cloud Gemini
// otherwise — see getGenerativeModel() + InferenceMode below.
//
// If config.js still holds placeholder values, the app runs in DEMO MODE:
// no SDK is loaded, no AI call is made, and the UI shows canned sample
// output that is clearly labelled as such.
// ─────────────────────────────────────────────────────────────────────────────

// Pinned Firebase JS SDK version for the CDN (ESM) imports.
const FIREBASE_SDK_VERSION = "12.5.0";
const GSTATIC = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

// ── Config / mode detection ──────────────────────────────────────────────────

const firebaseConfig = window.STUDYSPARK_FIREBASE_CONFIG || {};
const CLOUD_MODEL = window.STUDYSPARK_CLOUD_MODEL || "gemini-2.5-flash";

function isPlaceholderConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return true;
  return ["apiKey", "authDomain", "projectId", "appId"].some(
    (k) => !cfg[k] || String(cfg[k]).includes("REPLACE_ME")
  );
}

const DEMO_MODE = isPlaceholderConfig(firebaseConfig);

// ── DOM handles ──────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const els = {
  badge: $("modeBadge"),
  demoBanner: $("demoBanner"),
  studyText: $("studyText"),
  sampleBtn: $("sampleBtn"),
  generateBtn: $("generateBtn"),
  inferenceMode: $("inferenceMode"),
  status: $("status"),
  summarySection: $("summarySection"),
  summaryText: $("summaryText"),
  flashcardsSection: $("flashcardsSection"),
  flashcardGrid: $("flashcardGrid"),
  quizSection: $("quizSection"),
  quizList: $("quizList"),
  checkQuizBtn: $("checkQuizBtn"),
  quizScore: $("quizScore"),
  sampleTags: [$("sampleTagSummary"), $("sampleTagFlashcards"), $("sampleTagQuiz")]
};

// ── Sample input + canned demo output (DEMO MODE ONLY, clearly labelled) ────

const SAMPLE_TEXT = `Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy stored in glucose. In plants it takes place mainly in the leaves, inside organelles called chloroplasts, which contain the green pigment chlorophyll.

The overall equation is: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2. In words, carbon dioxide and water, using energy from sunlight, produce glucose and oxygen.

Photosynthesis happens in two stages. The light-dependent reactions occur in the thylakoid membranes of the chloroplasts. There, light energy splits water molecules (photolysis), releasing oxygen, and produces ATP and NADPH. The light-independent reactions — the Calvin cycle — take place in the stroma. Using the ATP and NADPH from the first stage, the plant fixes carbon dioxide into glucose.

Several factors affect the rate of photosynthesis: light intensity, carbon dioxide concentration, and temperature. If any one of them is in short supply it becomes a limiting factor, capping the rate even if the others are abundant. Photosynthesis matters because nearly all life on Earth depends on it: it produces the oxygen we breathe and forms the base of almost every food chain.`;

const DEMO_RESULT = {
  summary:
    "Photosynthesis is how green plants turn sunlight into food: inside chloroplasts, the pigment chlorophyll captures light energy, which splits water and builds ATP and NADPH in the light-dependent reactions; the Calvin cycle then uses that energy to fix carbon dioxide into glucose, releasing oxygen. The rate is capped by whichever of light intensity, carbon dioxide concentration, or temperature is scarcest — the limiting factor. (This paragraph is canned sample output shown in demo mode.)",
  flashcards: [
    { front: "What is photosynthesis?", back: "The process by which green plants, algae and some bacteria convert light energy into chemical energy stored in glucose." },
    { front: "Where does photosynthesis happen in a plant cell?", back: "In chloroplasts — organelles containing the green pigment chlorophyll, found mainly in the leaves." },
    { front: "What is the overall equation for photosynthesis?", back: "6CO2 + 6H2O + light energy → C6H12O6 + 6O2 (carbon dioxide + water → glucose + oxygen)." },
    { front: "What do the light-dependent reactions produce?", back: "ATP and NADPH — and oxygen, released when water molecules are split (photolysis) in the thylakoid membranes." },
    { front: "What happens in the Calvin cycle?", back: "In the stroma, ATP and NADPH from the light-dependent stage are used to fix carbon dioxide into glucose." },
    { front: "What is a limiting factor?", back: "Whichever required input — light intensity, CO2 concentration or temperature — is in shortest supply; it caps the rate of photosynthesis even if the others are abundant." }
  ],
  quiz: [
    {
      question: "Which pigment captures the light energy used in photosynthesis?",
      options: ["Melanin", "Chlorophyll", "Haemoglobin", "Carotene (only)"],
      answerIndex: 1,
      explanation: "Chlorophyll, the green pigment inside chloroplasts, absorbs light energy."
    },
    {
      question: "The oxygen released during photosynthesis comes from…",
      options: ["Carbon dioxide", "Glucose", "Water molecules being split", "The air"],
      answerIndex: 2,
      explanation: "In the light-dependent reactions, photolysis splits water, releasing oxygen."
    },
    {
      question: "Where does the Calvin cycle take place?",
      options: ["Thylakoid membrane", "Stroma", "Mitochondria", "Nucleus"],
      answerIndex: 1,
      explanation: "The light-independent reactions (Calvin cycle) run in the stroma of the chloroplast."
    },
    {
      question: "Which pair of products from the light-dependent reactions powers the Calvin cycle?",
      options: ["ATP and NADPH", "Oxygen and glucose", "ADP and water", "CO2 and ATP"],
      answerIndex: 0,
      explanation: "ATP and NADPH carry the energy used to fix carbon into glucose."
    },
    {
      question: "If light and temperature are plentiful but CO2 is scarce, the rate of photosynthesis is limited by…",
      options: ["Light intensity", "Temperature", "Carbon dioxide concentration", "Oxygen levels"],
      answerIndex: 2,
      explanation: "The scarcest input is the limiting factor — here, carbon dioxide concentration."
    }
  ]
};

// ── Firebase AI Logic (live mode) ────────────────────────────────────────────

let modelPromise = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // Dynamic imports keep demo mode completely free of network/SDK loads.
      const appModule = await import(`${GSTATIC}/firebase-app.js`);
      const aiModule = await import(`${GSTATIC}/firebase-ai.js`);

      const app = appModule.initializeApp(firebaseConfig);

      // Firebase App Check: the project enforces App Check for AI Logic,
      // so requests without a valid token are rejected with HTTP 401.
      // When a reCAPTCHA v3 site key is configured, initialize App Check
      // before any AI call so every request carries a token.
      const siteKey = window.STUDYSPARK_RECAPTCHA_SITE_KEY;
      if (siteKey) {
        const appCheckModule = await import(`${GSTATIC}/firebase-app-check.js`);
        appCheckModule.initializeAppCheck(app, {
          provider: new appCheckModule.ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true
        });
      }

      const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend() });

      const params = { model: CLOUD_MODEL };
      // Hybrid inference: prefer on-device Gemini Nano, fall back to cloud.
      const modeKey = els.inferenceMode.value;
      if (aiModule.InferenceMode && aiModule.InferenceMode[modeKey]) {
        params.mode = aiModule.InferenceMode[modeKey];
        // When a mode is set, the SDK ignores the top-level `model` and
        // uses its built-in default cloud model — which in SDK 12.5.0 is
        // the retired gemini-2.0-flash-lite (HTTP 404). Per the Firebase
        // AI Logic hybrid configuration docs, the cloud-hosted model for
        // mode-based requests is set via inCloudParams.
        params.inCloudParams = { model: CLOUD_MODEL };
      }
      return aiModule.getGenerativeModel(ai, params);
    })();
  }
  return modelPromise;
}

async function generateText(prompt) {
  const model = await getModel();
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Pull a JSON array out of a model response (tolerates code fences / prose).
function parseJsonArray(text) {
  if (!text) throw new Error("Empty response from the model.");
  let t = text.trim().replace(/```(?:json)?/gi, "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON array.");
  }
  return JSON.parse(t.slice(start, end + 1));
}

async function generateLive(text) {
  const base =
    "You are a study assistant. Work ONLY from the study material below.\n\nSTUDY MATERIAL:\n" +
    text +
    "\n\n";

  const [summaryRaw, flashcardsRaw, quizRaw] = await Promise.all([
    generateText(
      base +
        "Write a one-paragraph summary of the material, 80–120 words, plain text only, " +
        "written for quick revision before an exam."
    ),
    generateText(
      base +
        'Create exactly 6 flashcards. Respond with ONLY a JSON array of objects ' +
        'in the form {"front": "question or term", "back": "answer or definition"}. ' +
        "No markdown, no commentary."
    ),
    generateText(
      base +
        "Create exactly 5 multiple-choice questions with 4 options each. Respond with ONLY " +
        'a JSON array of objects in the form {"question": "...", "options": ["...","...","...","..."], ' +
        '"answerIndex": 0, "explanation": "..."}. answerIndex is the 0-based index of the correct ' +
        "option. No markdown, no commentary."
    )
  ]);

  return {
    summary: summaryRaw.trim(),
    flashcards: parseJsonArray(flashcardsRaw),
    quiz: parseJsonArray(quizRaw)
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function showSampleTags(show) {
  els.sampleTags.forEach((t) => { if (t) t.hidden = !show; });
}

function renderSummary(summary) {
  els.summaryText.textContent = summary;
  els.summarySection.hidden = false;
}

function renderFlashcards(cards) {
  els.flashcardGrid.replaceChildren();
  cards.forEach((card) => {
    const outer = document.createElement("div");
    outer.className = "flashcard";
    const inner = document.createElement("div");
    inner.className = "flashcard-inner";
    const front = document.createElement("div");
    front.className = "flashcard-face flashcard-front";
    front.textContent = card.front ?? "";
    const back = document.createElement("div");
    back.className = "flashcard-face flashcard-back";
    back.textContent = card.back ?? "";
    inner.append(front, back);
    outer.append(inner);
    outer.addEventListener("click", () => outer.classList.toggle("flipped"));
    els.flashcardGrid.append(outer);
  });
  els.flashcardsSection.hidden = false;
}

let currentQuiz = [];

function renderQuiz(quiz) {
  currentQuiz = quiz;
  els.quizScore.textContent = "";
  els.quizList.replaceChildren();
  quiz.forEach((q, qi) => {
    const box = document.createElement("div");
    box.className = "quiz-q";
    const prompt = document.createElement("p");
    prompt.textContent = `${qi + 1}. ${q.question}`;
    box.append(prompt);
    const opts = document.createElement("div");
    opts.className = "quiz-options";
    (q.options || []).forEach((opt, oi) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-option";
      b.textContent = opt;
      b.dataset.q = String(qi);
      b.dataset.o = String(oi);
      b.addEventListener("click", () => {
        opts.querySelectorAll(".quiz-option").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
      });
      opts.append(b);
    });
    box.append(opts);
    const expl = document.createElement("p");
    expl.className = "quiz-explanation";
    expl.hidden = true;
    expl.textContent = q.explanation ? `Why: ${q.explanation}` : "";
    box.append(expl);
    els.quizList.append(box);
  });
  els.quizSection.hidden = false;
}

function checkQuiz() {
  let score = 0;
  currentQuiz.forEach((q, qi) => {
    const buttons = els.quizList.querySelectorAll(`.quiz-option[data-q="${qi}"]`);
    buttons.forEach((b) => {
      const oi = Number(b.dataset.o);
      b.classList.remove("correct", "wrong");
      if (oi === q.answerIndex) b.classList.add("correct");
      else if (b.classList.contains("selected")) b.classList.add("wrong");
      if (b.classList.contains("selected") && oi === q.answerIndex) score += 1;
    });
    const box = buttons[0]?.closest(".quiz-q");
    const expl = box?.querySelector(".quiz-explanation");
    if (expl && expl.textContent) expl.hidden = false;
  });
  els.quizScore.textContent = `You scored ${score} / ${currentQuiz.length}`;
}

function renderResult(result, isDemo) {
  showSampleTags(isDemo);
  renderSummary(result.summary);
  renderFlashcards(result.flashcards);
  renderQuiz(result.quiz);
}

// ── Main flow ────────────────────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

async function onGenerate() {
  const text = els.studyText.value.trim();
  if (text.length < 80) {
    setStatus("Paste a bit more study text first (at least a paragraph or two) — or load the sample text.", true);
    return;
  }
  els.generateBtn.disabled = true;
  try {
    if (DEMO_MODE) {
      setStatus("Demo mode: showing canned sample output (labelled below). Connect Firebase to generate from your text.");
      renderResult(DEMO_RESULT, true);
    } else {
      setStatus("Generating with Firebase AI Logic — hybrid inference (on-device Gemini Nano when available, cloud Gemini fallback)…");
      const result = await generateLive(text);
      renderResult(result, false);
      setStatus("Done — generated live with Firebase AI Logic.");
    }
  } catch (err) {
    console.error(err);
    setStatus(
      "Live generation failed: " + (err && err.message ? err.message : String(err)) +
        " — check that AI Logic is enabled for this Firebase project and that the config in config.js is correct.",
      true
    );
  } finally {
    els.generateBtn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  if (DEMO_MODE) {
    els.badge.textContent = "Demo mode";
    els.badge.className = "badge badge-demo";
    els.demoBanner.hidden = false;
  } else {
    els.badge.textContent = "Live — Firebase AI Logic";
    els.badge.className = "badge badge-live";
    els.demoBanner.hidden = true;
  }
  els.sampleBtn.addEventListener("click", () => {
    els.studyText.value = SAMPLE_TEXT;
    setStatus(DEMO_MODE ? "Sample text loaded. Hit “Generate study set” to see the (labelled) sample output." : "Sample text loaded. Hit “Generate study set”.");
  });
  els.generateBtn.addEventListener("click", onGenerate);
  els.checkQuizBtn.addEventListener("click", checkQuiz);
  // Changing the inference mode must rebuild the model with the new mode.
  els.inferenceMode.addEventListener("change", () => { modelPromise = null; });
}

init();
