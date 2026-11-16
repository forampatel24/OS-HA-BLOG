'use strict';

const {
  api,
  escapeHtml,
  formatDate,
  timeAgo,
  readingTimeLabel,
  toneFor,
  showToast
} = window.Blog;

const state = {
  posts: [],
  view: location.hash === '#drafts' ? 'drafts' : 'published',
  query: ''
};

const featuredSlot = document.getElementById('featuredPost');
const postGrid = document.getElementById('postGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const emptyText = document.getElementById('emptyText');
const emptyAction = document.getElementById('emptyAction');
const searchInput = document.getElementById('searchInput');
const draftBadge = document.getElementById('draftBadge');
const sectionKicker = document.getElementById('sectionKicker');
const journalTitle = document.getElementById('journalTitle');
const readLatestBtn = document.getElementById('readLatestBtn');
const year = document.getElementById('year');

if (year) year.textContent = new Date().getFullYear();

function cardMeta(post, isDraft) {
  if (isDraft) {
    return `<span>Edited ${escapeHtml(timeAgo(post.updatedAt))}</span><span class="meta-dot"></span><span class="draft-label">Draft</span>`;
  }
  return `<span>${escapeHtml(formatDate(post.publishedAt || post.updatedAt))}</span><span class="meta-dot"></span><span>${escapeHtml(readingTimeLabel(post.readingTime))}</span>`;
}

function tagMarkup(tags, limit = 3) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return `<div class="card-tags">${tags.slice(0, limit).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function coverMarkup(post, isDraft) {
  if (post.coverImage) {
    return `<div class="card-cover"><img src="${escapeHtml(post.coverImage)}" alt="" loading="lazy"></div>`;
  }
  return `
    <div class="card-cover card-cover-art tone-${toneFor(post.id)}">
      <span class="art-ring" aria-hidden="true"></span>
      <span class="art-grid" aria-hidden="true"></span>
      <span class="art-label">${isDraft ? 'draft' : 'os notes'}</span>
      <span class="art-mark" aria-hidden="true">${escapeHtml((post.title || 'U').charAt(0).toUpperCase())}</span>
    </div>`;
}

function cardMarkup(post, isDraft) {
  const href = isDraft ? `/editor?id=${encodeURIComponent(post.id)}` : `/post/${encodeURIComponent(post.id)}`;
  const title = escapeHtml(post.title || 'Untitled');
  const description = escapeHtml(post.subtitle || post.excerpt || 'A thought waiting to be finished.');
  return `
    <article class="post-card ${isDraft ? 'is-draft' : ''}">
      <a class="card-link" href="${href}" aria-label="${title}">
        ${coverMarkup(post, isDraft)}
        <div class="card-body">
          <div class="card-meta">${cardMeta(post, isDraft)}</div>
          <h3 class="card-title">${title}</h3>
          <p class="card-description">${description}</p>
          ${tagMarkup(post.tags)}
          <span class="card-cta">${isDraft ? 'Continue writing' : 'Read post'}
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </span>
        </div>
      </a>
    </article>`;
}

function featuredMarkup(post) {
  const href = `/post/${encodeURIComponent(post.id)}`;
  const title = escapeHtml(post.title || 'Untitled');
  const description = escapeHtml(post.subtitle || post.excerpt || 'A new note from the journal.');
  const media = post.coverImage
    ? `<div class="featured-media"><img src="${escapeHtml(post.coverImage)}" alt="" loading="lazy"></div>`
    : `<div class="featured-media featured-art tone-${toneFor(post.id)}">
        <span class="art-ring" aria-hidden="true"></span>
        <span class="art-grid" aria-hidden="true"></span>
        <span class="art-mark" aria-hidden="true">${escapeHtml((post.title || 'U').charAt(0).toUpperCase())}</span>
      </div>`;

  return `
    <article class="featured-post">
      <a class="featured-link" href="${href}">
        ${media}
        <div class="featured-copy">
          <span class="featured-label"><i></i>Latest post</span>
          <div class="card-meta">
            <span>${escapeHtml(formatDate(post.publishedAt || post.updatedAt))}</span>
            <span class="meta-dot"></span>
            <span>${escapeHtml(readingTimeLabel(post.readingTime))}</span>
          </div>
          <h3>${title}</h3>
          <p>${description}</p>
          ${tagMarkup(post.tags, 4)}
          <span class="featured-cta">Read the post
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </span>
        </div>
      </a>
    </article>`;
}

function filteredPosts() {
  const query = state.query.trim().toLowerCase();
  const pool = state.posts.filter((post) => post.status === state.view);
  if (!query) return pool;
  return pool.filter((post) => {
    const haystack = [
      post.title,
      post.subtitle,
      post.excerpt,
      ...(Array.isArray(post.tags) ? post.tags : [])
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function updateHeader() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.view);
  });

  if (state.view === 'drafts') {
    sectionKicker.textContent = 'Unfinished ideas';
    journalTitle.textContent = 'Drafts';
    searchInput.placeholder = 'Search drafts';
    if (readLatestBtn) readLatestBtn.hidden = true;
    document.title = 'Drafts · Foram\'s OS Journal';
  } else {
    sectionKicker.textContent = 'Latest writing';
    journalTitle.textContent = 'Published';
    searchInput.placeholder = 'Search posts';
    if (readLatestBtn) readLatestBtn.hidden = false;
    document.title = 'Foram\'s OS Journal';
  }
}

function showEmpty(kind) {
  emptyState.hidden = false;
  emptyAction.onclick = null;

  if (kind === 'search') {
    emptyTitle.textContent = 'Nothing matches that search.';
    emptyText.textContent = 'Try a different word, or clear the search to see everything again.';
    emptyAction.textContent = 'Clear search';
    emptyAction.setAttribute('href', '#');
    emptyAction.onclick = (event) => {
      event.preventDefault();
      searchInput.value = '';
      state.query = '';
      render();
      searchInput.focus();
    };
    return;
  }

  if (state.view === 'drafts') {
    emptyTitle.textContent = 'No drafts waiting.';
    emptyText.textContent = 'Unfinished thoughts will wait for you here until you are ready to publish.';
    emptyAction.textContent = 'Start a new draft';
    emptyAction.setAttribute('href', '/editor');
    return;
  }

  emptyTitle.textContent = 'The first page is blank.';
  emptyText.textContent = 'Write your first post and it will live right here, ready whenever you open the site.';
  emptyAction.textContent = 'Write the first post';
  emptyAction.setAttribute('href', '/editor');
}

function render() {
  updateHeader();

  const posts = filteredPosts();
  const isDrafts = state.view === 'drafts';
  const hasQuery = Boolean(state.query.trim());

  const draftCount = state.posts.filter((post) => post.status === 'draft').length;
  if (draftBadge) {
    draftBadge.textContent = String(draftCount);
    draftBadge.hidden = draftCount === 0;
  }

  loadingState.hidden = true;
  featuredSlot.innerHTML = '';
  postGrid.innerHTML = '';

  if (!posts.length) {
    emptyState.hidden = false;
    showEmpty(hasQuery ? 'search' : state.view === 'drafts' ? 'drafts' : 'published');
    if (readLatestBtn) {
      readLatestBtn.disabled = state.posts.every((post) => post.status !== 'published');
    }
    return;
  }

  emptyState.hidden = true;

  if (!isDrafts && !hasQuery) {
    featuredSlot.innerHTML = featuredMarkup(posts[0]);
    postGrid.innerHTML = posts.slice(1).map((post) => cardMarkup(post, false)).join('');
    postGrid.classList.toggle('is-single', posts.length <= 1);
  } else {
    postGrid.innerHTML = posts.map((post) => cardMarkup(post, isDrafts)).join('');
    postGrid.classList.remove('is-single');
  }

  if (readLatestBtn) {
    const latest = state.posts.find((post) => post.status === 'published');
    readLatestBtn.disabled = !latest;
  }
}

function setView(view) {
  if (view !== 'published' && view !== 'drafts') return;
  state.view = view;
  history.replaceState(null, '', view === 'drafts' ? '#drafts' : location.pathname);
  render();
  document.getElementById('journal').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  render();
});

if (readLatestBtn) {
  readLatestBtn.addEventListener('click', () => {
    const latest = state.posts.find((post) => post.status === 'published');
    if (!latest) {
      showToast('Publish your first post to read it here.');
      return;
    }
    location.href = `/post/${encodeURIComponent(latest.id)}`;
  });
}

window.addEventListener('hashchange', () => {
  state.view = location.hash === '#drafts' ? 'drafts' : 'published';
  render();
});

async function load() {
  try {
    const posts = await api('/api/posts');
    state.posts = Array.isArray(posts) ? posts : [];
    loadingState.hidden = true;
    render();
  } catch (err) {
    loadingState.hidden = true;
    featuredSlot.innerHTML = '';
    postGrid.innerHTML = '';
    emptyState.hidden = false;
    emptyTitle.textContent = 'The journal could not be loaded.';
    emptyText.textContent = err.message;
    emptyAction.textContent = 'Try again';
    emptyAction.setAttribute('href', '#');
    emptyAction.onclick = (event) => {
      event.preventDefault();
      location.reload();
    };
  }
}

load();
