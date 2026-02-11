export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface AmbiguityResult {
  isAmbiguous: boolean;
  questions?: string[];
  reason?: string;
}

/**
 * Validates if a prompt is meaningful and not gibberish
 */
export function validatePrompt(prompt: string): ValidationResult {
  const trimmed = prompt.trim();
  
  // Empty check
  if (!trimmed) {
    return { isValid: false, error: "Please enter a prompt" };
  }
  
  // Minimum length check (at least 5 characters)
  if (trimmed.length < 5) {
    return { isValid: false, error: "Prompt is too short. Please provide more details." };
  }
  
  // Check for excessive repeated characters (e.g., "aaaaaaa")
  const repeatedCharsPattern = /(.)\1{4,}/;
  if (repeatedCharsPattern.test(trimmed)) {
    return { isValid: false, error: "Invalid input detected. Please enter a meaningful prompt." };
  }
  
  // Check for minimum word count (at least 2 words)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) {
    return { isValid: false, error: "Please provide more details (at least 2 words)." };
  }
  
  // Check for excessive special characters (more than 50% of content)
  const specialCharsCount = (trimmed.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const specialCharsRatio = specialCharsCount / trimmed.length;
  if (specialCharsRatio > 0.5) {
    return { isValid: false, error: "Too many special characters. Please use normal text." };
  }
  
  // Check for keyboard mashing patterns (e.g., "asdfghjkl", "qwerty")
  const keyboardPatterns = [
    /qwerty/i,
    /asdfgh/i,
    /zxcvbn/i,
    /qazwsx/i,
    /123456/,
  ];
  for (const pattern of keyboardPatterns) {
    if (pattern.test(trimmed)) {
      return { isValid: false, error: "Invalid input detected. Please enter a meaningful prompt." };
    }
  }
  
  // Check for excessive punctuation (e.g., "!!!!!!!")
  const punctuationPattern = /[!?.]{4,}/;
  if (punctuationPattern.test(trimmed)) {
    return { isValid: false, error: "Excessive punctuation detected. Please use normal text." };
  }
  
  // Check character diversity (at least 5 unique characters)
  const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s/g, ''));
  if (uniqueChars.size < 5) {
    return { isValid: false, error: "Input lacks variety. Please provide a meaningful prompt." };
  }
  
  return { isValid: true };
}

/**
 * Detects if a prompt is ambiguous and needs clarification
 */
export function detectAmbiguity(prompt: string, isUpdate: boolean): AmbiguityResult {
  const trimmed = prompt.toLowerCase().trim();
  const words = trimmed.split(/\s+/);
  
  // For new project creation
  if (!isUpdate) {
    // Check if prompt is too vague for project creation
    const vaguePhrases = [
      'make a project',
      'create something',
      'build something',
      'new project',
      'help me',
    ];
    
    if (vaguePhrases.some(phrase => trimmed === phrase || trimmed.startsWith(phrase + ' '))) {
      return {
        isAmbiguous: true,
        questions: [
          "What type of project do you want to create?",
          "What is the main goal or purpose?",
          "How many people will work on it?",
          "What is the estimated timeline?"
        ],
        reason: "Project description is too vague"
      };
    }
    
    // Check if missing key project details (very short prompts)
    if (words.length < 5) {
      return {
        isAmbiguous: true,
        questions: [
          "Can you provide more details about the project?",
          "What is the project about?",
          "Who will be working on it?",
          "What is the timeline?"
        ],
        reason: "Need more project details"
      };
    }
  }
  
  // For project updates
  if (isUpdate) {
    // Vague update instructions
    const vagueUpdatePhrases = [
      /^add someone$/,
      /^add person$/,
      /^add task$/,
      /^add a task$/,
      /^remove someone$/,
      /^delete person$/,
      /^change it$/,
      /^update it$/,
      /^make it better$/,
      /^improve$/,
      /^fix it$/,
      /^change dates?$/,
      /^update timeline$/,
    ];
    
    for (const pattern of vagueUpdatePhrases) {
      if (pattern.test(trimmed)) {
        // Generate specific questions based on the vague command
        if (trimmed.includes('add') && (trimmed.includes('someone') || trimmed.includes('person'))) {
          return {
            isAmbiguous: true,
            questions: [
              "What is the person's name?",
              "What role or responsibilities will they have?"
            ],
            reason: "Missing person details"
          };
        }
        
        if (trimmed.includes('add') && trimmed.includes('task')) {
          return {
            isAmbiguous: true,
            questions: [
              "What is the task description?",
              "Who should be assigned to this task?"
            ],
            reason: "Missing task details"
          };
        }
        
        if (trimmed.includes('remove') || trimmed.includes('delete')) {
          return {
            isAmbiguous: true,
            questions: [
              "Who or what do you want to remove?",
              "Please specify the name or item to remove."
            ],
            reason: "Missing removal target"
          };
        }
        
        if (trimmed.includes('change') || trimmed.includes('update')) {
          return {
            isAmbiguous: true,
            questions: [
              "What specifically do you want to change?",
              "Please provide more details about the update."
            ],
            reason: "Update instruction too vague"
          };
        }
        
        // Generic vague instruction
        return {
          isAmbiguous: true,
          questions: [
            "Can you be more specific about what you want to change?",
            "What details should be updated?"
          ],
          reason: "Instruction too vague"
        };
      }
    }
    
    // Check for pronouns without clear antecedents
    const hasVaguePronouns = /\b(it|that|this|them|those)\b/.test(trimmed);
    const hasNoSpecificNames = !/\b[A-Z][a-z]+\b/.test(prompt); // No capitalized names
    
    if (hasVaguePronouns && hasNoSpecificNames && words.length < 8) {
      return {
        isAmbiguous: true,
        questions: [
          "Can you be more specific about what you're referring to?",
          "Please mention specific names or items to update."
        ],
        reason: "Unclear reference"
      };
    }
  }
  
  return { isAmbiguous: false };
}
