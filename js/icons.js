const svg = (body, size, className) =>
  `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const sun = `<circle cx="12" cy="12" r="3.4"/><path d="M12 3v2.2M12 18.8V21M4.2 12H2M22 12h-2.2M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M6.1 17.9l1.5-1.5M16.4 7.6l1.5-1.5"/>`;
const moon = `<path d="M16.2 13.8A6.2 6.2 0 0 1 10 5.2 6.4 6.4 0 1 0 16.2 13.8z"/>`;
const cloud = `<path d="M7.5 17h9.2a3.4 3.4 0 0 0 .5-6.7 5.1 5.1 0 0 0-9.8-1.2A3.6 3.6 0 0 0 7.5 17z"/>`;
const fogLines = `<path d="M5 19.2h10M8 21.2h9" opacity=".7"/>`;
const drops = `<path d="M9 18.6v2.2M12.2 19.2v2.4M15.4 18.6v2.2"/>`;
const flakes = `<path d="M9.2 19v2M8.2 20h2M12.2 19.2v2.2M11.2 20.3h2M15.4 19v2M14.4 20h2"/>`;
const bolt = `<path d="M13 11.2 10.6 17h2.2L11.2 21.2 16 14.6h-2.3L15.4 11.2z" fill="currentColor" stroke="none"/>`;

export function weatherIcon(kind, isDay = 1, size = 24, className = "wx-icon") {
  if (kind === "clear") return svg(isDay ? sun : moon, size, className);
  if (kind === "fog") return svg(cloud + fogLines, size, className);
  if (kind === "rain") return svg(cloud + drops, size, className);
  if (kind === "snow") return svg(cloud + flakes, size, className);
  if (kind === "storm") return svg(cloud + bolt, size, className);
  return svg(cloud, size, className);
}

export function moonDisc(illum, t) {
  const waxing = t < 0.5;
  const k = Math.max(0, Math.min(1, illum));
  const shift = (1 - k) * 20 * (waxing ? 1 : -1);
  return `<svg class="moon-disc" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="20" fill="#9aa3b0"/>
    <circle cx="${36 + shift}" cy="36" r="20" fill="#12141a"/>
    <circle cx="36" cy="36" r="20" fill="none" stroke="rgb(236 238 242 / 0.18)"/>
  </svg>`;
}
