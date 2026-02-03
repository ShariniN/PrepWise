// Language normalization and code generation utilities

export const normalizeLanguageName = (language) => {
  if (!language || typeof language !== 'string') return 'javascript';
  
  const normalizedMap = {
    'javascript': 'javascript', 'js': 'javascript', 'nodejs': 'javascript', 'node': 'javascript', 'node.js': 'javascript',
    'python': 'python', 'python3': 'python', 'py': 'python',
    'java': 'java',
    'cpp': 'cpp', 'c++': 'cpp', 'cpp17': 'cpp',
    'c': 'c',
    'c#': 'csharp', 'csharp': 'csharp', 'cs': 'csharp',
    'php': 'php',
    'go': 'go', 'golang': 'go'
  };
  
  return normalizedMap[language.toLowerCase()] || 'javascript';
};

export const selectBestLanguage = (resumeText, suggestedLanguage) => {
  const supportedLanguages = ['javascript', 'python', 'java', 'cpp', 'c', 'csharp', 'php', 'go'];
  const normalizedSuggested = normalizeLanguageName(suggestedLanguage);
  
  if (suggestedLanguage && supportedLanguages.includes(normalizedSuggested)) {
    return normalizedSuggested;
  }
  
  const patterns = {
    'javascript': /javascript|js\b|node\.?js|react|vue|angular|express|npm|typescript/i,
    'python': /python|django|flask|pandas|numpy|tensorflow|pytorch|pip/i,
    'java': /\bjava\b(?!script)|spring|hibernate|maven|gradle|android/i,
    'cpp': /c\+\+|cpp|std::|boost|qt|cmake/i,
    'c': /\bc\b(?!\+|#)|gcc|glibc|posix|embedded/i,
    'csharp': /c#|csharp|\.net|asp\.net|unity|xamarin/i,
    'php': /php|laravel|symfony|composer|wordpress/i,
    'go': /\bgo\b|golang|goroutine|gin/i
  };
  
  const languageCount = {};
  supportedLanguages.forEach(lang => {
    const matches = resumeText.match(patterns[lang]);
    languageCount[lang] = matches ? matches.length : 0;
  });
  
  const bestLanguage = Object.keys(languageCount).reduce((a, b) => 
    languageCount[a] > languageCount[b] ? a : b
  );
  
  return languageCount[bestLanguage] > 0 ? bestLanguage : 'javascript';
};

export const generateStarterCode = (questionText, language) => {
  if (!language) return null;

  const normalizedLanguage = normalizeLanguageName(language);
  const isArrayProblem = /array|list|numbers/i.test(questionText);
  const isStringProblem = /string|text|word|character/i.test(questionText);
  const isNumberProblem = /number|sum|count|calculate|even|odd/i.test(questionText);
  
  const generators = {
    javascript: generateJavaScriptTemplate,
    python: generatePythonTemplate,
    java: generateJavaTemplate,
    cpp: generateCppTemplate,
    c: generateCTemplate,
    csharp: generateCSharpTemplate,
    php: generatePhpTemplate,
    go: generateGoTemplate
  };

  const generator = generators[normalizedLanguage] || generators.javascript;
  return { [normalizedLanguage]: generator(questionText, isArrayProblem, isStringProblem, isNumberProblem) };
};

const generateJavaScriptTemplate = (questionText, isArray, isString, isNumber) => {
  const comment = `// ${questionText.substring(0, 60)}${questionText.length > 60 ? '...' : ''}`;
  
  if (isArray) {
    return `function solution(arr) {
    ${comment}
    
    // Your code here
    
    return arr;
}

const testArray = [1, 2, 3, 4, 5];
console.log(solution(testArray));`;
  }
  
  if (isString) {
    return `function solution(str) {
    ${comment}
    
    // Your code here
    
    return str;
}

console.log(solution("hello world"));`;
  }

  if (isNumber) {
    return `function solution(num) {
    ${comment}
    
    // Your code here
    
    return num;
}

console.log(solution(10));`;
  }
  
  return `function solution(input) {
    ${comment}
    
    // Your code here
    
    return input;
}

console.log(solution("test input"));`;
};

const generatePythonTemplate = (questionText, isArray, isString, isNumber) => {
  const comment = `# ${questionText.substring(0, 60)}${questionText.length > 60 ? '...' : ''}`;
  
  if (isArray) {
    return `def solution(arr):
    ${comment}
    
    # Your code here
    
    return arr

test_array = [1, 2, 3, 4, 5]
print(solution(test_array))`;
  }
  
  if (isString) {
    return `def solution(text):
    ${comment}
    
    # Your code here
    
    return text

print(solution("hello world"))`;
  }

  if (isNumber) {
    return `def solution(num):
    ${comment}
    
    # Your code here
    
    return num

print(solution(10))`;
  }
  
  return `def solution(input_data):
    ${comment}
    
    # Your code here
    
    return input_data

print(solution("test input"))`;
};

const generateJavaTemplate = (questionText, isArray, isString, isNumber) => {
  const comment = `// ${questionText.substring(0, 40)}${questionText.length > 40 ? '...' : ''}`;
  
  if (isArray) {
    return `public class Solution {
    public static int solution(int[] arr) {
        ${comment}
        
        // Your code here
        
        return 0;
    }
    
    public static void main(String[] args) {
        int[] test = {1, 2, 3, 4, 5};
        System.out.println(solution(test));
    }
}`;
  }
  
  if (isString) {
    return `public class Solution {
    public static String solution(String text) {
        ${comment}
        
        // Your code here
        
        return "";
    }
    
    public static void main(String[] args) {
        System.out.println(solution("hello world"));
    }
}`;
  }

  return `public class Solution {
    public static int solution(int num) {
        ${comment}
        
        // Your code here
        
        return 0;
    }
    
    public static void main(String[] args) {
        System.out.println(solution(10));
    }
}`;
};

const generateCppTemplate = (questionText, isArray, isString, isNumber) => {
  const comment = `// ${questionText.substring(0, 40)}${questionText.length > 40 ? '...' : ''}`;
  
  if (isArray) {
    return `#include <iostream>
#include <vector>
using namespace std;

int solution(vector<int>& arr) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    vector<int> test = {1, 2, 3, 4, 5};
    cout << solution(test) << endl;
    return 0;
}`;
  }
  
  if (isString) {
    return `#include <iostream>
#include <string>
using namespace std;

string solution(string text) {
    ${comment}
    
    // Your code here
    
    return "";
}

int main() {
    cout << solution("hello world") << endl;
    return 0;
}`;
  }

  return `#include <iostream>
using namespace std;

int solution(int num) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    cout << solution(10) << endl;
    return 0;
}`;
};

const generateCTemplate = (questionText, isArray) => {
  const comment = `// ${questionText.substring(0, 40)}${questionText.length > 40 ? '...' : ''}`;
  
  if (isArray) {
    return `#include <stdio.h>

int solution(int arr[], int size) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    int test[] = {1, 2, 3, 4, 5};
    printf("%d\\n", solution(test, 5));
    return 0;
}`;
  }
  
  return `#include <stdio.h>

int solution(char* input) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    printf("%d\\n", solution("test input"));
    return 0;
}`;
};

const generateCSharpTemplate = () => `using System;

class Solution {
    static void Main() {
        Console.WriteLine(Solve());
    }
    
    static int Solve() {
        // Your code here
        return 0;
    }
}`;

const generatePhpTemplate = () => `<?php

function solution($input) {
    // Your code here
    return $input;
}

echo solution("test");
?>`;

const generateGoTemplate = () => `package main

import "fmt"

func solution(input string) string {
    // Your code here
    return input
}

func main() {
    fmt.Println(solution("test"))
}`;

export default { normalizeLanguageName, selectBestLanguage, generateStarterCode };
