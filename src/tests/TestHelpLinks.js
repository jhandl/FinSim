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
                        }
                    } else {
                        // For links without keywords, just check basic accessibility
                        const content = await response.text();
                        if (content.length < 500) {
                            testResults.errors.push(`${url}: Suspiciously short content (${content.length} chars)`);
                            testResults.success = false;
                        }
                    }

                } catch (error) {
                    testResults.errors.push(`${url}: ${error.message}`);
                    testResults.success = false;
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
                'User-Agent': 'Mozilla/5.0 (compatible; FinSim-LinkChecker/1.0)'
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