// @finsim-test-speed: slow
// Comprehensive test suite for validating help links in help.yml
// Uses Playwright to fetch URLs with a real browser TLS fingerprint,
// avoiding anti-bot detection that blocks Node.js fetch requests.

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'TestHelpLinks',
  description: 'Tests all external links found in help.yml for accessibility and basic content validation',
  isCustomTest: true,
  runCustomTest: async function () {
    const testResults = {
      success: true,
      errors: []
    };

    // Dynamically import Playwright
    let chromium;
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium;
    } catch (error) {
      testResults.errors.push(`Failed to load Playwright: ${error.message}. Run 'npx playwright install' first.`);
      testResults.success = false;
      return testResults;
    }

    let browser = null;
    try {
      // Read and parse help.yml file
      const helpYmlPath = path.join(__dirname, '..', 'src', 'frontend', 'web', 'assets', 'help.yml');
      if (!fs.existsSync(helpYmlPath)) {
        testResults.errors.push('help.yml file not found at expected location');
        testResults.success = false;
        return testResults;
      }

      const helpContent = fs.readFileSync(helpYmlPath, 'utf8');

      // Extract all HTTP/HTTPS links with optional validation keywords using regex
      const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)(?:\{([^\}]*)\})?/g;
      const foundLinks = [];
      let match;

      while ((match = linkRegex.exec(helpContent)) !== null) {
        const [, text, url, keywords] = match;
        foundLinks.push({
          text,
          url,
          keywords: keywords ? keywords.split(',').map(k => k.trim()) : []
        });
      }

      if (foundLinks.length === 0) {
        testResults.errors.push('No HTTP/HTTPS links found in help.yml');
        testResults.success = false;
        return testResults;
      }

      // Remove duplicates based on URL
      const uniqueLinks = foundLinks.filter((link, index, arr) =>
        arr.findIndex(l => l.url === link.url) === index
      );

      // Launch browser once, reuse for all requests
      // Use channel: 'chromium' to use full browser headless mode (not detectable shell)
      browser = await chromium.launch({ channel: 'chromium' });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Test each unique link
      for (const linkInfo of uniqueLinks) {
        const { url, keywords } = linkInfo;
        try {
          const page = await context.newPage();

          // Navigate and wait for network to be idle (handles JS challenges)
          const response = await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
          });

          if (!response || !response.ok()) {
            const status = response ? response.status() : 'no response';
            testResults.errors.push(`${url}: HTTP ${status}`);
            testResults.success = false;
            console.log(`    ❌ FAILED: ${url} - HTTP ${status}`);
            await page.close();
            continue;
          }

          // Get page content for keyword validation
          const content = await page.content();

          // Validate content based on keywords specified in help.yml
          if (keywords.length > 0) {
            const contentLower = content.toLowerCase();

            // Count matching keywords
            let matchingKeywords = 0;
            let matchedKeywords = [];

            for (const keyword of keywords) {
              if (contentLower.includes(keyword.toLowerCase())) {
                matchingKeywords++;
                matchedKeywords.push(keyword);
              }
            }

            // Require at least half the keywords to match (minimum 1)
            const minRequired = Math.max(1, Math.floor(keywords.length / 2));
            if (matchingKeywords < minRequired) {
              testResults.errors.push(
                `${url}: Only ${matchingKeywords}/${minRequired} required keywords found. ` +
                `Matched: [${matchedKeywords.join(', ')}]. Expected: [${keywords.join(', ')}]`
              );
              testResults.success = false;

              console.log(`   ❌ KEYWORD VALIDATION FAILED: ${url}`);
              console.log(`      Expected keywords: [${keywords.join(', ')}]`);
              console.log(`      Found keywords: [${matchedKeywords.join(', ')}]`);
              console.log(`      Required: ${minRequired}/${keywords.length}, Found: ${matchingKeywords}/${keywords.length}`);
              console.log(`      --- CONTENT PREVIEW (first 800 chars) ---`);
              const contentPreview = content.substring(0, 800).replace(/\s+/g, ' ').trim();
              console.log(`      ${contentPreview}${content.length > 800 ? '...' : ''}`);
              console.log(`      --- END CONTENT PREVIEW ---\n`);
            }
          } else {
            // For links without keywords, just check basic accessibility
            if (content.length < 500) {
              testResults.errors.push(`${url}: Suspiciously short content (${content.length} chars)`);
              testResults.success = false;
              console.log(`   ❌ FAILED: ${url} - Content too short (${content.length} chars)`);
            }
          }

          await page.close();

        } catch (error) {
          testResults.errors.push(`${url}: ${error.message}`);
          testResults.success = false;
          console.log(`❌ ERROR: ${url} - ${error.message}`);
        }
      }

    } catch (error) {
      testResults.errors.push(`Test setup error: ${error.message}`);
      testResults.success = false;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return testResults;
  }
};
