# PIXEL FRACTAL LAB

An interactive Mandelbrot mathematical art playground with a retro-futuristic pixel-art interface. Built with **HTML5, CSS3, Vanilla JavaScript, Canvas 2D, LocalStorage, and URLSearchParams**. The UI uses OLED black, charcoal panels, stepped borders, pixel typography, and neon-lime accents.

## Run locally

No backend or build step is required.

### Option A — open directly
Open `index.html` in a modern browser. The Google Fonts import is optional; system monospace fallbacks are provided.

### Option B — local static server (recommended)
From the project folder:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features

- Real-time Mandelbrot rendering using the escape-time algorithm.
- Smooth coloring based on normalized escape iterations.
- Progressive rendering with `requestAnimationFrame` so large renders yield to the browser.
- Mouse-wheel / trackpad zoom centered on the cursor.
- Pointer drag to pan.
- Zoom in, zoom out, and reset controls.
- Five color presets:
  - Cosmic Purple
  - Electric Blue
  - Solar Flare
  - Emerald Abyss
  - Pixel Lime (retro terminal palette)
- Randomize button for a quick combination of known fractal regions, palettes, and iteration limits.
- Maximum iteration control (60–900).
- Four exploration landmarks.
- PNG export.
- Shareable URL state containing center, scale, palette, and iterations.
- Clipboard API with a legacy `execCommand("copy")` fallback.
- LocalStorage persistence with corrupted-data protection.
- Device-pixel-ratio aware canvas resizing.
- Responsive desktop/mobile layout.

## Algorithm

For each pixel, the screen coordinate is mapped to a complex number:

```text
c = x + yi
```

Starting with:

```text
z₀ = 0
```

the renderer repeatedly evaluates:

```text
zₙ₊₁ = zₙ² + c
```

If:

```text
|z| > 2
```

the point is considered to have escaped. The number of iterations before escape controls the color.

For escaped points the app applies smooth escape-time normalization:

```text
μ = i + 1 − log(log|z|) / log(2)
```

This reduces visible color banding compared with using the raw integer iteration count.

Points that do not escape before the maximum iteration are rendered as the interior/dark color.

The viewport keeps the complex-plane aspect ratio tied to the canvas dimensions, preventing geometric distortion when the canvas changes shape.

## Performance notes

Rendering is intentionally progressive: rows are computed in chunks and scheduled with `requestAnimationFrame`. This keeps the browser responsive while a high-iteration image is being calculated.

The canvas is capped at 2× device pixel ratio to avoid excessive work on very dense displays.

Deep zooms are visually useful, but this MVP still uses JavaScript `Number` (IEEE-754 double precision). At extreme zoom levels, floating-point precision eventually limits detail. It is not a deep-zoom arbitrary-precision renderer.

## URL state

The app stores:

- `x` — real component of the center
- `y` — imaginary component of the center
- `s` — complex-plane width / scale
- `p` — palette identifier
- `i` — maximum iterations

Example shape:

```text
index.html?x=-0.743643887037&y=0.131825904205&s=0.018&p=cosmic&i=240
```

Only validated parameter values are accepted.

## GitHub Pages deployment

1. Create a GitHub repository, for example `fractal-explorer`.
2. Upload:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
3. Commit and push to the default branch.
4. Open **Settings → Pages** in the repository.
5. Under **Build and deployment**, select **Deploy from a branch**.
6. Select the default branch and `/ (root)`.
7. Save.
8. GitHub will provide the public Pages URL after deployment finishes.

No API key or backend is required.

## MVP limitations

- Rendering is CPU-based Canvas 2D JavaScript, so very high iteration counts or very large canvases can take noticeable time.
- Deep zoom is limited by JavaScript floating-point precision.
- There is no WebGL/GPU renderer in this MVP.
- URL sharing uses the current page path plus query parameters; it assumes the GitHub Pages site serves `index.html` at that path.
- External Google Fonts are used for the visual typography. The app remains functional if fonts are unavailable because system fallbacks are defined.
