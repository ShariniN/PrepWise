import { useState, useCallback } from 'react';

export const useCodeEditor = (supportedLanguages, addDebugLog) => {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('nodejs');
  const [codeOutput, setCodeOutput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  // Monaco language ids differ from the interview language values for two entries.
  const monacoLanguage = { nodejs: 'javascript', python3: 'python' }[language] || language;

  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      setCodeOutput('Please write some code before running.');
      return;
    }

    try {
      setIsRunningCode(true);
      setVerdict('');
      setUnavailable(false);
      setCodeOutput('Executing code in the sandbox...\n');
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

      if (response.status === 503) {
        setUnavailable(true);
        setVerdict('unavailable');
        setCodeOutput('');
        addDebugLog('Code execution unavailable', 'error');
        return;
      }
      if (!response.ok && response.status !== 200) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      // success is false for any non-accepted verdict, so only reject results with no verdict at all.
      if (!result.success && !result.verdict) {
        throw new Error(result.error || 'Code execution failed');
      }
      setVerdict(result.verdict || '');

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
    setVerdict('');
    setUnavailable(false);
  }, [code, language, supportedLanguages]);

  const resetCodeEditor = useCallback((question, lang) => {
    const template = question?.starterCode?.[lang] || 
                    supportedLanguages.find(l => l.value === lang)?.template || '';
    setCode(template);
    setCodeOutput('');
    setCodeInput('');
    setVerdict('');
    setUnavailable(false);
  }, [supportedLanguages]);

  return {
    code,
    language,
    codeOutput,
    codeInput,
    isRunningCode,
    verdict,
    unavailable,
    monacoLanguage,
    setCode,
    setCodeInput,
    setCodeOutput,
    executeCode,
    changeLanguage,
    resetCodeEditor
  };
};
