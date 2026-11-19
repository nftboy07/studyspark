// ─────────────────────────────────────────────────────────────────────────────
// StudySpark — Firebase project configuration
//
// HOW TO GO LIVE:
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. In the project, enable "AI Logic" (Build → AI Logic) with the
//      Gemini Developer API backend.
//   3. Register a Web app in the project and copy its firebaseConfig values
//      into the object below, replacing every REPLACE_ME placeholder.
//   4. Reload the page — StudySpark detects a real config automatically and
//      switches from demo mode to live Firebase AI Logic inference.
//
// Until every value below is replaced, the app runs in DEMO MODE with
// clearly labelled canned sample output. No AI calls are made in demo mode.
// ─────────────────────────────────────────────────────────────────────────────

window.STUDYSPARK_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDlxkFbSa0a6rYj18fP_fJf8c8pNcCpe1Y",
  authDomain: "studyspark-1157b.firebaseapp.com",
  projectId: "studyspark-1157b",
  storageBucket: "studyspark-1157b.firebasestorage.app",
  messagingSenderId: "522209588840",
  appId: "1:522209588840:web:416a8842b93c86ccea2ddd"
};

// Cloud model used when Firebase AI Logic routes a request to the cloud
// (and the model family paired with on-device Gemini Nano in hybrid mode).
window.STUDYSPARK_CLOUD_MODEL = "gemini-2.5-flash";
