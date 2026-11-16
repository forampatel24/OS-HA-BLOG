'use strict';

window.Blog = (() => {
  const THEME_KEY = 'os-journal-theme';

  const ALLOWED_TAGS = new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i',
    'u', 's', 'del', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img',
    'figure', 'figcaption', 'hr', 'div', 'span', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'sup', 'sub', 'mark'
  ]);

  const DROP_TAGS = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'noscript',
    'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio'
  ]);

  async function api(url, options = {}) {
    const config = { ...options };
    if (config.body && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body);
      config.headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
    }

    const response = await fetch(url, config);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }

    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value, kind) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      return url;
    }
    if (/^https?:\/\//i.test(url)) return url;
    if (kind === 'link' && /^mailto:/i.test(url)) return url;
    if (kind === 'image' && /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(url)) {
      return url;
    }
    return '';
  }

  function cleanTree(parent) {
    Array.from(parent.children).forEach((element) => {
      const tag = element.tagName.toLowerCase();

      if (DROP_TAGS.has(tag)) {
        element.remove();
        return;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        cleanTree(element);
        const fragment = document.createDocumentFragment();
        while (element.firstChild) fragment.appendChild(element.firstChild);
        element.replaceWith(fragment);
        return;
      }

      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const keep = (
          (tag === 'a' && ['href', 'title'].includes(name)) ||
          (tag === 'img' && ['src', 'alt', 'title'].includes(name)) ||
          (tag === 'td' && ['colspan', 'rowspan'].includes(name)) ||
          (tag === 'th' && ['colspan', 'rowspan'].includes(name))
        );
        if (!keep) element.removeAttribute(attribute.name);
      });

      if (tag === 'a') {
        const href = safeUrl(element.getAttribute('href'), 'link');
        if (href) {
          element.setAttribute('href', href);
          if (/^https?:\/\//i.test(href)) {
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          }
        } else {
          element.removeAttribute('href');
        }
      }

      if (tag === 'img') {
        const src = safeUrl(element.getAttribute('src'), 'image');
        if (src) {
          element.setAttribute('src', src);
          if (!element.getAttribute('alt')) element.setAttribute('alt', '');
        } else {
          element.remove();
          return;
        }
      }

      cleanTree(element);
    });
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    cleanTree(template.content);
    return template.innerHTML;
  }

  function formatDate(value, options = {}) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options
    }).format(date);
  }

  function timeAgo(value) {
    if (!value) return '';
    const date = new Date(value);
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 45) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return formatDate(value);
  }

  function readingTimeLabel(minutes) {
    return `${Math.max(1, Number(minutes) || 1)} min read`;
  }

  function toneFor(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash % 5;
  }

  function showToast(message, type = '') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`.trim();
    toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 260);
    }, 3400);
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('title', next === 'dark' ? 'Light mode' : 'Dark mode');
    });
  }

  function initTheme() {
    let saved = '';
    try {
      saved = localStorage.getItem(THEME_KEY) || '';
    } catch {
      /* ignore */
    }
    const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    applyTheme(saved || preferred);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initTheme);

  return {
    api,
    escapeHtml,
    sanitizeHtml,
    formatDate,
    timeAgo,
    readingTimeLabel,
    toneFor,
    showToast,
    applyTheme
  };
})();
