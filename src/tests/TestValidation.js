// Test suite for UI validation logic, particularly for Person 2
// Enhanced with comprehensive UI input validation tests for Person 1 and Person 2 parameters.

// Test suite for UI input validation, especially for Person 1 and Person 2 parameters.

console.log('Loading TestValidation.js');

// UIManager will be loaded from the global scope in the test runner environment.
// If UIManager is not available globally, this test file will need adjustment
// on how UIManager is imported or accessed.

function runValidationTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestValidation tests.');
        return;
    }

    const { describe, it, beforeEach, afterEach, assert } = testFramework;

    describe('UI Input Validation Tests (UIManager.readParameters)', () => {

        let mockUi;
        let getValueStore;      // To simulate input field values: { fieldId: stringValueFromInput }
        let setWarningSpy;      // To check if warning messages are set: { fieldId: message }
        let clearAllErrorsSpy;  // To check if clearAllErrors was called
        let uiManagerInstance;  // Instance of UIManager

        // Helper to simulate UIManager's dependency: AbstractUI / WebUI
        const p1ParameterFields = ['StartingAge', 'TargetAge', 'InitialSavings', 'InitialPension', 'InitialFunds', 'InitialShares', 'RetirementAge', 'EmergencyStash', 'PensionContributionPercentage', 'PensionContributionCapped', 'StatePensionWeekly', 'PensionGrowthRate', 'PensionGrowthStdDev', 'FundsGrowthRate', 'FundsGrowthStdDev', 'SharesGrowthRate', 'SharesGrowthStdDev', 'Inflation', 'FundsAllocation', 'SharesAllocation', 'PriorityCash', 'PriorityPension', 'PriorityFunds', 'PriorityShares', 'MarriageYear', 'YoungestChildBorn', 'OldestChildBorn', 'PersonalTaxCredit'];
        const p2ParameterFields = ['P2StartingAge', 'P2RetirementAge', 'P2StatePensionWeekly', 'InitialPensionP2', 'PensionContributionPercentageP2'];
        const allKnownParams = [...p1ParameterFields, ...p2ParameterFields];


        beforeEach(() => {
            getValueStore = {};
            setWarningSpy = {};
            clearAllErrorsSpy = false;

            mockUi = {
                getValue: (fieldId) => getValueStore[fieldId] !== undefined ? getValueStore[fieldId] : '', // Simulate DOMUtils returning '' for empty, not 0
                setValue: (fieldId, value) => getValueStore[fieldId] = value,
                setWarning: (fieldId, message) => {
                    setWarningSpy[fieldId] = message;
                },
                clearAllErrors: () => {
                    setWarningSpy = {}; // Clears the spy object
                    clearAllErrorsSpy = true;
                },
                // Add dummy implementations for other AbstractUI methods UIManager might call if any
                // For now, assume only these are critical for readParameters/validateParameters path
                isPercentage: (id) => id.includes('Percentage') || id.includes('Allocation') || id.includes('Rate') || id.includes('StdDev') || id.includes('Inflation'),
                isBoolean: (id) => id.includes('Capped'),
                getTableData: () => [], // For readEvents, not directly tested here but UIManager constructor might expect it.
                setStatus: () => {},
                updateUIForSimMode: () => {},
                triggerLoadEvents: () => {},
                updateEventListeners: () => {},
                updateLabels: () => {},
                updatePrioritiesDisplay: () => {},
                updatePerson2FieldsState: () => {},
                showOldScenarioWarning: () => {},
                displayWarning: () => {},
                clearElementWarning: () => {},
                getRawValue: (fieldId) => getValueStore[fieldId] || '',

            };

            // Initialize all known params to empty string in store to mimic fresh UI state
            allKnownParams.forEach(key => getValueStore[key] = '');

            // UIManager is expected to be a global constructor from UIManager.js
            if (typeof UIManager === 'undefined') {
                throw new Error("UIManager class is not loaded/available in the test environment.");
            }
            uiManagerInstance = new UIManager(mockUi);
            console.log("TestValidation: beforeEach completed.");
        });

        afterEach(() => {
            console.log("TestValidation: afterEach completed.");
        });

        function callReadParameters() {
            // readParameters(true) calls validateParameters internally
            return uiManagerInstance.readParameters(true);
        }

        describe('Person 1 Validation Rules', () => {
            it('should require P1 RetirementAge if P1 StartingAge is provided and RetirementAge is blank', () => {
                getValueStore['StartingAge'] = '30';
                getValueStore['RetirementAge'] = ''; // Blank, so param becomes 0
                callReadParameters();
                assert(clearAllErrorsSpy === true, 'clearAllErrors should have been called');
                assert(setWarningSpy['RetirementAge'] !== undefined, 'Warning should be set for P1 RetirementAge');
                assert(setWarningSpy['StartingAge'] === undefined, 'No warning for P1 StartingAge');
            });

            it('should require P1 StartingAge if P1 RetirementAge is provided and StartingAge is blank', () => {
                getValueStore['StartingAge'] = ''; // Blank, so param becomes 0
                getValueStore['RetirementAge'] = '65';
                callReadParameters();
                assert(setWarningSpy['StartingAge'] !== undefined, 'Warning should be set for P1 StartingAge');
                assert(setWarningSpy['RetirementAge'] === undefined, 'No warning for P1 RetirementAge');
            });

            it('should be valid if P1 StartingAge and P1 RetirementAge are both provided', () => {
                getValueStore['StartingAge'] = '30';
                getValueStore['RetirementAge'] = '65';
                callReadParameters();
                assert(Object.keys(setWarningSpy).length === 0, 'No warnings should be set for P1 if both ages provided. Got: ' + JSON.stringify(setWarningSpy));
            });

            it('should be valid if P1 StartingAge and P1 RetirementAge are both blank (optional group)', () => {
                getValueStore['StartingAge'] = '';
                getValueStore['RetirementAge'] = '';
                callReadParameters();
                assert(Object.keys(setWarningSpy).length === 0, 'No warnings should be set for P1 if both ages blank. Got: ' + JSON.stringify(setWarningSpy));
            });
        });

        describe('Person 2 Validation Rules', () => {
            const p2TriggerFields = ['P2StatePensionWeekly', 'InitialPensionP2', 'PensionContributionPercentageP2'];
            // P2StartingAge and P2RetirementAge are the dependent fields.

            p2TriggerFields.forEach(triggerField => {
                it(`should require P2StartingAge and P2RetirementAge if ${triggerField} is provided and ages are blank`, () => {
                    getValueStore[triggerField] = '100'; // Provide a value for the trigger field
                    getValueStore['P2StartingAge'] = '';    // Blank, so param becomes 0
                    getValueStore['P2RetirementAge'] = '';   // Blank, so param becomes 0
                    callReadParameters();
                    assert(clearAllErrorsSpy === true, 'clearAllErrors should have been called');
                    assert(setWarningSpy['P2StartingAge'] !== undefined, `Warning for P2StartingAge with ${triggerField} provided`);
                    assert(setWarningSpy['P2RetirementAge'] !== undefined, `Warning for P2RetirementAge with ${triggerField} provided`);
                });

                it(`should require P2RetirementAge if ${triggerField} and P2StartingAge are provided but P2RetirementAge is blank`, () => {
                    getValueStore[triggerField] = '100';
                    getValueStore['P2StartingAge'] = '30';
                    getValueStore['P2RetirementAge'] = '';
                    callReadParameters();
                    assert(setWarningSpy['P2RetirementAge'] !== undefined, `Warning for P2RetirementAge with ${triggerField} and P2StartingAge`);
                    assert(setWarningSpy['P2StartingAge'] === undefined, `No warning for P2StartingAge`);
                });

                it(`should require P2StartingAge if ${triggerField} and P2RetirementAge are provided but P2StartingAge is blank`, () => {
                    getValueStore[triggerField] = '100';
                    getValueStore['P2StartingAge'] = '';
                    getValueStore['P2RetirementAge'] = '60';
                    callReadParameters();
                    assert(setWarningSpy['P2StartingAge'] !== undefined, `Warning for P2StartingAge with ${triggerField} and P2RetirementAge`);
                    assert(setWarningSpy['P2RetirementAge'] === undefined, `No warning for P2RetirementAge`);
                });
            });

            it('should require P2StartingAge and P2RetirementAge if P2StartingAge itself is provided but P2RetirementAge is blank', () => {
                getValueStore['P2StartingAge'] = '30';
                getValueStore['P2RetirementAge'] = '';
                callReadParameters();
                assert(setWarningSpy['P2StartingAge'] === undefined, 'No warning for P2StartingAge as it is provided');
                assert(setWarningSpy['P2RetirementAge'] !== undefined, 'Warning for P2RetirementAge');
            });

            it('should require P2StartingAge and P2RetirementAge if P2RetirementAge itself is provided but P2StartingAge is blank', () => {
                getValueStore['P2StartingAge'] = '';
                getValueStore['P2RetirementAge'] = '60';
                callReadParameters();
                assert(setWarningSpy['P2StartingAge'] !== undefined, 'Warning for P2StartingAge');
                assert(setWarningSpy['P2RetirementAge'] === undefined, 'No warning for P2RetirementAge as it is provided');
            });

            it('should be valid if all P2 fields (including ages) are blank', () => {
                // All p2 fields are already blank from beforeEach
                callReadParameters();
                assert(Object.keys(setWarningSpy).length === 0, 'No warnings if all P2 fields are blank. Got: ' + JSON.stringify(setWarningSpy));
            });

            it('should be valid if P2StartingAge, P2RetirementAge, and other P2 fields are present', () => {
                getValueStore['P2StartingAge'] = '30';
                getValueStore['P2RetirementAge'] = '60';
                getValueStore['P2StatePensionWeekly'] = '100';
                getValueStore['InitialPensionP2'] = '5000';
                getValueStore['PensionContributionPercentageP2'] = '0.1';
                callReadParameters();
                assert(Object.keys(setWarningSpy).length === 0, 'No warnings if all required P2 fields provided. Got: ' + JSON.stringify(setWarningSpy));
            });

            it('should be valid if only P2StartingAge and P2RetirementAge are provided (other P2 fields blank)', () => {
                getValueStore['P2StartingAge'] = '30';
                getValueStore['P2RetirementAge'] = '60';
                // Other P2 fields remain blank
                callReadParameters();
                assert(Object.keys(setWarningSpy).length === 0, 'No warnings if only P2 ages are provided. Got: ' + JSON.stringify(setWarningSpy));
            });
        });

    });
}

if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('Validation', runValidationTests);
} else {
    console.log('TestValidation.js loaded - TestFramework not detected for registration.');
    // To run standalone (basic example, actual UIManager and its deps would need to be loaded):
    // if (typeof runValidationTests === 'function' && typeof UIManager !== 'undefined') {
    //     const mockFramework = { describe: console.log, it: (s, f) => { console.log(s); f(); }, beforeEach: (f)=>f(), afterEach: (f)=>f(), assert: console.assert };
    //     runValidationTests(mockFramework);
    // }
}

// Mocking UI elements and functions for testing purposes
// In a real environment, this might interact with actual UI components or a UI testing framework.
const mockUI = {
    params: {},
    errors: [],

    // Mock getParameters to simulate reading from UI fields
    getParameters: function() {
        // This would normally read from document.getElementById().value
        return this.params;
    },

    // Mock showError to simulate displaying an error message
    showError: function(fieldId, message) {
        this.errors.push({ fieldId, message });
        console.log(`Validation Error: Field '${fieldId}' - ${message}`);
    },

    // Utility to set mock parameters for a test
    setMockParams: function(params) {
        this.params = params;
        this.errors = []; // Clear previous errors
    },

    // --- This is where the actual validation logic from WebUI.js would be duplicated or imported ---
    // For now, we'll placeholder the validation logic that would be tested.
    // Example: validatePerson1Data(params) from WebUI.js
    // Example: validatePerson2Data(params) from WebUI.js
};

function runTests() {
    console.log('Running tests for TestValidation.js...');

    // --- Person 1 Validation Tests (examples) ---
    // TODO: Implement test_p1Validation_missingStartingAge_showsError()
    // mockUI.setMockParams({ retirementAge: 65 }); // Missing startingAge
    // WebUI.prototype.validateParameters.call(mockUI); // Assuming validation logic is in WebUI
    // assert(mockUI.errors.some(e => e.fieldId === 'StartingAgeInputId')); // Example assertion

    // TODO: Implement test_p1Validation_missingRetirementAge_showsError()

    // TODO: Implement test_p1Validation_completeData_noError()

    // --- Person 2 Validation Tests ---
    // Placeholder: Test P2 validation - P2StartingAge provided, P2RetirementAge missing
    // TODO: Implement test_p2Validation_P2StartingAgeProvided_P2RetirementAgeMissing_showsError()
    // mockUI.setMockParams({ P2StartingAge: 30 });
    // WebUI.prototype.validateParameters.call(mockUI);
    // assert(mockUI.errors.some(e => e.fieldId === 'P2RetirementAgeInputId'));

    // Placeholder: Test P2 validation - P2RetirementAge provided, P2StartingAge missing
    // TODO: Implement test_p2Validation_P2RetirementAgeProvided_P2StartingAgeMissing_showsError()

    // Placeholder: Test P2 validation - Some P2 field (e.g., P2StatePensionWeekly) provided, but P2StartingAge and P2RetirementAge missing
    // TODO: Implement test_p2Validation_P2FieldProvided_AgesMissing_showsError()
    // mockUI.setMockParams({ P2StatePensionWeekly: 100 });
    // WebUI.prototype.validateParameters.call(mockUI);
    // assert(mockUI.errors.some(e => e.fieldId === 'P2StartingAgeInputId'));
    // assert(mockUI.errors.some(e => e.fieldId === 'P2RetirementAgeInputId'));

    // Placeholder: Test P2 validation - All required P2 fields (P2StartingAge, P2RetirementAge) provided when another P2 field is present
    // TODO: Implement test_p2Validation_P2FieldAndAgesProvided_noError()
    // mockUI.setMockParams({ P2StartingAge: 30, P2RetirementAge: 60, P2InitialPensionP2: 5000 });
    // WebUI.prototype.validateParameters.call(mockUI);
    // assert(mockUI.errors.length === 0);

    // Placeholder: Test P2 validation - No P2 fields provided, no P2 errors
    // TODO: Implement test_p2Validation_NoP2Fields_noP2Error()
    // mockUI.setMockParams({ startingAge: 30, retirementAge: 60 }); // Only P1 data
    // WebUI.prototype.validateParameters.call(mockUI);
    // assert(!mockUI.errors.some(e => e.fieldId.startsWith('P2')));

    console.log('TestValidation tests completed (placeholders).');
}

// Example of how tests might be run
if (typeof TestFramework === 'undefined') {
    runTests();
} else {
    // TestFramework.registerTestGroup('Validation', runTests);
}

/* Validation Test
 * 
 * This test validates the two-person functionality with minimal parameters
 * to ensure that two-person scenarios work correctly.
 */

module.exports = {
  name: "Two-Person Validation Test",
  description: "Validates basic two-person simulation functionality",
  category: "validation",
  
  scenario: {
    parameters: {
      simulation_mode: 'couple',  // REQUIRED for two-person simulation
      startingAge: 30,
      targetAge: 35,
      retirementAge: 65,
      initialSavings: 0,           // Start simple
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 10000,
      pensionPercentage: 0,        // No pension for simplicity
      pensionCapped: "No",
      statePensionWeekly: 289,
      growthRatePension: 0.05,
      growthDevPension: 0.0,
      growthRateFunds: 0.07,
      growthDevFunds: 0.0,
      growthRateShares: 0.08,
      growthDevShares: 0.0,
      inflation: 0.02,
      FundsAllocation: 0,
      SharesAllocation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875,
      
      // Simple Person 2 parameters
      p2StartingAge: 32,           // Person 2 is 2 years older
      p2RetirementAge: 67,         // Person 2 retires at 67
      p2StatePensionWeekly: 289,   // Same state pension
      initialPensionP2: 0,         // No initial pension
      pensionPercentageP2: 0       // No pension contribution
    },
    
    events: [
      {
        type: 'SI',                // Person 1 salary
        id: 'p1-salary',
        amount: 40000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      },
      {
        type: 'SI2np',             // Person 2 salary (no pension contributions)
        id: 'p2-salary',
        amount: 30000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      }
    ]
  },

  assertions: [
    // Test that both people's salaries are processed correctly
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'incomeSalaries',
      expected: 70000,             // €40,000 + €30,000
      tolerance: 10
    },

    // Test that no pension fund accumulates (since rate = 0)
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'pensionFund',
      expected: 0,
      tolerance: 10
    },

    // Test simulation completes successfully
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 34
      }
    }
  ]
};
