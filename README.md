# AI Quiz Generator & Study Assistant (Project 2)

👨🎓 Student Information
*   **Name**: 
*   **Enrollment No**: 
*   **Semester**: 7th Sem
*   **College**: 

📖 About This Repository
This repository contains the **AI Quiz Generator & Study Assistant** project completed during my **AI Tools and Automation process Internship** @Unicode Technolab.

*   🌐 **Live Demo (Render)**: [Paste Render Link Here]
*   🎥 **Project Execution Video**: [Paste Google Drive/YouTube Link Here]

The project is designed to understand web-based AI tools and automation. Specifically, it implements:
1. **Multi-Source Knowledge Parsing**: Custom parsers for PDFs, plain text, web articles (URL scraping), YouTube video transcripts, and images.
2. **Dynamic Prompt Engineering**: High-quality structured system prompts to generate clean MCQ, True/False, Fill in the Blanks, and Short/Long Answer quizzes via the Google Gemini API.
3. **Interactive Testing Dashboard**: Real-time timer control, active performance tracking, and direct result exports (PDF, JSON).

---

## 🚀 Key Features

*   **Multi-Source Knowledge Inputs**:
    *   📁 **PDF Documents**: Client-side text parsing using PDF.js (`pdfjs-dist`).
    *   ✍️ **Pasted Text**: Direct raw text input with a live word & character counter.
    *   🌐 **Web Articles**: URL scraper input to fetch and summarize articles.
    *   🎥 **YouTube Videos**: Automated video metadata and transcript fetch using YouTube URLs.
    *   🖼️ **Visual/Image Input**: Upload images (scanned documents, diagrams) for OCR/visual extraction.
*   **Diverse Quiz Types**:
    *   Multiple Choice Questions (MCQs)
    *   True / False Statements
    *   Fill in the Blanks (FITB)
    *   Open-ended Questions (OQ)
    *   Short Answer Questions (SAQ)
    *   Long Answer Questions (LAQ)
*   **Customizable Settings**: Set the exact number of questions and select target content difficulty.
*   **Interactive Testing Console**:
    *   Built-in stopwatch/timer to track response times.
    *   Live progress indicators.
    *   Instant feedback with explanation and grading.
*   **Detailed Results Dashboard**:
    *   Score breakdowns with visual progress circles.
    *   Wrong/Right answer analysis with helpful suggestions.
    *   Export results to **PDF** or **JSON** for future review.
*   **Premium Modern Dark Mode Design**: Full dark/glassmorphic responsive UI, optimized for seamless interaction.

---

## 🛠️ Technology Stack

*   **Build Tool**: Vite 8
*   **Language**: Vanilla JavaScript (ES Modules)
*   **Styling**: Pure CSS3 (featuring premium dark aesthetics, cards, custom scrolls, responsive layouts)
*   **Core Libraries**:
    *   `@google/generative-ai`: Integrates Google Gemini API for quiz generation and text processing.
    *   `pdfjs-dist`: Handled client-side PDF loading and text extraction.
    *   `lucide`: Modern SVG icons.

---

## 📁 Project Structure

```text
project-2/
├── index.html             # Main Single Page App (SPA) template
├── vite.config.js         # Vite bundling configuration
├── package.json           # Scripts and dependency list
├── .env                   # Local API credentials
├── public/                # Static assets (images, fonts, custom libs)
└── src/
    ├── main.js            # Core AppState, tab routing, and Event Listeners
    ├── pdf-parser.js      # PDF extraction logic using pdf.js
    ├── quiz-generator.js  # Prompt templates and Gemini API calls
    ├── quiz-controller.js # Quiz rendering, timer, score management, and PDF exports
    └── style.css          # Premium stylesheet (UI typography, components, and animations)
```

---

## 🔧 Installation & Local Setup

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended).

### Step 1: Navigate to Project Folder
```bash
cd project-2
```

### Step 2: Install Node Dependencies
```bash
npm install
```

### Step 3: Configure Gemini API Key
Create a `.env` file in the root of the `project-2` folder:
```env
# Google Gemini API Key
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```
*(Alternatively, if no `.env` file is present, you can enter the Gemini API Key directly in the UI settings sidebar).*

### Step 4: Run the Application
Start the local Vite development server:
```bash
npm run dev
```

Open the local address printed by Vite (typically `http://localhost:5173`) in your browser to interact with the application!
