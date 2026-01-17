// Test suite for verifying config version updates and compatibility

// Test definition object
module.exports = {
    name: 'ConfigVersioning',
    description: 'Tests config version update functionality including version detection, updates, and error handling',
    isCustomTest: true,
    runCustomTest: async function() {
        const testResults = {
            success: true,
            errors: []
        };
        const TestFramework = require('../src/core/TestFramework.js').TestFramework;
        const framework = new TestFramework();
            
        let currentVersion, versionUpdated, alertShown, alertResponse;

        // --- Mock console.error to keep test output clean ---
        const originalConsoleError = console.error;
        let consoleErrors = [];
        console.error = (...args) => {
            consoleErrors.push(args.join(' '));
        };

        // --- Realistic config file mock ---
        const configFiles = {
            '1.26': {
                latestVersion: '1.27',
                dataUpdateMessage: 'New tax rates and calculations available',
                someOtherConfigData: 'value1'
            },
            '1.27': {
                latestVersion: '1.27', // Current version is latest
                dataUpdateMessage: 'You have the latest data',
                someOtherConfigData: 'value2'
            },
            '1.25': {
                latestVersion: '1.27', // Older version
                dataUpdateMessage: 'Multiple updates available',
                someOtherConfigData: 'oldValue'
            }
        };

        // --- Helper to setup and run a test ---
        const runTest = async (startVersion = '1.26', setup) => {
            framework.reset();
            if (!framework.loadCoreModules()) {
                throw new Error('Failed to load core modules');
            }
            const Config = framework.simulationContext.Config;

            currentVersion = startVersion;
            versionUpdated = false;
            alertShown = null;
            alertResponse = true; // Default to "yes"

            const mockUi = {
                getVersion: () => currentVersion,
                setVersion: (v) => { currentVersion = v; versionUpdated = true; },
                showAlert: (m) => { alertShown = m; return alertResponse; },
                fetchUrl: async (url) => {
                    // Handle config files: /src/core/config/finsim-1.26.json
                    const versionMatch = url.match(/finsim-(\d+\.\d+)\.json$/);
                    if (versionMatch) {
                        const requestedVersion = versionMatch[1];
                        if (!configFiles[requestedVersion]) {
                            throw new Error(`Config file not found for version ${requestedVersion}`);
                        }
                        return JSON.stringify(configFiles[requestedVersion]);
                    }
                    
                    // Handle global tax rules: /src/core/config/tax-rules-global.json
                    if (url.match(/tax-rules-global\.json$/)) {
                        return JSON.stringify({
                            version: "1.0",
                            investmentBaseTypes: [
                                {
                                    baseKey: "globalEquity",
                                    label: "Global Equity Index",
                                    baseCurrency: "USD",
                                    assetCountry: "us",
                                    residenceScope: "global"
                                }
                            ]
                        });
                    }
                    
                    // Handle tax rules files: /src/core/config/tax-rules-ie.json
                    const taxRulesMatch = url.match(/tax-rules-(\w+)\.json$/);
                    if (taxRulesMatch) {
                        // Return a minimal valid tax rules structure
                        return JSON.stringify({
                            country: taxRulesMatch[1].toUpperCase(),
                            countryName: taxRulesMatch[1].toUpperCase(),
                            version: "1.0",
                            updateMessage: "",
                            locale: { numberLocale: "en-US", currencyCode: "USD", currencySymbol: "$" }
                        });
                    }
                    
                    throw new Error('Invalid config URL format: ' + url);
                },
                newDataVersion: (v, m) => { if(mockUi.showAlert(m)) { mockUi.setVersion(v); }},
                newCodeVersion: () => {},
                clearVersionNote: () => {},
                setVersionHighlight: () => {}
            };

            if (setup) {
                setup(mockUi);
            }
            
            await Config.initialize(mockUi);
            return Config;
        };

        // --- Helper to assert that a function throws ---
        const assertThrows = async (testFn, expectedErrorMessage, failMessage) => {
            try {
                await testFn();
                testResults.errors.push(failMessage);
                testResults.success = false;
            } catch (e) {
                if (!e.message.includes(expectedErrorMessage)) {
                    testResults.errors.push(`Wrong error. Expected "${expectedErrorMessage}", got "${e.message}"`);
                    testResults.success = false;
                }
            }
        };
        
        try {
            // Test 1: Data version update detected and applied silently (1.26 → 1.27)
            await runTest('1.26');
            if (currentVersion !== '1.27' || !versionUpdated) {
                testResults.errors.push(`Test 1 Failed: Version not updated from 1.26 to 1.27. Got ${currentVersion}, updated: ${versionUpdated}`);
                testResults.success = false;
            }
            if (alertShown) {
                testResults.errors.push(`Test 1 Failed: Unexpected alert shown for data update. Got: ${alertShown}`);
                testResults.success = false;
            }

            // Test 2: User declines data version update (no prompt now, still updates silently)
            await runTest('1.26', mockUi => {
                alertResponse = false; // User clicks "no"
            });
            if (currentVersion !== '1.27' || !versionUpdated) {
                testResults.errors.push(`Test 2 Failed: Version not updated silently. Got ${currentVersion}, updated: ${versionUpdated}`);
                testResults.success = false;
            }
            if (alertShown) {
                testResults.errors.push(`Test 2 Failed: Unexpected alert shown when user would have declined. Got: ${alertShown}`);
                testResults.success = false;
            }

            // Test 3: No update needed (already on latest version)
            await runTest('1.27');
            if (currentVersion !== '1.27' || versionUpdated) {
                testResults.errors.push(`Test 3 Failed: Version changed when no update needed. Got ${currentVersion}, updated: ${versionUpdated}`);
                testResults.success = false;
            }
            if (alertShown) {
                testResults.errors.push(`Test 3 Failed: Alert shown when no update needed. Got: ${alertShown}`);
                testResults.success = false;
            }

            // Test 4: Multiple version jump (1.25 → 1.27)
            await runTest('1.25');
            if (currentVersion !== '1.27' || !versionUpdated) {
                testResults.errors.push(`Test 4 Failed: Multiple version update failed. Got ${currentVersion}, updated: ${versionUpdated}`);
                testResults.success = false;
            }

            // Test 5: Singleton behavior - second initialize call should not reinitialize
            framework.reset();
            if (!framework.loadCoreModules()) {
                throw new Error('Failed to load core modules');
            }
            const Config = framework.simulationContext.Config;
            
            // First initialization
            currentVersion = '1.26';
            versionUpdated = false;
            const mockUi1 = {
                getVersion: () => '1.26',
                setVersion: (v) => { currentVersion = v; versionUpdated = true; },
                showAlert: (m) => true,
                fetchUrl: async (url) => {
                    if (url.match(/finsim-(\d+\.\d+)\.json$/)) {
                        return JSON.stringify(configFiles['1.26']);
                    }
                    if (url.match(/tax-rules-global\.json$/)) {
                        return JSON.stringify({
                            version: "1.0",
                            investmentBaseTypes: [
                                {
                                    baseKey: "globalEquity",
                                    label: "Global Equity Index",
                                    baseCurrency: "USD",
                                    assetCountry: "us",
                                    residenceScope: "global"
                                }
                            ]
                        });
                    }
                    if (url.match(/tax-rules-(\w+)\.json$/)) {
                        return JSON.stringify({
                            country: 'IE',
                            countryName: 'Ireland',
                            version: "1.0",
                            updateMessage: "",
                            locale: { numberLocale: "en-US", currencyCode: "USD", currencySymbol: "$" }
                        });
                    }
                    throw new Error('Invalid config URL format: ' + url);
                },
                newDataVersion: (v, m) => { mockUi1.setVersion(v); },
                newCodeVersion: () => {},
                clearVersionNote: () => {},
                setVersionHighlight: () => {}
            };
            const config1 = await Config.initialize(mockUi1);
            
            // Second initialization with different UI - should return same instance
            const mockUi2 = {
                getVersion: () => '1.27',
                setVersion: () => {},
                showAlert: () => false,
                fetchUrl: async (url) => {
                    if (url.match(/finsim-(\d+\.\d+)\.json$/)) {
                        return JSON.stringify(configFiles['1.27']);
                    }
                    if (url.match(/tax-rules-global\.json$/)) {
                        return JSON.stringify({
                            version: "1.0",
                            investmentBaseTypes: [
                                {
                                    baseKey: "globalEquity",
                                    label: "Global Equity Index",
                                    baseCurrency: "USD",
                                    assetCountry: "us",
                                    residenceScope: "global"
                                }
                            ]
                        });
                    }
                    if (url.match(/tax-rules-(\w+)\.json$/)) {
                        return JSON.stringify({
                            country: 'IE',
                            countryName: 'Ireland',
                            version: "1.0",
                            updateMessage: "",
                            locale: { numberLocale: "en-US", currencyCode: "USD", currencySymbol: "$" }
                        });
                    }
                    throw new Error('Invalid config URL format: ' + url);
                },
                newDataVersion: () => {},
                newCodeVersion: () => {},
                clearVersionNote: () => {},
                setVersionHighlight: () => {}
            };
            const config2 = await Config.initialize(mockUi2);
            
            if (config1 !== config2) {
                testResults.errors.push(`Test 5 Failed: Singleton not working - got different instances`);
                testResults.success = false;
            }

            // Test 6: getInstance() works after initialization
            framework.reset();
            await runTest('1.26');
            const ConfigForTest6 = framework.simulationContext.Config;
            const instance = ConfigForTest6.getInstance();
            if (!instance) {
                testResults.errors.push(`Test 6 Failed: getInstance() returned null after initialization`);
                testResults.success = false;
            }

            // Test 7: getInstance() throws before initialization
            framework.reset();
            if (!framework.loadCoreModules()) {
                throw new Error('Failed to load core modules');
            }
            const ConfigForTest7 = framework.simulationContext.Config;
            try {
                ConfigForTest7.getInstance();
                testResults.errors.push(`Test 7 Failed: getInstance() should throw before initialization`);
                testResults.success = false;
            } catch (e) {
                if (!e.message.includes('Config has not been initialized')) {
                    testResults.errors.push(`Test 7 Failed: Wrong error from getInstance(). Got: ${e.message}`);
                    testResults.success = false;
                }
            }

            // Test 8: Network error during config fetch
            await assertThrows(
                () => runTest('1.26', mockUi => {
                    const originalFetchUrl = mockUi.fetchUrl;
                    mockUi.fetchUrl = async (url) => {
                        // Allow tax rules to load successfully, but throw on config files
                        if (url.match(/tax-rules-global\.json$/) || url.match(/tax-rules-(\w+)\.json$/)) {
                            return originalFetchUrl(url);
                        }
                        throw new Error("Network timeout");
                    };
                }),
                "Network timeout",
                "Test 8 Failed: Did not throw on network error."
            );

            // Test 9: Malformed JSON in config file
            await assertThrows(
                () => runTest('1.26', mockUi => {
                    const originalFetchUrl = mockUi.fetchUrl;
                    mockUi.fetchUrl = async (url) => {
                        // Allow tax rules to load successfully, but return invalid JSON for config files
                        if (url.match(/tax-rules-global\.json$/) || url.match(/tax-rules-(\w+)\.json$/)) {
                            return originalFetchUrl(url);
                        }
                        return "invalid json content";
                    };
                }),
                "Unexpected token",
                "Test 9 Failed: Did not throw on malformed JSON."
            );

            // Test 10: Missing config file (version doesn't exist)
            await assertThrows(
                () => runTest('1.99'), // Version that doesn't exist in our mock
                "Config file not found",
                "Test 10 Failed: Did not throw on missing config file."
            );

            // Test 11: Config file missing latestVersion field - should handle gracefully
            await runTest('1.26', mockUi => {
                const originalFetchUrl = mockUi.fetchUrl;
                mockUi.fetchUrl = async (url) => {
                    const result = await originalFetchUrl(url);
                    const config = JSON.parse(result);
                    delete config.latestVersion; // Remove the field
                    return JSON.stringify(config);
                };
            });
            // Should not crash, should not update version, but should log warning
            if (versionUpdated) {
                testResults.errors.push(`Test 11 Failed: Version updated despite missing latestVersion field`);
                testResults.success = false;
            }
            if (currentVersion !== '1.26') {
                testResults.errors.push(`Test 11 Failed: Version changed despite missing latestVersion. Got ${currentVersion}`);
                testResults.success = false;
            }
            // Check that a warning was logged
            const hasWarning = consoleErrors.some(error => 
                error.includes('latestVersion') || error.includes('missing') || error.includes('update check')
            );
            if (!hasWarning) {
                testResults.errors.push(`Test 11 Failed: No warning logged for missing latestVersion field`);
                testResults.success = false;
            }
            
            console.error = originalConsoleError; // Restore console.error
            return testResults;

        } catch (error) {
            console.error = originalConsoleError; // Restore console.error on failure
            return { success: false, errors: [error.stack] };
        }
    }
}; 
