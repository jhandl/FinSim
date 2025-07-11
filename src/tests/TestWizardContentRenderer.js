// Test suite for validating wizard content renderer integration
// Tests both new structured content and backward compatibility

const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'WizardContentRenderer',
    description: 'Tests wizard content renderer integration with structured content and backward compatibility',
    isCustomTest: true,
    runCustomTest: async function() {
        const testResults = {
            success: true,
            errors: []
        };

        try {
            // Test 1: Verify help.yml structure and conversion
            console.log('  Testing help.yml structure...');
            const helpYmlPath = path.join(__dirname, '..', 'frontend', 'web', 'assets', 'help.yml');
            if (!fs.existsSync(helpYmlPath)) {
                testResults.errors.push('help.yml file not found');
                testResults.success = false;
            } else {
                const helpContent = fs.readFileSync(helpYmlPath, 'utf8');

                // Check for structured content examples
                if (!helpContent.includes('contentType: bullets')) {
                    testResults.errors.push('help.yml does not contain expected bullets content type');
                    testResults.success = false;
                }

                // Check for the converted header step
                if (!helpContent.includes('Main action buttons:')) {
                    testResults.errors.push('help.yml header step was not converted correctly');
                    testResults.success = false;
                }

                // Check for inline icon syntax
                if (!helpContent.includes('{icon:info}')) {
                    testResults.errors.push('help.yml does not contain inline info icon syntax');
                    testResults.success = false;
                }

                // Check for text content type
                if (!helpContent.includes('contentType: text')) {
                    testResults.errors.push('help.yml does not contain text content type examples');
                    testResults.success = false;
                }

                // Check for backward compatibility (some steps should still use description)
                if (!helpContent.includes('description: "<p>')) {
                    testResults.errors.push('help.yml does not maintain backward compatibility examples');
                    testResults.success = false;
                }
            }

            // Test 2: Verify ContentRenderer.js has wizard support
            console.log('  Testing ContentRenderer.js wizard support...');
            const contentRendererPath = path.join(__dirname, '..', 'frontend', 'web', 'components', 'ContentRenderer.js');
            if (!fs.existsSync(contentRendererPath)) {
                testResults.errors.push('ContentRenderer.js file not found');
                testResults.success = false;
            } else {
                const contentRendererCode = fs.readFileSync(contentRendererPath, 'utf8');

                // Check for wizard context support
                if (!contentRendererCode.includes('processRenderingOptions')) {
                    testResults.errors.push('ContentRenderer does not have processRenderingOptions method');
                    testResults.success = false;
                }

                if (!contentRendererCode.includes('context === \'wizard\'')) {
                    testResults.errors.push('ContentRenderer does not check for wizard context');
                    testResults.success = false;
                }

                if (!contentRendererCode.includes('cssPrefix')) {
                    testResults.errors.push('ContentRenderer does not support CSS prefix customization');
                    testResults.success = false;
                }

                if (!contentRendererCode.includes('renderText')) {
                    testResults.errors.push('ContentRenderer does not have renderText method');
                    testResults.success = false;
                }

                if (!contentRendererCode.includes('renderBullets')) {
                    testResults.errors.push('ContentRenderer does not have renderBullets method');
                    testResults.success = false;
                }

                if (!contentRendererCode.includes('renderIcon')) {
                    testResults.errors.push('ContentRenderer does not have renderIcon method');
                    testResults.success = false;
                }

                // Check that IconRenderer dependency is removed
                if (contentRendererCode.includes('IconRenderer')) {
                    testResults.errors.push('ContentRenderer still has IconRenderer dependency');
                    testResults.success = false;
                }
            }

            // Test 3: Verify Wizard.js has ContentRenderer integration
            console.log('  Testing Wizard.js ContentRenderer integration...');
            const wizardPath = path.join(__dirname, '..', 'frontend', 'web', 'components', 'Wizard.js');
            if (!fs.existsSync(wizardPath)) {
                testResults.errors.push('Wizard.js file not found');
                testResults.success = false;
            } else {
                const wizardCode = fs.readFileSync(wizardPath, 'utf8');

                // Check for ContentRenderer integration
                if (!wizardCode.includes('ContentRenderer.render')) {
                    testResults.errors.push('Wizard.js does not use ContentRenderer.render');
                    testResults.success = false;
                }

                if (!wizardCode.includes('step.popover.contentType')) {
                    testResults.errors.push('Wizard.js does not check for contentType');
                    testResults.success = false;
                }

                if (!wizardCode.includes('processAgeYearInContent')) {
                    testResults.errors.push('Wizard.js does not have processAgeYearInContent method');
                    testResults.success = false;
                }

                if (!wizardCode.includes('context: \'wizard\'')) {
                    testResults.errors.push('Wizard.js does not pass wizard context to ContentRenderer');
                    testResults.success = false;
                }
            }

            if (testResults.success) {
                console.log('✅ All wizard content renderer tests passed');
            } else {
                console.log('❌ Some wizard content renderer tests failed');
                testResults.errors.forEach(error => console.log(`  Error: ${error}`));
            }

        } catch (error) {
            testResults.errors.push(`Test execution error: ${error.message}`);
            testResults.success = false;
            console.error('❌ Test execution failed:', error.message);
        }

        return testResults;
    }
};
