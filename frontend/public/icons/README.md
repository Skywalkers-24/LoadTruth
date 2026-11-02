# LoadTruth Icon Pack

A clean, **true vector SVG** (not a PNG embedded in an SVG) LoadTruth identity: a stylized dump truck, a raised load bed and a large verification checkmark.

## Included

- `dark/svg/` — SVGs with a navy background for dark surfaces.
- `light/svg/` — SVGs with a pale background for light surfaces.
- `transparent/dark/svg/` — truck mark only, intended for dark backgrounds.
- `transparent/light/svg/` — truck mark only, intended for light backgrounds.
- Every SVG folder includes matching `png/` exports.
- Sizes: 16, 20, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024 pixels.
- `favicon-dark.svg` and `favicon-light.svg`.
- `preview.png` — contact sheet of both themes.

All SVGs have a common `viewBox="0 0 1024 1024"`, so they scale cleanly to **any size**. Files with specific pixel dimensions are provided for easy drop-in usage.

## Website usage

```html
<link
  rel="icon"
  type="image/svg+xml"
  href="/icons/favicon-light.svg"
  media="(prefers-color-scheme: light)"
/>
<link
  rel="icon"
  type="image/svg+xml"
  href="/icons/favicon-dark.svg"
  media="(prefers-color-scheme: dark)"
/>
<link rel="apple-touch-icon" href="/icons/light/png/loadtruth-light-180.png" />
```

For React/Next.js, use the 256+ SVG or PNG icons on the landing page and the 32/48 favicon files for the browser tab. For PWA icons, use 192 and 512 PNG files.

## Palette

- Dark background: `#06132A` / `#041222`
- Light background: `#FFFFFF` / `#F0F8FF`
- Brand blue: `#1884F4`
- Bright cyan: `#39DEFA`
- Verified teal: `#19F9BC`

Artwork is newly drawn using SVG paths and gradients, designed for LoadTruth.
