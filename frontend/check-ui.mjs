import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForFunction(() => !document.body.innerText.includes('Loading LangoSoft'), { timeout: 10000 });
await page.waitForTimeout(3000);

// ── 1. Single reading pane ─────────────────────────────────────────────────
const pane = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const paras = [...document.querySelectorAll('[aria-current="true"]')];
  return { hasCurrent: paras.length > 0, text: paras[0]?.innerText?.slice(0, 80) ?? '' };
});
console.log('\n── Reading pane ──');
console.log(pane.hasCurrent ? `PASS: current paragraph found — "${pane.text}"` : 'FAIL: no current paragraph');

await page.screenshot({ path: 'check-initial.png' });

// ── 2. Speed controls ──────────────────────────────────────────────────────
const speedLabel = await page.evaluate(() => [...document.querySelectorAll('span')].find(s => s.innerText.trim() === 'Speed') ? 'found' : 'missing');
const speedButtons = await page.evaluate(() => ({
  minus: !!document.querySelector('[aria-label="Slow down narration"]'),
  plus:  !!document.querySelector('[aria-label="Speed up narration"]'),
}));
console.log('\n── Speed controls ──');
console.log(`Speed label: ${speedLabel}`);
console.log(`Minus: ${speedButtons.minus ? 'PASS' : 'FAIL'}  Plus: ${speedButtons.plus ? 'PASS' : 'FAIL'}`);

// ── 3. → enters inline input mode ─────────────────────────────────────────
await page.click('body');
await page.waitForTimeout(300);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);

const inputMode = await page.evaluate(() => {
  const textarea = document.querySelector('textarea#recall-input');
  const hint = document.querySelector('[aria-live="polite"]');
  return { hasTextarea: !!textarea, hintText: hint?.innerText?.slice(0, 60) ?? '' };
});
console.log('\n── → input mode ──');
console.log(inputMode.hasTextarea ? 'PASS: textarea visible' : 'FAIL: no textarea');
console.log(inputMode.hintText ? `Hint text: "${inputMode.hintText}"` : 'No hint text yet');

await page.screenshot({ path: 'check-input-mode.png' });

// ── 4. Type + Enter = check, then ← exits ─────────────────────────────────
// Type something and submit to get to the result state (no textarea)
const textarea = page.locator('textarea#recall-input');
await textarea.fill('test input');
await page.keyboard.press('Enter');
await page.waitForTimeout(600); // wait for diff + sound
const resultShown = await page.evaluate(() => !!document.querySelector('[role="status"]'));
console.log('\n── Enter checks ──');
console.log(resultShown ? 'PASS: result shown after Enter' : 'FAIL: no result shown');

// Now ← should exit (no textarea focused)
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(300);
const backToReading = await page.evaluate(() => !document.querySelector('textarea#recall-input'));
console.log('\n── ← back to reading ──');
console.log(backToReading ? 'PASS: back to reading pane' : 'FAIL: still in input mode');

await page.screenshot({ path: 'check-back.png' });

await browser.close();
console.log('\nScreenshots: check-initial.png, check-input-mode.png, check-back.png');
