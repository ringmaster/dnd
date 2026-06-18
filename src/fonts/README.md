# Fonts (share-image rendering only)

These TTFs are used solely by `src/builder/og-images.mjs` to rasterize the
Open Graph share images with consistent typography in CI (the rasterizer can't
fetch Google Fonts, and system fonts differ between machines). The sheets
themselves still load Cinzel/Spectral from Google Fonts in the browser.

Both are licensed under the SIL Open Font License 1.1 (redistributable):

- **Cinzel** (`Cinzel-Bold.ttf`) — © Natanael Gama. https://fonts.google.com/specimen/Cinzel
- **Spectral** (`Spectral-Regular.ttf`) — © Production Type. https://fonts.google.com/specimen/Spectral

Full license: https://openfontlicense.org
