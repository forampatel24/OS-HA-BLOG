'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
};

const IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(POSTS_FILE)) {
  fs.writeFileSync(POSTS_FILE, '[]\n', 'utf8');
}

let writeLock = Promise.resolve();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let finished = false;

    req.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) {
        finished = true;
        const err = new Error('That file is a little too large.');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (finished) return;
      finished = true;
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        const parseError = new Error('Invalid JSON body.');
        parseError.status = 400;
        reject(parseError);
      }
    });

    req.on('error', (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    });
  });
}

async function readPosts() {
  try {
    const raw = await fsp.readFile(POSTS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writePosts(posts) {
  const tempFile = `${POSTS_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
  await fsp.rename(tempFile, POSTS_FILE);
}

function withPosts(task) {
  const run = writeLock.then(async () => {
    const posts = await readPosts();
    const result = await task(posts);
    await writePosts(posts);
    return result;
  });
  writeLock = run.catch(() => {});
  return run;
}

function collapseWhitespace(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function plainTextFromHtml(html) {
  return collapseWhitespace(
    String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|figure)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );
}

function makeExcerpt(html, maxLength = 190) {
  const text = plainTextFromHtml(html);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}

function makeReadingTime(html) {
  const text = plainTextFromHtml(html);
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function countWords(html) {
  const text = plainTextFromHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function cleanText(value, maxLength) {
  return collapseWhitespace(value).slice(0, maxLength);
}

function cleanImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('/uploads/')) return url;
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

function cleanTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value == null ? '' : value).split(',');

  const seen = new Set();
  return source
    .map((tag) => collapseWhitespace(tag).replace(/^#+/, '').slice(0, 32))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function normalizeStatus(value, fallback = 'draft') {
  return value === 'published' ? 'published' : value === 'draft' ? 'draft' : fallback;
}

function postPayload(body, existing) {
  const now = new Date().toISOString();
  const content = typeof body.content === 'string' ? body.content : existing?.content || '';
  const status = normalizeStatus(body.status, existing?.status || 'draft');
  const wasPublished = Boolean(existing?.publishedAt);

  return {
    title: cleanText(body.title ?? existing?.title, 180),
    subtitle: cleanText(body.subtitle ?? existing?.subtitle, 320),
    content,
    coverImage: cleanImageUrl(body.coverImage ?? existing?.coverImage),
    tags: cleanTags(body.tags ?? existing?.tags),
    status,
    excerpt: makeExcerpt(content),
    readingTime: makeReadingTime(content),
    wordCount: countWords(content),
    updatedAt: now,
    publishedAt: status === 'published'
      ? existing?.publishedAt || now
      : wasPublished
        ? existing.publishedAt
        : null
  };
}

function sortPosts(posts) {
  return posts.slice().sort((a, b) => {
    const aDate = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/posts' && req.method === 'GET') {
    const posts = await readPosts();
    return sendJson(res, 200, sortPosts(posts));
  }

  if (pathname === '/api/posts' && req.method === 'POST') {
    const body = await readBody(req);
    const post = await withPosts((posts) => {
      const now = new Date().toISOString();
      const created = {
        id: newId(),
        createdAt: now,
        ...postPayload(body, null)
      };
      posts.push(created);
      return created;
    });
    return sendJson(res, 201, post);
  }

  const postMatch = pathname.match(/^\/api\/posts\/([a-zA-Z0-9-]+)$/);
  if (postMatch) {
    const id = postMatch[1];

    if (req.method === 'GET') {
      const posts = await readPosts();
      const post = posts.find((item) => item.id === id);
      if (!post) return sendError(res, 404, 'Post not found.');
      return sendJson(res, 200, post);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readBody(req);
      const updated = await withPosts((posts) => {
        const index = posts.findIndex((item) => item.id === id);
        if (index === -1) {
          const err = new Error('Post not found.');
          err.status = 404;
          throw err;
        }
        posts[index] = { ...posts[index], ...postPayload(body, posts[index]) };
        return posts[index];
      });
      return sendJson(res, 200, updated);
    }

    if (req.method === 'DELETE') {
      await withPosts((posts) => {
        const index = posts.findIndex((item) => item.id === id);
        if (index === -1) {
          const err = new Error('Post not found.');
          err.status = 404;
          throw err;
        }
        posts.splice(index, 1);
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendError(res, 405, 'Method not allowed.');
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    const body = await readBody(req);
    const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([\s\S]+)$/i.exec(
      String(body.data || '')
    );
    if (!match) {
      return sendError(res, 400, 'Unsupported image. Use PNG, JPG, WEBP, GIF, or AVIF.');
    }

    const ext = IMAGE_EXTENSIONS[match[1].toLowerCase()];
    if (!ext) return sendError(res, 400, 'Unsupported image format.');

    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length) return sendError(res, 400, 'The image could not be read.');
    if (buffer.length > MAX_IMAGE_BYTES) {
      return sendError(res, 413, 'That image is too large. Try one under 12 MB.');
    }

    const filename = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return sendJson(res, 201, { url: `/uploads/${filename}` });
  }

  return sendError(res, 404, 'API route not found.');
}

function serveFile(res, filePath, cacheControl) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cacheControl
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  let relative;

  if (pathname === '/' || pathname === '') {
    relative = 'index.html';
  } else if (pathname === '/editor' || pathname === '/write') {
    relative = 'editor.html';
  } else if (/^\/(post|preview)\/[a-zA-Z0-9-]+\/?$/.test(pathname)) {
    relative = 'post.html';
  } else if (pathname.startsWith('/uploads/')) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname.slice('/uploads/'.length));
    } catch {
      return sendError(res, 400, 'Bad path.');
    }
    const filePath = path.resolve(UPLOAD_DIR, decoded);
    if (!filePath.startsWith(`${UPLOAD_DIR}${path.sep}`)) {
      return sendError(res, 403, 'Forbidden.');
    }
    return serveFile(res, filePath, 'public, max-age=31536000, immutable');
  } else {
    try {
      relative = decodeURIComponent(pathname.replace(/^\/+/, ''));
    } catch {
      return sendError(res, 400, 'Bad path.');
    }
  }

  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendError(res, 403, 'Forbidden.');
  }

  const ext = path.extname(filePath).toLowerCase();
  const cacheControl = ext === '.html' ? 'no-store' : 'no-cache';
  serveFile(res, filePath, cacheControl);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, 405, 'Method not allowed.');
    }

    serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendError(res, err.status || 500, err.status ? err.message : 'Something went wrong.');
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Foram\'s OS Journal is running.');
  console.log(`  Open http://localhost:${PORT}`);
  console.log('');
  console.log('  Keep this window open while you write.');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other server or run: $env:PORT=3001; node server.js`);
    process.exit(1);
  }
  throw err;
});
