import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Controls the active quiz player state and user interface.
 */
export class QuizController {
  constructor(appState) {
    this.appState = appState;
    this.quizData = null;
    this.currentIndex = 0;
    this.answers = {}; // Map of question index -> selected option or typed text
    this.selfGrades = {}; // Map of question index -> descriptive self-grade score (0, 0.5, 1)
    
    // Timer state
    this.timerInterval = null;
    this.secondsElapsed = 0;
    
    // Initialize Gamification / Analytics
    this.points = parseInt(localStorage.getItem('quiz_points') || '0', 10);
    this.streak = parseInt(localStorage.getItem('quiz_streak') || '0', 10);
    this.lastActiveDate = localStorage.getItem('quiz_last_active') || '';
    
    // UI elements cache
    this.screenQuiz = document.getElementById('screen-quiz');
    this.screenResults = document.getElementById('screen-results');
    this.qCounter = document.getElementById('quiz-question-counter');
    this.qProgressFill = document.getElementById('quiz-progress-fill');
    this.qTimerText = document.getElementById('quiz-timer-text');
    this.qText = document.getElementById('question-text');
    this.optionsContainer = document.getElementById('options-container');
    
    this.btnPrev = document.getElementById('btn-prev-question');
    this.btnNext = document.getElementById('btn-next-question');
    this.btnNextText = document.getElementById('btn-next-text');
    
    // Result elements cache
    this.resultsRingFill = document.getElementById('results-ring-fill');
    this.resultsScorePercent = document.getElementById('results-score-percent');
    this.resultsScoreFraction = document.getElementById('results-score-fraction');
    this.resultsMessage = document.getElementById('results-message');
    this.resultsMetricTime = document.getElementById('results-metric-time');
    this.resultsMetricAccuracy = document.getElementById('results-metric-accuracy');
    this.reviewContainer = document.getElementById('review-container');
    
    // Dashboard metric cache nodes
    this.resultsMetricTotal = document.getElementById('results-metric-total');
    this.resultsMetricCorrect = document.getElementById('results-metric-correct');
    this.resultsMetricWrong = document.getElementById('results-metric-wrong');
    this.resultsMetricUnattempted = document.getElementById('results-metric-unattempted');
    this.resultsMetricPercentage = document.getElementById('results-metric-percentage');
    this.resultsMetricGrade = document.getElementById('results-metric-grade');
    this.resultsAiFeedbackText = document.getElementById('results-ai-feedback-text');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.btnPrev.addEventListener('click', () => this.prevQuestion());
    this.btnNext.addEventListener('click', () => this.nextQuestion());
    
    const btnQuizAudio = document.getElementById('btn-quiz-audio');
    if (btnQuizAudio) {
      btnQuizAudio.addEventListener('click', () => this.speakCurrentQuestion());
    }
  }

  /**
   * Initializes and starts a new quiz session.
   * @param {object} quizData - Generated quiz data containing title and questions list.
   */
  startQuiz(quizData, timeLimitMinutes = 0, marksPerQuestion = 1) {
    this.quizData = quizData;
    this.currentIndex = 0;
    this.answers = {};
    this.selfGrades = {};
    this.secondsElapsed = 0;
    this.timeLimitMinutes = timeLimitMinutes;
    this.marksPerQuestion = marksPerQuestion;
    this.secondsRemaining = timeLimitMinutes * 60;
    
    // Setup and start the timer
    const sideTimerInit = document.getElementById('sidebar-timer-text');
    if (this.timeLimitMinutes > 0) {
      const initialMins = this.timeLimitMinutes.toString().padStart(2, '0');
      this.qTimerText.textContent = `${initialMins}:00`;
      if (sideTimerInit) sideTimerInit.textContent = `${initialMins}:00`;
    } else {
      this.qTimerText.textContent = '00:00';
      if (sideTimerInit) sideTimerInit.textContent = '00:00';
    }

    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      
      if (this.timeLimitMinutes > 0) {
        this.secondsRemaining--;
        if (this.secondsRemaining <= 0) {
          clearInterval(this.timerInterval);
          this.appState.showToast('Time limit reached! Auto-submitting quiz.', 'error');
          this.finishQuiz();
          return;
        }
        const mins = Math.floor(this.secondsRemaining / 60).toString().padStart(2, '0');
        const secs = (this.secondsRemaining % 60).toString().padStart(2, '0');
        this.qTimerText.textContent = `${mins}:${secs}`;
        
        const sideTimer = document.getElementById('sidebar-timer-text');
        if (sideTimer) sideTimer.textContent = `${mins}:${secs}`;
      } else {
        const mins = Math.floor(this.secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (this.secondsElapsed % 60).toString().padStart(2, '0');
        this.qTimerText.textContent = `${mins}:${secs}`;
        
        const sideTimer = document.getElementById('sidebar-timer-text');
        if (sideTimer) sideTimer.textContent = `${mins}:${secs}`;
      }
    }, 1000);
    
    // Show first question
    this.renderCurrentQuestion();
  }

  /**
   * Renders the current question based on its format type.
   */
  renderCurrentQuestion() {
    if (!this.quizData || !this.quizData.questions) return;
    
    const question = this.quizData.questions[this.currentIndex];
    const totalQuestions = this.quizData.questions.length;
    
    // Update question counter & progress bar
    this.qCounter.textContent = `Question ${this.currentIndex + 1} of ${totalQuestions}`;
    const progressPercent = ((this.currentIndex + 1) / totalQuestions) * 100;
    this.qProgressFill.style.width = `${progressPercent}%`;
    
    // Format question headers for Assertion-Reason vs standard, including chapter/topic badges
    let metaTagHtml = '';
    if (question.chapter) {
      metaTagHtml = `<span class="question-meta-tag">📚 Chapter: ${question.chapter}</span><br/>`;
    } else if (question.topic) {
      metaTagHtml = `<span class="question-meta-tag">🔖 Topic: ${question.topic}</span><br/>`;
    }

    if (question.type === 'assertion-reason') {
      this.qText.innerHTML = `${metaTagHtml}<span class="ar-badge-label">ASSERTION & REASON</span><br/>${question.text}`;
    } else {
      this.qText.innerHTML = `${metaTagHtml}${question.text}`;
    }
    
    // Clear options container
    this.optionsContainer.innerHTML = '';
    
    const type = question.type || 'multiple-choice';
    
    if (['multiple-choice', 'true-false', 'assertion-reason'].includes(type)) {
      // Choice selections (MCQ / TF / AR)
      question.options.forEach((option) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option;
        
        if (this.answers[this.currentIndex] === option) {
          button.classList.add('selected');
        }
        
        button.addEventListener('click', () => {
          this.answers[this.currentIndex] = option;
          const buttons = this.optionsContainer.querySelectorAll('.option-button');
          buttons.forEach(btn => btn.classList.remove('selected'));
          button.classList.add('selected');
        });
        
        this.optionsContainer.appendChild(button);
      });
    } else if (['fill-blanks', 'one-word'].includes(type)) {
      // Single-line text fields (FITB / One-word)
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-text-input';
      input.placeholder = type === 'fill-blanks' ? 'Type the missing word(s)...' : 'Type a single-word answer...';
      input.value = this.answers[this.currentIndex] || '';
      
      input.addEventListener('input', (e) => {
        this.answers[this.currentIndex] = e.target.value;
      });
      
      this.optionsContainer.appendChild(input);
      // Focus element
      setTimeout(() => input.focus(), 50);
    } else if (['short-answer', 'long-answer'].includes(type)) {
      // Multi-line textareas (Short / Long Answer)
      const textarea = document.createElement('textarea');
      textarea.className = 'quiz-textarea-input';
      textarea.placeholder = type === 'short-answer' ? 'Type your short response (2-3 sentences)...' : 'Type your detailed paragraph explanation...';
      textarea.value = this.answers[this.currentIndex] || '';
      
      textarea.addEventListener('input', (e) => {
        this.answers[this.currentIndex] = e.target.value;
      });
      
      const micButton = document.createElement('button');
      micButton.className = 'btn-mic';
      micButton.innerHTML = '🎤';
      micButton.title = 'Speak your Answer';
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
          micButton.classList.add('recording');
          micButton.innerHTML = '🔴';
        };
        
        recognition.onerror = (e) => {
          console.error('Speech Recognition Error:', e);
          micButton.classList.remove('recording');
          micButton.innerHTML = '🎤';
        };
        
        recognition.onend = () => {
          micButton.classList.remove('recording');
          micButton.innerHTML = '🎤';
        };
        
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          textarea.value = (textarea.value + ' ' + transcript).trim();
          this.answers[this.currentIndex] = textarea.value;
        };
        
        micButton.addEventListener('click', (e) => {
          e.preventDefault();
          if (micButton.classList.contains('recording')) {
            recognition.stop();
          } else {
            recognition.start();
          }
        });
      } else {
        micButton.style.display = 'none';
      }
      
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'stretch';
      wrapper.style.gap = '0.5rem';
      wrapper.style.width = '100%';
      wrapper.appendChild(textarea);
      wrapper.appendChild(micButton);
      
      this.optionsContainer.appendChild(wrapper);
      setTimeout(() => textarea.focus(), 50);
    }
    
    // Enable/disable navigation buttons
    this.btnPrev.disabled = this.currentIndex === 0;
    
    if (this.currentIndex === totalQuestions - 1) {
      this.btnNextText.textContent = 'Submit Quiz';
    } else {
      this.btnNextText.textContent = 'Next Question';
    }
  }

  /**
   * Navigates to the next question or submits the quiz.
   */
  nextQuestion() {
    const question = this.quizData.questions[this.currentIndex];
    const totalQuestions = this.quizData.questions.length;
    const answer = this.answers[this.currentIndex];
    
    const isTextBased = ['fill-blanks', 'one-word', 'short-answer', 'long-answer'].includes(question.type);
    
    if (isTextBased) {
      if (!answer || answer.trim() === '') {
        this.appState.showToast('Please type your response before proceeding.', 'error');
        return;
      }
    } else {
      if (answer === undefined) {
        this.appState.showToast('Please choose an option before proceeding.', 'error');
        return;
      }
    }
    
    if (this.currentIndex < totalQuestions - 1) {
      this.currentIndex++;
      this.renderCurrentQuestion();
    } else {
      this.finishQuiz();
    }
  }

  /**
   * Navigates to the previous question.
   */
  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentQuestion();
    }
  }

  /**
   * Ends the quiz timer, computes scores, and displays the evaluation review.
   */
  finishQuiz() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    // Initialize default grades for descriptive questions
    this.quizData.questions.forEach((q, idx) => {
      if (['short-answer', 'long-answer'].includes(q.type)) {
        if (this.selfGrades[idx] === undefined) {
          this.selfGrades[idx] = 0; // Default self-grade as incorrect
        }
      }
    });

    this.appState.switchScreen('screen-results');
    
    // Trigger dynamic score evaluations
    const stats = this.recalculateScore();
    
    // Format spent time (calculate elapsed if countdown)
    const spentTime = this.timeLimitMinutes > 0 
      ? (this.timeLimitMinutes * 60 - this.secondsRemaining) 
      : this.secondsElapsed;
    const mins = Math.floor(spentTime / 60);
    const secs = spentTime % 60;
    this.resultsMetricTime.textContent = `${mins}m ${secs}s`;
    
    // Trigger background AI performance review feedback
    this.generateAIFeedback(stats);
    
    // Populate review section
    this.renderReviewSection();

    // Save run details to local history
    try {
      const totalPossibleMarks = stats.total * (this.marksPerQuestion || 1);
      const earnedMarks = stats.correct * (this.marksPerQuestion || 1);
      
      const history = JSON.parse(localStorage.getItem('quiz_history') || '[]');
      history.push({
        date: new Date().toLocaleDateString(),
        score: earnedMarks,
        total: totalPossibleMarks,
        percent: stats.percentage,
        difficulty: this.quizData.questions[0]?.difficulty || 'Medium',
        topic: this.quizData.title || 'General Quiz',
        timeSpent: spentTime
      });
      localStorage.setItem('quiz_history', JSON.stringify(history));

      // Update streaks and points
      this.updateStreak();
      this.awardPointsAndCheckBadges(stats.percentage, stats.total, this.quizData.questions[0]?.difficulty || 'medium', spentTime, this.timeLimitMinutes);
    } catch (e) {
      console.error('Failed to update stats history:', e);
    }
  }

  /**
   * Re-evaluates totals and outputs accuracy percentages dynamically
   */
  recalculateScore() {
    const questions = this.quizData.questions;
    let correctCount = 0;
    let unattemptedCount = 0;
    
    questions.forEach((q, idx) => {
      const type = q.type || 'multiple-choice';
      const userAnswer = this.answers[idx] || '';
      
      // Calculate unattempted
      const isUnattempted = !userAnswer || userAnswer.toString().trim() === '';
      if (isUnattempted) {
        unattemptedCount++;
        return;
      }
      
      if (['multiple-choice', 'true-false', 'assertion-reason'].includes(type)) {
        if (userAnswer === q.correctAnswer) {
          correctCount++;
        }
      } else if (['fill-blanks', 'one-word'].includes(type)) {
        if (userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()) {
          correctCount++;
        }
      } else if (['short-answer', 'long-answer'].includes(type)) {
        // Increment correct count proportionally for self grades (1 = correct, 0.5 = correct-ish, 0 = wrong)
        if ((this.selfGrades[idx] || 0) >= 0.5) {
          correctCount++;
        }
      }
    });
    
    const total = questions.length;
    const wrongCount = Math.max(0, total - correctCount - unattemptedCount);
    
    const scorePercent = Math.round((correctCount / total) * 100);
    const attemptedCount = total - unattemptedCount;
    const accuracyPercent = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
    
    // Calculate Letter Grade
    let grade = 'F';
    if (scorePercent >= 90) grade = 'A+';
    else if (scorePercent >= 80) grade = 'A';
    else if (scorePercent >= 70) grade = 'B';
    else if (scorePercent >= 60) grade = 'C';
    else if (scorePercent >= 50) grade = 'D';
    
    // Apply stroke-dashoffset transition
    const perimeter = 283;
    const offset = perimeter - (scorePercent / 100) * perimeter;
    this.resultsRingFill.style.strokeDashoffset = offset;
    
    // Compute marks scaling
    const totalPossibleMarks = total * (this.marksPerQuestion || 1);
    const earnedMarks = correctCount * (this.marksPerQuestion || 1);

    // Set main score circle texts
    this.resultsScorePercent.textContent = `${scorePercent}%`;
    this.resultsScoreFraction.textContent = `${earnedMarks}/${totalPossibleMarks} Marks`;
    this.resultsMetricAccuracy.textContent = `${accuracyPercent}%`;
    
    const sideScoreText = document.getElementById('sidebar-score-text');
    if (sideScoreText) sideScoreText.textContent = `${earnedMarks}/${totalPossibleMarks}`;
    
    // Populate dashboard metric grid values
    if (this.resultsMetricTotal) this.resultsMetricTotal.textContent = total;
    if (this.resultsMetricCorrect) this.resultsMetricCorrect.textContent = correctCount;
    if (this.resultsMetricWrong) this.resultsMetricWrong.textContent = wrongCount;
    if (this.resultsMetricUnattempted) this.resultsMetricUnattempted.textContent = unattemptedCount;
    if (this.resultsMetricPercentage) this.resultsMetricPercentage.textContent = `${scorePercent}%`;
    if (this.resultsMetricGrade) this.resultsMetricGrade.textContent = grade;
    if (this.resultsMetricAccuracy) this.resultsMetricAccuracy.textContent = `${accuracyPercent}%`;
    
    const spentTime = this.timeLimitMinutes > 0 
      ? (this.timeLimitMinutes * 60 - this.secondsRemaining) 
      : this.secondsElapsed;
    const mins = Math.floor(spentTime / 60);
    const secs = spentTime % 60;
    const formattedTime = `${mins}m ${secs}s`;
    if (this.resultsMetricTime) this.resultsMetricTime.textContent = formattedTime;

    // Customize title feedback message
    if (scorePercent === 100) {
      this.resultsMessage.textContent = 'Perfect Score! 🎉';
    } else if (scorePercent >= 80) {
      this.resultsMessage.textContent = 'Excellent Work! 🌟';
    } else if (scorePercent >= 50) {
      this.resultsMessage.textContent = 'Good Effort! 👍';
    } else {
      this.resultsMessage.textContent = 'Keep Studying! 📚';
    }

    return {
      total,
      correct: correctCount,
      wrong: wrongCount,
      unattempted: unattemptedCount,
      percentage: scorePercent,
      grade,
      accuracy: accuracyPercent
    };
  }

  /**
   * Generates dynamic AI performance feedback review based on metrics stats.
   * @param {object} stats - Evaluated scores and grade totals.
   */
  async generateAIFeedback(stats) {
    if (!this.resultsAiFeedbackText) return;
    
    this.resultsAiFeedbackText.textContent = 'Generating personalized AI insights... ✨';

    try {
      const apiKey = this.appState.apiKey;
      if (!apiKey) {
        throw new Error('API Key is missing');
      }

      const prompt = `Please generate a very brief, encouraging 2-3 sentence personalized tutoring feedback in the quiz language for a student with the following quiz results:
Quiz Title: ${this.quizData.title}
Total Questions: ${stats.total}
Correct: ${stats.correct}
Wrong: ${stats.wrong}
Unattempted: ${stats.unattempted}
Percentage Score: ${stats.percentage}%
Grade: ${stats.grade}
Accuracy: ${stats.accuracy}%

Provide direct constructive feedback on their strengths or where they should revise. Be highly motivational. Avoid markdown code block formatting or title wrappers.`;

      const isGroq = apiKey.startsWith('gsk_');
      let feedbackText = '';

      if (isGroq) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are an encouraging academic tutor. Write a warm 2-3 sentence feedback. Do not include markdown code block syntax.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 150
          })
        });

        if (!response.ok) throw new Error('Groq feedback request failed');
        const resJson = await response.json();
        feedbackText = resJson.choices[0].message.content;
      } else {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 150 }
        });
        const response = await result.response;
        feedbackText = response.text();
      }

      this.resultsAiFeedbackText.textContent = feedbackText.trim();
    } catch (e) {
      console.warn('AI Feedback generation failed, using local fallback:', e);
      let fallbackText = '';
      if (stats.percentage === 100) {
        fallbackText = `Outstanding performance! You got a perfect score of 100% (Grade ${stats.grade}) with 100% accuracy. You have fully mastered this topic! 🎉`;
      } else if (stats.percentage >= 80) {
        fallbackText = `Excellent work! You scored ${stats.percentage}% (Grade ${stats.grade}) with ${stats.accuracy}% accuracy. A small review of the wrong answer(s) will help you achieve perfection! 🌟`;
      } else if (stats.percentage >= 50) {
        fallbackText = `Good effort! You achieved a ${stats.percentage}% (Grade ${stats.grade}) score. We recommend reading through the explanation reviews below to clear up the ${stats.wrong} incorrect and ${stats.unattempted} unattempted questions. 👍`;
      } else {
        fallbackText = `You scored ${stats.percentage}% (Grade ${stats.grade}). Don't worry, every mistake is a learning opportunity. Carefully study the explanation cards below and try the quiz again to boost your score! 📚`;
      }
      this.resultsAiFeedbackText.textContent = fallbackText;
    }
  }

  /**
   * Renders the question breakdown review lists with toggling accordion boxes.
   */
  renderReviewSection() {
    this.reviewContainer.innerHTML = '';
    
    this.quizData.questions.forEach((q, idx) => {
      const userAnswer = this.answers[idx] || '';
      const type = q.type || 'multiple-choice';
      
      let isCorrect = false;
      let badgeLabel = 'Incorrect';
      let statusClass = 'incorrect';
      
      if (['multiple-choice', 'true-false', 'assertion-reason'].includes(type)) {
        isCorrect = userAnswer === q.correctAnswer;
        badgeLabel = isCorrect ? 'Correct' : 'Incorrect';
        statusClass = isCorrect ? 'correct' : 'incorrect';
      } else if (['fill-blanks', 'one-word'].includes(type)) {
        isCorrect = userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        badgeLabel = isCorrect ? 'Correct' : 'Incorrect';
        statusClass = isCorrect ? 'correct' : 'incorrect';
      } else if (['short-answer', 'long-answer'].includes(type)) {
        const grade = this.selfGrades[idx] || 0;
        isCorrect = grade > 0;
        badgeLabel = grade === 1 ? 'Correct' : grade === 0.5 ? 'Partial' : 'Incorrect';
        statusClass = grade === 1 ? 'correct' : grade === 0.5 ? 'partial' : 'incorrect';
      }
      
      const reviewItem = document.createElement('div');
      reviewItem.className = `review-item ${statusClass}`;
      
      // Header for accordion
      const header = document.createElement('div');
      header.className = 'review-header';
      
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'review-header-title';
      
      const badge = document.createElement('span');
      badge.className = `review-badge badge-${statusClass}`;
      badge.textContent = badgeLabel;
      
      const qText = document.createElement('span');
      qText.className = 'review-q-text';
      
      let metaLabel = '';
      if (q.chapter) metaLabel = ` [Chapter: ${q.chapter}]`;
      else if (q.topic) metaLabel = ` [Topic: ${q.topic}]`;
      
      qText.textContent = `${idx + 1}. ${q.text}${metaLabel}`;
      
      titleWrapper.appendChild(badge);
      titleWrapper.appendChild(qText);
      
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'review-toggle-icon';
      toggleIcon.textContent = '▼';
      
      header.appendChild(titleWrapper);
      header.appendChild(toggleIcon);
      reviewItem.appendChild(header);
      
      // Body for accordion
      const body = document.createElement('div');
      body.className = 'review-body';
      
      if (['multiple-choice', 'true-false', 'assertion-reason'].includes(type)) {
        // Choice selection reviews
        const optionsList = document.createElement('div');
        optionsList.className = 'review-options-list';
        
        q.options.forEach((opt) => {
          const optionEl = document.createElement('div');
          optionEl.className = 'review-option';
          
          const marker = document.createElement('span');
          marker.className = 'review-option-marker';
          
          if (opt === q.correctAnswer) {
            optionEl.classList.add('correct-choice');
            marker.textContent = '✓';
          } else if (opt === userAnswer) {
            optionEl.classList.add('incorrect-choice');
            marker.textContent = '✗';
          } else {
            marker.textContent = '○';
          }
          
          optionEl.appendChild(marker);
          optionEl.appendChild(document.createTextNode(` ${opt}`));
          optionsList.appendChild(optionEl);
        });
        body.appendChild(optionsList);
      } else if (['fill-blanks', 'one-word'].includes(type)) {
        // Text field comparisons reviews
        const textCompareList = document.createElement('div');
        textCompareList.className = 'text-comparison-list';
        
        const userEl = document.createElement('div');
        userEl.className = `compare-entry ${isCorrect ? 'correct-entry' : 'incorrect-entry'}`;
        userEl.innerHTML = `<strong>Your Answer:</strong> <span>${userAnswer}</span>`;
        
        const idealEl = document.createElement('div');
        idealEl.className = 'compare-entry ideal-entry';
        idealEl.innerHTML = `<strong>Correct Key:</strong> <span>${q.correctAnswer}</span>`;
        
        textCompareList.appendChild(userEl);
        textCompareList.appendChild(idealEl);
        body.appendChild(textCompareList);
      } else if (['short-answer', 'long-answer'].includes(type)) {
        // Descriptive comparisons & Self-assessment selectors
        const textCompareList = document.createElement('div');
        textCompareList.className = 'text-comparison-list';
        
        const userEl = document.createElement('div');
        userEl.className = 'compare-entry descriptive-entry';
        userEl.innerHTML = `<strong>Your Response:</strong> <p class="descriptive-text">${userAnswer}</p>`;
        
        const idealEl = document.createElement('div');
        idealEl.className = 'compare-entry ideal-entry';
        idealEl.innerHTML = `<strong>Ideal Sample Answer:</strong> <p class="descriptive-text">${q.correctAnswer}</p>`;
        
        textCompareList.appendChild(userEl);
        textCompareList.appendChild(idealEl);
        body.appendChild(textCompareList);
        
        // Self-assessment Rating panel
        const selfAssessPanel = document.createElement('div');
        selfAssessPanel.className = 'self-grade-container';
        selfAssessPanel.innerHTML = '<span class="grade-label">Self-Assessment Grade:</span>';
        
        const selfBtnGroup = document.createElement('div');
        selfBtnGroup.className = 'self-grade-btn-group';
        
        const grades = [
          { label: 'Incorrect (0%)', value: 0, class: 'grade-incorrect' },
          { label: 'Partial (50%)', value: 0.5, class: 'grade-partial' },
          { label: 'Correct (100%)', value: 1, class: 'grade-correct' }
        ];
        
        grades.forEach(gradeOpt => {
          const btn = document.createElement('button');
          btn.className = `self-grade-btn ${gradeOpt.class}`;
          btn.textContent = gradeOpt.label;
          
          if ((this.selfGrades[idx] || 0) === gradeOpt.value) {
            btn.classList.add('active');
          }
          
          btn.addEventListener('click', () => {
            this.selfGrades[idx] = gradeOpt.value;
            
            // Re-render item class and badges
            const currentGrade = gradeOpt.value;
            const newStatusClass = currentGrade === 1 ? 'correct' : currentGrade === 0.5 ? 'partial' : 'incorrect';
            const newBadgeLabel = currentGrade === 1 ? 'Correct' : currentGrade === 0.5 ? 'Partial' : 'Incorrect';
            
            reviewItem.className = `review-item ${newStatusClass}`;
            badge.className = `review-badge badge-${newStatusClass}`;
            badge.textContent = newBadgeLabel;
            
            // Toggle active classes on self assessment buttons
            const siblingBtns = selfBtnGroup.querySelectorAll('.self-grade-btn');
            siblingBtns.forEach(sBtn => sBtn.classList.remove('active'));
            btn.classList.add('active');
            
            // Recalculate score display
            this.recalculateScore();
          });
          
          selfBtnGroup.appendChild(btn);
        });
        
        selfAssessPanel.appendChild(selfBtnGroup);
        body.appendChild(selfAssessPanel);
      }
      
      // Render Explanation Box
      const explanationBox = document.createElement('div');
      explanationBox.className = 'review-explanation';
      explanationBox.innerHTML = `
        <div class="exp-icon">💡</div>
        <div class="exp-text">
          <h4>Gemini Explanation</h4>
          <p>${q.explanation}</p>
          ${q.reference ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #10b981; font-weight: bold;">📚 Source Reference: ${q.reference}</div>` : ''}
        </div>
      `;
      body.appendChild(explanationBox);
      
      // Inline AI Tutor trigger options
      const tutorTriggers = document.createElement('div');
      tutorTriggers.className = 'ai-tutor-triggers';
      tutorTriggers.innerHTML = `
        <button class="btn-tutor-action" data-prompt="Explain this answer in simpler terms.">🤖 Explain answer</button>
        <button class="btn-tutor-action" data-prompt="Give another real-world example of this concept.">💡 Give another example</button>
        <button class="btn-tutor-action" data-prompt="Explain step-by-step why this answer is correct.">❓ Why is this correct?</button>
      `;
      body.appendChild(tutorTriggers);

      const tutorAnswerBox = document.createElement('div');
      tutorAnswerBox.className = 'tutor-answer-box hidden';
      body.appendChild(tutorAnswerBox);

      const actionBtns = tutorTriggers.querySelectorAll('.btn-tutor-action');
      actionBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const actionPrompt = btn.getAttribute('data-prompt');
          tutorAnswerBox.classList.remove('hidden');
          tutorAnswerBox.innerHTML = '🤖 <em>AI Tutor is thinking...</em>';
          
          try {
            const answerText = await this.askTutor(q.text, q.correctAnswer, q.explanation, actionPrompt);
            tutorAnswerBox.innerHTML = `<strong>Tutor Response:</strong><br/>${answerText}`;
          } catch (err) {
            tutorAnswerBox.innerHTML = `⚠️ Error getting tutor response: ${err.message}`;
          }
        });
      });

      reviewItem.appendChild(body);
      
      // Accordion expand/collapse
      header.addEventListener('click', () => {
        reviewItem.classList.toggle('expanded');
      });
      
      this.reviewContainer.appendChild(reviewItem);
    });
  }

  /**
   * TTS engine reads active question out loud
   */
  speakCurrentQuestion() {
    if (!this.quizData) return;
    const question = this.quizData.questions[this.currentIndex];
    if (!question) return;
    
    window.speechSynthesis.cancel();
    
    let textToSpeak = `Question ${this.currentIndex + 1}. ${question.text}.`;
    if (question.options && question.options.length > 0) {
      textToSpeak += ` The options are: ` + question.options.join(', ');
    }
    
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Tracks daily streak parameters
   */
  updateStreak() {
    const today = new Date().toDateString();
    if (this.lastActiveDate === today) return;
    
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (this.lastActiveDate === yesterday) {
      this.streak += 1;
    } else {
      this.streak = 1;
    }
    this.lastActiveDate = today;
    localStorage.setItem('quiz_streak', this.streak.toString());
    localStorage.setItem('quiz_last_active', today);
  }

  /**
   * Awards points based on accuracy and checks badges unlock constraints
   */
  awardPointsAndCheckBadges(scorePercent, totalQuestions, difficulty, timeTakenSeconds, timerLimitMinutes) {
    const earnedPoints = Math.round(scorePercent);
    this.points += earnedPoints;
    localStorage.setItem('quiz_points', this.points.toString());

    const badges = JSON.parse(localStorage.getItem('quiz_badges') || '[]');
    const newBadges = [];

    if (scorePercent === 100 && totalQuestions >= 5 && !badges.includes('first_win')) {
      badges.push('first_win');
      newBadges.push('🏆 First Victory (100% Score)');
    }
    if (this.streak >= 3 && !badges.includes('streak_master')) {
      badges.push('streak_master');
      newBadges.push('🔥 Streak Master (3-Day Streak)');
    }
    if (timerLimitMinutes > 0 && timeTakenSeconds < 60 && !badges.includes('speed_runner')) {
      badges.push('speed_runner');
      newBadges.push('🎓 Speed Runner (Timed under 1m)');
    }
    if (difficulty === 'hard' && !badges.includes('intellect')) {
      badges.push('intellect');
      newBadges.push('🎖️ Intellect (Hard Quiz Completed)');
    }

    if (newBadges.length > 0) {
      localStorage.setItem('quiz_badges', JSON.stringify(badges));
      setTimeout(() => {
        newBadges.forEach(b => {
          this.appState.showToast(`🎉 Achievement unlocked: ${b}`, 'success');
        });
      }, 800);
    }
  }

  /**
   * Resolves tutor query dynamically
   */
  async askTutor(questionText, correctAnswer, explanation, promptRequest) {
    const apiKey = this.appState.apiKey;
    if (!apiKey) {
      throw new Error('API Key is missing. Configure it in Settings.');
    }
    
    const systemInstruction = 'You are an expert AI Tutor helping a student. Keep your response helpful, concise (maximum 3-4 sentences), and structured.';
    const prompt = `
Question: ${questionText}
Correct Answer: ${correctAnswer}
Explanation: ${explanation}

Student's Request: ${promptRequest}
`;
    
    const isGroq = apiKey.startsWith('gsk_');
    if (isGroq) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      });
      if (!response.ok) throw new Error('Groq tutoring failed');
      const resJson = await response.json();
      return resJson.choices[0].message.content.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      });
      const response = await result.response;
      return response.text().trim();
    }
  }
}
