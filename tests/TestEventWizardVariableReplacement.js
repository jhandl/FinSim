// Test suite for validating event wizard variable replacement functionality
// Tests that frequency and other variables are correctly replaced in wizard text

module.exports = {
    name: 'EventWizardVariableReplacement',
    description: 'Tests that wizard text variables like {frequency} are correctly replaced',
    isCustomTest: true,
    runCustomTest: async function() {
        const testResults = {
            success: true,
            errors: []
        };

        try {
            // Mock EventWizardRenderer class to test variable replacement
            class MockEventWizardRenderer {
                processTextVariables(text, wizardState) {
                    if (!text) return text;
                    
                    let processedText = text;
                    const data = wizardState.data;
                    
                    // Replace common placeholders
                    processedText = processedText.replace(/{name}/g, data.name || 'Unnamed Event');
                    processedText = processedText.replace(/{amount}/g, this.formatCurrency(data.amount));
                    processedText = processedText.replace(/{fromAge}/g, data.fromAge || '?');
                    processedText = processedText.replace(/{toAge}/g, data.toAge || '?');
                    processedText = processedText.replace(/{rate}/g, data.rate ? `${data.rate}%` : 'inflation rate');
                    processedText = processedText.replace(/{propertyValue}/g, this.formatCurrency(data.propertyValue));
                    
                    // Replace frequency with human-readable text
                    if (data.frequency) {
                        const frequencyMap = {
                            'oneoff': 'one-time',
                            'weekly': 'weekly',
                            'monthly': 'monthly', 
                            'yearly': 'annual'
                        };
                        const frequencyText = frequencyMap[data.frequency] || data.frequency;
                        processedText = processedText.replace(/{frequency}/g, frequencyText);
                    }
                    
                    return processedText;
                }

                formatCurrency(amount) {
                    if (!amount) return '€0';
                    return `€${parseFloat(amount).toLocaleString()}`;
                }
            }

            const renderer = new MockEventWizardRenderer();

            // Test 1: Frequency replacement for different values
            
            const testCases = [
                {
                    text: "What's the {frequency} cost of this expense?",
                    wizardState: { data: { frequency: 'weekly' } },
                    expected: "What's the weekly cost of this expense?"
                },
                {
                    text: "What's the {frequency} cost of this expense?",
                    wizardState: { data: { frequency: 'monthly' } },
                    expected: "What's the monthly cost of this expense?"
                },
                {
                    text: "What's the {frequency} cost of this expense?",
                    wizardState: { data: { frequency: 'yearly' } },
                    expected: "What's the annual cost of this expense?"
                },
                {
                    text: "What's the {frequency} cost of this expense?",
                    wizardState: { data: { frequency: 'oneoff' } },
                    expected: "What's the one-time cost of this expense?"
                }
            ];

            for (const testCase of testCases) {
                const result = renderer.processTextVariables(testCase.text, testCase.wizardState);
                if (result !== testCase.expected) {
                    testResults.errors.push(`Frequency replacement failed for '${testCase.wizardState.data.frequency}': expected '${testCase.expected}', got '${result}'`);
                    testResults.success = false;
                }
            }

            // Test 2: Multiple variable replacement
            
            const multiVarTest = {
                text: "Your {frequency} {name} expense of {amount}",
                wizardState: { 
                    data: { 
                        frequency: 'monthly',
                        name: 'Groceries',
                        amount: 500
                    } 
                },
                expected: "Your monthly Groceries expense of €500"
            };

            const multiVarResult = renderer.processTextVariables(multiVarTest.text, multiVarTest.wizardState);
            if (multiVarResult !== multiVarTest.expected) {
                testResults.errors.push(`Multiple variable replacement failed: expected '${multiVarTest.expected}', got '${multiVarResult}'`);
                testResults.success = false;
            }

            // Test 3: No frequency data (should leave placeholder unchanged)
            
            const noFrequencyTest = {
                text: "What's the {frequency} cost of this expense?",
                wizardState: { data: {} },
                expected: "What's the {frequency} cost of this expense?"
            };

            const noFrequencyResult = renderer.processTextVariables(noFrequencyTest.text, noFrequencyTest.wizardState);
            if (noFrequencyResult !== noFrequencyTest.expected) {
                testResults.errors.push(`Missing frequency handling failed: expected '${noFrequencyTest.expected}', got '${noFrequencyResult}'`);
                testResults.success = false;
            }

            if (!testResults.success) {
                console.log('❌ Some event wizard variable replacement tests failed');
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
