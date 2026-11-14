# Healix: the complete guide

A plain-language guide to what Healix is, how it works, what it runs on, and the questions people usually ask.

---

## 1. What is Healix?

Healix is a web app that helps a patient in India get from "I feel unwell" to "I am sitting with the right doctor", and then helps them understand their medical reports.

It does **guidance, not diagnosis**. It never tells a person what disease they have and never suggests medicines or doses. The doctor decides.

**Who uses it**
- **Patients and their families.** One account can hold several people (for example a mother and a child).
- **Hospital front-desk staff.** They see live queues, delays and incoming emergencies.

**Languages:** English, Hindi, Marathi and Hinglish (Hindi written in English letters).

---

## 2. What it does

| # | Feature | In one line |
|---|---|---|
| 1 | **Describe symptoms** | Speak or type. Healix suggests the right kind of specialist and how urgent it is. |
| 2 | **Emergency help** | Danger signs trigger an emergency screen: call 102, nearest emergency hospital, share details. |
| 3 | **Find a doctor** | Pick specialty, date and time. Doctors are ranked by wait, distance, language, fee and rating. |
| 4 | **Book and get a token** | A digital queue ticket with "leave home in N minutes" and live queue position. |
| 5 | **Swap places** | Ask the person ahead to swap tokens. Only token numbers are shown, never names. |
| 6 | **Upload reports** | Photo, PDF, scanned PDF, Word or text file, up to 50 MB. |
| 7 | **Check and confirm values** | Healix shows what it read. The patient fixes anything wrong before anything is explained. |
| 8 | **Explain the report** | Plain words, a range bar for each flagged value, and questions to ask the doctor. |
| 9 | **Healix AI chatbot** | Ask about your report or a health word. It also says hello and chats. |
| 10 | **Community** | Anonymous posts and replies about health topics. Phone numbers, links and doses are blocked. |
| 11 | **Family profiles** | Each person has their own reports, tokens and settings. |
| 12 | **Large text mode** | Bigger text, bigger buttons, a simpler home screen. |
| 13 | **Voice** | Speak your question, and listen to answers. |
| 14 | **Hospital dashboard** | Live queues, break and delay controls, walk-ins, pre-alerts, analytics. |

---

## 3. How it works (the big picture)

```
Patient's browser (React app)
        |
        |  /api  (one address for everything)
        v
Healix server (Hono, Node.js)
   |-- Queue and booking engine      (wait-time prediction, tokens, swaps)
   |-- Triage rules                  (symptoms -> specialist + urgency)
   |-- Report reader                 (OCR + PDF + Word + text)
   |-- Vector index                  (report text split into chunks)
   |-- Groq  ----------------------> writes chatbot answers   (external)
   |-- Sarvam ---------------------> voice and translation    (external)
   |
   v
Saved data on disk (server/data/local)
```

The browser never talks to Groq or Sarvam directly. Only the server does, so the keys stay hidden.

---

## 4. The report chatbot, in simple steps

This idea is called **RAG** (retrieval-augmented generation). It means "look things up first, then answer".

1. **Read.** When a report is confirmed, Healix collects its text (OCR for photos, text layer for PDFs).
2. **Chunk.** The text is cut into small pieces of about 480 characters. The cutting is **recursive**: it tries paragraph breaks first, then lines, then sentences, then words, and only cuts mid-word as a last resort. A little overlap keeps context between pieces.
3. **Store.** Each piece is turned into a list of numbers (a vector) and saved in a small **vector store** on disk (`vectors.json`).
4. **Search.** When someone asks a question, Healix turns it into numbers the same way and finds the closest pieces of *that person's* reports.
5. **Answer.** The question and those pieces go to **Groq**, which writes a short answer and marks which piece it used with `[1]`, `[2]`. Tapping a marker shows the exact piece of the report.
6. **Safety check.** The answer is scanned for diagnosis wording ("you have diabetes") and doses ("500 mg"). If it fails, Healix asks once more, then falls back to its built-in answer.

**Without a Groq key** the chatbot still works: it uses a built-in glossary of 18 tests and 5 terms (in 4 languages) and can quote the closest part of the report.

---

## 5. Tech stack

| Part | What we use | Why |
|---|---|---|
| Frontend | React 19, TypeScript (strict), Vite | Fast, safe, familiar |
| Styling | Tailwind CSS 4 with design tokens | One consistent look |
| Pages and data | React Router 7, TanStack Query, Zustand | Routing, server data, small global state |
| UI parts | Radix UI, Lucide icons, Motion, Recharts | Accessible dialogs, icons, animation, charts |
| Languages | i18next (4 languages) | Translations |
| Validation | Zod | Checks every API message |
| Server | Node.js, Hono | Small and quick |
| Report reading | tesseract.js (OCR), pdfjs-dist (PDF), @napi-rs/canvas (draw scanned pages) | Works offline, no extra service |
| Chatbot AI | **Groq** (model `openai/gpt-oss-120b`) | Fast answers |
| Voice and language | **Sarvam AI** (speech-to-text, text-to-speech, translate) | Built for Indian languages |
| Tests | Vitest, Playwright, axe-core | Unit, browser and accessibility tests |

**Code layout**
- `src/core`: logic with no screen code (API types, rules, i18n, stores).
- `src/web`: the screens and components.
- `server/`: the API, queue engine, report reader, chatbot, Sarvam connection.

---

## 6. API keys and settings

**Healix needs 2 API keys.** Both are optional: the app still runs without them.

| Key | For | Where to get it | Required? |
|---|---|---|---|
| `GROQ_API_KEY` | Chatbot answers | console.groq.com | No. Without it the built-in reader answers. |
| `SARVAM_API_KEY` | Voice (mic, Listen) and translation | dashboard.sarvam.ai | No. Without it voice and translation are off. |

**Other settings (not keys)**
- `GROQ_MODEL`: the Groq model name, for example `openai/gpt-oss-120b`.
- `SARVAM_STT_MODEL` (`saaras:v3`) and `SARVAM_TTS_MODEL` (`bulbul:v4-flash`): speech models.
- `DATA_MODE`: `mock`, `local` or `live` (see below).
- `AUTH_CODE`: the 6-digit sign-in code used in local mode (for example `424242`).
- `STAFF_PHONES`: hospital staff phone numbers, like `9000000001:karve`.

All of these live in one file: `server/.env`. It is never uploaded to GitHub and never put in the browser. Run `npm run check:keys` to test your keys and model names.

---

## 7. The three data modes

| Mode | What it is | Use it for |
|---|---|---|
| `mock` | Built-in demo data (80 doctors, 6 Pune hospitals, sample reports). Sign-in code `123456`. | Demos |
| `local` | A real backend that saves everything to `server/data/local`. Reads your real uploaded reports. | Real testing on one computer |
| `live` | Passes requests on to a teammate's backend and AI services. | Joining the full team system |

---

## 8. Safety and privacy rules

- No diagnosis. No medicine names or doses. For anything serious: "see a doctor".
- The patient **must confirm** report values before they are explained.
- Reports are visible only to the account that owns them.
- Health data is **never** saved in the browser. Only language and large-text choice are.
- Red is used only for emergency screens.
- Community posts are anonymous and checked for phone numbers, emails, links and doses.
- Emergency number shown is **102** (note: the national ambulance number is 108; this is a team decision).

---

## 9. Run it (short version)

```powershell
npm install
Copy-Item server\.env.example server\.env
npm run check:keys
npm run dev
```

Open `http://localhost:5173`. In local mode sign up with any phone number and the code from `AUTH_CODE`.

Useful commands: `npm test` (unit tests), `npm run test:local` (browser tests on the real backend), `npm run test:groq` (chatbot test with a stand-in Groq), `npm run check:keys`.

---

## 10. Honest limits (good to say out loud)

- **Doctors and hospitals are dummy data** (80 doctors, 6 hospitals in Pune).
- **Triage is rule-based**, not a trained model. It is predictable and safe, but limited.
- **The vector search is simple**: word and character matching saved in a file, not a neural model or a cloud database. It is enough for single reports but is not built for huge scale.
- **No real text-message sign-in.** Local mode uses a fixed code. A real launch needs an SMS provider.
- **Data lives in files on one computer.** A real launch needs a proper database, backups and security review.
- **Hindi and Marathi wording** needs a native speaker's check.
- **iPhone HEIC photos** are not supported. Export as JPG.
- **Report reading** depends on image quality. That is why a human check step exists.

---

## 11. Questions and answers

**What problem does Healix solve?**
People do not know which specialist to see, wait a long time without knowing when their turn is, and cannot understand lab reports. Healix handles all three in their own language.

**Is it a diagnosis tool?**
No. It suggests a type of specialist and explains words in a report. It never names a disease for the patient and never suggests medicines. The doctor decides.

**How many API keys does it use?**
Two: Groq (chatbot answers) and Sarvam (voice and translation). Both are optional.

**Why Groq?**
It gives fast answers. We only use it to *write* a short, plain explanation from the report text we send it.

**Why Sarvam?**
It is built for Indian languages, so speech, listening and translation work well in Hindi and Marathi.

**What is RAG and why use it?**
RAG means "look up first, then answer". The chatbot answers from the patient's own report text instead of guessing from memory, so answers stay tied to the report and can show their source.

**What is recursive chunking?**
Cutting long text into small pieces by trying the biggest natural break first (paragraph), then line, sentence, word, and character only if needed. Pieces stay readable and keep their meaning.

**Is there a vector database?**
Yes, a simple one built in: each text piece is stored as a list of numbers in a file (`vectors.json`) and found by closeness. It is not an outside service like Pinecone.

**What happens if Groq is down or the key is wrong?**
The chatbot falls back to the built-in glossary and quotes the report. The server terminal prints the reason, for example `Groq returned 401`.

**What if the AI says something unsafe?**
Every Groq answer is scanned for diagnosis wording and doses. A failed answer is retried once, then replaced by the built-in answer. The system instructions also forbid diagnosis and medicines.

**Does the chatbot only talk about reports?**
It answers report questions, explains health words, greets, thanks and explains how to use Healix. It refuses clearly unrelated topics (like cricket) and anything about medicine doses.

**How does triage work?**
Rules match symptoms to a specialty and an urgency level. Danger signs (like chest pain with breathlessness) send the person straight to the emergency screen. It asks follow-up questions when needed.

**How is the waiting time predicted?**
From the live queue: patients ahead, how long this doctor usually takes per patient (observed, not just scheduled), delays and breaks. It shows a range and the reasons, for example "+8 min: doctor running late".

**How are reports read?**
Photos go through OCR (tesseract). PDFs use their text layer; scanned PDFs are drawn page by page and read like photos. Word and text files are read directly. Known tests (18 of them) are turned into values with ranges; anything else is kept as text.

**What if a report has none of the 18 known tests?**
It is still saved. The review screen says no standard values were found, the patient can confirm it, and the chatbot can still answer from its text.

**Which file types and what size?**
Photos (PNG, JPG, WebP, GIF, BMP, TIFF), PDF, Word (.docx) and text files, up to 50 MB.

**Where is my data stored? Is it private?**
On the server, in `server/data/local`. Only the account owner can open their reports. The browser stores only language and large-text choice, never health data. API keys stay on the server.

**Why is there a "confirm values" step?**
OCR can misread a digit. A wrong number could give a wrong explanation, so the patient checks first.

**Can the hospital use it?**
Yes. Staff sign in to a separate dashboard with live queues, delay and break controls, walk-in registration, emergency pre-alerts and simple analytics.

**What is the difference between mock, local and live?**
Mock is demo data. Local is a real, saving backend on one computer. Live forwards to the team's other services.

**How is it tested?**
Over 500 unit tests, about 175 browser tests (including accessibility checks and phone-width checks), a test that uses a stand-in Groq server, and a test that uses the real local backend with real report files.

**What would you build next?**
A real database and SMS sign-in, real hospital and doctor data, a stronger search model for reports, a trained triage model reviewed by doctors, and native-speaker review of Hindi and Marathi.

**Why use 102 as the emergency number?**
It was the team's decision. The national ambulance number is 108, so this should be reviewed before launch.
