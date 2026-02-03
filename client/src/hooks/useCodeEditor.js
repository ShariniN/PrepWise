import { useState, useCallback } from 'react';

export const useCodeEditor = (supportedLanguages, addDebugLog) => {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('nodejs');
  const [codeOutput, setCodeOutput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);

  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      setCodeOutput('Please write some code before running.');
      return;
    }

    try {
      setIsRunningCode(true);
      setCodeOutput('Executing code on JDoodle servers...\n');
      addDebugLog(`Executing ${language} code`);

      const selectedLang = supportedLanguages.find(l => l.value === language);
      if (!selectedLang) {
        throw new Error('Unsupported language');
      }

      const response = await fetch('/api/code/execute', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include',
        body: JSON.stringify({
          script: code,
          language: selectedLang.jdoodleLanguage,
          versionIndex: selectedLang.version,
          stdin: codeInput || ''
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Code execution failed');
      }

      let output = '';
      
      if (result.executionTime || result.memory) {
        output += '=== Execution Info ===\n';
        if (result.executionTime) output += `Time: ${result.executionTime}\n`;
        if (result.memory) output += `Memory: ${result.memory}\n`;
        output += '\n=== Output ===\n';
      }

      output += result.output || 'Program executed successfully (no output)';

      if (result.error?.trim()) {
        output += '\n\n=== Errors/Warnings ===\n' + result.error;
      }

      setCodeOutput(output);
      addDebugLog('Code execution completed');
      
    } catch (error) {
      const errorMsg = `Execution Error: ${error.message}\n\nPlease check your code and try again.`;
      setCodeOutput(errorMsg);
      addDebugLog(`Code execution error: ${error.message}`, 'error');
    } finally {
      setIsRunningCode(false);
    }
  }, [code, language, codeInput, supportedLanguages, addDebugLog]);

  const changeLanguage = useCallback((newLanguage, currentQuestion) => {
    setLanguage(newLanguage);
    
    const currentTemplate = supportedLanguages.find(l => l.value === language)?.template || '';
    const normalizedCode = code.replace(/\s+/g, '').toLowerCase();
    const normalizedTemplate = currentTemplate.replace(/\s+/g, '').toLowerCase();
    
    if (!code.trim() || normalizedCode === normalizedTemplate) {
      const langTemplate = supportedLanguages.find(l => l.value === newLanguage)?.template || '';
      setCode(currentQuestion?.starterCode?.[newLanguage] || langTemplate);
    }
    
    setCodeOutput('');
    setCodeInput('');
  }, [code, language, supportedLanguages]);

  const resetCodeEditor = useCallback((question, lang) => {
    const template = question?.starterCode?.[lang] || 
                    supportedLanguages.find(l => l.value === lang)?.template || '';
    setCode(template);
    setCodeOutput('');
    setCodeInput('');
  }, [supportedLanguages]);

  return {
    code,
    language,
    codeOutput,
    codeInput,
    isRunningCode,
    setCode,
    setCodeInput,
    setCodeOutput,
    executeCode,
    changeLanguage,
    resetCodeEditor
  };
};
