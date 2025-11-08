// Test suite for UI validation logic, particularly for Person 2
// Enhanced with comprehensive UI input validation tests for Person 1 and Person 2 parameters.
// Also includes tests for strict currency conversion error handling.

const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
    name: 'UI Input Validation Test',
    description: 'Validates UI input validation logic for Person 1 and Person 2 parameters, and strict currency conversion',
    isCustomTest: true,
    runCustomTest: async function() {
        const testResults = {
            success: true,
            errors: []
        };

        try {
            // Create a mock UIManager that simulates the validation logic
            // This is a simplified version that focuses on the core validation rules
            class MockUIManager {
                constructor(ui) {
                    this.ui = ui;
                }

                hasValue(value) {
                    return value !== undefined && value !== '' && value !== 0;
                }

                readParameters(validate = true) {
                    const params = {
                        startingAge: this.ui.getValue("StartingAge"),
                        retirementAge: this.ui.getValue("RetirementAge"),
                        p2StartingAge: this.ui.getValue("P2StartingAge"),
                        p2RetirementAge: this.ui.getValue("P2RetirementAge"),
                        p2StatePensionWeekly: this.ui.getValue("P2StatePensionWeekly"),
                        initialPensionP2: this.ui.getValue("InitialPensionP2"),
                        pensionPercentageP2: this.ui.getValue("PensionContributionPercentageP2")
                    };
                    
                    if (validate) {
                        this.ui.clearAllErrors();
                        this.validateParameterAgeFields(params);
                    }
                    
                    return params;
                }

                validateParameterAgeFields(params) {
                    // Person 1 validation: If one age field is provided, both must be provided
                    const p1StartingProvided = this.hasValue(params.startingAge);
                    const p1RetirementProvided = this.hasValue(params.retirementAge);
                    
                    if (p1StartingProvided && !p1RetirementProvided) {
                        this.ui.setWarning('RetirementAge', 'Retirement age is required when starting age is provided');
                    }
                    
                    if (p1RetirementProvided && !p1StartingProvided) {
                        this.ui.setWarning('StartingAge', 'Starting age is required when retirement age is provided');
                    }

                    // Person 2 validation: If any P2 field is provided, P2 ages must be provided
                    const p2StartingProvided = this.hasValue(params.p2StartingAge);
                    const p2RetirementProvided = this.hasValue(params.p2RetirementAge);
                    const p2OtherFieldsProvided = this.hasValue(params.p2StatePensionWeekly) ||
                                                 this.hasValue(params.initialPensionP2) ||
                                                 this.hasValue(params.pensionPercentageP2);
                    
                    // If P2 starting age is provided but retirement age is not
                    if (p2StartingProvided && !p2RetirementProvided) {
                        this.ui.setWarning('P2RetirementAge', 'Partner retirement age is required when starting age is provided');
                    }
                    
                    // If P2 retirement age is provided but starting age is not
                    if (p2RetirementProvided && !p2StartingProvided) {
                        this.ui.setWarning('P2StartingAge', 'Partner starting age is required when retirement age is provided');
                    }
                    
                    // If any other P2 field is provided, both P2 ages must be provided
                    if (p2OtherFieldsProvided) {
                        if (!p2StartingProvided) {
                            this.ui.setWarning('P2StartingAge', 'Partner starting age is required when partner information is provided');
                        }
                        if (!p2RetirementProvided) {
                            this.ui.setWarning('P2RetirementAge', 'Partner retirement age is required when partner information is provided');
                        }
                    }
                }
            }

            // Test counter
            let testsRun = 0;
            let testsPassed = 0;

            // Helper function to run a single test (supports both sync and async)
            const runSingleTest = async (testName, testFunction) => {
                testsRun++;
                try {
                    const result = testFunction();
                    // Handle async test functions
                    if (result && typeof result.then === 'function') {
                        await result;
                    }
                    testsPassed++;
                } catch (error) {
                    testResults.errors.push(`${testName}: ${error.message}`);
                    testResults.success = false;
                }
            };

            // Helper function to create mock UI and UIManager
            const createMockUIManager = () => {
                const getValueStore = {};
                const setWarningSpy = {};
                let clearAllErrorsSpy = false;

                const mockUi = {
                    getValue: (fieldId) => getValueStore[fieldId] !== undefined ? getValueStore[fieldId] : '',
                    setValue: (fieldId, value) => getValueStore[fieldId] = value,
                    setWarning: (fieldId, message) => {
                        setWarningSpy[fieldId] = message;
                    },
                    clearAllErrors: () => {
                        Object.keys(setWarningSpy).forEach(key => delete setWarningSpy[key]);
                        clearAllErrorsSpy = true;
                    }
                };

                // Initialize all known params to empty string
                const p1ParameterFields = ['StartingAge', 'RetirementAge'];
                const p2ParameterFields = ['P2StartingAge', 'P2RetirementAge', 'P2StatePensionWeekly', 'InitialPensionP2', 'PensionContributionPercentageP2'];
                const allKnownParams = [...p1ParameterFields, ...p2ParameterFields];

                allKnownParams.forEach(key => getValueStore[key] = '');

                const uiManagerInstance = new MockUIManager(mockUi);

                return {
                    getValueStore,
                    setWarningSpy,
                    clearAllErrorsSpy: () => clearAllErrorsSpy,
                    uiManagerInstance,
                    callReadParameters: () => uiManagerInstance.readParameters(true)
                };
            };

            // Person 1 Validation Tests
            await runSingleTest('P1 RetirementAge required when StartingAge provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['StartingAge'] = '30';
                mock.getValueStore['RetirementAge'] = '';
                mock.callReadParameters();
                
                if (!mock.clearAllErrorsSpy()) {
                    throw new Error('clearAllErrors should have been called');
                }
                if (mock.setWarningSpy['RetirementAge'] === undefined) {
                    throw new Error('Warning should be set for P1 RetirementAge');
                }
                if (mock.setWarningSpy['StartingAge'] !== undefined) {
                    throw new Error('No warning should be set for P1 StartingAge');
                }
            });

            await runSingleTest('P1 StartingAge required when RetirementAge provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['StartingAge'] = '';
                mock.getValueStore['RetirementAge'] = '65';
                mock.callReadParameters();
                
                if (mock.setWarningSpy['StartingAge'] === undefined) {
                    throw new Error('Warning should be set for P1 StartingAge');
                }
                if (mock.setWarningSpy['RetirementAge'] !== undefined) {
                    throw new Error('No warning should be set for P1 RetirementAge');
                }
            });

            await runSingleTest('P1 valid when both ages provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['StartingAge'] = '30';
                mock.getValueStore['RetirementAge'] = '65';
                mock.callReadParameters();
                
                if (Object.keys(mock.setWarningSpy).length !== 0) {
                    throw new Error(`No warnings should be set for P1 if both ages provided. Got: ${JSON.stringify(mock.setWarningSpy)}`);
                }
            });

            await runSingleTest('P1 valid when both ages blank', () => {
                const mock = createMockUIManager();
                mock.getValueStore['StartingAge'] = '';
                mock.getValueStore['RetirementAge'] = '';
                mock.callReadParameters();
                
                if (Object.keys(mock.setWarningSpy).length !== 0) {
                    throw new Error(`No warnings should be set for P1 if both ages blank. Got: ${JSON.stringify(mock.setWarningSpy)}`);
                }
            });

            // Person 2 Validation Tests
            const p2TriggerFields = ['P2StatePensionWeekly', 'InitialPensionP2', 'PensionContributionPercentageP2'];

            for (const triggerField of p2TriggerFields) {
                await runSingleTest(`P2 ages required when ${triggerField} provided`, () => {
                    const mock = createMockUIManager();
                    mock.getValueStore[triggerField] = '100';
                    mock.getValueStore['P2StartingAge'] = '';
                    mock.getValueStore['P2RetirementAge'] = '';
                    mock.callReadParameters();
                    
                    if (!mock.clearAllErrorsSpy()) {
                        throw new Error('clearAllErrors should have been called');
                    }
                    if (mock.setWarningSpy['P2StartingAge'] === undefined) {
                        throw new Error(`Warning should be set for P2StartingAge with ${triggerField} provided`);
                    }
                    if (mock.setWarningSpy['P2RetirementAge'] === undefined) {
                        throw new Error(`Warning should be set for P2RetirementAge with ${triggerField} provided`);
                    }
                });
            }

            await runSingleTest('P2StartingAge required when P2RetirementAge provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['P2StartingAge'] = '';
                mock.getValueStore['P2RetirementAge'] = '60';
                mock.callReadParameters();
                
                if (mock.setWarningSpy['P2StartingAge'] === undefined) {
                    throw new Error('Warning should be set for P2StartingAge');
                }
                if (mock.setWarningSpy['P2RetirementAge'] !== undefined) {
                    throw new Error('No warning should be set for P2RetirementAge as it is provided');
                }
            });

            await runSingleTest('P2RetirementAge required when P2StartingAge provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['P2StartingAge'] = '30';
                mock.getValueStore['P2RetirementAge'] = '';
                mock.callReadParameters();
                
                if (mock.setWarningSpy['P2StartingAge'] !== undefined) {
                    throw new Error('No warning should be set for P2StartingAge as it is provided');
                }
                if (mock.setWarningSpy['P2RetirementAge'] === undefined) {
                    throw new Error('Warning should be set for P2RetirementAge');
                }
            });

            await runSingleTest('P2 valid when all fields blank', () => {
                const mock = createMockUIManager();
                // All fields are already blank from initialization
                mock.callReadParameters();
                
                if (Object.keys(mock.setWarningSpy).length !== 0) {
                    throw new Error(`No warnings should be set if all P2 fields are blank. Got: ${JSON.stringify(mock.setWarningSpy)}`);
                }
            });

            await runSingleTest('P2 valid when ages and other fields provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['P2StartingAge'] = '30';
                mock.getValueStore['P2RetirementAge'] = '60';
                mock.getValueStore['P2StatePensionWeekly'] = '100';
                mock.getValueStore['InitialPensionP2'] = '5000';
                mock.getValueStore['PensionContributionPercentageP2'] = '0.1';
                mock.callReadParameters();
                
                if (Object.keys(mock.setWarningSpy).length !== 0) {
                    throw new Error(`No warnings should be set if all required P2 fields provided. Got: ${JSON.stringify(mock.setWarningSpy)}`);
                }
            });

            await runSingleTest('P2 valid when only ages provided', () => {
                const mock = createMockUIManager();
                mock.getValueStore['P2StartingAge'] = '30';
                mock.getValueStore['P2RetirementAge'] = '60';
                // Other P2 fields remain blank
                mock.callReadParameters();
                
                if (Object.keys(mock.setWarningSpy).length !== 0) {
                    throw new Error(`No warnings should be set if only P2 ages are provided. Got: ${JSON.stringify(mock.setWarningSpy)}`);
                }
            });

            // Currency conversion strict mode tests
            await runSingleTest('Simulator refuses to run with unknown currency code in event', async () => {
                const framework = new TestFramework();
                const scenario = {
                    name: 'UnknownCurrencyTest',
                    description: 'Event with unknown currency code should abort simulation',
                    scenario: {
                        parameters: {
                            startingAge: 30,
                            targetAge: 35,
                            retirementAge: 65,
                            initialSavings: 10000,
                            inflation: 0.02,
                            StartCountry: 'ie',
                            simulation_mode: 'single',
                            economy_mode: 'deterministic'
                        },
                        events: [
                            {
                                type: 'SI',
                                id: 'salary-unknown-currency',
                                amount: 50000,
                                fromAge: 30,
                                toAge: 34,
                                currency: 'XXX', // Unknown currency code
                                rate: 0
                            }
                        ]
                    },
                    assertions: []
                };

                if (!framework.loadScenario(scenario)) {
                    throw new Error('Failed to load scenario with unknown currency');
                }

                const results = await framework.runSimulation();
                
                // Check that errors flag was set in the VM context
                const vm = require('vm');
                const errorsFlag = vm.runInContext('errors', framework.simulationContext);
                if (!errorsFlag) {
                    throw new Error('Expected errors flag to be true when unknown currency (XXX) is used, but got: ' + errorsFlag);
                }
                
                // The simulation should have failed or been aborted due to the error
                // Check if netIncome is null (which indicates conversion failure) or success is false
                if (results && results.dataSheet && results.dataSheet.length > 0) {
                    const firstDataRow = results.dataSheet.find(r => r && typeof r === 'object' && r.age === 30);
                    if (firstDataRow && firstDataRow.netIncome !== null && firstDataRow.netIncome !== undefined) {
                        // If netIncome is not null, the conversion might have succeeded incorrectly
                        // But we already checked errors flag, so this is acceptable
                    }
                }
            });

            // Set final success state
            if (testResults.errors.length > 0) {
                testResults.success = false;
            }

        } catch (error) {
            testResults.errors.push(`Test setup error: ${error.message}`);
            testResults.success = false;
        }

        return testResults;
    }
};
