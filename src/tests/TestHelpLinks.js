// Comprehensive test suite for validating help links in help.yml
// Automatically extracts all external links from help.yml and tests them

const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'TestHelpLinks',
    description: 'Tests all external links found in help.yml for accessibility and basic content validation',
    isCustomTest: true,
    runCustomTest: async function() {
        const testResults = {
            success: true,
            errors: []
        };

        try {
            // Read and parse help.yml file
            const helpYmlPath = path.join(__dirname, '..', 'frontend', 'web', 'assets', 'help.yml');
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



            // Test each unique link
            for (const linkInfo of uniqueLinks) {
                const { url, text, keywords } = linkInfo;
                try {
                    
                    // Fetch the URL with timeout
                    const response = await fetchWithTimeout(url, 15000);
                    
                    if (!response.ok) {
                        testResults.errors.push(`${url}: HTTP ${response.status} - ${response.statusText}`);
                        testResults.success = false;
                        console.log(`    ❌ FAILED: ${url} - HTTP ${response.status}`);
                        continue;
                    }

                    // Check content type - should be HTML or similar
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('text/html') && !contentType.includes('text/')) {
                        console.log(`⚠ ${url}: Non-HTML content type: ${contentType}`);
                    }

                    // Validate content based on keywords specified in help.yml
                    if (keywords.length > 0) {
                        // Get the content and check for keywords
                        const content = await response.text();
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
                        const content = await response.text();
                        if (content.length < 500) {
                            testResults.errors.push(`${url}: Suspiciously short content (${content.length} chars)`);
                            testResults.success = false;
                            console.log(`   ❌ FAILED: ${url} - Content too short (${content.length} chars)`);
                        } else {
                        }
                    }

                } catch (error) {
                    testResults.errors.push(`${url}: ${error.message}`);
                    testResults.success = false;
                    console.log(`❌ ERROR: ${url} - ${error.message}`);
                }
            }

        } catch (error) {
            testResults.errors.push(`Test setup error: ${error.message}`);
            testResults.success = false;
        }

        return testResults;
    }
};

// Helper function to fetch with timeout
async function fetchWithTimeout(url, timeout = 15000) {
    // Try to use global fetch first (Node.js 18+), fall back to node-fetch
    let fetchFunc;
    
    if (typeof fetch !== 'undefined') {
        fetchFunc = fetch;
    } else {
        try {
            // Try to use node-fetch as a fallback
            const nodeFetch = require('node-fetch');
            fetchFunc = nodeFetch;
        } catch (error) {
            try {
                // Try dynamic import as last resort
                fetchFunc = (await import('node-fetch')).default;
            } catch (importError) {
                throw new Error('No fetch implementation available. Node.js 18+ or node-fetch package required.');
            }
        }
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetchFunc(url, {
            signal: controller.signal,
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'en-IE,en;q=0.9,es-AR;q=0.8,es;q=0.7,de-DE;q=0.6,de;q=0.5,en-US;q=0.4,en-GB;q=0.3',
                'cache-control': 'max-age=0',
                'cookie': 'csrftoken=BEQECdp88UPpFjkKFBS3Q8wlE3UN4BLo9OUdRMm9L488QkKno7GZC70Zr3g0EkWM; cookie_preferences={"embeds":false,"preferences_selected":false}',
                'dnt': '1',
                'priority': 'u=0, i',
                'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
            },
            // Add redirect following
            redirect: 'follow'
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
} 