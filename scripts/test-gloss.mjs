/**
 * Automated gloss test: navigates to La Divina Commedia stanza 4,
 * walks every word, and checks that the blue translation text appears
 * in the DOM for each word. Uses window.dispatchEvent since Reader
 * listens on window keydown.
 */
import { chromium } from 'playwright';

const FRONTEND   = 'http://localhost:5173';
const PARA_IDX   = 3;       // stanza 4 (0-based) in Inferno Canto 1
const GLOSS_WAIT = 8000;    // ms to wait for Groq gloss fetch

const key = (page, k) =>
  page.evaluate(k => window.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, code: `Digit${k}`, bubbles: true })
  ), k);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Capture page console to diagnose gloss fetch
  page.on('console', msg => {
    const text = msg.text();
    if (text.startsWith('[gloss]') || text.startsWith('[Gloss') || text.includes('gloss') || text.includes('Error') || text.includes('Failed'))
      console.log('[page]', text);
  });
  page.on('requestfailed', req => console.log('[net FAIL]', req.url(), req.failure()?.errorText));
  page.on('response', res => {
    if (res.url().includes('gloss')) console.log('[net]', res.status(), res.url());
  });

  await page.addInitScript(() => {
    window.speechSynthesis = {
      speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
      getVoices: () => [], speaking: false, pending: false, paused: false,
      addEventListener: () => {}, removeEventListener: () => {},
    };
  });

  await page.goto(FRONTEND);
  await page.waitForLoadState('networkidle');

  // Select La Divina Commedia
  const select = page.locator('select').first();
  await select.waitFor({ timeout: 10000 });
  await select.selectOption({ label: 'La Divina Commedia' });
  await page.waitForTimeout(2000);

  // Navigate to chapter 0 via [ key (go back up to 10 times)
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true })));
    await page.waitForTimeout(150);
  }

  // Navigate to stanza PARA_IDX using key 9 (next verse line / next stanza in poetry mode).
  // Each Commedia stanza has 3 lines, so pressing 9 three times per stanza reaches the next stanza.
  for (let i = 0; i < PARA_IDX * 3; i++) {
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true })));
    await page.waitForTimeout(200);
  }

  // Count words in the current stanza so the loop doesn't overshoot into the next one.
  // The Reader marks the active paragraph with aria-current="true" on its <div>.
  const stanzaWordCount = await page.evaluate(() => {
    const para = document.querySelector('[aria-current="true"]');
    if (!para) return 0;
    return para.querySelectorAll('span[role="button"]').length;
  });
  console.log(`Stanza ${PARA_IDX} word count from DOM: ${stanzaWordCount}`);

  // Discover the database paragraph ID by querying the book's chapter 0 paragraphs.
  // The Commedia is bookId=5 (hard-coded; adjust if the DB changes).
  const paraId = await fetch('http://localhost:5000/api/books/5/chapters/0/paragraphs')
    .then(r => r.json())
    .then(ps => ps[PARA_IDX]?.id ?? null)
    .catch(() => null);
  console.log(`Paragraph ${PARA_IDX} database id: ${paraId}`);

  // Wait specifically for THIS paragraph's gloss response, up to GLOSS_WAIT.
  console.log(`Waiting up to ${GLOSS_WAIT / 1000}s for stanza ${PARA_IDX} gloss...`);
  const glossUrlPattern = paraId ? `/paragraphs/${paraId}/gloss` : '/gloss';
  try {
    await page.waitForResponse(
      res => res.url().includes(glossUrlPattern) && res.status() === 200,
      { timeout: GLOSS_WAIT }
    );
    // Settle time for the React state update
    await page.waitForTimeout(1500);
  } catch {
    console.log('  (timed out waiting for gloss response — proceeding anyway)');
    await page.waitForTimeout(1500);
  }

  // Capture the initial active paragraph element by JS reference BEFORE walking.
  // We use evaluateHandle so the same DOM node is tracked even after aria-current moves.
  const initialParaHandle = await page.evaluateHandle(() =>
    document.querySelector('[aria-current="true"]')
  );

  // Walk all words in the stanza; stop when the focused word leaves the initial paragraph.
  const wordLimit = stanzaWordCount > 0 ? stanzaWordCount : 30;
  const results = [];
  let prevWord  = '';

  for (let i = 0; i < wordLimit + 2; i++) {
    await key(page, '6');
    await page.waitForTimeout(400);

    const { word, gloss, stillInPara } = await page.evaluate((initPara) => {
      const wordEl  = document.querySelector('span[role="button"][tabindex="0"]');
      const glossEl = document.querySelector('.text-sky-400');
      return {
        word:        wordEl?.textContent?.trim()  ?? '',
        gloss:       glossEl?.textContent?.trim() ?? '',
        // initPara still points to the stanza 3 div even after aria-current moves away
        stillInPara: !!initPara && !!wordEl && initPara.contains(wordEl),
      };
    }, initialParaHandle);

    if (!word || word === prevWord || !stillInPara) break;
    prevWord = word;

    const ok = gloss.length > 0;
    results.push({ word, gloss, ok });
    console.log(`  ${ok ? 'OK  ' : 'MISS'} "${word}" -> "${gloss}"`);
  }

  await browser.close();

  const misses = results.filter(r => !r.ok);
  console.log(`\n${results.length - misses.length}/${results.length} words have translations`);
  if (misses.length > 0) {
    console.log('Missing:', misses.map(r => `"${r.word}"`).join(', '));
    process.exit(1);
  } else {
    console.log('All words covered.');
  }
}

run().catch(err => { console.error(err); process.exit(1); });
