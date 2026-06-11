import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

function waitForServer(port, maxWait = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > maxWait) {
        reject(new Error('Server did not start in time'));
        return;
      }
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        setTimeout(check, 1000);
      });
    };
    check();
  });
}

async function main() {
  // Start the Next.js server
  console.log('Starting Next.js dev server...');
  const server = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000', '-H', '0.0.0.0'], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  server.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('Ready') || msg.includes('GET') || msg.includes('error') || msg.includes('Error')) {
      console.log('[SERVER]', msg.substring(0, 200));
    }
  });
  
  server.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('error') || msg.includes('Error')) {
      console.log('[SERVER ERR]', msg.substring(0, 200));
    }
  });

  // Wait for server to be ready
  try {
    await waitForServer(3000, 60000);
    console.log('Server is ready!');
  } catch (e) {
    console.error('Failed to start server:', e.message);
    server.kill();
    process.exit(1);
  }

  // Now launch browser
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });
  
  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  // Step 1: Open dashboard
  console.log('\n=== STEP 1: Opening Dashboard ===');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/z/my-project/screenshot-dashboard.png', fullPage: true });
  console.log('Screenshot saved: screenshot-dashboard.png');
  
  const title = await page.title();
  console.log('Page title:', title);
  
  // Get page text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n--- Dashboard Text ---');
  console.log(bodyText.substring(0, 5000));
  
  // Check for key dashboard elements
  console.log('\n--- Dashboard Elements Check ---');
  const dashboardElements = await page.evaluate(() => {
    const checks = {};
    checks['gold21k'] = document.body.innerText.includes('Gold 21K') || document.body.innerText.includes('21K') || document.body.innerText.includes('gold');
    checks['usdEgp'] = document.body.innerText.includes('USD/EGP') || document.body.innerText.includes('USD') || document.body.innerText.includes('EGP');
    checks['buyPrice'] = document.body.innerText.includes('Buy') || document.body.innerText.includes('buy');
    checks['sellPrice'] = document.body.innerText.includes('Sell') || document.body.innerText.includes('sell');
    checks['investmentPlan'] = document.body.innerText.includes('Investment') || document.body.innerText.includes('Plan') || document.body.innerText.includes('investment');
    checks['signal'] = document.body.innerText.includes('Signal') || document.body.innerText.includes('signal');
    checks['pricesTab'] = document.body.innerText.includes('Prices') || document.body.innerText.includes('prices');
    checks['settingsTab'] = document.body.innerText.includes('Settings') || document.body.innerText.includes('settings');
    checks['logsTab'] = document.body.innerText.includes('Logs') || document.body.innerText.includes('logs');
    return checks;
  });
  console.log('Element presence:', JSON.stringify(dashboardElements, null, 2));
  
  // Step 2: Click Prices tab
  console.log('\n=== STEP 2: Prices Tab ===');
  try {
    const pricesTab = page.locator('button:has-text("Prices"), [role="tab"]:has-text("Prices"), a:has-text("Prices")').first();
    if (await pricesTab.count() > 0) {
      await pricesTab.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/home/z/my-project/screenshot-prices.png', fullPage: true });
      console.log('Screenshot saved: screenshot-prices.png');
      const pricesText = await page.evaluate(() => document.body.innerText);
      console.log('Prices tab text:', pricesText.substring(0, 3000));
    } else {
      console.log('Prices tab button not found, trying text search...');
      // Try finding it by text content
      const found = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Prices' && el.click) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (found) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/home/z/my-project/screenshot-prices.png', fullPage: true });
        console.log('Screenshot saved: screenshot-prices.png');
        const pricesText = await page.evaluate(() => document.body.innerText);
        console.log('Prices tab text:', pricesText.substring(0, 3000));
      } else {
        console.log('Could not find Prices tab');
      }
    }
  } catch (e) {
    console.log('Error clicking Prices tab:', e.message);
  }
  
  // Step 3: Click Settings tab
  console.log('\n=== STEP 3: Settings Tab ===');
  try {
    const settingsTab = page.locator('button:has-text("Settings"), [role="tab"]:has-text("Settings"), a:has-text("Settings")').first();
    if (await settingsTab.count() > 0) {
      await settingsTab.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/home/z/my-project/screenshot-settings.png', fullPage: true });
      console.log('Screenshot saved: screenshot-settings.png');
      const settingsText = await page.evaluate(() => document.body.innerText);
      console.log('Settings tab text:', settingsText.substring(0, 3000));
    } else {
      const found = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Settings' && el.click) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (found) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/home/z/my-project/screenshot-settings.png', fullPage: true });
        console.log('Screenshot saved: screenshot-settings.png');
        const settingsText = await page.evaluate(() => document.body.innerText);
        console.log('Settings tab text:', settingsText.substring(0, 3000));
      } else {
        console.log('Could not find Settings tab');
      }
    }
  } catch (e) {
    console.log('Error clicking Settings tab:', e.message);
  }
  
  // Step 4: Click Logs tab
  console.log('\n=== STEP 4: Logs Tab ===');
  try {
    const logsTab = page.locator('button:has-text("Logs"), [role="tab"]:has-text("Logs"), a:has-text("Logs")').first();
    if (await logsTab.count() > 0) {
      await logsTab.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/home/z/my-project/screenshot-logs.png', fullPage: true });
      console.log('Screenshot saved: screenshot-logs.png');
      const logsText = await page.evaluate(() => document.body.innerText);
      console.log('Logs tab text:', logsText.substring(0, 3000));
    } else {
      const found = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Logs' && el.click) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (found) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/home/z/my-project/screenshot-logs.png', fullPage: true });
        console.log('Screenshot saved: screenshot-logs.png');
        const logsText = await page.evaluate(() => document.body.innerText);
        console.log('Logs tab text:', logsText.substring(0, 3000));
      } else {
        console.log('Could not find Logs tab');
      }
    }
  } catch (e) {
    console.log('Error clicking Logs tab:', e.message);
  }
  
  // Step 5: Check footer
  console.log('\n=== STEP 5: Footer Check ===');
  const footerInfo = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (!footer) return { exists: false };
    const style = window.getComputedStyle(footer);
    const rect = footer.getBoundingClientRect();
    return {
      exists: true,
      text: footer.innerText,
      position: style.position,
      bottom: style.bottom,
      height: rect.height,
      visible: rect.height > 0,
      atBottom: rect.bottom >= window.innerHeight - 5,
      className: footer.className
    };
  });
  console.log('Footer info:', JSON.stringify(footerInfo, null, 2));
  
  // Step 6: Check for errors
  console.log('\n=== STEP 6: Error Check ===');
  console.log('Console errors/warnings:', consoleMessages.length > 0 ? consoleMessages : 'None');
  console.log('Page errors:', pageErrors.length > 0 ? pageErrors : 'None');
  
  // Check for broken images
  const brokenImages = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    return Array.from(imgs).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src);
  });
  console.log('Broken images:', brokenImages.length > 0 ? brokenImages : 'None');
  
  // Final full page screenshot
  await page.screenshot({ path: '/home/z/my-project/screenshot-final.png', fullPage: true });
  console.log('\nFinal screenshot saved: screenshot-final.png');
  
  await browser.close();
  server.kill();
  console.log('\nTest complete!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
