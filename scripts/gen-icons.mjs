// Generate square home-screen / PWA icons from the app's logo mark (the
// off-white tile with an amber sun + navy mountains used on the login screen).
// Content sits inside the maskable "safe zone" so iOS/Android rounding never
// clips it. Run: node scripts/gen-icons.mjs
import sharp from 'sharp'

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#F5F3EF"/>
  <circle cx="330" cy="196" r="34" fill="#E8944A"/>
  <path d="M92 360 L190 232 L250 300 L330 206 L420 360 Z" fill="#1C2B4A"/>
</svg>`

const buf = Buffer.from(svg)
const targets = [
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-touch-icon.png', 180],
]

for (const [out, size] of targets) {
  await sharp(buf).resize(size, size).png().toFile(out)
  console.log(`[gen-icons] wrote ${out} (${size}x${size})`)
}
