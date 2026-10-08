// Adding files and switching between them must show exactly one document pane, for
// the selected file. Guards against a shared React key between the pane and the
// findings panel, which silently stacked stale panes (production builds don't warn).
// Needs `npm run preview` running.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:4173/app/';
const file = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
const input = page.locator('input[type=file]').first();

// The document pane is the <section> directly inside <main>.
const panes = page.locator('main > section');
const expectPane = async (name) => {
  await panes.locator('h2', { hasText: name }).waitFor();
  assert.equal(await panes.count(), 1, `one pane while showing ${name}`);
  assert.equal(await panes.locator('h2').textContent(), name);
};
const docButton = (name) => page.getByRole('navigation', { name: 'Documents' }).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) });

await input.setInputFiles(file('a.txt', 'Kevin Okafor called 212-555-0199.'));
await expectPane('a.txt');
await input.setInputFiles([file('b.txt', 'Priya Raman, priya@example.com'), file('c.csv', 'Name,Email\nZyra,z@x.com')]);
await expectPane('b.txt');
for (const name of ['a.txt', 'c.csv', 'b.txt', 'a.txt']) {
  await docButton(name).click();
  await expectPane(name);
}
await page.getByRole('button', { name: 'Close a.txt' }).click();
assert.equal(await panes.count(), 1);
assert.deepEqual(errors, []);
await browser.close();
console.log('Document switching passed.');
