// test/wealthTaxCalculator.test.js

const WealthTaxCalculator = require('../src/core/tax/WealthTaxCalculator');

describe('WealthTaxCalculator', () => {
    let mockTaxman;
    let mockSchemaEvaluator;
    let calculator;

    beforeEach(() => {
        // Mock SchemaEvaluator
        mockSchemaEvaluator = {
            calculateValue: jest.fn((rule, context) => {
                // Generalized mock
                if (!rule || !rule.method) return 0;
                const basisValue = mockSchemaEvaluator.getBasisValue(rule.basis, context);
                let calculatedValue = 0;
                switch (rule.method) {
                    case 'fixedAmount': calculatedValue = rule.value ?? 0; break;
                    case 'percentage': calculatedValue = basisValue * (rule.value ?? 0); break;
                    default: calculatedValue = rule.value ?? 0;
                }
                return calculatedValue;
            }),
            calculateBracketTax: jest.fn((brackets, income) => {
                // Simple mock: 1% on first 1M, 2% after
                if (!brackets || brackets.length === 0) return 0;
                if (income <= 1000000) return income * 0.01;
                return (1000000 * 0.01) + ((income - 1000000) * 0.02);
            }),
            getBasisValue: jest.fn((basis, context) => {
                 if (!basis) return 0;
                 if (context && context[basis] !== undefined) return context[basis];
                 // Check calculated first for income basis
                 if (basis === 'adjustedGrossIncome') return mockTaxman?.calculated?.adjustedGrossIncome ?? 0;
                 return mockTaxman?.currentState?.[basis] ?? 0;
            }),
        };

        // Mock Taxman instance
        mockTaxman = {
            taxConfig: {
                wealthTax: { // Default config
                    applies: true,
                    baseDefinition: { type: 'netWorth', liabilityInclusion: 'include' },
                    exemptionThreshold: { calculationRule: { method: 'fixedAmount', value: 1000000 } }, // 1M exemption rule
                    taxCalculationMethod: { method: 'flatRate', flatRateRule: { method: 'fixedAmount', value: 0.01 } }, // 1% flat rate rule
                    liabilityCapRule: { applies: false } // Cap disabled by default
                }
            },
            currentState: {
                netWorth: 5000000, // Example net worth
                liabilities: 500000,
                // assets needed if base is grossAssets
            },
            calculated: {
                wealthTax: 0, // Initialize
                adjustedGrossIncome: 100000, // Example income for cap
                incomeTax: 15000,
                appliedNonRefundableCredits: 2000
            },
            // Provide mocks
            evaluator: mockSchemaEvaluator,
             utils: {
                 evaluateFormula: jest.fn(),
                 executeCustomRule: jest.fn(),
            },
            // Mock assets if needed for grossAssets base type
            assets: {
                property: { type: 'realEstate', value: 4000000 },
                investments: { type: 'financial', value: 1500000 }
            }
        };

        // Instantiate the calculator
        calculator = new WealthTaxCalculator(mockTaxman, mockSchemaEvaluator);
    });

    it('should calculate zero tax if wealth tax does not apply', () => {
        mockTaxman.taxConfig.wealthTax.applies = false;
        calculator.calculateWealthTax();
        expect(mockTaxman.calculated.wealthTax).toBe(0);
    });

    it('should calculate wealth base correctly (net worth)', () => {
        mockTaxman.taxConfig.wealthTax.baseDefinition = { type: 'netWorth', liabilityInclusion: 'include' };
        // Assets value = 4M + 1.5M = 5.5M
        // Liabilities = 0.5M
        // Net Worth = 5M (This should be calculated by the calculator based on assets/liabilities)
        calculator.calculateWealthTax();
        // Verify exemption calculation uses the calculated base
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 1000000 }), // Exemption rule
            expect.objectContaining({ wealthBase: 5000000 }) // Context should include calculated base
        );
    });

     it('should calculate wealth base correctly (gross assets)', () => {
        mockTaxman.taxConfig.wealthTax.baseDefinition = { type: 'grossAssets', includedAssetTypes: ['all'] };
        calculator.calculateWealthTax();
        // Expected base = 4M + 1.5M = 5.5M
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 1000000 }), // Exemption rule
            expect.objectContaining({ wealthBase: 5500000 }) // Context should include calculated base
        );
    });

    it('should apply exemption threshold using calculateValue', () => {
        const exemptionAmount = 1500000;
        mockTaxman.taxConfig.wealthTax.exemptionThreshold.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        // Mock calculateValue to return this specific exemption
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
            if (rule.method === 'fixedAmount' && rule.value === 0.01) return 0.01; // Rate
            return 0;
        });

        calculator.calculateWealthTax();
        // Verify calculateValue called for exemption
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: exemptionAmount }),
            expect.any(Object)
        );
        // Base = 5M (net worth). Taxable = 5M - 1.5M = 3.5M
        // Tax = 3.5M * 1% = 35000
        expect(mockTaxman.calculated.wealthTax).toBeCloseTo(35000);
    });

    it('should calculate tax using flat rate rule via calculateValue', () => {
        const flatRate = 0.015; // 1.5%
        mockTaxman.taxConfig.wealthTax.taxCalculationMethod = { method: 'flatRate', flatRateRule: { method: 'fixedAmount', value: flatRate } };
        // Mock calculateValue for exemption and rate
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === 1000000) return 1000000; // Exemption
            if (rule.method === 'fixedAmount' && rule.value === flatRate) return flatRate; // Rate
            return 0;
        });

        calculator.calculateWealthTax();
        // Base = 5M. Exemption = 1M. Taxable = 4M.
        // Verify calculateValue called for rate
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: flatRate }),
            expect.any(Object) // Context
        );
        // Tax = 4M * 1.5% = 60000
        expect(mockTaxman.calculated.wealthTax).toBeCloseTo(60000);
    });

    it('should calculate tax using brackets via calculateBracketTax', () => {
        const brackets = [
            { threshold: 1000000, rate: 0.01 }, // 1% on first 1M (of taxable wealth)
            { rate: 0.02 } // 2% above 1M
        ];
        mockTaxman.taxConfig.wealthTax.taxCalculationMethod = { method: 'brackets', brackets: brackets };
        // Mock calculateValue for exemption only
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === 1000000) return 1000000; // Exemption
            return 0;
        });

        calculator.calculateWealthTax();
        // Base = 5M. Exemption = 1M. Taxable = 4M.
        // Verify calculateBracketTax called
        expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledWith(
            brackets,
            4000000 // Taxable wealth
        );
        // Expected tax (using mock): (1M * 1%) + (3M * 2%) = 10000 + 60000 = 70000
        expect(mockTaxman.calculated.wealthTax).toBeCloseTo(70000);
    });

    it('should apply liability cap using calculateValue and getBasisValue', () => {
        const capPercentage = 0.80; // 80% of income
        mockTaxman.taxConfig.wealthTax.liabilityCapRule = {
            applies: true,
            basedOn: 'adjustedGrossIncome', // Use AGI as base for cap
            maxPercentageOfIncomeRule: { method: 'fixedAmount', value: capPercentage }
        };
        // Mock calculateValue for exemption, rate, and cap percentage
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === 1000000) return 1000000; // Exemption
            if (rule.method === 'fixedAmount' && rule.value === 0.01) return 0.01; // Rate
            if (rule.method === 'fixedAmount' && rule.value === capPercentage) return capPercentage; // Cap %
            return 0;
        });
        // Mock getBasisValue for the income base of the cap
        mockSchemaEvaluator.getBasisValue.mockImplementation((basis, context) => {
            if (basis === 'adjustedGrossIncome') return 100000; // AGI from mockTaxman.calculated
            return 0;
        });

        calculator.calculateWealthTax();
        // Base = 5M. Exemption = 1M. Taxable = 4M.
        // Initial Wealth Tax = 4M * 1% = 40000.
        // Verify calculateValue called for cap rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: capPercentage }),
            expect.any(Object)
        );
        // Verify getBasisValue called for cap income base
        expect(mockSchemaEvaluator.getBasisValue).toHaveBeenCalledWith(
            'adjustedGrossIncome',
            expect.any(Object)
        );
        // Max Total Tax = 100000 (AGI) * 80% = 80000.
        // Income Tax after non-ref credits = 15000 - 2000 = 13000.
        // Max Wealth Tax = 80000 - 13000 = 67000.
        // Since initial wealth tax (40000) < max wealth tax (67000), cap is not applied.
        expect(mockTaxman.calculated.wealthTax).toBeCloseTo(40000);
    });

     it('should apply liability cap when initial wealth tax exceeds limit', () => {
        const capPercentage = 0.15; // 15% of income - low cap
        mockTaxman.taxConfig.wealthTax.liabilityCapRule = {
            applies: true,
            basedOn: 'adjustedGrossIncome',
            maxPercentageOfIncomeRule: { method: 'fixedAmount', value: capPercentage }
        };
         // Mock calculateValue for exemption, rate, and cap percentage
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === 1000000) return 1000000; // Exemption
            if (rule.method === 'fixedAmount' && rule.value === 0.01) return 0.01; // Rate
            if (rule.method === 'fixedAmount' && rule.value === capPercentage) return capPercentage; // Cap %
            return 0;
        });
        // Mock getBasisValue for the income base of the cap
        mockSchemaEvaluator.getBasisValue.mockImplementation((basis, context) => {
            if (basis === 'adjustedGrossIncome') return 100000; // AGI
            return 0;
        });

        calculator.calculateWealthTax();
        // Initial Wealth Tax = 40000.
        // Max Total Tax = 100000 (AGI) * 15% = 15000.
        // Income Tax after non-ref credits = 13000.
        // Max Wealth Tax = 15000 - 13000 = 2000.
        // Since initial wealth tax (40000) > max wealth tax (2000), cap IS applied.
        expect(mockTaxman.calculated.wealthTax).toBeCloseTo(2000);
    });

});