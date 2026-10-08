# Suha AI Tutor — User Manual

Welcome! This guide explains how to use Suha AI Tutor to study for school and the
national examinations. The app works **completely offline**.

---

## 1. Installing

1. Run **`Suha AI Tutor-Setup-<version>.exe`**.
2. Choose an install folder (or accept the default) and finish the wizard.
3. Launch **Suha AI Tutor** from the Desktop or Start menu.

The first time it runs, the app sets up its local library of lessons and practice
questions automatically.

---

## 2. Turning on the AI Tutor (one-time setup)

You can read books, study lessons and take the seeded quizzes **without** any setup.
To use the **AI Tutor**, **AI question generation** and **textbook-grounded answers**,
install a free local AI program once:

**Easiest: Ollama**
1. Download from <https://ollama.com> and install.
2. Open a terminal / command prompt and run:
   - `ollama pull qwen3:8b`
   - `ollama pull nomic-embed-text`
3. In Suha AI Tutor, go to **Settings → Local AI**, choose **Ollama**, and click
   **Test connection**. You should see *AI online*.

If you ever see **"AI server is offline"**, open the program (Ollama or LM Studio) and
make sure it is running, then click **Test connection** again.

---

## 3. The main screens

Use the left sidebar to move around.

- **Dashboard** — your study hub: streak, today's study time, what to continue, a
  recommended lesson, recent activity, weak topics and achievements.
- **Subjects** — pick your grade (top-right) and open a subject to see chapters,
  lessons, books and practice.
- **Library** — all your textbooks. Open one to read, or import a new PDF.
- **AI Tutor** — ask anything. Choose a grade/subject so answers fit your level, and
  toggle **Textbook** (grounded) vs **General**.
- **Quiz** — build a quiz by subject, difficulty and mode.
- **Aptitude** — train reasoning skills (logical, numerical, verbal, spatial, …).
- **Notes** — write, color-code, search and export your notes.
- **Progress** — detailed charts, topic mastery and achievements.
- **Settings / Admin / About**.

The grade selector in the top bar changes your active grade everywhere.

---

## 4. Reading a textbook

Open a book from **Library** or a subject's **Books** tab.

- **Navigate:** arrows or type a page number; the app remembers your last page.
- **Zoom / Fit width** and a **reader dark mode**.
- **Contents / Bookmarks / Notes** tabs on the side.
- **Select text** to **Ask AI** about it or **Copy** it.
- **Index for AI (RAG):** click this once per book so the AI Tutor can quote it. After
  indexing, ask questions and the tutor will cite pages like *(Book, p.42)*.

---

## 5. Learning with the AI Tutor

Open a lesson or the **AI Tutor** page and ask a question, or tap a quick action:

> Explain this page · Explain highlighted text · Explain like I'm 10 · Explain in
> simple English · Explain in Amharic · Give another example · Show formula · Draw
> diagram · Generate quiz · Generate flashcards · Generate exam questions · Generate
> revision notes · Summarize page · Translate.

Every explanation follows the same clear structure: simple explanation → intuition →
real-life example → diagram → formulas → common mistakes → memory tricks → summary →
practice → exam questions. When useful, the tutor draws a **diagram** right in the
answer.

---

## 6. Lessons

Each lesson includes: introduction, objectives, theory, worked examples, visuals,
notes, common mistakes, memory tips, practice, revision, summary, glossary and exam
tips — plus **flashcards** you can flip. Tap **Mark as complete** to record progress.

---

## 7. Quizzes & question banks

Choose a **subject**, **difficulty** (beginner / medium / difficult / exam) and a
**mode**:

- **Practice / Revision** — immediate feedback and explanations after each question.
- **Random** — a mixed set.
- **Adaptive** — focuses on your weak topics.
- **Mock exam** — timed, feedback at the end.

Turn on **Generate fresh AI questions** to create brand-new questions (needs the AI
server). At the end you get a score, a full review with explanations, and your weak
topics are updated.

---

## 8. Notes

Create color-coded notes from anywhere (including a specific book page). Search them,
edit them, and use **Export notes** to save them all as a Markdown file.

---

## 9. Tracking progress

The **Dashboard** and **Progress** pages show your streak, study minutes, average quiz
score, mastery per topic, and unlocked **achievements**. If you keep struggling with a
topic, the app recommends a revision lesson and extra practice automatically.

---

## 10. Admin & backups

In **Admin** you can import/manage textbooks, see RAG indexing status, and protect
your data:

- **Export database** — save a copy of everything.
- **Backup** — create a timestamped local backup.
- **Restore** — load a backup (the app restarts afterwards).
- **Reset curriculum** — restore the bundled lessons/questions to defaults.

---

## 11. Tips & troubleshooting

- **"AI offline"** → start Ollama/LM Studio and load a model; check the URL in Settings.
- **Tutor isn't quoting my book** → open the book and click **Index for AI (RAG)**,
  and make sure **Settings → Learning → RAG** is on.
- **Change the look** → Settings → Appearance (theme, accent, text size, motion,
  Amharic).
- **Everything is offline** → only importing brand-new books needs the internet.

Happy learning! — *Done by Suha Seid*
