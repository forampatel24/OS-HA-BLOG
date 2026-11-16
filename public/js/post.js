'use strict';

const {
  api,
  escapeHtml,
  sanitizeHtml,
  formatDate,
  readingTimeLabel
} = window.Blog;

const pathMatch = location.pathname.match(/^\/(?:post|preview)\/([a-zA-Z0-9-]+)\/?$/);
const queryId = new URLSearchParams(location.search).get('id');
const postId = pathMatch ? pathMatch[1] : queryId;

const article = document.getElementById('postArticle');
const loading = document.getElementById('postLoading');
const notFound = document.getElementById('postNotFound');
const title = document.getElementById('postTitle');
const subtitle = document.getElementById('postSubtitle');
const tags = document.getElementById('postTags');
const meta = document.getElementById('postMeta');
const content = document.getElementById('postContent');
const coverFigure = document.getElementById('coverFigure');
const cover = document.getElementById('postCover');
const editBtn = document.getElementById('editBtn');
const previewBanner = document.getElementById('previewBanner');
const previewText = document.getElementById('previewText');
const previewEditLink = document.getElementById('previewEditLink');
const progressBar = document.querySelector('#readingProgress span');
const year = document.getElementById('year');

if (year) year.textContent = new Date().getFullYear();

function renderTags(postTags) {
  if (!Array.isArray(postTags) || !postTags.length) return;
  tags.innerHTML = postTags
    .map((tag) => `<span class="post-tag">#${escapeHtml(tag)}</span>`)
    .join('');
}

function renderPost(post) {
  const isDraft = post.status !== 'published';
  const date = formatDate(post.publishedAt || post.updatedAt, { month: 'long' });
  const readTime = readingTimeLabel(post.readingTime);

  document.title = `${post.title || 'Untitled'} · Foram's OS Journal`;

  title.textContent = post.title || 'Untitled';
  if (post.subtitle) {
    subtitle.textContent = post.subtitle;
    subtitle.hidden = false;
  }

  renderTags(post.tags);

  meta.innerHTML = isDraft
    ? `<span>Draft</span><span class="meta-dot"></span><span>Last edited ${escapeHtml(date)}</span><span class="meta-dot"></span><span>${escapeHtml(readTime)}</span>`
    : `<span>Published ${escapeHtml(date)}</span><span class="meta-dot"></span><span>${escapeHtml(readTime)}</span>`;

  const safeContent = sanitizeHtml(post.content || '');
  content.innerHTML = safeContent || '<p class="empty-body">This post is still empty.</p>';

  if (post.coverImage) {
    cover.src = post.coverImage;
    cover.alt = post.title ? `Cover for ${post.title}` : 'Post cover';
    coverFigure.hidden = false;
  }

  editBtn.href = `/editor?id=${encodeURIComponent(post.id)}`;
  editBtn.hidden = false;

  if (isDraft) {
    previewBanner.hidden = false;
    previewText.textContent = 'Draft preview — this post is not visible on your journal yet.';
    previewEditLink.href = `/editor?id=${encodeURIComponent(post.id)}`;
  }

  const description = post.subtitle || post.excerpt || '';
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && description) descriptionTag.setAttribute('content', description);

  loading.hidden = true;
  article.hidden = false;
  requestAnimationFrame(updateProgress);
}

function updateProgress() {
  if (!progressBar) return;
  const rect = content.getBoundingClientRect();
  const articleTop = rect.top + window.scrollY;
  const usableHeight = Math.max(1, content.offsetHeight);
  const raw = (window.scrollY + window.innerHeight * 0.55 - articleTop) / usableHeight;
  const progress = Math.min(1, Math.max(0, raw));
  progressBar.style.transform = `scaleX(${progress})`;
}

async function loadPost() {
  if (!postId) {
    loading.hidden = true;
    notFound.hidden = false;
    return;
  }

  try {
    const post = await api(`/api/posts/${encodeURIComponent(postId)}`);
    renderPost(post);
  } catch {
    loading.hidden = true;
    notFound.hidden = false;
  }
}

window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);

loadPost();
