/**
 * DOM operation helpers
 * @module utils/dom
 */

/**
 * Shorthand for document.getElementById
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Sets text content of an element by ID
 * @param {string} id - Element ID
 * @param {string} text - Text to set
 */
export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

/**
 * Shows an error message under a form field
 * @param {string} fieldId - The error-msg span ID (e.g. 'error-x')
 * @param {string} message - Error text, or '' to clear
 */
export function showFieldError(fieldId, message) {
  const span = $(fieldId);
  if (!span) return;
  span.textContent = message;

  // Toggle .has-error on the sibling input
  const input = span.previousElementSibling;
  if (input && input.tagName === 'INPUT') {
    input.classList.toggle('has-error', message !== '');
  }
}

/**
 * Clears all field errors within a form
 * @param {HTMLFormElement} form
 */
export function clearFieldErrors(form) {
  form.querySelectorAll('.error-msg').forEach(span => {
    span.textContent = '';
  });
  form.querySelectorAll('.has-error').forEach(input => {
    input.classList.remove('has-error');
  });
}

/**
 * Creates an HTML element with attributes and children
 * @param {string} tag - Tag name
 * @param {Object} [attrs={}] - Attributes to set
 * @param {Array<HTMLElement|string>} [children=[]] - Child nodes or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key.startsWith('data-')) {
      el.setAttribute(key, value);
    } else {
      el[key] = value;
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }

  return el;
}

/**
 * Triggers a file download from a Blob
 * @param {Blob} blob - File content
 * @param {string} filename - Download filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a timestamp string for filenames (YYYYMMDD_HHmmss)
 * @returns {string}
 */
export function fileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
