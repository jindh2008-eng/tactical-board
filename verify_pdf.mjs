import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept(); });

await page.goto('http://localhost:5173/settings');
await page.waitForTimeout(2000);

// 1. Set known values
await page.evaluate(() => {
  const raw = localStorage.getItem('tacticalBoardWorkingPresets');
  const data = raw ? JSON.parse(raw) : {};
  data.building = { ...(data.building || {}), targetName: '가져오기테스트', fireFloor: 7,
    config: { aboveGroundFloors: 15, basementFloors: 2 } };
  localStorage.setItem('tacticalBoardWorkingPresets', JSON.stringify(data));
});
await page.reload();
await page.waitForTimeout(2000);

// 2. Export
const libTab = page.locator('button:has-text("설정 관리")').first();
await libTab.click();
await page.waitForTimeout(500);
const dlPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.locator('button:has-text("내보내기")').click();
const dl = await dlPromise;
const exportPath = 'C:/Users/user/AppData/Local/Temp/test-import.json';
await dl?.saveAs(exportPath);
const exported = JSON.parse(readFileSync(exportPath, 'utf-8'));
console.log('Exported:', { name: exported.workingPresets?.building?.targetName, floor: exported.workingPresets?.building?.fireFloor, config: exported.workingPresets?.building?.config });

// 3. Clear
await page.locator('button:has-text("신규 작성")').click();
await page.waitForTimeout(1000);

// 4. Import
await page.locator('input[type="file"]').setInputFiles(exportPath);
await page.waitForTimeout(3000);

// 5. After reload — check URL and UI
console.log('After import URL:', page.url());

// Navigate to 건물 정보 and check UI values
const buildTab = page.locator('button:has-text("건물 정보")').first();
if (await buildTab.isVisible().catch(() => false)) {
  await buildTab.click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: 'C:/Users/user/AppData/Local/Temp/import_result.png' });

// Check all visible inputs
const allInputs = await page.locator('input:visible').all();
for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
  const val = await allInputs[i].inputValue().catch(() => '');
  const placeholder = await allInputs[i].getAttribute('placeholder').catch(() => '');
  if (val || placeholder) console.log(`  input[${i}]: value="${val}" placeholder="${placeholder}"`);
}

// Check localStorage consistency with React state
const lsData = await page.evaluate(() => {
  const raw = localStorage.getItem('tacticalBoardWorkingPresets');
  if (!raw) return null;
  const data = JSON.parse(raw);
  return {
    targetName: data.building?.targetName,
    fireFloor: data.building?.fireFloor,
    aboveGroundFloors: data.building?.config?.aboveGroundFloors,
    basementFloors: data.building?.config?.basementFloors,
  };
});
console.log('localStorage after import:', lsData);

await browser.close();
