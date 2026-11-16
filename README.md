# Foram's OS Journal

A small, local blogging website for writing and publishing posts about Operating Systems. It runs entirely on your own machine, keeps your writing on disk, and does not need an internet connection.

## Quick start

You need [Node.js](https://nodejs.org) (version 18 or newer).

### Option 1: Start from VS Code

Open this folder in VS Code, then open the terminal with `Ctrl+`` and run:

```powershell
cd "D:\Foram_TP\ENGINEERING TY\SEM1\OS\HA"
npm start
```

Then open **http://localhost:3000** in your browser.

### Option 2: Double-click

Double-click `start.bat`. It starts the server and opens the site automatically.

To stop the server, press `Ctrl+C` in the terminal or close the command window.

## How to use

- Click **Write** to create a new post.
- Add a title, subtitle, tags, and an optional cover image.
- Paste text and images directly into the editor. Images copied from screenshots or other websites are uploaded automatically.
- Use the toolbar for headings, bold, italic, quotes, code blocks, lists, links, and dividers.
- Everything saves automatically as a draft while you write.
- Click **Publish** when the post is ready. It will appear on the journal homepage.
- Open **Drafts** to continue an unfinished post.
- Use the three-dot menu in the editor to preview, unpublish, or delete a post.
- Use the moon/sun button to switch between light and dark mode.

## Where your content is stored

All content stays inside the project folder:

```text
data/
  posts.json       All posts, drafts, titles, tags, and settings
  uploads/         Images added to posts
```

To back up your blog, copy the entire `data` folder somewhere safe. To move the blog to another computer, copy the whole project folder including `data`.

Do not delete `data/posts.json` if you want to keep your posts.

## Project structure

```text
server.js            Local web server and JSON storage API
package.json         Project information and start script
start.bat            Windows one-click launcher
public/
  index.html         Journal homepage
  editor.html        Writing and publishing page
  post.html          Reading page
  css/style.css      All styling, light and dark themes
  js/common.js       Shared helpers, theme, and HTML sanitising
  js/home.js         Homepage logic
  js/editor.js       Rich text editor, autosave, and image uploads
  js/post.js         Published post rendering
data/
  posts.json         Your saved posts
  uploads/           Uploaded images
```

## Changing the port

The site uses port `3000` by default. If that port is already in use, run:

```powershell
$env:PORT=3001
npm start
```

Then open **http://localhost:3001**.

## Troubleshooting

**The site does not open**

Make sure the terminal says the server is running and keep that window open. Check that you are visiting `http://localhost:3000`, not an `https` address.

**Port 3000 is already in use**

Another copy of the server is probably running. Close the old terminal window, or start this one on port 3001 using the command above.

**An image will not upload**

Use PNG, JPG, WEBP, GIF, or AVIF images under 12 MB. Very large images are resized automatically before uploading.

**I cannot find a post I wrote**

Check the **Drafts** tab. Unpublished posts are kept there. You can also check `data/posts.json`.

**The theme resets**

The theme preference is stored in your browser's local storage. Changing browsers or clearing browser data will reset it.

## Demo day checklist

1. Double-click `start.bat`.
2. Open **http://localhost:3000**.
3. Open your published post from the homepage.
4. Keep the command window open during the presentation.
