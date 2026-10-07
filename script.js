/**
 * AuraCalc — Modern Responsive Calculator
 * Interactive Engine, Mathematical Parser, Sound Effects & Theme Management
 */

(() => {
  'use strict';

  // --- DOM Elements ---
  const expressionDisplay = document.getElementById('expressionDisplay');
  const resultDisplay = document.getElementById('resultDisplay');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const copyFeedback = document.getElementById('copyFeedback');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIconOn = soundToggleBtn.querySelector('.sound-icon-on');
  const soundIconOff = soundToggleBtn.querySelector('.sound-icon-off');
  const historyToggleBtn = document.getElementById('historyToggleBtn');
  const historyDrawer = document.getElementById('historyDrawer');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');
  const historyBadge = document.getElementById('historyBadge');
  const calculatorWrapper = document.querySelector('.calculator-wrapper');
  const standardTab = document.getElementById('standardTab');
  const scientificTab = document.getElementById('scientificTab');
  const scientificKeypad = document.getElementById('scientificKeypad');
  const keypad = document.querySelector('.keypad-grid');

  // --- Calculator State ---
  let expression = '';
  let currentResult = '0';
  let isEvaluated = false;
  let history = [];
  let isMuted = false;
  let audioCtx = null;

  // --- Storage Keys ---
  const THEME_KEY = 'auracalc_theme';
  const SOUND_KEY = 'auracalc_muted';
  const HISTORY_KEY = 'auracalc_history';

  // ==========================================================================
  // Web Audio Synthesizer (Zero External Dependencies)
  // ==========================================================================
  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSound(type = 'default') {
    if (isMuted) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'number') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'operator') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.05);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'equals') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'clear') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch {
      // Audio playback can fail if blocked by browser policy
    }
  }

  // ==========================================================================
  // Display & UI Updates
  // ==========================================================================
  function updateDisplay() {
    // Format human-friendly display for operators
    const formattedExpression = expression
      .replace(/\*/g, ' × ')
      .replace(/\//g, ' ÷ ')
      .replace(/\+/g, ' + ')
      .replace(/(?<![\d)])-/g, '−')
      .replace(/(?<=[\d)])-/g, ' − ');

    expressionDisplay.textContent = formattedExpression;

    const displayVal = currentResult.toString();
    resultDisplay.textContent = displayVal;

    // Adjust font size dynamically to prevent overflow
    adjustFontSize(displayVal.length);
  }

  function adjustFontSize(length) {
    if (length > 14) {
      resultDisplay.style.fontSize = 'clamp(1.2rem, 3.8vw, 1.6rem)';
    } else if (length > 10) {
      resultDisplay.style.fontSize = 'clamp(1.4rem, 4.8vw, 2rem)';
    } else {
      resultDisplay.style.fontSize = '';
    }
  }

  function showToast(message = 'Copied!') {
    copyFeedback.textContent = message;
    copyFeedback.classList.add('show');
    setTimeout(() => {
      copyFeedback.classList.remove('show');
    }, 1600);
  }

  // ==========================================================================
  // Mathematical Evaluation Engine
  // ==========================================================================
  /**
   * Cleans floating point arithmetic imprecision (e.g. 0.1 + 0.2 = 0.3)
   */
  function formatNumber(num) {
    if (!Number.isFinite(num)) {
      return num > 0 ? 'Infinity' : '-Infinity';
    }
    // Precision clamp to 12 digits, strip trailing zeroes
    const formatted = parseFloat(num.toPrecision(12));
    if (Math.abs(formatted) >= 1e14 || (Math.abs(formatted) > 0 && Math.abs(formatted) < 1e-6)) {
      return formatted.toExponential(5).replace(/\.?0+e/, 'e');
    }
    return formatted.toString();
  }

  /**
   * Safely evaluates mathematical string expressions with proper operator precedence,
   * parenthesis support, power, scientific constants and functions.
   */
  function safeEvaluate(expr) {
    if (!expr || expr.trim() === '') return 0;

    let sanitized = expr.trim();

    // Strip trailing operators if user hit '=' after typing an operator (e.g. "5 + ")
    sanitized = sanitized.replace(/[+\-*/^]+$/, '');
    if (!sanitized) return 0;

    // Auto-close trailing unclosed parentheses
    const openParens = (sanitized.match(/\(/g) || []).length;
    const closeParens = (sanitized.match(/\)/g) || []).length;
    if (openParens > closeParens) {
      sanitized += ')'.repeat(openParens - closeParens);
    }

    // Replace constants
    sanitized = sanitized.replace(/\bpi\b|π/g, `(${Math.PI})`);
    sanitized = sanitized.replace(/\be\b/g, `(${Math.E})`);

    // Replace scientific functions: sin, cos, tan, sqrt, log, ln
    sanitized = sanitized.replace(/sin\(/g, 'Math.sin(');
    sanitized = sanitized.replace(/cos\(/g, 'Math.cos(');
    sanitized = sanitized.replace(/tan\(/g, 'Math.tan(');
    sanitized = sanitized.replace(/sqrt\(/g, 'Math.sqrt(');
    sanitized = sanitized.replace(/log\(/g, 'Math.log10(');
    sanitized = sanitized.replace(/ln\(/g, 'Math.log(');

    // Replace power operator ^ with **
    sanitized = sanitized.replace(/\^/g, '**');

    // Handle percentage: e.g. 50% -> (50/100)
    sanitized = sanitized.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

    // Insert implicit multiplication: e.g. 5( -> 5*( or )3 -> )*3 or )( -> )*(
    sanitized = sanitized.replace(/(\d)(\()/g, '$1*$2');
    sanitized = sanitized.replace(/(\))(\d)/g, '$1*$2');
    sanitized = sanitized.replace(/(\))(\()/g, '$1*$2');

    // Check for division by zero: /0 not followed by . or other nonzero digits
    if (/\/\s*0(?![.\d])/.test(sanitized)) {
      throw new Error('Cannot divide by 0');
    }

    // Strict validation: verify characters are strictly mathematical
    const testChars = sanitized.replace(/Math\.(sin|cos|tan|sqrt|log10|log)/g, '');
    if (!/^[0-9+\-*/().,%\s*eE]+$/.test(testChars)) {
      throw new Error('Invalid Expression');
    }

    // Safe execution within Function sandbox
    const result = new Function(`"use strict"; return (${sanitized});`)();
    
    if (result === undefined || Number.isNaN(result)) {
      throw new Error('Invalid Result');
    }
    return result;
  }

  // ==========================================================================
  // Core Calculator Operations
  // ==========================================================================
  function handleNumber(num) {
    playSound('number');
    if (isEvaluated) {
      expression = '';
      currentResult = '0';
      isEvaluated = false;
    }

    // Prevent excessive leading zeroes
    const lastNumMatch = expression.match(/(\d+\.?\d*)$/);
    if (lastNumMatch && lastNumMatch[0] === '0' && num === '0') {
      return;
    }
    if (lastNumMatch && lastNumMatch[0] === '0' && num !== '.') {
      expression = expression.slice(0, -1) + num;
      currentResult = num;
      updateDisplay();
      return;
    }

    expression += num;
    currentResult = extractCurrentInputNumber();
    updateDisplay();
  }

  function handleDecimal() {
    playSound('number');
    if (isEvaluated) {
      expression = '0.';
      currentResult = '0.';
      isEvaluated = false;
      updateDisplay();
      return;
    }

    // Check last number segment to prevent duplicate dots
    const parts = expression.split(/[\+\-\*\/\(\)\^]/);
    const lastPart = parts[parts.length - 1];

    if (lastPart.includes('.')) {
      return; // Already has decimal point
    }

    if (!lastPart || lastPart === '') {
      expression += '0.';
    } else {
      expression += '.';
    }

    currentResult = extractCurrentInputNumber();
    updateDisplay();
  }

  function handleOperator(op) {
    playSound('operator');
    if (isEvaluated) {
      // Continue calculation from previous result
      expression = currentResult;
      isEvaluated = false;
    }

    if (expression === '' && (op === '*' || op === '/' || op === '^')) {
      return; // Can't start with binary operator
    }

    if (expression === '' && op === '-') {
      expression = '-';
      updateDisplay();
      return;
    }

    const lastChar = expression.slice(-1);
    const operators = ['+', '-', '*', '/', '^'];

    if (operators.includes(lastChar)) {
      // Replace last operator
      expression = expression.slice(0, -1) + op;
    } else {
      expression += op;
    }

    updateDisplay();
  }

  function handleParentheses() {
    playSound('operator');
    if (isEvaluated) {
      expression = '';
      isEvaluated = false;
    }

    const openCount = (expression.match(/\(/g) || []).length;
    const closeCount = (expression.match(/\)/g) || []).length;
    const lastChar = expression.slice(-1);

    if (
      expression === '' ||
      ['+', '-', '*', '/', '(', '^'].includes(lastChar)
    ) {
      expression += '(';
    } else if (openCount > closeCount && !['+', '-', '*', '/', '(', '^'].includes(lastChar)) {
      expression += ')';
    } else {
      expression += '*(';
    }

    currentResult = extractCurrentInputNumber();
    updateDisplay();
  }

  function handleNegate() {
    playSound('operator');
    if (isEvaluated) {
      const num = parseFloat(currentResult);
      if (!Number.isNaN(num)) {
        currentResult = formatNumber(-num);
        expression = currentResult;
        updateDisplay();
      }
      return;
    }

    if (!expression) {
      expression = '-';
      updateDisplay();
      return;
    }

    // Match trailing number or parenthesized number
    const match = expression.match(/(-?\d+\.?\d*)$/);
    if (match) {
      const val = match[1];
      const start = expression.slice(0, match.index);
      if (val.startsWith('-')) {
        expression = start + val.slice(1);
      } else {
        expression = start + '-' + val;
      }
      currentResult = extractCurrentInputNumber();
      updateDisplay();
    }
  }

  function handleBackspace() {
    playSound('clear');
    if (isEvaluated) {
      expression = '';
      currentResult = '0';
      isEvaluated = false;
      updateDisplay();
      return;
    }

    if (expression.length > 0) {
      expression = expression.slice(0, -1);
      currentResult = extractCurrentInputNumber();
      updateDisplay();
    }
  }

  function handleClear() {
    playSound('clear');
    expression = '';
    currentResult = '0';
    isEvaluated = false;
    updateDisplay();
  }

  function handleCalculate() {
    if (!expression) return;
    try {
      const rawResult = safeEvaluate(expression);
      const formattedResult = formatNumber(rawResult);

      playSound('equals');

      // Add to history
      saveHistory(expression, formattedResult);

      currentResult = formattedResult;
      isEvaluated = true;
      updateDisplay();
    } catch (err) {
      playSound('clear');
      currentResult = err.message || 'Error';
      isEvaluated = true;
      updateDisplay();
    }
  }

  // --- Scientific Operations ---
  function handleScientific(action) {
    playSound('operator');
    if (isEvaluated) {
      expression = currentResult;
      isEvaluated = false;
    }

    switch (action) {
      case 'sin':
      case 'cos':
      case 'tan':
      case 'sqrt':
      case 'log':
      case 'ln':
        if (expression === '' || ['+', '-', '*', '/', '('].includes(expression.slice(-1))) {
          expression += `${action}(`;
        } else {
          expression += `*${action}(`;
        }
        break;
      case 'pi':
        expression += (expression === '' || ['+', '-', '*', '/', '('].includes(expression.slice(-1))) ? 'π' : '*π';
        break;
      case 'e':
        expression += (expression === '' || ['+', '-', '*', '/', '('].includes(expression.slice(-1))) ? 'e' : '*e';
        break;
      case 'power':
        handleOperator('^');
        return;
      case 'square':
        if (!expression || ['+', '-', '*', '/', '(', '^'].includes(expression.slice(-1))) {
          return;
        }
        expression += '^2';
        break;
    }

    currentResult = extractCurrentInputNumber();
    updateDisplay();
  }

  function extractCurrentInputNumber() {
    if (!expression) return '0';
    const match = expression.match(/(-?\d+\.?\d*)$/);
    return match ? match[1] : (expression.slice(-1) || '0');
  }

  // ==========================================================================
  // History Management
  // ==========================================================================
  function loadHistory() {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        history = JSON.parse(saved);
        renderHistory();
      }
    } catch {
      history = [];
    }
  }

  function saveHistory(expr, res) {
    if (!expr || res === 'Error' || res === 'Cannot divide by 0') return;

    history.unshift({
      expression: expr,
      result: res,
      timestamp: Date.now()
    });

    if (history.length > 30) {
      history = history.slice(0, 30);
    }

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}

    renderHistory();
  }

  function renderHistory() {
    historyBadge.textContent = history.length;

    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-history">
          <div class="empty-icon">📭</div>
          <p>No calculations yet</p>
          <span class="empty-sub">Your recent equations will appear here</span>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.map((item, index) => `
      <div class="history-item" data-index="${index}" title="Click to recall this result">
        <div class="history-item-expr">${escapeHtml(item.expression)} =</div>
        <div class="history-item-result">${escapeHtml(item.result)}</div>
      </div>
    `).join('');

    // Attach click listeners to history items
    const items = historyList.querySelectorAll('.history-item');
    items.forEach(el => {
      el.addEventListener('click', () => {
        const idx = el.dataset.index;
        const item = history[idx];
        if (item) {
          expression = item.result;
          currentResult = item.result;
          isEvaluated = true;
          updateDisplay();
          playSound('default');
          showToast('Loaded into calculator');
          // On mobile, auto close drawer
          if (window.innerWidth <= 640) {
            closeDrawer();
          }
        }
      });
    });
  }

  function clearAllHistory() {
    history = [];
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
    renderHistory();
    playSound('clear');
    showToast('History cleared');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toggleDrawer() {
    calculatorWrapper.classList.toggle('drawer-open');
    playSound('default');
  }

  function closeDrawer() {
    calculatorWrapper.classList.remove('drawer-open');
  }

  // ==========================================================================
  // Theme & Sound Settings
  // ==========================================================================
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    playSound('default');
  }

  function initSound() {
    const savedMuted = localStorage.getItem(SOUND_KEY);
    if (savedMuted === 'true') {
      isMuted = true;
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
    }
  }

  function toggleSound() {
    isMuted = !isMuted;
    try {
      localStorage.setItem(SOUND_KEY, isMuted ? 'true' : 'false');
    } catch {}

    if (isMuted) {
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
      showToast('Sound Muted');
    } else {
      soundIconOn.classList.remove('hidden');
      soundIconOff.classList.add('hidden');
      initAudio();
      playSound('default');
      showToast('Sound Enabled');
    }
  }

  // ==========================================================================
  // Copy to Clipboard
  // ==========================================================================
  async function copyResult() {
    const textToCopy = currentResult.toString();
    if (!textToCopy || textToCopy === '0') return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast('Copied to clipboard!');
      playSound('default');
    } catch {
      showToast('Failed to copy');
    }
  }

  // ==========================================================================
  // Event Listeners & Binding
  // ==========================================================================
  function setupKeypadEvents() {
    // Standard Keypad Click
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;

      const action = btn.dataset.action;
      const value = btn.dataset.value;

      switch (action) {
        case 'number':
          handleNumber(value);
          break;
        case 'operator':
          handleOperator(value);
          break;
        case 'decimal':
          handleDecimal();
          break;
        case 'parentheses':
          handleParentheses();
          break;
        case 'negate':
          handleNegate();
          break;
        case 'backspace':
          handleBackspace();
          break;
        case 'clear':
          handleClear();
          break;
        case 'calculate':
          handleCalculate();
          break;
      }
    });

    // Scientific Keypad Click
    scientificKeypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-fn');
      if (!btn) return;
      const action = btn.dataset.action;
      handleScientific(action);
    });

    // Mode Tabs Switch
    standardTab.addEventListener('click', () => {
      standardTab.classList.add('active');
      scientificTab.classList.remove('active');
      scientificKeypad.classList.remove('expanded');
      scientificKeypad.setAttribute('aria-hidden', 'true');
      playSound('default');
    });

    scientificTab.addEventListener('click', () => {
      scientificTab.classList.add('active');
      standardTab.classList.remove('active');
      scientificKeypad.classList.add('expanded');
      scientificKeypad.setAttribute('aria-hidden', 'false');
      playSound('default');
    });

    // Theme Toggle
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Sound Toggle
    soundToggleBtn.addEventListener('click', toggleSound);

    // Copy Result
    copyResultBtn.addEventListener('click', copyResult);
    resultDisplay.addEventListener('click', copyResult);

    // History Toggle & Actions
    historyToggleBtn.addEventListener('click', toggleDrawer);
    closeHistoryBtn.addEventListener('click', closeDrawer);
    clearHistoryBtn.addEventListener('click', clearAllHistory);

    // Keyboard Navigation & Physical Key Handling
    window.addEventListener('keydown', handlePhysicalKeyboard);
  }

  function handlePhysicalKeyboard(e) {
    // If typing in any input field or dialog, don't hijack
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    const key = e.key;

    // Highlight corresponding visual button
    flashButton(key);

    if (key >= '0' && key <= '9') {
      e.preventDefault();
      handleNumber(key);
    } else if (key === '.') {
      e.preventDefault();
      handleDecimal();
    } else if (['+', '-', '*', '/'].includes(key)) {
      e.preventDefault();
      handleOperator(key);
    } else if (key === '^') {
      e.preventDefault();
      handleOperator('^');
    } else if (key === '(' || key === ')') {
      e.preventDefault();
      handleParentheses();
    } else if (key === 'Enter' || key === '=') {
      e.preventDefault();
      handleCalculate();
    } else if (key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (key === 'Escape' || key.toLowerCase() === 'c') {
      e.preventDefault();
      handleClear();
    } else if (key === '%') {
      e.preventDefault();
      handleOperator('%');
    }
  }

  function flashButton(key) {
    let selector = `[data-key="${key}"]`;
    if (key === '=') selector = `[data-key="Enter"]`;
    if (key.toLowerCase() === 'c') selector = `[data-key="Escape"]`;

    const btn = document.querySelector(selector);
    if (btn) {
      btn.classList.add('active-key');
      setTimeout(() => btn.classList.remove('active-key'), 130);
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  function init() {
    initTheme();
    initSound();
    loadHistory();
    setupKeypadEvents();
    updateDisplay();
  }

  // Launch on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
