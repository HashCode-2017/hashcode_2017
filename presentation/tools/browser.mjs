// Shared headless browser launcher for the exporters and the screenshot check.
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// To use an installed Chrome instead of Playwright's Chromium:  CHROME_PATH=/path/to/chrome npm run pdf
export async function launch(extra = []) {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { console.error('Playwright is missing. Run:  npm i -D playwright && npx playwright install chromium'); process.exit(1); }
  const opts = { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...extra] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  return chromium.launch(opts);
}
export const BASE = process.env.SV_URL || 'http://localhost:8080/';
