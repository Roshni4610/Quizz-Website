import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extracts text content from an uploaded PDF file page-by-page.
 * @param {File} file - The file uploaded by the user.
 * @param {Function} onProgress - Callback to notify parent component of extraction progress.
 * @returns {Promise<{text: string, pageCount: number}>} Resolves with extracted text and total pages.
 */
export async function extractTextFromPDF(file, onProgress = () => {}) {
  try {
    onProgress({ percent: 10, status: 'Reading file data...' });
    
    // Read the file as an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    onProgress({ percent: 20, status: 'Loading PDF document structure...' });
    
    // Load the document using PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    let extractedText = '';
    
    // Extract text page by page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({ 
        percent: 20 + Math.round((pageNum / numPages) * 75), 
        status: `Parsing text from page ${pageNum} of ${numPages}...` 
      });
      
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items on the page
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      
      extractedText += `--- Page ${pageNum} ---\n` + pageText + '\n\n';
    }
    
    onProgress({ percent: 100, status: 'Extraction complete!' });
    
    return {
      text: extractedText.trim(),
      pageCount: numPages
    };
  } catch (error) {
    console.error('Error during PDF extraction:', error);
    throw new Error('Could not parse the PDF file. Please ensure it is not password-protected or corrupted.');
  }
}

/**
 * Renders the first page of a PDF file to a canvas element as a visual cover preview.
 * @param {File} file - The uploaded PDF file.
 * @param {HTMLCanvasElement} canvasElement - The canvas element to render to.
 * @returns {Promise<void>} Resolves when rendering is complete.
 */
export async function renderPDFThumbnail(file, canvasElement) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    const context = canvasElement.getContext('2d');
    const targetHeight = 120; // fixed visual preview height
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = targetHeight / unscaledViewport.height;
    const viewport = page.getViewport({ scale });
    
    canvasElement.height = viewport.height;
    canvasElement.width = viewport.width;
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext).promise;
  } catch (error) {
    console.error('Error rendering PDF thumbnail:', error);
    // Draw a fallback generic document icon on failure
    const context = canvasElement.getContext('2d');
    canvasElement.height = 120;
    canvasElement.width = 90;
    context.fillStyle = 'rgba(255, 255, 255, 0.05)';
    context.fillRect(0, 0, 90, 120);
    context.fillStyle = '#10b981';
    context.font = '24px sans-serif';
    context.fillText('📄', 30, 70);
  }
}

