# NoDues favicon and app-icon package

This package uses the approved high-detail NoDues document-and-approval artwork.
The transparent master preserves the purple layered document, golden folded corner,
lavender document lines, and overlapping purple approval badge.

## Files

- `nodues-master-1024.png` — transparent master raster (1024 × 1024).
- `nodues-master-512.png` — transparent master raster (512 × 512).
- `favicon.svg` — SVG favicon wrapper embedding the approved 1024px raster.
  This preserves the exact artwork but is **not a true vector reconstruction**.
- `favicon.ico` — multi-resolution ICO (16, 32, 48, 64).
- `favicon-16x16.png` and `favicon-32x32.png` — simplified micro-size variants for legibility.
- `favicon-48x48.png` and `favicon-96x96.png` — detailed artwork at larger sizes.
- `apple-touch-icon.png` — 180 × 180 opaque iOS home-screen icon.
- `android-chrome-192x192.png` and `android-chrome-512x512.png`.
- `android-chrome-maskable-512x512.png` — maskable icon with safe-area padding.
- `site.webmanifest` — PWA icon and theme metadata.
- `size-preview.png` — favicon previews on light and dark surfaces.

## Install

Copy the package contents into the frontend's `public/` directory (or the equivalent
static public root). Then add this to the document `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#25215B">
```

Remove older/conflicting favicon declarations. If the app is deployed under a subpath,
adjust the leading-slash asset paths and `start_url` accordingly.

## Important implementation notes

- The transparent master retains the approved design and is intended for the browser
  favicon and brand use.
- iOS and Android app icons use a solid purple background because those surfaces
  commonly expect opaque app artwork.
- The maskable Android icon has extra safe-area padding to avoid important details
  being clipped by adaptive icon shapes.
- A manifest alone does not make a website installable. A valid HTTPS deployment and
  appropriate PWA/service-worker configuration may also be required.
- Browsers cache favicons aggressively. After deployment, test in a private window
  or use a versioned asset filename if the old icon persists.
- Validate the final live deployment in Chrome, Edge, Firefox, Safari, iOS and Android.
