import './style.css';
import { extractTextFromPDF, renderPDFThumbnail } from './pdf-parser.js';
import { generateQuiz } from './quiz-generator.js';
import { QuizController } from './quiz-controller.js';

class AppState {
  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
    
    // Core data inputs state
    this.activeTab = 'pdf';
    this.selectedPdfs = [];      // Array of PDF File objects
    this.pastedText = '';
    this.articleUrl = '';
    this.articleText = '';       // Clean scraped text
    this.youtubeUrl = '';
    this.youtubeText = '';       // Clean transcript text
    this.selectedImages = [];    // Array of { file: File, base64: String }

    this.generatedQuiz = null;
    
    // Screens mapping
    this.screens = {
      upload: document.getElementById('screen-upload'),
      loading: document.getElementById('screen-loading'),
      quiz: document.getElementById('screen-quiz'),
      results: document.getElementById('screen-results'),
      analytics: document.getElementById('screen-analytics'),
    };
    
    this.quizController = new QuizController(this);
    this.init();
  }

  init() {
    this.setupUIReferences();
    this.bindEvents();
    
    // Check saved theme
    const savedTheme = localStorage.getItem('quiz_theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      setTimeout(() => {
        if (this.themeToggleIcon && this.themeToggleText) {
          this.themeToggleIcon.textContent = '☀️';
          this.themeToggleText.textContent = 'Light Mode';
        }
      }, 50);
    }
    
    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  setupUIReferences() {
    // Tab Navigation
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabPanels = document.querySelectorAll('.tab-panel');

    // General Control Buttons
    this.btnGenerate = document.getElementById('btn-generate');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnExportJson = document.getElementById('btn-export-json');
    this.btnExportPdf = document.getElementById('btn-export-pdf');
    
    // Sidebar inspector references
    this.inspectorCard = document.getElementById('inspector-card');
    this.inspectorIcon = document.getElementById('inspector-icon');
    this.inspectorFilename = document.getElementById('inspector-filename');
    this.inspectorFilesize = document.getElementById('inspector-filesize');
    this.sidebarStatusWidget = document.getElementById('sidebar-status-widget');
    this.sidebarScoreMetric = document.getElementById('sidebar-score-metric');
    this.sidebarScoreText = document.getElementById('sidebar-score-text');
    this.sidebarTimerText = document.getElementById('sidebar-timer-text');
    
    // Tab 1: PDFs References
    this.dropZonePdf = document.getElementById('drop-zone');
    this.fileInputPdf = document.getElementById('file-input');
    this.pdfFileList = document.getElementById('pdf-file-list');

    // Tab 2: Text References
    this.textInputField = document.getElementById('text-input-field');
    this.textCharCount = document.getElementById('text-char-count');
    this.textWordCount = document.getElementById('text-word-count');

    // Tab 3: Article References
    this.articleUrlInput = document.getElementById('article-url-input');
    this.btnFetchArticle = document.getElementById('btn-fetch-article');
    this.articlePreviewBox = document.getElementById('article-preview-box');
    this.articleTitle = document.getElementById('article-title');
    this.articleSnippet = document.getElementById('article-snippet');

    // Tab 4: YouTube References
    this.youtubeUrlInput = document.getElementById('youtube-url-input');
    this.btnFetchYoutube = document.getElementById('btn-fetch-youtube');
    this.youtubePreviewBox = document.getElementById('youtube-preview-box');
    this.youtubeThumb = document.getElementById('youtube-thumb');
    this.youtubeTitle = document.getElementById('youtube-title');
    this.youtubeSnippet = document.getElementById('youtube-snippet');

    // Tab 5: Images References
    this.dropZoneImages = document.getElementById('image-drop-zone');
    this.fileInputImages = document.getElementById('image-file-input');
    this.imageGalleryList = document.getElementById('image-gallery-list');
    
    // Config controls
    this.selectNumQuestions = document.getElementById('select-num-questions');
    this.selectQuestionType = document.getElementById('select-question-type');
    this.selectTimeLimit = document.getElementById('select-time-limit');
    this.selectMarks = document.getElementById('select-marks');
    this.selectDifficulty = document.getElementById('select-difficulty');
    this.selectLanguage = document.getElementById('select-language');
    
    // New Config controls
    this.selectStudyMode = document.getElementById('select-study-mode');
    this.labelNumItemsText = document.getElementById('label-num-items-text');
    this.configQuestionsWrapper = document.getElementById('config-questions-wrapper');
    this.configFormatsWrapper = document.getElementById('config-formats-wrapper');
    this.configTimeLimitWrapper = document.getElementById('config-time-limit-wrapper');
    this.configMarksWrapper = document.getElementById('config-marks-wrapper');
    this.configDifficultyWrapper = document.getElementById('config-difficulty-wrapper');
    this.btnGenerateText = document.getElementById('btn-generate-text');

    // New Screens references
    this.screenAnalytics = document.getElementById('screen-analytics');

    // Sidebar references
    this.btnSidebarAnalytics = document.getElementById('btn-sidebar-analytics');
    this.btnThemeToggle = document.getElementById('btn-theme-toggle');
    this.themeToggleIcon = document.getElementById('theme-toggle-icon');
    this.themeToggleText = document.getElementById('theme-toggle-text');

    // Analytics exit & clears
    this.btnAnalyticsExit = document.getElementById('btn-analytics-exit');
    this.btnAnalyticsClear = document.getElementById('btn-analytics-clear');

    // Export separate buttons
    this.btnExportQuizOnly = document.getElementById('btn-export-quiz-only');
    this.btnExportKeyOnly = document.getElementById('btn-export-key-only');
    
    // Loading Screen Sub-states
    this.loadingStatus = document.getElementById('loading-status');
    this.loadingProgress = document.getElementById('loading-progress');
    this.stepPdf = document.getElementById('step-pdf');
    this.stepAi = document.getElementById('step-ai');
    this.stepRender = document.getElementById('step-render');
    
    // Toast Container
    this.toastContainer = document.getElementById('toast-container');
  }

  bindEvents() {
    // 1. Tab switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });

    // 2. Tab 1: PDFs Drag & Drop / Input
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZonePdf.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropZonePdf.classList.add('dragover');
      }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZonePdf.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropZonePdf.classList.remove('dragover');
      }, false);
    });
    this.dropZonePdf.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files.length > 0) {
        this.handleAddPdfs(dt.files);
      }
    });
    this.fileInputPdf.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleAddPdfs(e.target.files);
      }
    });

    // 3. Tab 2: Text input field live update
    this.textInputField.addEventListener('input', () => {
      this.pastedText = this.textInputField.value;
      const charLen = this.pastedText.length;
      const wordCount = charLen > 0 ? this.pastedText.trim().split(/\s+/).length : 0;
      
      this.textCharCount.textContent = `${charLen.toLocaleString()} / 100,000 characters`;
      this.textWordCount.textContent = `${wordCount.toLocaleString()} words`;
      
      this.updateGenerateButtonState();
      this.updateSourceInspector();
    });

    // 4. Tab 3: Article fetch trigger
    this.btnFetchArticle.addEventListener('click', () => this.handleArticleFetch());

    // 5. Tab 4: YouTube fetch trigger
    this.btnFetchYoutube.addEventListener('click', () => this.handleYouTubeFetch());

    // 6. Tab 5: Images Drag & Drop / Input
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZoneImages.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropZoneImages.classList.add('dragover');
      }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZoneImages.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropZoneImages.classList.remove('dragover');
      }, false);
    });
    this.dropZoneImages.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files.length > 0) {
        this.handleAddImages(dt.files);
      }
    });
    this.fileInputImages.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleAddImages(e.target.files);
      }
    });

    // Config adjustments
    this.selectNumQuestions.addEventListener('change', () => this.updateGenerateButtonState());
    this.selectQuestionType.addEventListener('change', () => this.updateGenerateButtonState());
    this.selectTimeLimit.addEventListener('change', () => this.updateGenerateButtonState());
    this.selectMarks.addEventListener('change', () => this.updateGenerateButtonState());
    this.selectStudyMode.addEventListener('change', () => this.handleStudyModeChange());

    // Sidebar custom triggers
    if (this.btnThemeToggle) {
      this.btnThemeToggle.addEventListener('click', () => this.handleThemeToggle());
    }
    if (this.btnSidebarAnalytics) {
      this.btnSidebarAnalytics.addEventListener('click', () => this.showAnalyticsHub());
    }

    // Analytics actions
    if (this.btnAnalyticsExit) {
      this.btnAnalyticsExit.addEventListener('click', () => this.switchScreen('screen-upload'));
    }
    if (this.btnAnalyticsClear) {
      this.btnAnalyticsClear.addEventListener('click', () => this.clearAnalyticsData());
    }

    // Export separate handlers
    if (this.btnExportQuizOnly) {
      this.btnExportQuizOnly.addEventListener('click', () => this.exportQuizOnlyPdf());
    }
    if (this.btnExportKeyOnly) {
      this.btnExportKeyOnly.addEventListener('click', () => this.exportAnswerKeyPdf());
    }

    // Core buttons actions
    this.btnGenerate.addEventListener('click', () => this.startQuizGenerationFlow());
    this.btnRestart.addEventListener('click', () => this.restartFlow());
    this.btnExportJson.addEventListener('click', () => this.exportQuizAsJson());
    this.btnExportPdf.addEventListener('click', () => this.exportQuizAsPdfStudyGuide());
  }

  // Switches input tabs
  switchTab(tabName) {
    this.activeTab = tabName;
    
    // Toggle active state on buttons
    this.tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Toggle active panels
    this.tabPanels.forEach(panel => {
      if (panel.id === `panel-${tabName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  // PDFs Multi-upload Handler
  handleAddPdfs(files) {
    let countAdded = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== 'application/pdf') {
        this.showToast(`Skipped non-PDF file: ${file.name}`, 'error');
        continue;
      }
      
      // Prevent duplicates
      if (this.selectedPdfs.some(pdf => pdf.name === file.name && pdf.size === file.size)) {
        continue;
      }
      
      this.selectedPdfs.push(file);
      countAdded++;
    }

    if (countAdded > 0) {
      this.showToast(`Successfully added ${countAdded} PDF file(s).`, 'success');
      this.renderPdfsList();
    }
  }

  // Renders PDFs list with live canvas page previews
  renderPdfsList() {
    this.pdfFileList.innerHTML = '';
    
    if (this.selectedPdfs.length === 0) {
      this.pdfFileList.classList.add('hidden');
    } else {
      this.pdfFileList.classList.remove('hidden');
      
      this.selectedPdfs.forEach((file, idx) => {
        const fileCard = document.createElement('div');
        fileCard.className = 'preview-file-card';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-preview-canvas';
        
        const details = document.createElement('div');
        details.className = 'preview-details';
        
        const name = document.createElement('h5');
        name.textContent = file.name;
        
        const meta = document.createElement('span');
        meta.textContent = this.formatBytes(file.size);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          this.selectedPdfs.splice(idx, 1);
          this.renderPdfsList();
        });
        
        details.appendChild(name);
        details.appendChild(meta);
        
        fileCard.appendChild(canvas);
        fileCard.appendChild(details);
        fileCard.appendChild(removeBtn);
        
        this.pdfFileList.appendChild(fileCard);
        
        // Asynchronously render Page 1 to canvas using PDF.js worker
        renderPDFThumbnail(file, canvas);
      });
    }

    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  // Web Article Scraper
  async handleArticleFetch() {
    const url = this.articleUrlInput.value.trim();
    if (!url) {
      this.showToast('Please enter a valid website URL.', 'error');
      return;
    }

    this.btnFetchArticle.disabled = true;
    this.btnFetchArticle.textContent = 'Fetching...';
    
    try {
      const result = await this.fetchArticleText(url);
      this.articleUrl = url;
      this.articleText = result.text;
      
      this.articleTitle.textContent = result.title;
      this.articleSnippet.textContent = result.text.substring(0, 180) + '...';
      
      this.articlePreviewBox.classList.remove('hidden');
      this.showToast('Article text retrieved successfully!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast(err.message || 'Could not fetch web article content.', 'error');
      this.articleText = '';
      this.articlePreviewBox.classList.add('hidden');
    } finally {
      this.btnFetchArticle.disabled = false;
      this.btnFetchArticle.textContent = 'Fetch Text';
      this.updateGenerateButtonState();
      this.updateSourceInspector();
    }
  }

  // Helper method to scrape page contents using CORS proxy
  async fetchArticleText(url) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error('Failed to load webpage content from this URL.');
    }
    const data = await response.json();
    const html = data.contents;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract title
    const pageTitle = doc.title || 'Web Article';
    
    // Remove unwanted interactive elements
    const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, iframe, noscript');
    elementsToRemove.forEach(el => el.remove());
    
    // Target common main article elements
    let contentText = '';
    const mainArea = doc.querySelector('main, article, #content, .content, .post, .entry-content');
    if (mainArea) {
      contentText = mainArea.innerText || mainArea.textContent;
    } else {
      contentText = doc.body.innerText || doc.body.textContent;
    }
    
    contentText = contentText.replace(/\s+/g, ' ').trim();
    if (contentText.length < 100) {
      throw new Error('Web article content seems too short or empty.');
    }
    
    return {
      title: pageTitle,
      text: contentText
    };
  }

  // YouTube Transcript Parser
  async handleYouTubeFetch() {
    const url = this.youtubeUrlInput.value.trim();
    if (!url) {
      this.showToast('Please enter a valid YouTube video URL.', 'error');
      return;
    }

    this.btnFetchYoutube.disabled = true;
    this.btnFetchYoutube.textContent = 'Processing...';

    try {
      const result = await this.fetchYouTubeTranscript(url);
      this.youtubeUrl = url;
      this.youtubeText = result.text;
      
      this.youtubeTitle.textContent = result.title;
      this.youtubeSnippet.textContent = result.text.substring(0, 180) + '...';
      
      // Load visual thumbnail from YouTube API
      this.youtubeThumb.src = `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`;
      
      this.youtubePreviewBox.classList.remove('hidden');
      this.showToast('Video transcript retrieved successfully!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast(err.message || 'Could not fetch YouTube transcript.', 'error');
      this.youtubeText = '';
      this.youtubePreviewBox.classList.add('hidden');
    } finally {
      this.btnFetchYoutube.disabled = false;
      this.btnFetchYoutube.textContent = 'Get Subtitles';
      this.updateGenerateButtonState();
      this.updateSourceInspector();
    }
  }

  // Fetches YouTube closed caption tracks and parses XML transcript
  async fetchYouTubeTranscript(url) {
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL. Please provide a standard YouTube video link.');
    }
    
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error('Failed to retrieve video details from YouTube.');
    }
    const data = await response.json();
    const html = data.contents;
    
    // Extract title
    const titleRegex = /<meta name="title" content="([^"]+)"/;
    const titleMatch = html.match(titleRegex);
    const videoTitle = titleMatch ? titleMatch[1] : 'YouTube Video';
    
    // Extract captions tracks
    const captionRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
    const captionMatch = html.match(captionRegex);
    if (!captionMatch) {
      throw new Error('Subtitles/captions are not available for this YouTube video.');
    }
    
    const playerResponse = JSON.parse(captionMatch[1]);
    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No transcript tracks found. Ensure the video has subtitles/captions.');
    }
    
    const trackUrl = captionTracks[0].baseUrl;
    let xmlText;
    try {
      const directRes = await fetch(trackUrl);
      xmlText = await directRes.text();
    } catch (e) {
      const proxyTrackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(trackUrl)}`;
      const proxyRes = await fetch(proxyTrackUrl);
      const proxyData = await proxyRes.json();
      xmlText = proxyData.contents;
    }
    
    // Parse XML transcript nodes
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textElements = xmlDoc.getElementsByTagName('text');
    if (textElements.length === 0) {
      throw new Error('Transcript track is empty.');
    }
    
    let transcriptText = '';
    for (let i = 0; i < textElements.length; i++) {
      transcriptText += textElements[i].textContent + ' ';
    }
    
    transcriptText = transcriptText
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
      
    return {
      title: videoTitle,
      videoId,
      text: transcriptText
    };
  }

  extractYouTubeVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  // Multimodal Images upload handler
  async handleAddImages(files) {
    let countAdded = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        this.showToast(`Skipped unsupported image type: ${file.name}`, 'error');
        continue;
      }
      
      if (this.selectedImages.some(img => img.file.name === file.name && img.file.size === file.size)) {
        continue;
      }

      try {
        const base64 = await this.readImageAsBase64(file);
        this.selectedImages.push({ file, base64 });
        countAdded++;
      } catch (err) {
        console.error(err);
        this.showToast(`Failed to read image file: ${file.name}`, 'error');
      }
    }

    if (countAdded > 0) {
      this.showToast(`Added ${countAdded} image(s) to workspace.`, 'success');
      this.renderImagesList();
    }
  }

  readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Renders visual thumbnails of uploaded image files
  renderImagesList() {
    this.imageGalleryList.innerHTML = '';
    
    if (this.selectedImages.length === 0) {
      this.imageGalleryList.classList.add('hidden');
    } else {
      this.imageGalleryList.classList.remove('hidden');
      
      this.selectedImages.forEach((imgObj, idx) => {
        const imgCard = document.createElement('div');
        imgCard.className = 'preview-file-card';
        
        const img = document.createElement('img');
        img.src = imgObj.base64;
        img.className = 'img-preview-thumbnail';
        
        const details = document.createElement('div');
        details.className = 'preview-details';
        
        const name = document.createElement('h5');
        name.textContent = imgObj.file.name;
        
        const meta = document.createElement('span');
        meta.textContent = this.formatBytes(imgObj.file.size);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          this.selectedImages.splice(idx, 1);
          this.renderImagesList();
        });
        
        details.appendChild(name);
        details.appendChild(meta);
        
        imgCard.appendChild(img);
        imgCard.appendChild(details);
        imgCard.appendChild(removeBtn);
        
        this.imageGalleryList.appendChild(imgCard);
      });
    }

    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  // Controls the disabled property of the Build AI Quiz button
  updateGenerateButtonState() {
    let hasSource = false;

    if (this.activeTab === 'pdf') {
      hasSource = this.selectedPdfs.length > 0;
    } else if (this.activeTab === 'text') {
      hasSource = this.pastedText.trim().length >= 50;
    } else if (this.activeTab === 'article') {
      hasSource = this.articleText.trim().length > 0;
    } else if (this.activeTab === 'youtube') {
      hasSource = this.youtubeText.trim().length > 0;
    } else if (this.activeTab === 'images') {
      hasSource = this.selectedImages.length > 0;
    }

    this.btnGenerate.disabled = !hasSource;
  }

  // Updates the sidebar "Source Inspector" details
  updateSourceInspector() {
    if (!this.inspectorCard) return;

    let hasSource = false;
    let icon = '📄';
    let title = 'No Source Loaded';
    let details = 'Select a tab and load content';

    if (this.activeTab === 'pdf' && this.selectedPdfs.length > 0) {
      hasSource = true;
      icon = '📚';
      title = `${this.selectedPdfs.length} PDF Document(s)`;
      const totalSize = this.selectedPdfs.reduce((acc, file) => acc + file.size, 0);
      details = this.formatBytes(totalSize);
    } else if (this.activeTab === 'text' && this.pastedText.trim().length >= 50) {
      hasSource = true;
      icon = '✍️';
      title = 'Raw Text Notes';
      details = `${this.pastedText.trim().split(/\s+/).length.toLocaleString()} words`;
    } else if (this.activeTab === 'article' && this.articleText.trim().length > 0) {
      hasSource = true;
      icon = '🌐';
      title = this.articleTitle.textContent;
      details = `${this.articleText.trim().split(/\s+/).length.toLocaleString()} words`;
    } else if (this.activeTab === 'youtube' && this.youtubeText.trim().length > 0) {
      hasSource = true;
      icon = '🎥';
      title = this.youtubeTitle.textContent;
      details = `${this.youtubeText.trim().split(/\s+/).length.toLocaleString()} words`;
    } else if (this.activeTab === 'images' && this.selectedImages.length > 0) {
      hasSource = true;
      icon = '🖼️';
      title = `${this.selectedImages.length} Notes Image(s)`;
      const totalSize = this.selectedImages.reduce((acc, img) => acc + img.file.size, 0);
      details = this.formatBytes(totalSize);
    }

    if (hasSource) {
      this.inspectorCard.classList.remove('empty');
      this.inspectorIcon.textContent = icon;
      this.inspectorFilename.textContent = title;
      this.inspectorFilesize.textContent = details;
    } else {
      this.inspectorCard.classList.add('empty');
      this.inspectorIcon.textContent = '📄';
      
      const tabNamesMap = {
        'pdf': 'No PDF Loaded',
        'text': 'No Text Loaded',
        'article': 'No Link Loaded',
        'youtube': 'No Video Loaded',
        'images': 'No Images Loaded'
      };
      
      const tabInstructionMap = {
        'pdf': 'Upload one or more PDFs',
        'text': 'Type or paste notes (min. 50 char)',
        'article': 'Enter an article URL to fetch',
        'youtube': 'Provide a YouTube lecture URL',
        'images': 'Upload slides/notes images'
      };

      this.inspectorFilename.textContent = tabNamesMap[this.activeTab];
      this.inspectorFilesize.textContent = tabInstructionMap[this.activeTab];
    }
  }

  // Navigation trackers and active elements mapping
  updateTrackerStep(screenId) {
    const stepsMap = {
      'screen-upload': 'tracker-step-upload',
      'screen-loading': 'tracker-step-generating',
      'screen-quiz': 'tracker-step-quiz',
      'screen-results': 'tracker-step-results'
    };
    
    // Remove active class from all trackers
    ['tracker-step-upload', 'tracker-step-generating', 'tracker-step-quiz', 'tracker-step-results'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    
    // Set target active
    const activeId = stepsMap[screenId];
    const activeEl = document.getElementById(activeId);
    if (activeEl) {
      activeEl.classList.add('active');
    }

    // Toggle Sidebar Status widgets
    if (this.sidebarStatusWidget) {
      if (screenId === 'screen-quiz') {
        this.sidebarStatusWidget.classList.remove('hidden');
        this.sidebarScoreMetric.classList.add('hidden');
      } else if (screenId === 'screen-results') {
        this.sidebarStatusWidget.classList.remove('hidden');
        this.sidebarScoreMetric.classList.remove('hidden');
        if (this.sidebarScoreText && this.quizController) {
          const questions = this.generatedQuiz ? this.generatedQuiz.questions.length : 0;
          let correct = 0;
          Object.keys(this.quizController.answers).forEach(idx => {
            if (this.quizController.answers[idx] === this.generatedQuiz.questions[idx].correctAnswer) {
              correct++;
            }
          });
          this.sidebarScoreText.textContent = `${correct}/${questions}`;
        }
      } else {
        this.sidebarStatusWidget.classList.add('hidden');
      }
    }
  }

  switchScreen(screenId) {
    Object.keys(this.screens).forEach((key) => {
      const screen = this.screens[key];
      if (screen.id === screenId) {
        screen.classList.remove('hidden');
        screen.classList.add('active-screen');
      } else {
        screen.classList.add('hidden');
        screen.classList.remove('active-screen');
      }
    });
    this.updateTrackerStep(screenId);
  }

  // Generates quiz depending on active content tab
  async startQuizGenerationFlow() {
    if (!this.apiKey) {
      this.showToast('Please set your VITE_GEMINI_API_KEY environment variable in your .env file.', 'error');
      return;
    }

    const mode = this.selectStudyMode.value;
    const detailLevel = this.selectDetailLevel.value;
    const numQuestions = parseInt(this.selectNumQuestions.value, 10);
    const questionType = this.selectQuestionType.value;
    const timeLimitMinutes = parseInt(this.selectTimeLimit.value, 10);
    const marksPerQuestion = parseInt(this.selectMarks.value, 10);
    const difficulty = this.selectDifficulty.value;
    const language = this.selectLanguage.value;
    
    this.switchScreen('screen-loading');
    this.resetLoadingSteps();

    try {
      let combinedContentText = '';
      let imgParts = [];

      // Step 1: Source content compilation
      if (this.activeTab === 'pdf') {
        this.updateLoadingStep('pdf', 'active', 'Extracting text from PDF documents...');
        
        for (let i = 0; i < this.selectedPdfs.length; i++) {
          const file = this.selectedPdfs[i];
          this.loadingStatus.textContent = `Extracting text from [${i+1}/${this.selectedPdfs.length}] ${file.name}...`;
          
          const { text } = await extractTextFromPDF(file, (progress) => {
            this.loadingProgress.style.width = `${((i + progress.percent / 100) / this.selectedPdfs.length) * 45}%`;
          });
          combinedContentText += `\n\n--- DOCUMENT SOURCE: ${file.name} ---\n` + text;
        }
        this.updateLoadingStep('pdf', 'completed');
      } else if (this.activeTab === 'text') {
        this.updateLoadingStep('pdf', 'completed');
        combinedContentText = this.pastedText;
      } else if (this.activeTab === 'article') {
        this.updateLoadingStep('pdf', 'completed');
        combinedContentText = `--- ARTICLE LINK: ${this.articleUrl} ---\n${this.articleText}`;
      } else if (this.activeTab === 'youtube') {
        this.updateLoadingStep('pdf', 'completed');
        combinedContentText = `--- YOUTUBE TRANSCRIPT: ${this.youtubeUrl} ---\n${this.youtubeText}`;
      } else if (this.activeTab === 'images') {
        this.updateLoadingStep('pdf', 'completed');
        // Encodes uploaded image files for multimodal part list
        imgParts = this.selectedImages.map(imgObj => {
          return {
            inlineData: {
              data: imgObj.base64.split(',')[1],
              mimeType: imgObj.file.type
            }
          };
        });
      }

      // Step 2: Generation using Gemini/Groq
      this.updateLoadingStep('ai', 'active', 'Generating with AI model...');
      this.loadingProgress.style.width = '65%';
      
      const studyData = await generateQuiz(combinedContentText, {
        mode,
        numQuestions,
        questionType,
        difficulty,
        language,
        apiKey: this.apiKey,
        detailLevel,
        examDate: document.getElementById('input-exam-date')?.value || '',
        studyHours: document.getElementById('input-study-hours')?.value || '2'
      }, imgParts);
      
      this.updateLoadingStep('ai', 'completed');
      
      // Step 3: Render Interactive Content
      this.updateLoadingStep('render', 'active', 'Compiling interactive material...');
      this.loadingProgress.style.width = '90%';
      
      await new Promise(r => setTimeout(r, 600));
      this.updateLoadingStep('render', 'completed');
      this.loadingProgress.style.width = '100%';
      
      // Route depending on mode
      const isQuiz = mode.startsWith('quiz-') || mode.startsWith('exam-') || mode.startsWith('bloom-');
      
      if (isQuiz) {
        this.generatedQuiz = studyData;
        this.switchScreen('screen-quiz');
        this.quizController.startQuiz(this.generatedQuiz, timeLimitMinutes, marksPerQuestion);
        this.showToast('Quiz generated successfully! Best of luck!', 'success');
      } else {
        throw new Error('Unsupported mode generated.');
      }
      
    } catch (error) {
      console.error(error);
      this.showToast(error.message || 'An error occurred during generation.', 'error');
      this.switchScreen('screen-upload');
    }
  }

  resetLoadingSteps() {
    this.loadingProgress.style.width = '0%';
    this.loadingStatus.textContent = '';
    
    const steps = [this.stepPdf, this.stepAi, this.stepRender];
    steps.forEach((step) => {
      step.className = '';
    });
  }

  updateLoadingStep(stepKey, state, message = '') {
    let element;
    if (stepKey === 'pdf') element = this.stepPdf;
    if (stepKey === 'ai') element = this.stepAi;
    if (stepKey === 'render') element = this.stepRender;
    
    if (!element) return;
    
    if (state === 'active') {
      element.className = 'active';
      if (message) this.loadingStatus.textContent = message;
    } else if (state === 'completed') {
      element.className = 'completed';
    }
  }

  // Resets app logic back to home screen
  restartFlow() {
    this.switchScreen('screen-upload');
    this.selectedPdfs = [];
    this.pastedText = '';
    this.articleUrl = '';
    this.articleText = '';
    this.youtubeUrl = '';
    this.youtubeText = '';
    this.selectedImages = [];
    
    this.fileInputPdf.value = '';
    this.textInputField.value = '';
    this.articleUrlInput.value = '';
    this.youtubeUrlInput.value = '';
    this.fileInputImages.value = '';
    
    this.articlePreviewBox.classList.add('hidden');
    this.youtubePreviewBox.classList.add('hidden');
    this.pdfFileList.classList.add('hidden');
    this.imageGalleryList.classList.add('hidden');
    
    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = document.createElement('span');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    
    const text = document.createElement('span');
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    this.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  exportQuizAsJson() {
    if (!this.generatedQuiz) return;
    
    const quizWithAnswers = {
      ...this.generatedQuiz,
      userAnswers: this.quizController.answers,
      score: this.quizController.resultsScoreFraction.textContent,
      timeTaken: this.quizController.resultsMetricTime.textContent
    };
    
    const blob = new Blob([JSON.stringify(quizWithAnswers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.generatedQuiz.title.replace(/\s+/g, '_')}_quiz.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('Quiz exported as JSON!', 'success');
  }

  exportQuizAsPdfStudyGuide() {
    if (!this.generatedQuiz) return;
    
    const quiz = this.generatedQuiz;
    const answers = this.quizController.answers;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.showToast('Pop-up blocked. Please allow pop-ups to print the study guide.', 'error');
      return;
    }
    
    let questionsHtml = '';
    quiz.questions.forEach((q, idx) => {
      const userAnswer = answers[idx];
      const isCorrect = userAnswer === q.correctAnswer;
      
      let optionsHtml = '';
      q.options.forEach((opt) => {
        const isSelected = opt === userAnswer;
        const isCorrectOpt = opt === q.correctAnswer;
        
        let marker = 'o';
        let style = '';
        if (isCorrectOpt) {
          marker = '[Correct] ✓';
          style = 'font-weight: bold; color: #059669;';
        } else if (isSelected && !isCorrectOpt) {
          marker = '[Your Choice] ✗';
          style = 'color: #dc2626; text-decoration: line-through;';
        }
        
        optionsHtml += `<li style="margin-bottom: 0.4rem; ${style}">${marker} ${opt}</li>`;
      });

      questionsHtml += `
        <div style="margin-bottom: 2rem; page-break-inside: avoid; border-bottom: 1px solid #e2e8f0; padding-bottom: 1.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: #1e293b;">Question ${idx + 1}: ${q.text}</h3>
          <ul style="list-style-type: none; padding-left: 0.5rem; margin-bottom: 1rem;">
            ${optionsHtml}
          </ul>
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 1rem; border-radius: 4px; font-size: 0.95rem;">
            <strong>Explanation:</strong> ${q.explanation}
          </div>
        </div>
      `;
    });

    const docContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Study Guide - ${quiz.title}</title>
        <style>
          body {
            font-family: 'Inter', system-ui, sans-serif;
            line-height: 1.5;
            color: #334155;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
          }
          h1 {
            color: #0f172a;
            border-bottom: 2px solid #10b981;
            padding-bottom: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            color: #64748b;
            font-size: 0.9rem;
            margin-bottom: 2rem;
          }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 1rem;">
          <button onclick="window.print()" style="background-color: #10b981; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.9rem;">
            Print Study Guide
          </button>
        </div>
        <h1>${quiz.title}</h1>
        <div class="meta-info">
          <span>AI Generated Study Guide</span>
          <span>Score: ${this.quizController.resultsScoreFraction.textContent} (${this.quizController.resultsScorePercent.textContent})</span>
        </div>
        <div>
          ${questionsHtml}
        </div>
        <footer style="margin-top: 3rem; text-align: center; font-size: 0.8rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
          Generated by QuizCraft AI from uploaded materials. Keep learning!
        </footer>
      </body>
      </html>
    `;

    printWindow.document.write(docContent);
    printWindow.document.close();
  }

  handleStudyModeChange() {
    const mode = this.selectStudyMode.value;
    
    // For all quiz modes, all configuration panels are shown
    this.configQuestionsWrapper.classList.remove('hidden');
    this.configFormatsWrapper.classList.remove('hidden');
    this.configTimeLimitWrapper.classList.remove('hidden');
    this.configMarksWrapper.classList.remove('hidden');
    this.configDifficultyWrapper.classList.remove('hidden');

    this.labelNumItemsText.textContent = 'Number of Questions';
    Array.from(this.selectNumQuestions.options).forEach(opt => {
      opt.textContent = `${opt.value} Questions`;
    });

    const modeLabels = {
      'quiz-standard': 'Build AI Quiz',
      'quiz-chapter': 'Generate Chapter Quiz',
      'quiz-topic': 'Generate Topic Quiz',
      'exam-gtu': 'Generate GTU Quiz',
      'exam-cbse': 'Generate CBSE Quiz',
      'exam-uni': 'Generate University Quiz',
      'bloom-remember': 'Bloom: Remember Quiz',
      'bloom-understand': 'Bloom: Understand Quiz',
      'bloom-apply': 'Bloom: Apply Quiz',
      'bloom-analyze': 'Bloom: Analyze Quiz',
      'bloom-evaluate': 'Bloom: Evaluate Quiz',
      'bloom-create': 'Bloom: Create Quiz'
    };
    this.btnGenerateText.textContent = modeLabels[mode] || 'Generate';

    this.updateGenerateButtonState();
    this.updateSourceInspector();
  }

  handleFlashcardMastery(e, status) {
    e.stopPropagation();
    this.flashcardMastery[this.activeFlashcardIndex] = status;
    if (status === 'review') {
      this.btnFlashcardReview.classList.add('active');
      this.btnFlashcardMaster.classList.remove('active');
    } else {
      this.btnFlashcardMaster.classList.add('active');
      this.btnFlashcardReview.classList.remove('active');
    }
    this.recalculateFlashcardMasteryRatio();
  }

  navigateFlashcard(direction) {
    const total = this.flashcardsData.length;
    if (direction === 1) {
      if (this.activeFlashcardIndex < total - 1) {
        this.activeFlashcardIndex++;
        this.renderCurrentFlashcard();
      } else {
        this.showToast('Congratulations on completing the study deck!', 'success');
        this.switchScreen('screen-upload');
      }
    } else if (direction === -1) {
      if (this.activeFlashcardIndex > 0) {
        this.activeFlashcardIndex--;
        this.renderCurrentFlashcard();
      }
    }
  }

  recalculateFlashcardMasteryRatio() {
    const total = this.flashcardsData.length;
    if (total === 0) return;
    let masterCount = 0;
    Object.values(this.flashcardMastery).forEach(status => {
      if (status === 'master') masterCount++;
    });
    const ratio = Math.round((masterCount / total) * 100);
    this.flashcardMasteryRatio.textContent = `${ratio}% Mastered`;
  }

  startFlashcardPlayer(deckData) {
    this.flashcardsData = deckData.flashcards || [];
    this.activeFlashcardIndex = 0;
    this.flashcardMastery = {};
    this.renderCurrentFlashcard();
  }



  handleThemeToggle() {
    const body = document.body;
    body.classList.toggle('light-theme');
    const isLight = body.classList.contains('light-theme');
    
    localStorage.setItem('quiz_theme', isLight ? 'light' : 'dark');
    
    if (this.themeToggleIcon && this.themeToggleText) {
      this.themeToggleIcon.textContent = isLight ? '☀️' : '🌙';
      this.themeToggleText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
    }
    this.showToast(`Theme switched to ${isLight ? 'Light' : 'Dark'} Mode!`, 'success');
  }

  showAnalyticsHub() {
    this.switchScreen('screen-analytics');
    
    const streak = localStorage.getItem('quiz_streak') || '0';
    const points = localStorage.getItem('quiz_points') || '0';
    
    let rank = 'Bronze Tier';
    const ptsNum = parseInt(points, 10);
    if (ptsNum >= 600) rank = 'Platinum Tier';
    else if (ptsNum >= 300) rank = 'Gold Tier';
    else if (ptsNum >= 100) rank = 'Silver Tier';
    
    document.getElementById('analytics-streak').textContent = `🔥 ${streak} Days`;
    document.getElementById('analytics-points').textContent = `⭐ ${points} pts`;
    document.getElementById('analytics-rank').textContent = rank;
    
    const history = JSON.parse(localStorage.getItem('quiz_history') || '[]');
    const strongList = document.getElementById('analytics-strong-list');
    const weakList = document.getElementById('analytics-weak-list');
    
    strongList.innerHTML = '';
    weakList.innerHTML = '';
    
    if (history.length === 0) {
      strongList.innerHTML = '<li>Take a quiz to compute strong topics!</li>';
      weakList.innerHTML = '<li>Take a quiz to compute weak topics!</li>';
    } else {
      const topicStats = {};
      history.forEach(run => {
        if (!topicStats[run.topic]) {
          topicStats[run.topic] = { totalPct: 0, count: 0 };
        }
        topicStats[run.topic].totalPct += run.percent;
        topicStats[run.topic].count += 1;
      });
      
      let hasStrong = false;
      let hasWeak = false;
      
      Object.keys(topicStats).forEach(topicName => {
        const avg = Math.round(topicStats[topicName].totalPct / topicStats[topicName].count);
        const li = document.createElement('li');
        li.textContent = `${topicName} (Avg: ${avg}%)`;
        
        if (avg >= 75) {
          strongList.appendChild(li);
          hasStrong = true;
        } else {
          weakList.appendChild(li);
          hasWeak = true;
        }
      });
      
      if (!hasStrong) strongList.innerHTML = '<li>None yet (keep scoring >= 75%)</li>';
      if (!hasWeak) weakList.innerHTML = '<li>None yet! You have no weak topics! 🎉</li>';
    }
    
    const badgesContainer = document.getElementById('analytics-badges-container');
    badgesContainer.innerHTML = '';
    
    const allBadges = [
      { id: 'first_win', title: '🏆 First Victory', desc: 'Score 100% on a quiz of at least 5 questions.' },
      { id: 'streak_master', title: '🔥 Streak Master', desc: 'Maintain a study streak of at least 3 days.' },
      { id: 'speed_runner', title: '🎓 Speed Runner', desc: 'Complete any timed quiz in under 60 seconds.' },
      { id: 'intellect', title: '🎖️ Intellect', desc: 'Pass a generated quiz set to Hard difficulty.' }
    ];
    
    const unlockedBadges = JSON.parse(localStorage.getItem('quiz_badges') || '[]');
    allBadges.forEach(badge => {
      const isLocked = !unlockedBadges.includes(badge.id);
      const div = document.createElement('div');
      div.className = `badge-item ${isLocked ? 'locked' : ''}`;
      div.innerHTML = `
        <div class="badge-icon">${badge.title.split(' ')[0]}</div>
        <div class="badge-title">${badge.title.substring(2)}</div>
        <div class="badge-desc">${badge.desc}</div>
      `;
      badgesContainer.appendChild(div);
    });
    
    this.renderAnalyticsGraph(history);
  }

  renderAnalyticsGraph(history) {
    const chartContainer = document.getElementById('analytics-chart-container');
    if (!chartContainer) return;
    
    chartContainer.innerHTML = '';
    
    if (history.length === 0) {
      chartContainer.innerHTML = '<div style="width: 100%; text-align: center; color: var(--text-medium); font-size: 0.9rem; margin-bottom: 4.5rem;">Take a quiz to see your progress graph!</div>';
      return;
    }
    
    const recentRuns = history.slice(-8);
    recentRuns.forEach((run, idx) => {
      const barWrapper = document.createElement('div');
      barWrapper.style.display = 'flex';
      barWrapper.style.flexDirection = 'column';
      barWrapper.style.alignItems = 'center';
      barWrapper.style.flexGrow = '1';
      barWrapper.style.height = '100%';
      barWrapper.style.justifyContent = 'flex-end';
      
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      bar.style.height = `${run.percent}%`;
      bar.style.width = '30px';
      bar.textContent = `${run.percent}%`;
      bar.title = `${run.topic}\nDate: ${run.date}\nScore: ${run.percent}%`;
      
      const label = document.createElement('span');
      label.style.fontSize = '0.7rem';
      label.style.color = 'var(--text-low)';
      label.style.marginTop = '0.5rem';
      label.textContent = `Q${idx + 1}`;
      
      barWrapper.appendChild(bar);
      barWrapper.appendChild(label);
      chartContainer.appendChild(barWrapper);
    });
  }

  clearAnalyticsData() {
    if (confirm('Are you sure you want to reset all of your progress, history, points, and streaking records?')) {
      localStorage.removeItem('quiz_history');
      localStorage.removeItem('quiz_points');
      localStorage.removeItem('quiz_streak');
      localStorage.removeItem('quiz_last_active');
      localStorage.removeItem('quiz_badges');
      
      if (this.quizController) {
        this.quizController.points = 0;
        this.quizController.streak = 0;
        this.quizController.lastActiveDate = '';
      }
      this.showToast('All progress records have been reset.', 'success');
      this.showAnalyticsHub();
    }
  }



  exportQuizOnlyPdf() {
    if (!this.generatedQuiz) return;
    const quiz = this.generatedQuiz;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.showToast('Pop-up blocked. Please allow pop-ups to print the quiz.', 'error');
      return;
    }
    
    let questionsHtml = '';
    quiz.questions.forEach((q, idx) => {
      let optionsHtml = '';
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt) => {
          optionsHtml += `<li style="margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 4px;">○ ${opt}</li>`;
        });
      } else {
        const lines = q.type === 'long-answer' ? 6 : q.type === 'short-answer' ? 3 : 1;
        optionsHtml = `<div style="border: 1px solid #e2e8f0; height: ${lines * 1.5}rem; border-radius: 4px; margin-top: 0.5rem; background: #fafafa;"></div>`;
      }

      questionsHtml += `
        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: #1e293b;">Question ${idx + 1}: ${q.text}</h3>
          <ul style="list-style-type: none; padding-left: 0; margin-bottom: 1rem;">
            ${optionsHtml}
          </ul>
        </div>
      `;
    });

    const docContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quiz - ${quiz.title}</title>
        <style>
          body { font-family: system-ui, sans-serif; line-height: 1.5; color: #334155; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1 { color: #0f172a; border-bottom: 2px solid #06b6d4; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 1rem;">
          <button onclick="window.print()" style="background-color: #06b6d4; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
            Print Quiz Questions
          </button>
        </div>
        <h1>${quiz.title}</h1>
        <div>
          ${questionsHtml}
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(docContent);
    printWindow.document.close();
  }

  exportAnswerKeyPdf() {
    if (!this.generatedQuiz) return;
    const quiz = this.generatedQuiz;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.showToast('Pop-up blocked. Please allow pop-ups to print the answer key.', 'error');
      return;
    }
    
    let answersHtml = '';
    quiz.questions.forEach((q, idx) => {
      answersHtml += `
        <div style="margin-bottom: 1.5rem; page-break-inside: avoid; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem;">
          <h3 style="font-size: 1.05rem; margin-bottom: 0.5rem; color: #1e293b;">Question ${idx + 1}: ${q.text}</h3>
          <p style="margin: 0 0 0.5rem 0; color: #059669; font-weight: bold;">✅ Correct Answer: ${q.correctAnswer}</p>
          <p style="margin: 0 0 0.5rem 0; font-size: 0.95rem; color: #475569;"><strong>Explanation:</strong> ${q.explanation}</p>
          ${q.reference ? `<p style="margin: 0; font-size: 0.85rem; color: #6b7280; font-style: italic;">Reference: ${q.reference}</p>` : ''}
        </div>
      `;
    });

    const docContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Answer Key - ${quiz.title}</title>
        <style>
          body { font-family: system-ui, sans-serif; line-height: 1.5; color: #334155; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1 { color: #0f172a; border-bottom: 2px solid #fbbf24; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 1rem;">
          <button onclick="window.print()" style="background-color: #fbbf24; color: #0f172a; padding: 0.6rem 1.2rem; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
            Print Answer Key
          </button>
        </div>
        <h1>Answer Key - ${quiz.title}</h1>
        <div>
          ${answersHtml}
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(docContent);
    printWindow.document.close();
  }


}

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
  new AppState();
});
