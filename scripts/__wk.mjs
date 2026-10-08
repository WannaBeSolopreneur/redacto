import { webkit } from 'playwright';
import { execSync } from 'node:child_process';
const rss = () => execSync("ps -axo rss=,command= | grep -i -E 'WebContent|WebKitWebProcess|com.apple.WebKit.WebContent' | grep -v grep | awk '{s+=$1} END {print s}'").toString().trim();
const ctx = await webkit.launchPersistentContext(process.env.PROFILE, { viewport: { width: 1280, height: 900 } });
const base = process.env.URL;
// Visit 1: download the small model.
let page = await ctx.newPage();
await page.goto(base);
await page.getByRole('radio', { name: /Fast/ }).check().catch(() => {});
await page.getByRole('button', { name: /^(Download & activate|Activate) / }).first().click();
await page.getByRole('button', { name: /^AI model: / }).waitFor({ timeout: 180000 });
await page.close();
// Visit 2: model stored. Just open the start screen and wait. Nothing activated.
page = await ctx.newPage();
const before = rss();
await page.goto(base);
await page.getByText(/On this device ·/).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
console.log(`${process.env.LABEL}: web content memory before ${Math.round(before / 1024)} MB, start screen with stored model ${Math.round(rss() / 1024)} MB`);
await ctx.close();
