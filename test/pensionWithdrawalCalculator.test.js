// test/pensionWithdrawalCalculator.test.js

const PensionWithdrawalCalculator = require('../src/core/tax/PensionWithdrawalCalculator');

// Mocks
const mockSchemaEvaluator = {
    calculateValue: jest.fn((rule, context) => {
        // Generalized mock
        if (!rule || !rule.method) return 0;
        const basisValue = mockSchemaEvaluator.getBasisValue(rule.basis, context); // Use mocked getBasisValue if needed
        let calculatedValue = 0;
        switch (rule.method) {
            case 'fixedAmount': calculatedValue = rule.value ?? 0; break;
            case 'percentage': calculatedValue = basisValue * (rule.value ?? 0); break;
            // Add other methods if needed for pension tests
            default: calculatedValue = rule.value ?? 0; // Fallback
        }
        return calculatedValue;
    }),
    evaluateCondition: jest.fn().mockReturnValue(true), // Default: conditions met
    getBasisValue: jest.fn((basis, context) => 0), // Mock getBasisValue if needed by rules
};
// Note: The calculator constructor expects the evaluator as the second argument.

describe('PensionWithdrawalCalculator', () => {
    let calculator;
    let mockConfig;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // More realistic mock config based on Design.md schema
        mockConfig = {
            pensionRules: {
                withdrawalTaxTreatment: [
                    {
                        planTypeRegex: "genericPension",
                        "withdrawalAge": {
                            "normalMinAgeRule": { "method": "fixedAmount", "value": 65 }, // Use CalculationRule
                            "earlyMinAgeRule": { "method": "fixedAmount", "value": 55 }   // Use CalculationRule
                         },
                        "taxationMethod": {
                            "normalWithdrawal": "asOrdinaryIncome",
                            "earlyWithdrawal": "asOrdinaryIncomePlusPenalty",
                            "lumpSum": "partialTaxFree"
                        },
                        "ratesAndPenalties": {
                            "earlyWithdrawalPenaltyRateRule": { "method": "fixedAmount", "value": 0.10 }, // Use CalculationRule
                            "lumpSumTaxFreePortionRule": { "method": "fixedAmount", "value": 0.25 } // Use CalculationRule
                        },
                        // Example condition: Maybe different rules for specific plans
                        // conditions: [{ conditionType: 'planType', operator: '==', value: 'specificPlan' }]
                    }
                    // Add more rules for different plan types if needed
                ]
            }
        };

         // Mock Taxman instance structure expected by calculator
        const mockTaxmanInstance = {
            taxConfig: mockConfig,
            // Add other properties if calculator accesses them (e.g., currentState)
            currentState: { year: 2024, age: 60 }, // Example state
        };
        calculator = new PensionWithdrawalCalculator(mockTaxmanInstance, mockSchemaEvaluator);
    });

    test('should instantiate correctly', () => {
        expect(calculator).toBeInstanceOf(PensionWithdrawalCalculator);
        expect(calculator.config).toEqual(mockConfig); // Check config was stored
        expect(calculator.evaluator).toBe(mockSchemaEvaluator); // Check evaluator was stored
        expect(calculator.withdrawals).toEqual([]);
    });

    test('reset() should clear withdrawals array', () => {
        calculator.declareWithdrawal({ withdrawalType: 'normal', amount: 5000, planType: 'genericPension' });
        expect(calculator.withdrawals.length).toBe(1);
        calculator.reset();
        expect(calculator.withdrawals.length).toBe(0);
    });

    test('declareWithdrawal() should add withdrawal details to the array', () => {
        // Use details matching schema structure (withdrawalType, planType etc.)
        const withdrawal1 = { withdrawalType: 'normal', amount: 5000, planType: 'genericPension' };
        const withdrawal2 = { withdrawalType: 'early', amount: 10000, planType: 'genericPension' };
        calculator.declareWithdrawal(withdrawal1);
        calculator.declareWithdrawal(withdrawal2);
        expect(calculator.withdrawals).toEqual([withdrawal1, withdrawal2]);
    });

    test('calculatePensionWithdrawalTax() should return zero if no withdrawals declared', () => {
        const currentState = { year: 2024 };
        const result = calculator.calculatePensionWithdrawalTax(currentState);
        expect(result.totalWithdrawalSpecificTax).toBe(0);
        expect(result.totalTaxableWithdrawalAmount).toBe(0);
        expect(result.details).toEqual([]);
        expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalled();
    });

    test('calculatePensionWithdrawalTax() should return zero if no matching rules', () => {
        calculator.declareWithdrawal({ withdrawalType: 'normal', amount: 10000, planType: 'unknownPlan' }); // Plan type doesn't match rule
        const currentState = { year: 2024, age: 60 }; // Age doesn't matter if rule doesn't match
        const result = calculator.calculatePensionWithdrawalTax(currentState);
        // Default behavior when no rule matches: treat as normal withdrawal (fully taxable, no specific tax)
        expect(result.totalWithdrawalSpecificTax).toBe(0);
        expect(result.totalTaxableWithdrawalAmount).toBe(10000);
        expect(result.details.length).toBe(1);
        expect(result.details[0].specificTax).toBe(0);
        expect(result.details[0].taxableAmount).toBe(10000);
        expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalled(); // No rule matched to calculate penalty/tax-free portion
    });

    test('calculatePensionWithdrawalTax() should apply early withdrawal penalty if age < normalMinAge', () => {
        const withdrawal = { withdrawalType: 'early', amount: 10000, planType: 'genericPension' };
        calculator.declareWithdrawal(withdrawal);
        const currentState = { year: 2024, age: 60 }; // Between early (55) and normal (65)

        // Mock calculateValue to return ages and penalty rate based on rules
        const penaltyRate = 0.10;
        const normalAge = 65;
        const earlyAge = 55;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === penaltyRate) return penaltyRate;
            if (rule.method === 'fixedAmount' && rule.value === normalAge) return normalAge;
            if (rule.method === 'fixedAmount' && rule.value === earlyAge) return earlyAge;
            return 0;
        });

        const result = calculator.calculatePensionWithdrawalTax(currentState);

        const expectedPenaltyRate = 0.10; // From mockConfig
        const expectedPenalty = withdrawal.amount * expectedPenaltyRate;
        const expectedTaxableAmount = withdrawal.amount; // Taxed as ordinary income + penalty

        expect(result.totalWithdrawalSpecificTax).toBeCloseTo(expectedPenalty);
        expect(result.totalTaxableWithdrawalAmount).toBeCloseTo(expectedTaxableAmount);
        expect(result.details.length).toBe(1);
        expect(result.details[0].specificTax).toBeCloseTo(expectedPenalty);
        expect(result.details[0].taxableAmount).toBeCloseTo(expectedTaxableAmount);

        // Check calculateValue was called for ages and penalty rate rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: normalAge }), // normalMinAgeRule
            expect.any(Object)
        );
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: earlyAge }), // earlyMinAgeRule
            expect.any(Object)
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: penaltyRate }), // earlyWithdrawalPenaltyRateRule
            expect.any(Object)
        );
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledTimes(3); // Called for normal age, early age, and penalty rate
    });

    test('calculatePensionWithdrawalTax() should NOT apply penalty if age >= normalMinAge (treat as normal)', () => {
        // Declared as 'early' but age makes it 'normal'
        const withdrawal = { withdrawalType: 'early', amount: 10000, planType: 'genericPension' };
        calculator.declareWithdrawal(withdrawal);
        const currentState = { year: 2024, age: 67 }; // Above normal age

        // Mock calculateValue for ages
        const normalAge = 65;
        const earlyAge = 55;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === normalAge) return normalAge;
            if (rule.method === 'fixedAmount' && rule.value === earlyAge) return earlyAge;
            return 0; // Penalty rule should not be called
        });

        const result = calculator.calculatePensionWithdrawalTax(currentState);

        // Should be treated as normal: no specific tax, fully taxable
        expect(result.totalWithdrawalSpecificTax).toBeCloseTo(0);
        expect(result.totalTaxableWithdrawalAmount).toBeCloseTo(withdrawal.amount);
        expect(result.details.length).toBe(1);
        expect(result.details[0].specificTax).toBeCloseTo(0);
        expect(result.details[0].taxableAmount).toBeCloseTo(withdrawal.amount);
        // CalculateValue called for ages, but not penalty
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: normalAge }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: earlyAge }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalledWith(expect.objectContaining({ value: 0.10 }), expect.any(Object)); // Penalty rate rule
    });

    test('calculatePensionWithdrawalTax() should treat normal withdrawal as fully taxable', () => {
        const withdrawal = { withdrawalType: 'normal', amount: 15000, planType: 'genericPension' };
        calculator.declareWithdrawal(withdrawal);
        const currentState = { year: 2024, age: 70 }; // Above normal age

        // Mock calculateValue for ages
        const normalAge = 65;
        const earlyAge = 55;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === normalAge) return normalAge;
            if (rule.method === 'fixedAmount' && rule.value === earlyAge) return earlyAge;
            return 0;
        });

        const result = calculator.calculatePensionWithdrawalTax(currentState);

        expect(result.totalWithdrawalSpecificTax).toBeCloseTo(0);
        expect(result.totalTaxableWithdrawalAmount).toBeCloseTo(withdrawal.amount);
        expect(result.details.length).toBe(1);
        expect(result.details[0].specificTax).toBeCloseTo(0);
        expect(result.details[0].taxableAmount).toBeCloseTo(withdrawal.amount);
        // CalculateValue called for ages, but not penalty/tax-free
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: normalAge }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: earlyAge }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledTimes(2);
    });

    test('calculatePensionWithdrawalTax() should apply tax-free portion for lump sum', () => {
        const withdrawal = { withdrawalType: 'lumpSum', amount: 20000, planType: 'genericPension' };
        calculator.declareWithdrawal(withdrawal);
        const currentState = { year: 2024, age: 66 }; // Age doesn't affect lump sum rule here

        // Mock calculateValue to return the tax-free portion based on the rule
        const taxFreePortion = 0.25;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            // Need to mock age rules as well, although they don't affect lump sum type determination
            if (rule.method === 'fixedAmount' && rule.value === 65) return 65;
            if (rule.method === 'fixedAmount' && rule.value === 55) return 55;
            if (rule.method === 'fixedAmount' && rule.value === taxFreePortion) return taxFreePortion;
            return 0;
        });

        const result = calculator.calculatePensionWithdrawalTax(currentState);

        const expectedTaxFreeRate = 0.25; // From mockConfig
        const expectedSpecificTax = 0; // No specific tax for lump sum in this rule
        const expectedTaxableAmount = withdrawal.amount * (1 - expectedTaxFreeRate);

        expect(result.totalWithdrawalSpecificTax).toBeCloseTo(expectedSpecificTax);
        expect(result.totalTaxableWithdrawalAmount).toBeCloseTo(expectedTaxableAmount);
        expect(result.details.length).toBe(1);
        expect(result.details[0].specificTax).toBeCloseTo(expectedSpecificTax);
        expect(result.details[0].taxableAmount).toBeCloseTo(expectedTaxableAmount);

        // Check calculateValue was called for ages and the tax-free portion rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 65 }), // normalMinAgeRule
            expect.any(Object)
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 55 }), // earlyMinAgeRule
            expect.any(Object)
        );
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: taxFreePortion }), // lumpSumTaxFreePortionRule
            expect.any(Object)
        );
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledTimes(3); // Ages + TaxFree Portion
    });

    test('calculatePensionWithdrawalTax() should handle multiple withdrawals with different types/ages', () => {
        const withdrawalEarly = { withdrawalType: 'early', amount: 10000, planType: 'genericPension' }; // Age 60 -> Penalty
        const withdrawalLump = { withdrawalType: 'lumpSum', amount: 20000, planType: 'genericPension' }; // Age 60 -> TaxFree Portion
        const withdrawalNormal = { withdrawalType: 'normal', amount: 5000, planType: 'genericPension' }; // Age 60 -> Fully Taxable
        const withdrawalLate = { withdrawalType: 'normal', amount: 8000, planType: 'genericPension' }; // Age 70 -> Fully Taxable

        calculator.declareWithdrawal(withdrawalEarly);
        calculator.declareWithdrawal(withdrawalLump);
        calculator.declareWithdrawal(withdrawalNormal);
        calculator.declareWithdrawal(withdrawalLate); // Note: Need to handle state changes between calls if age matters

        // Mock calculateValue for ages, penalty, and tax-free portion
        const penaltyRate = 0.10;
        const taxFreePortion = 0.25;
        const normalAge = 65;
        const earlyAge = 55;
         mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === penaltyRate) return penaltyRate;
            if (rule.method === 'fixedAmount' && rule.value === taxFreePortion) return taxFreePortion;
            if (rule.method === 'fixedAmount' && rule.value === normalAge) return normalAge;
            if (rule.method === 'fixedAmount' && rule.value === earlyAge) return earlyAge;
            return 0;
        });

        // Simulate calculation at age 60 for first 3, then age 70 for last one
        // (In reality, calculator processes all declared withdrawals with the *current* state)
        // For simplicity, we'll calculate all using age 60 state here.
        // A more complex test could involve multiple calculate calls with state changes.
        const currentState = { year: 2024, age: 60 };
        const result = calculator.calculatePensionWithdrawalTax(currentState);

        // const penaltyRate = 0.10; // Remove redeclaration - value comes from mock
        const taxFreeRate = 0.25;

        const earlyPenalty = withdrawalEarly.amount * penaltyRate; // 1000
        const earlyTaxable = withdrawalEarly.amount; // 10000

        const lumpTax = 0;
        const lumpTaxable = withdrawalLump.amount * (1 - taxFreeRate); // 15000

        const normalTax = 0;
        const normalTaxable = withdrawalNormal.amount; // 5000

        const lateTax = 0; // Treated as normal at age 60
        const lateTaxable = withdrawalLate.amount; // 8000

        const expectedTotalSpecificTax = earlyPenalty + lumpTax + normalTax + lateTax; // 1000
        const expectedTotalTaxableAmount = earlyTaxable + lumpTaxable + normalTaxable + lateTaxable; // 10000 + 15000 + 5000 + 8000 = 38000

        expect(result.totalWithdrawalSpecificTax).toBeCloseTo(expectedTotalSpecificTax);
        expect(result.totalTaxableWithdrawalAmount).toBeCloseTo(expectedTotalTaxableAmount);
        expect(result.details.length).toBe(4);
        // Check individual details
        expect(result.details[0].specificTax).toBeCloseTo(earlyPenalty);
        expect(result.details[0].taxableAmount).toBeCloseTo(earlyTaxable);
        expect(result.details[1].specificTax).toBeCloseTo(lumpTax);
        expect(result.details[1].taxableAmount).toBeCloseTo(lumpTaxable);
        expect(result.details[2].specificTax).toBeCloseTo(normalTax);
        expect(result.details[2].taxableAmount).toBeCloseTo(normalTaxable);
        expect(result.details[3].specificTax).toBeCloseTo(lateTax);
        expect(result.details[3].taxableAmount).toBeCloseTo(lateTaxable);

        // Called for ages (x4), penalty (x1), tax-free (x1) = 6 calls per withdrawal * 4 withdrawals = 24? No, state is fixed.
        // Ages called once per withdrawal = 4 * 2 = 8
        // Penalty called once (for early) = 1
        // TaxFree called once (for lump) = 1
        // Total = 10
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledTimes(10);
    });

    // TODO: Add tests for:
    // - Interaction with IncomeTaxCalculator (how taxable amount is passed)
    // - More complex schema rules (e.g., age-based rules, plan-type specific rules)
});