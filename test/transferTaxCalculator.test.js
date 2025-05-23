// test/transferTaxCalculator.test.js

const TransferTaxCalculator = require('../src/core/tax/TransferTaxCalculator');

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
            // Add other methods if needed for transfer tax tests
            default: calculatedValue = rule.value ?? 0; // Fallback
        }
        return calculatedValue;
    }),
    evaluateCondition: jest.fn().mockReturnValue(true), // Default: conditions met
    calculateBracketTax: jest.fn((brackets, income) => income * 0.2), // Simple mock if needed
    getBasisValue: jest.fn((basis, context) => 0), // Mock getBasisValue if needed by rules
};
// Note: The calculator constructor expects the evaluator as the second argument.
// We don't need a separate mockUtils variable.

describe('TransferTaxCalculator', () => {
    let calculator;
    let mockConfig;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // More realistic mock config based on Design.md schema
        mockConfig = {
            transferTax: [
                // Gift Tax Rules
                {
                    taxType: "gift",
                    description: "Annual Gift Tax Rules",
                    "taxPayer": "donor",
                    "annualExclusionPerRecipient": { "calculationRule": { "method": "fixedAmount", "value": 15000 } }, // Use CalculationRule
                    "exemptionsAndRatesByRelationship": [
                        {
                            "relationshipCategory": "childDescendant",
                            "taxFreeThresholdRule": { "method": "fixedAmount", "value": 335000 }, // Use CalculationRule
                            "taxCalculationMethod": { "method": "flatRate", "flatRateRule": { "method": "fixedAmount", "value": 0.10 } } // Use CalculationRule
                        },
                        {
                            "relationshipCategory": "other",
                            "taxFreeThresholdRule": { "method": "fixedAmount", "value": 10000 }, // Use CalculationRule
                            "taxCalculationMethod": { "method": "flatRate", "flatRateRule": { "method": "fixedAmount", "value": 0.30 } } // Use CalculationRule
                        }
                    ]
                },
                // Inheritance Tax Rules
                {
                    taxType: "inheritance",
                    description: "Basic Inheritance Tax Rules",
                    "taxPayer": "recipient", // Example
                    "exemptionsAndRatesByRelationship": [
                        {
                            "relationshipCategory": "spouse",
                            "taxFreeThresholdRule": { "method": "fixedAmount", "value": 500000 }, // Use CalculationRule
                            "taxCalculationMethod": { "method": "exempt" }
                        },
                        {
                            "relationshipCategory": "childDescendant",
                            "taxFreeThresholdRule": { "method": "fixedAmount", "value": 335000 }, // Use CalculationRule
                            "taxCalculationMethod": { "method": "flatRate", "flatRateRule": { "method": "fixedAmount", "value": 0.15 } } // Use CalculationRule
                        }
                    ]
                }
            ]
        };

        // Mock Taxman instance structure expected by calculator
        const mockTaxmanInstance = {
            taxConfig: mockConfig,
            // Add other properties if calculator accesses them (e.g., currentState)
            currentState: { year: 2024 }, // Example state
        };
        calculator = new TransferTaxCalculator(mockTaxmanInstance, mockSchemaEvaluator);
    });

    test('should instantiate correctly', () => {
        expect(calculator).toBeInstanceOf(TransferTaxCalculator);
        expect(calculator.config).toEqual(mockConfig); // Check config was stored
        expect(calculator.evaluator).toBe(mockSchemaEvaluator); // Check evaluator was stored
        expect(calculator.transfers).toEqual([]);
    });

    test('reset() should clear transfers array', () => {
        calculator.declareTransfer({ type: 'gift', amount: 10000 });
        expect(calculator.transfers.length).toBe(1);
        calculator.reset();
        expect(calculator.transfers.length).toBe(0);
    });

    test('declareTransfer() should add transfer details to the array', () => {
        // Use details matching schema structure (value, relationshipToDonor etc.)
        const transfer1 = { type: 'gift', value: 5000, relationshipToDonor: 'parent' };
        const transfer2 = { type: 'inheritance', value: 20000, relationshipFromDeceased: 'childDescendant' };
        calculator.declareTransfer(transfer1);
        calculator.declareTransfer(transfer2);
        expect(calculator.transfers).toEqual([transfer1, transfer2]);
    });

    test('calculateTransferTax() should return zero tax if no transfers declared', () => {
        const currentState = { year: 2024 };
        const result = calculator.calculateTransferTax(currentState);
        expect(result.totalTransferTax).toBe(0);
        expect(result.details).toEqual([]);
        expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalled();
    });

    test('calculateTransferTax() should return zero tax if no matching rules in config', () => {
        // Set up mock taxman with empty config *before* instantiation
        const mockTaxmanInstance = {
            taxConfig: { transferTax: [] }, // Empty rules
            currentState: { year: 2024 },
        };
        // Instantiate calculator for this specific test
        calculator = new TransferTaxCalculator(mockTaxmanInstance, mockSchemaEvaluator);
        calculator.declareTransfer({ type: 'gift', value: 10000 });
        const currentState = { year: 2024 }; // Already set in mockTaxmanInstance, but keep for clarity if needed
        const result = calculator.calculateTransferTax(currentState);
        const declaredTransfer = { type: 'gift', value: 10000 };
        expect(result.totalTransferTax).toBe(0);
        expect(result.details.length).toBe(1); // Should contain one entry
        expect(result.details[0]).toEqual({
             transfer: declaredTransfer,
             tax: 0,
             taxableAmount: 0, // Match the key used in the code for this path
             notes: "No applicable rules found"
        });
    });

    test('calculateTransferTax() should apply annual gift exclusion', () => {
        const gift1 = { type: 'gift', value: 10000, relationshipToDonor: 'other', recipientId: 'recipA' }; // Below exclusion
        const gift2 = { type: 'gift', value: 20000, relationshipToDonor: 'other', recipientId: 'recipB' }; // Above exclusion
        calculator.declareTransfer(gift1);
        calculator.declareTransfer(gift2);

        const currentState = { year: 2024 };
        // Mock calculateValue for the exclusion rule
        const exclusionAmount = 15000;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === exclusionAmount) return exclusionAmount;
            // Mock threshold and rate calls needed for gift 2 (relationship 'other')
            if (rule.method === 'fixedAmount' && rule.value === 10000) return 10000; // Threshold
            if (rule.method === 'fixedAmount' && rule.value === 0.30) return 0.30; // Rate
            return 0;
        });

        const result = calculator.calculateTransferTax(currentState);

        // Verify calculateValue called for exclusion for both gifts
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: exclusionAmount }), // Exclusion rule
            expect.objectContaining({ relationshipCategory: 'other' }) // Context for gift 1
        );
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: exclusionAmount }), // Exclusion rule
            expect.objectContaining({ relationshipCategory: 'other' }) // Context for gift 2
        );

        // Gift 1: value 10k < exclusion 15k -> taxable = 0 -> tax = 0
        // Gift 2: value 20k > exclusion 15k -> taxable after exclusion = 5k.
        //         Relationship 'other' threshold = 10k. Taxable after threshold = max(0, 5k - 10k) = 0. Tax = 0.
        expect(result.totalTransferTax).toBeCloseTo(0);
        expect(result.details.length).toBe(2);
        expect(result.details[0].tax).toBeCloseTo(0); // Tax for gift1
        expect(result.details[1].tax).toBeCloseTo(0); // Tax for gift2
    });

    test('calculateTransferTax() should apply relationship thresholds and rates for gifts', () => {
        // Gift to child, above annual exclusion but below relationship threshold
        const giftChildBelow = { type: 'gift', value: 50000, relationshipToDonor: 'childDescendant', recipientId: 'child1' };
        // Gift to child, above annual exclusion and relationship threshold
        const giftChildAbove = { type: 'gift', value: 350000, relationshipToDonor: 'childDescendant', recipientId: 'child2' };
        // Gift to other, above annual exclusion and relationship threshold
        const giftOtherAbove = { type: 'gift', value: 25000, relationshipToDonor: 'other', recipientId: 'other1' };

        calculator.declareTransfer(giftChildBelow);
        calculator.declareTransfer(giftChildAbove);
        calculator.declareTransfer(giftOtherAbove);

        const currentState = { year: 2024 };
        // Mock calculateValue for exclusion, thresholds, and rates
        const exclusionAmount = 15000;
        const childThreshold = 335000;
        const childRate = 0.10;
        const otherThreshold = 10000;
        const otherRate = 0.30;
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === exclusionAmount) return exclusionAmount;
            if (rule.method === 'fixedAmount' && rule.value === childThreshold) return childThreshold;
            if (rule.method === 'fixedAmount' && rule.value === childRate) return childRate;
            if (rule.method === 'fixedAmount' && rule.value === otherThreshold) return otherThreshold;
            if (rule.method === 'fixedAmount' && rule.value === otherRate) return otherRate;
            return 0;
        });

        // Adjust gifts to incur tax
        giftChildAbove.value = 400000;
        giftOtherAbove.value = 30000;
        calculator.transfers = []; // Reset transfers
        calculator.declareTransfer(giftChildBelow);
        calculator.declareTransfer(giftChildAbove);
        calculator.declareTransfer(giftOtherAbove);

        const result = calculator.calculateTransferTax(currentState);

        // GiftChildBelow: TaxableAfterExcl = 50k-15k=35k. TaxableAfterThresh = max(0, 35k-335k)=0. Tax=0.
        // GiftChildAbove: TaxableAfterExcl = 400k-15k=385k. TaxableAfterThresh = max(0, 385k-335k)=50k. Tax=50k*10%=5000.
        // GiftOtherAbove: TaxableAfterExcl = 30k-15k=15k. TaxableAfterThresh = max(0, 15k-10k)=5k. Tax=5k*30%=1500.
        const expectedTotalTax = 5000 + 1500;

        expect(result.totalTransferTax).toBeCloseTo(expectedTotalTax);
        expect(result.details.length).toBe(3);
        expect(result.details[0].tax).toBeCloseTo(0); // giftChildBelow
        expect(result.details[1].tax).toBeCloseTo(5000); // giftChildAbove (adjusted)
        expect(result.details[2].tax).toBeCloseTo(1500); // giftOtherAbove (adjusted)

        // Verify calculateValue calls for thresholds and rates
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: childThreshold }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: childRate }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: otherThreshold }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: otherRate }), expect.any(Object));
    });

     test('calculateTransferTax() should apply inheritance rules (exempt spouse, threshold/rate for child)', () => {
        const inheritanceSpouse = { type: 'inheritance', value: 1000000, relationshipFromDeceased: 'spouse' };
        const inheritanceChildBelow = { type: 'inheritance', value: 300000, relationshipFromDeceased: 'childDescendant' };
        const inheritanceChildAbove = { type: 'inheritance', value: 500000, relationshipFromDeceased: 'childDescendant' };

        calculator.declareTransfer(inheritanceSpouse);
        calculator.declareTransfer(inheritanceChildBelow);
        calculator.declareTransfer(inheritanceChildAbove);

        const currentState = { year: 2024 };
        // Mock calculateValue for thresholds and rate
        const childThreshold = 335000;
        const childRate = 0.15;
        const spouseThreshold = 500000; // Though method is exempt
         mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === childThreshold) return childThreshold;
            if (rule.method === 'fixedAmount' && rule.value === childRate) return childRate;
            if (rule.method === 'fixedAmount' && rule.value === spouseThreshold) return spouseThreshold;
            return 0;
        });

        const result = calculator.calculateTransferTax(currentState);

        // Spouse: Exempt -> Tax = 0
        // ChildBelow: Value 300k <= Threshold 335k -> Tax = 0
        // ChildAbove: Value 500k > Threshold 335k -> Taxable = 500k - 335k = 165k. Tax = 165k * 15% = 24750
        const expectedTotalTax = 24750;

        expect(result.totalTransferTax).toBeCloseTo(expectedTotalTax);
        expect(result.details.length).toBe(3);
        expect(result.details[0].tax).toBeCloseTo(0); // inheritanceSpouse
        expect(result.details[1].tax).toBeCloseTo(0); // inheritanceChildBelow
        expect(result.details[2].tax).toBeCloseTo(24750); // inheritanceChildAbove

        // Verify calculateValue calls for thresholds and rate
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: spouseThreshold }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: childThreshold }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: childRate }), expect.any(Object));
    });

    // Add tests for accumulation periods if implemented
    // Add tests for different taxPayer logic if implemented
});