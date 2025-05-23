// test/schemaEvaluator.test.js

const SchemaEvaluator = require('../src/core/tax/SchemaEvaluator');

describe('SchemaEvaluator', () => {
    let mockTaxmanInstance;
    let evaluator;

    beforeEach(() => {
        // Create a fresh mock for each test to avoid state leakage
        mockTaxmanInstance = {
            currentState: {
                year: 2024,
                age: 40,
                filingStatus: 'single',
                dependents: [],
                residencyStatus: 'resident',
                // Add other relevant currentState properties as needed by tests
                someStateValue: 100,
            },
            calculated: {
                // Add calculated values used as basis or context
                grossIncome: 80000,
                adjustedGrossIncome: 75000,
                taxableIncome: 60000,
                someCalculatedValue: 50,
            },
            incomeSources: {
                employment: { gross: 80000 },
                investmentIncomeTotal: 1000,
                pensionIncomeTotal: 500,
            },
            dependents: [
                { type: 'child', age: 10 },
                { type: 'child', age: 5 },
                { type: 'other', age: 70 },
            ],
            taxConfig: {
                // Add relevant parts of tax config as needed
                incomeTax: {
                    filingStatusRules: {
                        single: {
                            taxCalculationMethod: {
                                type: 'brackets',
                                brackets: [
                                    { lowerBound: 0, upperBound: 10000, rate: 0.10 },
                                    { lowerBound: 10000, upperBound: 50000, rate: 0.20 },
                                    { lowerBound: 50000, rate: 0.30 }, // No upper bound
                                ],
                            },
                        },
                    },
                },
            },
            // Mock properties directly accessed by evaluator
            age: 40,
            filingStatus: 'single',
            residencyStatus: 'resident',
            isCouple: false, // Assuming single filer for default tests
            // Mock utilities
            utils: {
                evaluateFormula: jest.fn((formula, context) => {
                    // Basic mock: return a fixed value or based on formula string for testing
                    if (formula === 'context.value * 2') return context.value * 2;
                    if (formula === 'currentState.someStateValue + 10') return mockTaxmanInstance.currentState.someStateValue + 10;
                    return 999; // Default mock value
                }),
                executeCustomRule: jest.fn((identifier, context) => {
                    // Basic mock: return based on identifier
                    if (identifier === 'customConditionTrue') return true;
                    if (identifier === 'customConditionFalse') return false;
                    if (identifier === 'customValue123') return 123;
                    return null; // Default mock value
                }),
            },
            // Add getBasisValue and countDependents directly for simplicity in mocking,
            // or let the evaluator call its own methods which use the mockTaxmanInstance state.
            // Let's rely on the evaluator's methods for now.
        };

        evaluator = new SchemaEvaluator(mockTaxmanInstance);
    });

    // --- evaluateCondition Tests ---
    describe('evaluateCondition', () => {
        test('should return true for == operator when values match', () => {
            const rule = { conditionType: 'age', operator: '==', value: 40 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
        });

        test('should return false for == operator when values dont match', () => {
            const rule = { conditionType: 'age', operator: '==', value: 50 };
            expect(evaluator.evaluateCondition(rule)).toBe(false);
        });

        test('should handle > operator correctly', () => {
            const rule = { conditionType: 'age', operator: '>', value: 30 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'age', operator: '>', value: 40 };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should handle >= operator correctly', () => {
            const rule = { conditionType: 'age', operator: '>=', value: 40 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'age', operator: '>=', value: 41 };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

         test('should handle < operator correctly', () => {
            const rule = { conditionType: 'age', operator: '<', value: 50 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'age', operator: '<', value: 40 };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should handle <= operator correctly', () => {
            const rule = { conditionType: 'age', operator: '<=', value: 40 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'age', operator: '<=', value: 39 };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should handle != operator correctly', () => {
            const rule = { conditionType: 'filingStatus', operator: '!=', value: 'married' };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'filingStatus', operator: '!=', value: 'single' };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should handle "in" operator correctly', () => {
            const rule = { conditionType: 'filingStatus', operator: 'in', value: ['single', 'widow'] };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'filingStatus', operator: 'in', value: ['married', 'divorced'] };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should handle "notIn" operator correctly', () => {
            const rule = { conditionType: 'filingStatus', operator: 'notIn', value: ['married', 'divorced'] };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
            const rule2 = { conditionType: 'filingStatus', operator: 'notIn', value: ['single', 'widow'] };
            expect(evaluator.evaluateCondition(rule2)).toBe(false);
        });

        test('should use context value if provided', () => {
            const rule = { conditionType: 'income', operator: '>', value: 50000 };
            const context = { income: 60000 }; // Specific context overrides calculated.adjustedGrossIncome
            expect(evaluator.evaluateCondition(rule, context)).toBe(true);
        });

         test('should use calculated value if context value not provided', () => {
            const rule = { conditionType: 'adjustedGrossIncome', operator: '>', value: 70000 };
            expect(evaluator.evaluateCondition(rule)).toBe(true); // Uses calculated.adjustedGrossIncome = 75000
        });

        test('should use currentState value if context/calculated not provided', () => {
            const rule = { conditionType: 'someStateValue', operator: '==', value: 100 };
            expect(evaluator.evaluateCondition(rule)).toBe(true); // Uses currentState.someStateValue = 100
        });

        test('should calculate familySize correctly', () => {
            mockTaxmanInstance.isCouple = true;
            mockTaxmanInstance.dependents = [{ age: 5 }]; // 1 dependent
            // familySize = 1 (self) + 1 (spouse) + 1 (dependent) = 3
            const rule = { conditionType: 'familySize', operator: '==', value: 3 };
            expect(evaluator.evaluateCondition(rule)).toBe(true);
        });

        test('should handle custom condition type via executeCustomRule', () => {
            const rule = { conditionType: 'custom', customRuleIdentifier: 'customConditionTrue', operator: '==', value: true }; // Operator/value ignored for custom
            const context = { someData: 'abc' };
            expect(evaluator.evaluateCondition(rule, context)).toBe(true);
            expect(mockTaxmanInstance.utils.executeCustomRule).toHaveBeenCalledWith('customConditionTrue', expect.objectContaining({
                ...mockTaxmanInstance.currentState,
                ...mockTaxmanInstance.calculated,
                ...context,
                expectedType: 'boolean'
             }));

            const ruleFalse = { conditionType: 'custom', customRuleIdentifier: 'customConditionFalse', operator: '==', value: true };
            expect(evaluator.evaluateCondition(ruleFalse, context)).toBe(false);
            expect(mockTaxmanInstance.utils.executeCustomRule).toHaveBeenCalledWith('customConditionFalse', expect.any(Object));
        });

        test('should return false for unknown conditionType', () => {
            const rule = { conditionType: 'nonExistentProperty', operator: '==', value: 10 };
            expect(evaluator.evaluateCondition(rule)).toBe(false);
        });

         test('should return false for unknown operator', () => {
            const rule = { conditionType: 'age', operator: 'approx', value: 40 };
            expect(evaluator.evaluateCondition(rule)).toBe(false);
        });

        test('should default to true if rule is invalid (e.g., missing operator)', () => {
            // This behavior might be risky, but testing current implementation
            const rule = { conditionType: 'age', value: 40 }; // Missing operator
             expect(evaluator.evaluateCondition(rule)).toBe(true);
        });
    });

    // --- calculateValue Tests ---
    describe('calculateValue', () => {
        test('should return fixedAmount', () => {
            const rule = { method: 'fixedAmount', value: 500 };
            expect(evaluator.calculateValue(rule)).toBe(500);
        });

        test('should calculate percentage based on basis', () => {
            const rule = { method: 'percentage', basis: 'grossIncome', value: 0.1 }; // 10% of grossIncome (80000)
            expect(evaluator.calculateValue(rule)).toBe(8000);
        });

         test('should calculate percentage based on context value if provided', () => {
            const rule = { method: 'percentage', basis: 'someValue', value: 0.5 };
            const context = { someValue: 1000 };
            expect(evaluator.calculateValue(rule, context)).toBe(500);
        });

        test('should calculate perDependent amount', () => {
            const rule = { method: 'perDependent', amountPerDependent: 1000 };
            // Expect 3 dependents based on beforeEach setup
            expect(evaluator.calculateValue(rule)).toBe(3000);
        });

        test('should calculate perDependent amount with filter', () => {
            const rule = { method: 'perDependent', amountPerDependent: 1500, dependentTypeFilter: { type: 'child', maxAge: 12 } };
            // Expect 2 matching dependents (age 10, age 5)
            expect(evaluator.calculateValue(rule)).toBe(3000);
        });

        test('should call evaluateFormula for formula method', () => {
            const rule = { method: 'formula', formula: 'currentState.someStateValue + 10' };
            const context = { extra: 5 };
            expect(evaluator.calculateValue(rule, context)).toBe(110); // 100 + 10 from mock
            expect(mockTaxmanInstance.utils.evaluateFormula).toHaveBeenCalledWith('currentState.someStateValue + 10', expect.objectContaining({
                 ...mockTaxmanInstance.currentState,
                 ...mockTaxmanInstance.calculated,
                 ...context
            }));
        });

        test('should perform lookup using basis', () => {
             const rule = {
                 method: 'lookup',
                 basis: 'filingStatus',
                 lookupTable: [
                     { key: 'single', value: 100 },
                     { key: 'married', value: 200 }
                 ]
             };
             expect(evaluator.calculateValue(rule)).toBe(100);
         });

         test('should perform lookup using context lookupKey', () => {
             const rule = {
                 method: 'lookup',
                 basis: 'filingStatus', // Ignored if lookupKey present
                 lookupTable: [
                     { key: 'A', value: 50 },
                     { key: 'B', value: 60 }
                 ]
             };
             const context = { lookupKey: 'B' };
             expect(evaluator.calculateValue(rule, context)).toBe(60);
         });

         test('should return 0 for failed lookup', () => {
             const rule = {
                 method: 'lookup',
                 basis: 'residencyStatus', // 'resident'
                 lookupTable: [
                     { key: 'non-resident', value: 1000 }
                 ]
             };
             expect(evaluator.calculateValue(rule)).toBe(0);
         });

        test('should call executeCustomRule for custom method', () => {
            const rule = { method: 'custom', customRuleIdentifier: 'customValue123' };
            const context = { data: 1 };
            expect(evaluator.calculateValue(rule, context)).toBe(123);
            expect(mockTaxmanInstance.utils.executeCustomRule).toHaveBeenCalledWith('customValue123', expect.objectContaining({
                 ...mockTaxmanInstance.currentState,
                 ...mockTaxmanInstance.calculated,
                 ...context
            }));
        });

        test('should apply maxValue', () => {
            const rule = { method: 'fixedAmount', value: 500, maxValue: 400 };
            expect(evaluator.calculateValue(rule)).toBe(400);
        });

        test('should apply minValue', () => {
            const rule = { method: 'fixedAmount', value: 500, minValue: 600 };
            expect(evaluator.calculateValue(rule)).toBe(600);
        });

        test('should apply both minValue and maxValue (maxValue wins)', () => {
            const rule = { method: 'fixedAmount', value: 500, minValue: 400, maxValue: 450 };
            expect(evaluator.calculateValue(rule)).toBe(450);
        });

         test('should apply both minValue and maxValue (minValue wins)', () => {
            const rule = { method: 'fixedAmount', value: 300, minValue: 400, maxValue: 450 };
            expect(evaluator.calculateValue(rule)).toBe(400);
        });

        test('should return 0 for unknown method', () => {
            const rule = { method: 'unknownMethod', value: 100 };
            expect(evaluator.calculateValue(rule)).toBe(0);
        });

        test('should return 0 for invalid rule', () => {
            const rule = { value: 100 }; // Missing method
            expect(evaluator.calculateValue(rule)).toBe(0);
        });
    });

    test('should call calculateBracketTax for brackets method', () => {
        // Define some mock brackets for the rule, even though in reality
        // calculateValue might fetch them differently based on context.
        // This test verifies calculateValue passes the basis and calls calculateBracketTax.
        const mockBrackets = [ { lowerBound: 0, rate: 0.1 } ];
        const rule = {
            method: 'brackets',
            basis: 'taxableIncome',
            brackets: mockBrackets // Provide brackets directly on the rule for this test
            // We need to mock calculateBracketTax to isolate calculateValue's role.
        };
        const context = { someContext: 1 };
        const expectedTaxableAmount = 60000; // From mockTaxmanInstance.calculated.taxableIncome

        // Mock the specialized bracket calculation method
        jest.spyOn(evaluator, 'calculateBracketTax').mockReturnValue(12345); // Return a dummy value

        const result = evaluator.calculateValue(rule, context);

        expect(result).toBe(12345); // Should return the result from the mocked calculateBracketTax
        expect(evaluator.calculateBracketTax).toHaveBeenCalledTimes(1);
        // Verify calculateBracketTax was called with the correct taxable amount derived from the basis
        // Note: calculateBracketTax internally fetches brackets based on filing status etc.,
        // so we primarily test that calculateValue correctly determines the *amount* to tax.
        expect(evaluator.calculateBracketTax).toHaveBeenCalledWith(
            mockBrackets, // Expect the brackets passed directly in the rule for this method
            expectedTaxableAmount
        );

         // Restore the original method
         jest.restoreAllMocks();
    });

    // --- applyPhaseOut Tests ---
    describe('applyPhaseOut', () => {
        const baseAmount = 10000;
        const phaseOutRule = {
            basedOn: 'adjustedGrossIncome', // 75000 in mock
            threshold: 70000,
            taperRate: 0.5, // Reduce benefit by 0.5 for every 1 over threshold
            floor: 1000,
            description: "Test Benefit"
        };

        test('should not reduce amount if basis is below threshold', () => {
            const rule = { ...phaseOutRule, threshold: 80000 };
            expect(evaluator.applyPhaseOut(baseAmount, rule)).toBe(baseAmount);
        });

        test('should reduce amount correctly based on taper rate', () => {
            // Define rule components explicitly for mocking
            const thresholdRule = { method: 'fixedAmount', value: 70000 };
            const taperRateRule = { method: 'fixedAmount', value: 0.5 };
            const testPhaseOutRule = {
                basedOn: 'adjustedGrossIncome',
                thresholdRule: thresholdRule,
                taperRateRule: taperRateRule,
                description: "Test Benefit"
                // No floorRule for this test
            };

            // Ensure mockTaxmanInstance state is correct for the test
            mockTaxmanInstance.calculated.adjustedGrossIncome = 75000;
            // No need to mock evaluator.calculateValue or evaluator.getBasisValue here,
            // as applyPhaseOut calls them internally using the mockTaxmanInstance state.

            // Basis (75000) is 5000 over threshold (70000)
            // Reduction = 5000 * 0.5 = 2500
            // Phased Amount = 10000 - 2500 = 7500
            expect(evaluator.applyPhaseOut(baseAmount, testPhaseOutRule)).toBe(7500);
            // Remove assertions checking internal mock calls
        });

        test('should apply floor if reduction goes below floor', () => {
            // Define rule components explicitly
            const thresholdRule = { method: 'fixedAmount', value: 70000 };
            const taperRateRule = { method: 'fixedAmount', value: 2 }; // High taper
            const floorRule = { method: 'fixedAmount', value: 1000 };
            const testPhaseOutRule = {
                basedOn: 'adjustedGrossIncome',
                thresholdRule: thresholdRule,
                taperRateRule: taperRateRule,
                floorRule: floorRule, // Include floor rule
                description: "Test Benefit Floor"
            };

             // Ensure mockTaxmanInstance state is correct for the test
             mockTaxmanInstance.calculated.adjustedGrossIncome = 75000;
             // No need for specific mocks here, rely on beforeEach setup and internal calls

            // Basis (75000) is 5000 over threshold (70000)
            // Reduction = 5000 * 2 = 10000
            // Phased Amount = 10000 - 10000 = 0
            // Since 0 < floor (1000), result should be 1000
            expect(evaluator.applyPhaseOut(baseAmount, testPhaseOutRule)).toBe(1000);
             // Remove assertions checking internal mock calls
        });

        test('should use default floor of 0 if not specified', () => {
            // Define rule components explicitly
            const thresholdRule = { method: 'fixedAmount', value: 70000 };
            const taperRateRule = { method: 'fixedAmount', value: 2 }; // High taper
            const testPhaseOutRule = {
                basedOn: 'adjustedGrossIncome',
                thresholdRule: thresholdRule,
                taperRateRule: taperRateRule
                // No floorRule defined
            };

             // Ensure mockTaxmanInstance state is correct for the test
             mockTaxmanInstance.calculated.adjustedGrossIncome = 75000;
             // No need for specific mocks here

             // Phased Amount = 10000 - 10000 = 0. Default floor is 0.
             expect(evaluator.applyPhaseOut(baseAmount, testPhaseOutRule)).toBe(0);
              // Remove assertions checking internal mock calls
        });

        test('should return baseAmount if phase-out rule is invalid', () => {
            const invalidRule = { basedOn: 'adjustedGrossIncome' }; // Missing threshold/rate
            expect(evaluator.applyPhaseOut(baseAmount, invalidRule)).toBe(baseAmount);
        });
    });

    // --- calculateBracketTax Tests ---
    describe('calculateBracketTax', () => {
        const brackets = [
            { lowerBound: 0, upperBound: 10000, rate: 0.10 },
            { lowerBound: 10000, upperBound: 40000, rate: 0.20 },
            { lowerBound: 40000, rate: 0.30 }, // No upper bound
        ];

        test('should return 0 for zero taxable amount', () => {
            expect(evaluator.calculateBracketTax(brackets, 0)).toBe(0);
        });

        test('should calculate tax correctly within the first bracket', () => {
            // 8000 * 0.10 = 800
            expect(evaluator.calculateBracketTax(brackets, 8000)).toBe(800);
        });

        test('should calculate tax correctly spanning two brackets', () => {
            // First 10000 @ 10% = 1000
            // Next 5000 (15000 - 10000) @ 20% = 1000
            // Total = 1000 + 1000 = 2000
            expect(evaluator.calculateBracketTax(brackets, 15000)).toBe(2000);
        });

        test('should calculate tax correctly spanning all brackets', () => {
            // First 10000 @ 10% = 1000
            // Next 30000 (40000 - 10000) @ 20% = 6000
            // Next 10000 (50000 - 40000) @ 30% = 3000
            // Total = 1000 + 6000 + 3000 = 10000
            expect(evaluator.calculateBracketTax(brackets, 50000)).toBe(10000);
        });

         test('should calculate tax correctly for amount exactly at a boundary', () => {
            // First 10000 @ 10% = 1000
            // Total = 1000
            expect(evaluator.calculateBracketTax(brackets, 10000)).toBe(1000);
         });

        test('should handle unsorted brackets', () => {
             const unsortedBrackets = [
                 { lowerBound: 10000, upperBound: 40000, rate: 0.20 },
                 { lowerBound: 40000, rate: 0.30 },
                 { lowerBound: 0, upperBound: 10000, rate: 0.10 },
             ];
             // Same calculation as spanning all brackets test
             expect(evaluator.calculateBracketTax(unsortedBrackets, 50000)).toBe(10000);
         });

        test('should return 0 for empty or invalid brackets array', () => {
            expect(evaluator.calculateBracketTax([], 50000)).toBe(0);
            expect(evaluator.calculateBracketTax(null, 50000)).toBe(0);
            expect(evaluator.calculateBracketTax({}, 50000)).toBe(0); // Invalid type
        });
    });

    // --- getBasisValue Tests ---
    describe('getBasisValue', () => {
        test('should prioritize specific context', () => {
            const context = { grossIncome: 99999 }; // Override calculated.grossIncome
            expect(evaluator.getBasisValue('grossIncome', context)).toBe(99999);
        });

        test('should use calculated value if not in specific context', () => {
            expect(evaluator.getBasisValue('adjustedGrossIncome')).toBe(75000);
        });

        test('should use currentState value if not in context/calculated', () => {
            expect(evaluator.getBasisValue('someStateValue')).toBe(100);
        });

        test('should use incomeSources value if not elsewhere', () => {
             // Assuming 'employment' itself isn't in context/calculated/currentState
             // It should find incomeSources.employment.gross
             expect(evaluator.getBasisValue('employment.gross')).toBe(80000);
        });

         test('should handle specific income source totals', () => {
             expect(evaluator.getBasisValue('investmentIncomeTotal')).toBe(1000);
             expect(evaluator.getBasisValue('pensionIncomeTotal')).toBe(500);
         });

        test('should handle dot notation for nested properties (starting from taxman)', () => {
            // Accessing mockTaxmanInstance.currentState.someStateValue via dot notation
            expect(evaluator.getBasisValue('currentState.someStateValue')).toBe(100);
        });

        test('should return 0 for unknown basis', () => {
            expect(evaluator.getBasisValue('nonExistentBasis')).toBe(0);
        });

        test('should return 0 for null/undefined basis string', () => {
            expect(evaluator.getBasisValue(null)).toBe(0);
            expect(evaluator.getBasisValue(undefined)).toBe(0);
        });
    });

    // --- countDependents Tests ---
    describe('countDependents', () => {
        test('should return 0 if dependents array is missing or empty', () => {
            mockTaxmanInstance.dependents = undefined;
            expect(evaluator.countDependents()).toBe(0);
            mockTaxmanInstance.dependents = [];
            expect(evaluator.countDependents()).toBe(0);
        });

        test('should return total count if no filter provided', () => {
            // Uses the 3 dependents from beforeEach
            expect(evaluator.countDependents()).toBe(3);
        });

        test('should filter by type', () => {
            expect(evaluator.countDependents({ type: 'child' })).toBe(2);
            expect(evaluator.countDependents({ type: 'other' })).toBe(1);
            expect(evaluator.countDependents({ type: 'spouse' })).toBe(0);
        });

        test('should filter by maxAge', () => {
            expect(evaluator.countDependents({ maxAge: 18 })).toBe(2); // Child 10, Child 5
            expect(evaluator.countDependents({ maxAge: 8 })).toBe(1);  // Child 5
        });

        test('should filter by minAge', () => {
            expect(evaluator.countDependents({ minAge: 8 })).toBe(2); // Child 10, Other 70
            expect(evaluator.countDependents({ minAge: 20 })).toBe(1); // Other 70
        });

        test('should combine filters', () => {
            expect(evaluator.countDependents({ type: 'child', minAge: 8 })).toBe(1); // Child 10
            expect(evaluator.countDependents({ type: 'child', maxAge: 8 })).toBe(1); // Child 5
        });
    });

    // --- getMarginalIncomeRate Tests ---
    describe('getMarginalIncomeRate', () => {
        test('should return correct rate for income in first bracket', () => {
            expect(evaluator.getMarginalIncomeRate(5000)).toBe(0.10);
        });

        test('should return correct rate for income in second bracket', () => {
            expect(evaluator.getMarginalIncomeRate(25000)).toBe(0.20);
        });

        test('should return correct rate for income in top bracket (no upper bound)', () => {
            expect(evaluator.getMarginalIncomeRate(100000)).toBe(0.30);
        });

        test('should return correct rate for income exactly at bracket boundary (uses rate of bracket entered)', () => {
             expect(evaluator.getMarginalIncomeRate(10000)).toBe(0.20); // Enters the 20% bracket
             expect(evaluator.getMarginalIncomeRate(50000)).toBe(0.30); // Enters the 30% bracket
        });

        test('should use calculated taxableIncome if no incomeLevel provided', () => {
            // mockTaxmanInstance.calculated.taxableIncome = 60000
            expect(evaluator.getMarginalIncomeRate()).toBe(0.30);
        });

        test('should return 0 if brackets are missing or invalid', () => {
            mockTaxmanInstance.taxConfig.incomeTax.filingStatusRules.single.taxCalculationMethod = {};
            expect(evaluator.getMarginalIncomeRate(50000)).toBe(0);
        });

         test('should return 0 if filing status rule is missing', () => {
            delete mockTaxmanInstance.taxConfig.incomeTax.filingStatusRules.single;
            expect(evaluator.getMarginalIncomeRate(50000)).toBe(0);
        });
    });

});