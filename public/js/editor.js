'use strict';

const {
  api,
  escapeHtml,
  sanitizeHtml,
  timeAgo,
  showToast
} = window.Blog;

const params = new URLSearchParams(location.search);
let postId = params.get('id') || '';
let currentPost = null;
let coverImage = '';
let dirty = false;
let editVersion = 0;
let saveTimer = null;
let saveQueue = Promise.resolve();
let lastSavedAt = null;
let isLoading = true;
let savedRange = null;
let saveFailureNotified = false;

const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const tagsInput = document.getElementById('tagsInput');
const contentEditor = document.getElementById('contentEditor');
const editorStats = document.getElementById('editorStats');
const saveState = document.getElementById('saveState');
const saveStateText = document.getElementById('saveStateText');
const publishBtn = document.getElementById('publishBtn');
const previewBtn = document.getElementById('previewBtn');
const moreBtn = document.getElementById('moreBtn');
const moreMenu = document.getElementById('moreMenu');
const menuSave = document.getElementById('menuSave');
const menuView = document.getElementById('menuView');
const menuUnpublish = document.getElementById('menuUnpublish');
const menuDelete = document.getElementById('menuDelete');
const coverBtn = document.getElementById('coverBtn');
const coverPreview = document.getElementById('coverPreview');
const coverImg = document.getElementById('coverImg');
const changeCoverBtn = document.getElementById('changeCoverBtn');
const removeCoverBtn = document.getElementById('removeCoverBtn');
const coverInput = document.getElementById('coverInput');
const imageInput = document.getElementById('imageInput');
const imageBtn = document.getElementById('imageBtn');
const linkBtn = document.getElementById('linkBtn');
const dividerBtn = document.getElementById('dividerBtn');
const linkDialog = document.getElementById('linkDialog');
const linkForm = document.getElementById('linkForm');
const linkText = document.getElementById('linkText');
const linkUrl = document.getElementById('linkUrl');
const linkCancel = document.getElementById('linkCancel');
const linkCancelBtn = document.getElementById('linkCancelBtn');
const toolbar = document.querySelector('.toolbar');

function setSaveState(mode, text) {
  saveState.dataset.state = mode;
  saveStateText.textContent = text;
}

function resizeTextarea(element) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function updateDocumentTitle() {
  const title = titleInput.value.trim();
  document.title = title ? `${title} · Foram` : 'New post · Foram\'s OS Journal';
}

function updateStats() {
  const text = contentEditor.innerText.replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 220));
  editorStats.innerHTML = `${words} word${words === 1 ? '' : 's'} &middot; ${minutes} min read`;
}

function updateMode() {
  const published = currentPost?.status === 'published';
  publishBtn.textContent = published ? 'Update' : 'Publish';
  menuUnpublish.hidden = !published;
  menuView.hidden = !postId;
  updateDocumentTitle();
}

function hasDraftContent() {
  return Boolean(
    titleInput.value.trim() ||
    subtitleInput.value.trim() ||
    tagsInput.value.trim() ||
    coverImage ||
    contentEditor.textContent.trim()
  );
}

function buildPayload(status) {
  return {
    title: titleInput.value.trim(),
    subtitle: subtitleInput.value.trim(),
    tags: tagsInput.value,
    coverImage,
    content: sanitizeHtml(contentEditor.innerHTML),
    status: status || currentPost?.status || 'draft'
  };
}

function scheduleSave(delay = 1000) {
  if (isLoading) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save({ silent: true }).catch(() => {});
  }, delay);
}

function markDirty(options = {}) {
  if (isLoading) return;
  editVersion += 1;
  dirty = true;
  updateStats();
  updateDocumentTitle();
  setSaveState('dirty', 'Unsaved changes');

  if (options.immediate) {
    save({ silent: true }).catch(() => {});
  } else {
    scheduleSave();
  }
}

function save(options = {}) {
  const task = saveQueue.then(() => performSave(options));
  saveQueue = task.catch(() => {});
  return task;
}

async function performSave({ status, silent = false, force = false } = {}) {
  clearTimeout(saveTimer);

  const isNew = !postId;
  if (isNew && !hasDraftContent() && !force) return null;
  if (!hasDraftContent() && !force) return null;

  const versionAtStart = editVersion;
  const payload = buildPayload(status);
  setSaveState('saving', 'Saving...');

  try {
    const saved = isNew
      ? await api('/api/posts', { method: 'POST', body: payload })
      : await api(`/api/posts/${postId}`, { method: 'PUT', body: payload });

    postId = saved.id;
    currentPost = saved;
    lastSavedAt = new Date();
    saveFailureNotified = false;

    if (isNew) {
      const url = new URL(location.href);
      url.searchParams.set('id', postId);
      history.replaceState(null, '', `${url.pathname}${url.search}`);
    }

    updateMode();

    if (editVersion === versionAtStart) {
      dirty = false;
      setSaveState('saved', `Saved ${timeAgo(lastSavedAt)}`);
    } else {
      dirty = true;
      setSaveState('dirty', 'Unsaved changes');
      scheduleSave(600);
    }

    return saved;
  } catch (err) {
    setSaveState('error', 'Could not save');
    if (!silent || !saveFailureNotified) {
      showToast(err.message || 'Could not save the post.', 'error');
      saveFailureNotified = true;
    }
    throw err;
  }
}

function updateCoverUI() {
  const hasCover = Boolean(coverImage);
  coverPreview.hidden = !hasCover;
  coverBtn.hidden = hasCover;
  if (hasCover) coverImg.src = coverImage;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That image could not be opened.'));
    };
    image.src = objectUrl;
  });
}

async function prepareImage(file, maxDimension = 2000) {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
  if (file.type === 'image/gif') {
    if (file.size > 12 * 1024 * 1024) throw new Error('That GIF is larger than 12 MB.');
    return readFileAsDataUrl(file);
  }

  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  if (scale === 1 && supported.includes(file.type) && file.size <= 1.5 * 1024 * 1024) {
    return readFileAsDataUrl(file);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let dataUrl = canvas.toDataURL('image/webp', 0.87);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  }

  if (dataUrl.length > file.size * 1.6 && supported.includes(file.type) && file.size <= 8 * 1024 * 1024) {
    return readFileAsDataUrl(file);
  }

  return dataUrl;
}

async function uploadImage(file, maxDimension = 2000) {
  const data = await prepareImage(file, maxDimension);
  const result = await api('/api/upload', { method: 'POST', body: { data } });
  return result.url;
}

function getEditorRange() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount) {
    const range = selection.getRangeAt(0);
    if (contentEditor.contains(range.commonAncestorContainer)) {
      return range.cloneRange();
    }
  }
  return null;
}

function saveSelection() {
  const range = getEditorRange();
  if (range) savedRange = range;
}

function restoreSelection() {
  contentEditor.focus();
  const selection = window.getSelection();
  if (!selection) return;

  if (savedRange && contentEditor.contains(savedRange.commonAncestorContainer)) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(contentEditor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertHtml(html) {
  restoreSelection();
  document.execCommand('insertHTML', false, html);
  saveSelection();
  markDirty();
}

async function uploadAndInsertImages(files) {
  const images = files.filter((file) => file.type.startsWith('image/'));
  if (!images.length) return;

  const urls = [];
  try {
    for (const file of images) {
      const url = await uploadImage(file, 1900);
      urls.push(url);
    }
  } catch (err) {
    showToast(err.message || 'The image could not be uploaded.', 'error');
  }

  if (!urls.length) return;

  const html = urls
    .map((url) => `<figure><img src="${escapeHtml(url)}" alt=""></figure><p><br></p>`)
    .join('');
  insertHtml(html);
  showToast(urls.length > 1 ? `${urls.length} images added.` : 'Image added.');
}

function setCaretFromPoint(x, y) {
  if (typeof document.caretRangeFromPoint !== 'function') return;
  const range = document.caretRangeFromPoint(x, y);
  if (range && contentEditor.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange();
  }
}

titleInput.addEventListener('input', () => {
  resizeTextarea(titleInput);
  markDirty();
});

subtitleInput.addEventListener('input', () => {
  resizeTextarea(subtitleInput);
  markDirty();
});

tagsInput.addEventListener('input', () => {
  markDirty();
});

titleInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    subtitleInput.focus();
  }
});

subtitleInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    contentEditor.focus();
  }
});

contentEditor.addEventListener('input', () => {
  markDirty();
});

contentEditor.addEventListener('keyup', saveSelection);
contentEditor.addEventListener('mouseup', saveSelection);
contentEditor.addEventListener('focus', saveSelection);

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  if (!contentEditor.contains(selection.anchorNode)) return;
  savedRange = selection.getRangeAt(0).cloneRange();
});

contentEditor.addEventListener('paste', (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const files = [];
  if (clipboard.items) {
    Array.from(clipboard.items).forEach((item) => {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    });
  }

  if (files.length) {
    event.preventDefault();
    saveSelection();
    uploadAndInsertImages(files);
    return;
  }

  const html = clipboard.getData('text/html');
  if (html) {
    event.preventDefault();
    const cleaned = sanitizeHtml(html);
    if (cleaned) {
      document.execCommand('insertHTML', false, cleaned);
      saveSelection();
      markDirty();
    }
  }
});

contentEditor.addEventListener('dragover', (event) => {
  if (!event.dataTransfer) return;
  const hasFiles = Array.from(event.dataTransfer.types || []).includes('Files');
  if (!hasFiles) return;
  event.preventDefault();
  contentEditor.classList.add('is-dragging');
});

contentEditor.addEventListener('dragleave', () => {
  contentEditor.classList.remove('is-dragging');
});

contentEditor.addEventListener('drop', (event) => {
  contentEditor.classList.remove('is-dragging');
  if (!event.dataTransfer || !event.dataTransfer.files.length) return;
  const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  event.preventDefault();
  setCaretFromPoint(event.clientX, event.clientY);
  uploadAndInsertImages(files);
});

toolbar.addEventListener('mousedown', (event) => {
  if (event.target.closest('button')) event.preventDefault();
});

toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (!button) return;

  const command = button.dataset.command;
  const value = button.dataset.value || null;

  restoreSelection();
  document.execCommand(command, false, value);
  saveSelection();
  updateToolbarState();
  markDirty();
});

function updateToolbarState() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  if (!contentEditor.contains(selection.anchorNode)) return;

  toolbar.querySelectorAll('[data-command]').forEach((button) => {
    const command = button.dataset.command;
    if (!command || command === 'undo' || command === 'redo' || command === 'removeFormat') return;

    let active = false;
    try {
      if (button.dataset.value) {
        active = String(document.queryCommandValue('formatBlock') || '').toLowerCase() === button.dataset.value;
      } else {
        active = document.queryCommandState(command);
      }
    } catch {
      active = false;
    }
    button.classList.toggle('is-active', active);
  });
}

document.addEventListener('selectionchange', updateToolbarState);

linkBtn.addEventListener('click', () => {
  savedRange = getEditorRange() || savedRange;
  const selectedText = savedRange ? savedRange.toString() : '';
  linkText.value = selectedText;
  linkUrl.value = '';
  linkDialog.showModal();
  setTimeout(() => {
    (selectedText ? linkUrl : linkText).focus();
  }, 40);
});

function closeLinkDialog() {
  if (linkDialog.open) linkDialog.close();
}

linkCancel.addEventListener('click', closeLinkDialog);
linkCancelBtn.addEventListener('click', closeLinkDialog);

linkForm.addEventListener('submit', (event) => {
  event.preventDefault();

  let url = linkUrl.value.trim();
  if (!url) {
    linkUrl.focus();
    return;
  }

  if (!/^(https?:\/\/|mailto:|#|\/)/i.test(url)) {
    url = `https://${url}`;
  }

  const text = linkText.value.trim() || url;
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;

  linkDialog.close();
  restoreSelection();
  document.execCommand('insertHTML', false, html);
  saveSelection();
  markDirty();
});

dividerBtn.addEventListener('click', () => {
  insertHtml('<hr><p><br></p>');
});

imageBtn.addEventListener('click', () => {
  savedRange = getEditorRange() || savedRange;
  imageInput.value = '';
  imageInput.click();
});

imageInput.addEventListener('change', () => {
  const files = Array.from(imageInput.files || []);
  if (files.length) uploadAndInsertImages(files);
  imageInput.value = '';
});

coverBtn.addEventListener('click', () => {
  coverInput.value = '';
  coverInput.click();
});

changeCoverBtn.addEventListener('click', () => {
  coverInput.value = '';
  coverInput.click();
});

coverInput.addEventListener('change', async () => {
  const file = coverInput.files && coverInput.files[0];
  coverInput.value = '';
  if (!file) return;

  coverBtn.classList.add('is-loading');
  try {
    const url = await uploadImage(file, 2400);
    coverImage = url;
    updateCoverUI();
    markDirty();
    showToast('Cover image added.');
  } catch (err) {
    showToast(err.message || 'Could not upload the cover image.', 'error');
  } finally {
    coverBtn.classList.remove('is-loading');
  }
});

removeCoverBtn.addEventListener('click', () => {
  coverImage = '';
  coverImg.removeAttribute('src');
  updateCoverUI();
  markDirty();
});

function toggleMenu(force) {
  const open = typeof force === 'boolean' ? force : moreMenu.hidden;
  moreMenu.hidden = !open;
  moreBtn.setAttribute('aria-expanded', String(open));
}

moreBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu();
});

document.addEventListener('click', (event) => {
  if (moreMenu.hidden) return;
  if (!event.target.closest('.menu-wrap')) toggleMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !moreMenu.hidden) {
    toggleMenu(false);
    moreBtn.focus();
  }
});

menuSave.addEventListener('click', async () => {
  toggleMenu(false);
  if (!hasDraftContent() && !postId) {
    showToast('Start writing first, then save.');
    titleInput.focus();
    return;
  }
  try {
    await save({ force: true });
    showToast('Saved to this device.');
  } catch {
    /* save already reports the error */
  }
});

function openPostWindow(options = {}) {
  const previewWindow = window.open('', '_blank');
  const wantsPreview = options.preview !== false;

  (async () => {
    if (!hasDraftContent() && !postId) {
      previewWindow?.close();
      showToast('Write something first to preview it.');
      return;
    }

    try {
      await save({ force: true, silent: true });
      const previewQuery = wantsPreview && currentPost?.status !== 'published' ? '?preview=1' : '';
      const url = `/post/${postId}${previewQuery}`;
      if (previewWindow) previewWindow.location.href = url;
      else location.href = url;
    } catch {
      previewWindow?.close();
    }
  })();
}

previewBtn.addEventListener('click', () => openPostWindow({ preview: true }));

menuView.addEventListener('click', () => {
  toggleMenu(false);
  openPostWindow({ preview: true });
});

menuUnpublish.addEventListener('click', async () => {
  toggleMenu(false);
  try {
    await save({ status: 'draft', force: true });
    updateMode();
    showToast('Moved to drafts.');
  } catch {
    /* save already reports the error */
  }
});

menuDelete.addEventListener('click', async () => {
  toggleMenu(false);

  if (!postId) {
    if (!hasDraftContent() || confirm('Discard this unsaved draft?')) {
      location.href = '/';
    }
    return;
  }

  const confirmed = confirm('Delete this post permanently? This cannot be undone.');
  if (!confirmed) return;

  try {
    await api(`/api/posts/${postId}`, { method: 'DELETE' });
    dirty = false;
    showToast('Post deleted.');
    setTimeout(() => {
      location.href = '/';
    }, 350);
  } catch (err) {
    showToast(err.message || 'Could not delete the post.', 'error');
  }
});

publishBtn.addEventListener('click', async () => {
  if (!titleInput.value.trim()) {
    showToast('Give your post a title first.');
    titleInput.focus();
    return;
  }

  if (!contentEditor.textContent.trim()) {
    showToast('Write something before publishing.');
    contentEditor.focus();
    return;
  }

  const wasPublished = currentPost?.status === 'published';
  publishBtn.disabled = true;
  publishBtn.classList.add('is-busy');

  try {
    await save({ status: 'published', force: true });
    updateMode();

    if (wasPublished) {
      showToast('Changes saved. Your post is up to date.');
    } else {
      showToast('Published. Opening your post...');
      setTimeout(() => {
        location.href = `/post/${postId}`;
      }, 550);
    }
  } catch {
    /* save already reports the error */
  } finally {
    publishBtn.disabled = false;
    publishBtn.classList.remove('is-busy');
  }
});

document.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!hasDraftContent() && !postId) return;
    save({ force: true })
      .then(() => showToast('Saved.'))
      .catch(() => {});
  }

  if (modifier && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    linkBtn.click();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) {
    save({ silent: true }).catch(() => {});
  }
});

setInterval(() => {
  if (!lastSavedAt || dirty) return;
  if (saveState.dataset.state !== 'saved') return;
  setSaveState('saved', `Saved ${timeAgo(lastSavedAt)}`);
}, 30000);

async function loadPost() {
  updateCoverUI();
  updateStats();
  resizeTextarea(titleInput);
  resizeTextarea(subtitleInput);

  if (!postId) {
    isLoading = false;
    updateMode();
    setSaveState('', 'New draft');
    requestAnimationFrame(() => titleInput.focus());
    return;
  }

  try {
    const post = await api(`/api/posts/${encodeURIComponent(postId)}`);
    currentPost = post;
    titleInput.value = post.title || '';
    subtitleInput.value = post.subtitle || '';
    tagsInput.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
    contentEditor.innerHTML = sanitizeHtml(post.content || '');
    coverImage = post.coverImage || '';
    lastSavedAt = new Date(post.updatedAt);

    updateCoverUI();
    updateStats();
    resizeTextarea(titleInput);
    resizeTextarea(subtitleInput);
    updateMode();
    setSaveState('saved', post.status === 'published' ? 'Published' : 'Draft saved');
    isLoading = false;
  } catch (err) {
    isLoading = false;
    showToast(err.message || 'That post could not be opened.', 'error');
    setSaveState('error', 'Post not found');
    setTimeout(() => {
      location.href = '/';
    }, 1400);
  }
}

loadPost();
