// test/socialContributionsCalculator.test.js

const SocialContributionsCalculator = require('../src/core/tax/SocialContributionsCalculator');

describe('SocialContributionsCalculator', () => {
    let mockTaxman;
    let mockSchemaEvaluator;
    let calculator;

    beforeEach(() => {
        // Mock SchemaEvaluator with generalized calculateValue
        mockSchemaEvaluator = {
            evaluateCondition: jest.fn().mockReturnValue(false), // Default: not exempt
            calculateValue: jest.fn((rule, context) => {
                // Mock implementation - return fixed values based on rule structure for simplicity
                if (rule?.method === 'fixedAmount') return rule.value ?? 0;
                if (rule?.method === 'percentage' && rule.basis === 'relevantIncome') return (context?.relevantIncome ?? 0) * (rule.value ?? 0);
                // Add more specific mocks if needed per test
                return rule?.value ?? rule?.amount ?? 0; // Fallback
            }),
            calculateBracketTax: jest.fn((brackets, income) => {
                // Simple mock for bracket tax
                if (!brackets || brackets.length === 0) return 0;
                if (income <= 10000) return income * 0.05; // 5% on first 10k
                return (10000 * 0.05) + ((income - 10000) * 0.10); // 10% after
            }),
            utils: {
                executeCustomRule: jest.fn().mockReturnValue(0), // Default: no custom contribution
            }
        };

        // Mock Taxman instance
        mockTaxman = {
            taxConfig: {
                socialContributions: [] // Empty by default
            },
            currentState: {
                age: 35,
                // ... other state
            },
            calculated: {
                socialContributions: {} // Initialize
            },
            incomeSources: { // Example income sources
                employment: { gross: 60000 },
                selfEmployment: { gross: 20000 },
            },
            age: 35,
            // Mock helper used by calculator
            _getIncomeByTypes: jest.fn(types => {
                let total = 0;
                if (types.includes('all') || types.includes('employment')) total += mockTaxman.incomeSources.employment.gross;
                if (types.includes('all') || types.includes('selfEmployment')) total += mockTaxman.incomeSources.selfEmployment.gross;
                return total;
            }),
            utils: mockSchemaEvaluator.utils // Share the mocked utils
        };

        // Instantiate the calculator
        calculator = new SocialContributionsCalculator(mockTaxman, mockSchemaEvaluator);
    });

    it('should calculate zero contribution if config is empty', () => {
        calculator.calculateContributions();
        expect(mockTaxman.calculated.socialContributions).toEqual({});
    });

    it('should calculate contribution using flatRate with fixed rate rule', () => {
        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'FlatTax',
                appliesToIncomeType: ['employment'], // 60000
                incomeThresholds: { lowerBoundRule: { method: 'fixedAmount', value: 10000 } },
                calculationMethod: {
                    method: 'flatRate',
                    flatRateRule: { method: 'fixedAmount', value: 0.04 } // 4% flat rate
                },
                rates: { employeeRateFactor: 1.0 }
            }
        ];

        calculator.calculateContributions();

        // Relevant income = 60000
        // Lower bound = 10000
        // Income subject = 60000 - 10000 = 50000
        // Contribution = 50000 * 0.04 = 2000
        expect(mockTaxman.calculated.socialContributions['FlatTax']).toBeCloseTo(2000);
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ method: 'fixedAmount', value: 10000 }), expect.any(Object)); // Lower bound
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ method: 'fixedAmount', value: 0.04 }), expect.any(Object)); // Flat rate
    });

     it('should calculate contribution using brackets', () => {
        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'BracketTax',
                appliesToIncomeType: ['all'], // 60000 + 20000 = 80000
                incomeThresholds: { lowerBoundRule: { method: 'fixedAmount', value: 0 } }, // From 0
                calculationMethod: {
                    method: 'brackets',
                    brackets: [
                        { threshold: 10000, rate: 0.05 },
                        { rate: 0.10 } // 10% above 10000
                    ]
                },
                rates: { employeeRateFactor: 1.0 }
            }
        ];

        calculator.calculateContributions();

        // Relevant income = 80000
        // Lower bound = 0
        // Income subject = 80000
        // Expected bracket tax (using mock): (10000 * 0.05) + (70000 * 0.10) = 500 + 7000 = 7500
        expect(mockTaxman.calculated.socialContributions['BracketTax']).toBeCloseTo(7500);
        expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ rate: 0.05 })]),
            80000 // Relevant income base for brackets
        );
    });

    it('should apply exemption if condition met', () => {
        mockSchemaEvaluator.evaluateCondition.mockReturnValue(true); // Make exemption condition true
        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'ExemptTax',
                appliesToIncomeType: ['employment'],
                exemptions: [{ conditionType: 'age', operator: '>', value: 65 }], // Example condition
                calculationMethod: { method: 'flatRate', flatRateRule: { method: 'fixedAmount', value: 0.05 } },
                rates: { employeeRateFactor: 1.0 }
            }
        ];

        calculator.calculateContributions();

        expect(mockTaxman.calculated.socialContributions['ExemptTax']).toBe(0);
        expect(mockSchemaEvaluator.evaluateCondition).toHaveBeenCalledWith(expect.objectContaining({ conditionType: 'age' }), expect.any(Object));
    });

    it('should apply employeeRateFactor', () => {
        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'FactoredTax',
                appliesToIncomeType: ['employment'], // 60000
                incomeThresholds: { lowerBoundRule: { method: 'fixedAmount', value: 0 } },
                calculationMethod: { method: 'flatRate', flatRateRule: { method: 'fixedAmount', value: 0.10 } }, // 10% rate
                rates: { employeeRateFactor: 0.5 } // Only 50% paid by employee
            }
        ];

        calculator.calculateContributions();

        // Relevant income = 60000
        // Income subject = 60000
        // Base contribution = 60000 * 0.10 = 6000
        // Factored contribution = 6000 * 0.5 = 3000
        expect(mockTaxman.calculated.socialContributions['FactoredTax']).toBeCloseTo(3000);
    });

    it('should use calculateValue for income thresholds', () => {
        // Mock calculateValue to return specific threshold values
         mockSchemaEvaluator.calculateValue
            .mockImplementationOnce((rule) => rule.value) // For lowerBoundRule { value: 15000 }
            .mockImplementationOnce((rule) => rule.value); // For upperBoundCeilingRule { value: 50000 }

        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'ThresholdTax',
                appliesToIncomeType: ['employment'], // 60000
                incomeThresholds: {
                    lowerBoundRule: { method: 'fixedAmount', value: 15000 }, // Use calculateValue
                    upperBoundCeilingRule: { method: 'fixedAmount', value: 50000 } // Use calculateValue
                },
                calculationMethod: { method: 'flatRate', flatRateRule: { method: 'fixedAmount', value: 0.10 } }, // 10% rate
                rates: { employeeRateFactor: 1.0 }
            }
        ];

        calculator.calculateContributions();

        // Relevant income = 60000
        // Lower bound = 15000
        // Upper bound = 50000
        // Income subject = min(60000, 50000) - 15000 = 50000 - 15000 = 35000
        // Contribution = 35000 * 0.10 = 3500
        expect(mockTaxman.calculated.socialContributions['ThresholdTax']).toBeCloseTo(3500);
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: 15000 }), expect.any(Object));
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(expect.objectContaining({ value: 50000 }), expect.any(Object));
    });

     it('should handle custom calculation method', () => {
        mockSchemaEvaluator.utils.executeCustomRule.mockReturnValue(555); // Custom rule returns 555
        mockTaxman.taxConfig.socialContributions = [
            {
                name: 'CustomContrib',
                appliesToIncomeType: ['all'], // 80000
                incomeThresholds: { lowerBoundRule: { method: 'fixedAmount', value: 0 } },
                calculationMethod: {
                    method: 'custom',
                    customRuleIdentifier: 'calculateUSC' // Example identifier
                },
                rates: { employeeRateFactor: 1.0 }
            }
        ];

        calculator.calculateContributions();

        expect(mockTaxman.calculated.socialContributions['CustomContrib']).toBe(555);
        expect(mockSchemaEvaluator.utils.executeCustomRule).toHaveBeenCalledWith('calculateUSC', expect.objectContaining({ relevantIncome: 80000 }));
    });

});