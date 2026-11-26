// Renders the app icon and splash PNGs from SVG, for @capacitor/assets
import sharp from 'sharp';
const logo = (s) => `<g transform="translate(${s.x} ${s.y}) scale(${s.k})"><g fill="#3d8bfd"><rect x="96" y="196" width="40" height="120" rx="12"/><rect x="376" y="196" width="40" height="120" rx="12"/><rect x="146" y="166" width="44" height="180" rx="12"/><rect x="322" y="166" width="44" height="180" rx="12"/><rect x="190" y="240" width="132" height="32" rx="8"/></g><path d="M200 140 L256 92 L312 140" fill="none" stroke="#34c77b" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const svg = (w, h, bg, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${inner}</svg>`);
await sharp(svg(1024, 1024, '#0f1115', logo({ x: 0, y: 0, k: 2 }))).png().toFile('assets/icon-only.png');
await sharp(svg(1024, 1024, null, logo({ x: 256, y: 256, k: 1 }))).png().toFile('assets/icon-foreground.png');
await sharp(svg(1024, 1024, '#0f1115', '')).png().toFile('assets/icon-background.png');
await sharp(svg(2732, 2732, '#0f1115', logo({ x: 1110, y: 1110, k: 1 }))).png().toFile('assets/splash.png');
await sharp(svg(2732, 2732, '#0f1115', logo({ x: 1110, y: 1110, k: 1 }))).png().toFile('assets/splash-dark.png');
console.log('icons ok');
