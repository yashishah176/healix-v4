# Healix: the 4-minute pitch

**One line:** Healix takes you from "I feel unwell" to "I understand what my report says", in your own language, without ever pretending to be a doctor.

**Tagline options** (pick one and say it three times in the pitch):
- "From *I feel unwell* to *I understand*."
- "Right doctor. Right time. Plain words."

---

## Before you walk on

- Open the demo in **demo mode** (`DATA_MODE=mock`, sign-in code `123456`) and add `?fast=1` to the address so nothing waits.
- Sign in once before the pitch so you start on the Home screen.
- Zoom the browser to about 125% so the back row can read it.
- Keep a phone-width window or your phone ready for the large-text moment.
- Have a sample report ready (the app has built-in ones).
- Backup plan: screenshots of each step on a slide, in case the Wi-Fi fails.

---

## The pitch (about 4 minutes)

### 1. The hook: make them raise a hand (0:00 to 0:30)

> "Quick show of hands. Who here has ever **waited at a clinic with no idea when it's your turn**?"
> *(hands go up)*
> "Now keep your hand up if you've ever **got a lab report and just stared at it**."
> *(most hands stay up)*
> "Everyone with a hand up is who we built Healix for. And judges, you're allowed to keep yours up too."

*Smile. Pause. Let them laugh.*

### 2. The problem in three beats (0:30 to 1:00)

> "In India, getting care is three separate headaches.
> **One:** 'Which doctor do I even see?'
> **Two:** 'How long will I wait, and when should I leave home?'
> **Three:** 'What does this report mean?'
> And every answer you find online is in a language you're not comfortable with.
> **Healix fixes all three in one place, in English, Hindi, Marathi or Hinglish.**"

### 3. Live demo: let a judge drive (1:00 to 3:00)

Hand the first step to the panel. People remember what they take part in.

**Step A: "Give me a symptom."**
Ask a judge for a symptom and a language. Type or speak it on the Home screen.
> "Healix doesn't diagnose. It suggests **which kind of specialist** and **how urgent**. And if there's a real danger sign, it skips everything and goes straight to the emergency screen: call 102, nearest emergency hospital."

**Step B: "Pick a doctor."**
Show the ranked doctors: wait time, distance, language, fee.
> "Every doctor here is ranked on things that matter to a patient, not an ad budget. And look, the wait is a **range with reasons**, like 'plus 8 minutes, doctor running late'. Honest, not a fake number."

**Step C: "Your digital ticket."**
Book, then show the token screen.
> "This says **Leave home in 25 minutes**. No more sitting in a crowded waiting room for two hours. And if you need to swap places with the person ahead, you can ask, and **only token numbers are shown, never names**."

**Step D: "Now the report."**
Upload the sample report. Show the *Check the values* screen.
> "Cameras and OCR make mistakes, so **Healix never explains until you confirm what it read**. You stay in control."

Confirm, then show the explain screen with the range bar and "questions to ask your doctor".

**Step E: "Talk to it."**
Open Healix AI. Type **"hi"**.
> "It says hello. It's friendly, not a wall of warnings."

Then ask: **"Is my HbA1c high?"**
> "Watch this. It answers from **this patient's own report**, and see the little **[1]**? Tap it. That's the exact part of the report it used. **No guessing. Every answer has a receipt.**"

Last, ask the judge's silly question: **"Who won the cricket match?"**
> "And it politely says it only helps with health. Ask it about medicine doses, and it refuses too. **It will not play doctor.**"

**Step F: the mic-drop feature.**
Open Settings and switch on **Large text and simple screens**.
> "Now imagine this is a grandparent. The whole app grows: bigger text, bigger buttons, a simpler home screen. One switch. **Healix is for the whole family.**"

### 4. How it's built: two sentences only (3:00 to 3:20)

> "Under the hood: React and TypeScript on the front, a Node server behind it. For the chatbot we read the report, **cut it into small pieces, store them in a vector index, find the closest pieces to your question, and only then ask Groq to write the answer**. Sarvam AI gives us voice and translation in Indian languages. Two API keys, and the app still works without both."

*Keep it short. Judges who want detail will ask.*

### 5. Why it's safe (3:20 to 3:40)

> "Three rules we never break. **No diagnosis. No medicine doses. The patient confirms every value.** Every AI answer is scanned for those before you see it. If it fails the check, the app falls back to a safe built-in answer."

### 6. The close (3:40 to 4:00)

> "Healix isn't trying to replace your doctor. It's trying to make sure that when you **walk in**, you know **who to see, when to leave, and what your report says**."
> "**From *I feel unwell* to *I understand*.** We're Healix. Thank you."

*Stop talking. Smile. Wait for the questions.*

---

## Fun touches (use two, not all)

- **The stopwatch:** before the demo say "I'll get a patient from symptom to explained report in under two minutes." Start a timer on the screen. Beat it.
- **The grandparent test:** hand your phone to a judge with large text on and ask them to find "My reports". It takes one tap.
- **The language swap:** ask a judge for a language, switch the whole app to Marathi or Hindi with one tap, and say "Same app, same answers, now in the language you think in."
- **The "try to break it" challenge:** invite a judge to ask it something unsafe. It refuses. Safety shown, not told.

---

## If something goes wrong on stage

| Problem | What to say and do |
|---|---|
| Wi-Fi drops | "Good news, the demo runs on our own server." Keep going. If the server is down, switch to the screenshot slides. |
| Voice doesn't work | "The mic is a bonus. Typing works the same." Type it. |
| Chatbot is slow | Fill the gap: "While it thinks, notice it will show where each answer came from." |
| A judge asks something it refuses | Smile: "Exactly. That's the safety rule working." |

---

## Judge questions: the short honest answers

**"Is this a diagnosis tool?"**
No. It suggests a type of specialist and explains words in a report. Never a disease name, never a medicine.

**"What's the AI actually doing?"**
Two things. Rules match symptoms to a specialty and urgency, which keeps it predictable and safe. For reports, Groq writes a short explanation, but only from the report pieces we find first, and it must show its source.

**"Why not just use ChatGPT?"**
A general chatbot doesn't know your report, can't cite where an answer came from, and can say unsafe things. Healix reads *your* report, shows its source, and is built to refuse diagnoses and doses. It's also tied to booking and queues.

**"What if the OCR misreads a number?"**
That's why there's a confirm step. Low-confidence values are highlighted and the patient fixes them before anything is explained.

**"Is the doctor data real?"**
No. It's dummy data for 80 doctors across 6 Pune hospitals, built to show the product. A real launch needs hospital partnerships.

**"How does it predict the wait?"**
From the live queue: patients ahead, how long this doctor actually takes per patient, plus delays and breaks. It shows a range and the reasons.

**"What about privacy?"**
Reports are only visible to their owner. The browser never stores health data, only language and text size. API keys stay on the server.

**"How would you make money, or scale it?"**
Hospitals use the dashboard (queues, pre-alerts, analytics). Patients use it free. To scale we'd add a real database, SMS sign-in and hospital integrations.

**"What's missing?"**
Real hospital data, SMS sign-in, a proper database, and a native-speaker review of the Hindi and Marathi. We know it, and we'd rather say it than hide it.

**"What did you build in this hackathon?"**
The whole patient journey, a hospital dashboard, a safe report chatbot that reads real PDFs and photos, voice and translation in four languages, and over 500 automated tests.

---

## Numbers you can say

- 4 languages
- 2 API keys (both optional)
- 14 features, one app
- 80 sample doctors, 6 hospitals, 16 specialties
- Reads photos, PDFs, scanned PDFs, Word and text files up to 50 MB
- Over 500 unit tests and about 175 browser tests

*Don't invent any other statistics. If a judge asks for market size, say "I'd rather give you a real number than a guess. We haven't researched that yet."*

---

## One slide per beat (if you need slides)

1. **Title:** Healix + tagline
2. **The problem:** three headaches (which doctor, when to leave, what does it mean)
3. **Live demo** (just a big "Let's try it")
4. **How it works:** one diagram (browser, server, Groq, Sarvam)
5. **Safe by design:** no diagnosis, no doses, you confirm
6. **What's next + Thank you**
