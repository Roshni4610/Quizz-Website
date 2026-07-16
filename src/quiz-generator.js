import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Generates a quiz from text content using Google's Gemini API.
 * 
 * @param {string} text - The raw text content of the PDF.
 * @param {object} config - Configuration options.
 * @param {number} config.numQuestions - Number of questions to generate.
 * @param {string} config.questionType - Question types.
 * @param {string} config.difficulty - Difficulty level ('easy', 'medium', 'hard').
 * @param {string} config.language - Output language.
 * @param {string} config.apiKey - The Gemini API key (client-supplied).
 * @returns {Promise<object>} The generated quiz JSON object matching the schema.
 */
export async function generateQuiz(text, config, imageParts = []) {
  const { mode = 'quiz-standard', numQuestions, difficulty, language, apiKey, questionType = 'mixed' } = config;

  if (!apiKey) {
    throw new Error('API Key is missing. Please configure it in Settings.');
  }

  // Truncate text if it is excessively long to prevent model lag (100k chars is ~20k words)
  const maxChars = 100000;
  let truncatedText = text;
  if (text && text.length > maxChars) {
    console.warn(`Text is too long (${text.length} chars). Truncating to first ${maxChars} chars.`);
    truncatedText = text.substring(0, maxChars) + '\n\n[... Remaining content truncated for performance ...]';
  }

  try {
    // Initialize the Gemini API client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use gemini-3.5-flash for fast and cost-effective text tasks
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: 'You are an elite educational assistant and tutor. Your goal is to draft clean, academically rigorous, and accurate study aids based on the provided text or image materials.',
    });

    // 1. Response schema based on study mode
    let responseSchema;
    
    let allowedEnumTypes = ['multiple-choice', 'true-false', 'fill-blanks', 'one-word', 'short-answer', 'long-answer', 'assertion-reason'];
    if (questionType === 'mcq') {
      allowedEnumTypes = ['multiple-choice', 'true-false'];
    } else if (questionType === 'theory') {
      allowedEnumTypes = ['short-answer', 'long-answer'];
    } else if (questionType === 'viva') {
      allowedEnumTypes = ['one-word', 'short-answer'];
    }

    responseSchema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A descriptive title for the quiz.' },
        questions: {
          type: 'array',
          description: 'List of quiz questions.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              text: { type: 'string', description: 'The question text.' },
              type: { 
                type: 'string', 
                enum: allowedEnumTypes
              },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of options. For true-false, must be exactly ["True", "False"] in the quiz language. Empty [] for blanks, one-word, and descriptive short/long answers.'
              },
              correctAnswer: { type: 'string', description: 'Correct answer matching option or ideal text response.' },
              explanation: { type: 'string', description: 'Detailed explanation for why it is correct.' },
              reference: { type: 'string', description: 'The page number or section from the PDF where this concept is explained, e.g. Page 12' },
              chapter: { type: 'string', description: 'Name of the chapter/section, if generating a Chapter-wise quiz. Leave blank otherwise.' },
              topic: { type: 'string', description: 'Name of the sub-topic, if generating a Topic-wise quiz. Leave blank otherwise.' }
            },
            required: ['id', 'text', 'type', 'options', 'correctAnswer', 'explanation', 'reference']
          }
        }
      },
      required: ['title', 'questions']
    };

    // 2. Draft target prompt
    let prompt = ``;
    if (truncatedText && truncatedText.trim()) {
      prompt += `
--- SOURCE MATERIAL TEXT START ---
${truncatedText}
--- SOURCE MATERIAL TEXT END ---
`;
    }

    prompt += `
Generate quiz in ${language} using the source material text/images above.
Selected Study Mode: ${mode}

Generate a structured quiz:
- Number of questions: ${numQuestions}
- Question Category/Style: ${questionType.toUpperCase()} (MCQ = multiple-choice & true/false; Theory = short/long descriptive answers; Viva = oral questions; Mixed = balanced combination of all question types)
- Difficulty Level: ${difficulty}
- Language: ${language}
- Reference Extraction: For every single question, locate the exact page or section where the answer is found in the text, and populate the 'reference' property (e.g. 'Page 12' or 'Section 3.1').
`;
    if (mode.startsWith('exam-')) {
      const pattern = mode.replace('exam-', '').toUpperCase();
      prompt += `\n- Exam Style Pattern: Generate questions strictly following the ${pattern} exam pattern guidelines (including standard marking criteria, formal tone, and conceptual weightages).`;
    }
    if (mode.startsWith('bloom-')) {
      const category = mode.replace('bloom-', '').toUpperCase();
      prompt += `\n- Bloom's Taxonomy Cognitive Level: Structure questions to test the '${category}' skill (Remember, Understand, Apply, Analyze, Evaluate, Create) according to Bloom's educational objectives.`;
    }
    
    prompt += `\nAdditional Mode-specific Quiz Instructions:`;
    if (mode === 'quiz-chapter') {
      prompt += `
- Chapter-wise Mode: Identify the distinct chapters or main thematic sections within the source material. For every generated question, populate the 'chapter' property with the chapter/section name (e.g. 'Chapter 2: Linear Regression'). Group questions logically across chapters.
`;
    } else if (mode === 'quiz-topic') {
      prompt += `
- Topic-wise Mode: Identify the core conceptual sub-topics in the material. For every generated question, populate the 'topic' property with the sub-topic tag (e.g. 'Backpropagation' or 'SQL Joins').
`;
    } else {
      prompt += `
- Standard Mode: Keep 'chapter' and 'topic' blank or empty strings.
`;
    }

    prompt += `
Additional Question Constraints:
1. For multiple-choice questions, provide exactly 4 options. Make sure the distractors are plausible.
2. For true-false questions, the options array MUST be exactly ["True", "False"] (translated to the quiz language, e.g. ["Vrai", "Faux"] for French or ["True", "False"] for English).
3. For fill-blanks questions, provide a question sentence with a blank represented as '_______'. The options array MUST be empty.
4. For one-word questions, ask for a single key term. The options array MUST be empty.
5. For short-answer questions, write a conceptual question requiring 2-3 sentences. Options empty.
6. For long-answer questions, write an analysis question requiring a paragraph explanation. Options empty.
7. For assertion-reason questions, format exactly as 'Assertion (A): [statement]. Reason (R): [statement].' The options array MUST contain exactly the 4 standard assertion-reason choices in ${language}.
`;

    // Compile parts
    const contentParts = [];
    if (imageParts && imageParts.length > 0) {
      imageParts.forEach(part => contentParts.push(part));
    }
    contentParts.push({ text: prompt });

    // Check if key is a Groq API Key
    const isGroq = apiKey.startsWith('gsk_');

    if (isGroq) {
      if (imageParts && imageParts.length > 0) {
        throw new Error('Image inputs (Multimodal) are only supported when using an API Key. Please use PDF, Text, Article, or YouTube transcript tabs instead.');
      }

      const apiPromise = fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are an elite educational assistant. You must respond ONLY with a valid, raw JSON object matching the requested schema. Do not write any markdown blocks (like \`\`\`json) or extra text outside the JSON.
Requested Schema:
${JSON.stringify(responseSchema, null, 2)}`
            },
            {
              role: 'user',
              content: prompt + '\n\nIMPORTANT: Return ONLY a raw JSON object fitting the requested JSON schema. Do not wrap in markdown or backticks.'
            }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Groq generation request timed out (15s). Please check your internet connection.')), 15000)
      );

      const responseRes = await Promise.race([apiPromise, timeoutPromise]);
      if (!responseRes.ok) {
        const errText = await responseRes.text();
        throw new Error(`Groq API returned an error: ${responseRes.status} - ${errText}`);
      }

      const resJson = await responseRes.json();
      const jsonText = resJson.choices[0].message.content;
      const data = JSON.parse(jsonText);

      // Validate structure
      if (!data.title || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('Groq returned an invalid quiz structure.');
      }

      return data;
    }

    // Default: Make the Gemini API call with JSON constraints and a 15-second timeout race
    const apiPromise = model.generateContent({
      contents: [{ role: 'user', parts: contentParts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.3,
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Generation request timed out (15s). Please check your internet connection and verify that your API Key in .env is valid.')), 15000)
    );

    const result = await Promise.race([apiPromise, timeoutPromise]);

    const response = await result.response;
    const jsonText = response.text();
    const data = JSON.parse(jsonText);

    // Validate structure
    if (!data.title || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('API returned an invalid quiz structure.');
    }

    return data;
  } catch (error) {
    console.error('Generation Error:', error);
    if (error.message && error.message.includes('API_KEY_INVALID')) {
      throw new Error('Invalid API Key. Please verify your key in Settings.');
    }
    if (error.message && error.message.includes('quota')) {
      throw new Error('API Rate limit exceeded. Please try again in a moment.');
    }
    throw new Error(`Failed to generate: ${error.message || 'Unknown API error'}`);
  }
}

