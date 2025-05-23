// test/investmentIncomeTaxCalculator.test.js

const InvestmentIncomeTaxCalculator = require('../src/core/tax/InvestmentIncomeTaxCalculator');
const CapitalGainsTaxCalculator = require('../src/core/tax/CapitalGainsTaxCalculator'); // Dependency for 'asCapitalGains'

describe('InvestmentIncomeTaxCalculator', () => {
    let mockTaxman;
    let mockSchemaEvaluator;
    let mockCgtCalculator;
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
            evaluateCondition: jest.fn().mockReturnValue(false), // Default: not qualified, not exempt etc.
            calculateBracketTax: jest.fn((brackets, income) => income * 0.2), // Simple mock
            getBasisValue: jest.fn((basis, context) => {
                 if (!basis) return 0;
                 if (context && context[basis] !== undefined) return context[basis];
                 return mockTaxman?.calculated?.[basis] ?? mockTaxman?.currentState?.[basis] ?? 0;
            }),
            getMarginalIncomeRate: jest.fn().mockReturnValue(0.25), // Mock marginal rate
        };

        // Mock CGT Calculator (only need _getRateInfoForCGT for 'asCapitalGains')
        mockCgtCalculator = {
            _getRateInfoForCGT: jest.fn((period, type) => {
                // Mock CGT rate lookup
                if (type === 'dividend') return { type: 'flat', rate: 0.15 }; // Example CGT rate for dividends
                return { type: 'flat', rate: 0.20 }; // Default mock CGT rate
            })
        };

        // Mock Taxman instance
        mockTaxman = {
            taxConfig: {
                investmentIncomeTax: { // Default empty config
                    dividends: {},
                    interest: {},
                    royalties: {}
                },
                incomeTax: { // Needed for 'asOrdinaryIncome'
                     filingStatusRules: {
                         single: {
                             taxCalculationMethod: {
                                 method: 'brackets',
                                 brackets: [ { threshold: 10000, rate: 0.1 }, { rate: 0.2 } ] // Example brackets
                             }
                         }
                     }
                },
                capitalGainsTax: {} // Structure needed by CGT calculator mock
            },
            currentState: {
                filingStatus: 'single',
                // ... other state
            },
            calculated: {
                adjustedGrossIncome: 50000,
                taxableIncome: 40000,
                investmentIncomeTax: 0 // Initialize
            },
            incomeSources: { // Initialize structure
                investment: {
                    dividends: 0,
                    interest: 0,
                    royalties: 0
                }
            },
            // Provide mocks
            evaluator: mockSchemaEvaluator,
            cgtCalculator: mockCgtCalculator,
             utils: {
                 evaluateFormula: jest.fn(),
                 executeCustomRule: jest.fn(),
            },
        };

        // Instantiate the calculator
        calculator = new InvestmentIncomeTaxCalculator(mockTaxman, mockSchemaEvaluator, mockCgtCalculator);
    });

    it('should calculate zero tax if no income or config', () => {
        calculator.calculateInvestmentTax();
        expect(mockTaxman.calculated.investmentIncomeTax).toBe(0);
    });

    // --- Dividend Tests ---
    describe('Dividends', () => {
        beforeEach(() => {
            mockTaxman.incomeSources.investment.dividends = 2000;
            mockTaxman.taxConfig.investmentIncomeTax.dividends = {
                allowance: { calculationRule: { method: 'fixedAmount', value: 500 } }, // 500 allowance rule
                qualifiedDefinition: { conditionType: 'someCondition', value: true }, // Example qualified rule
                taxationMethod: 'preferentialRates', // Default method
                rates: {
                    qualifiedRule: { method: 'fixedAmount', value: 0.10 }, // 10% qualified rate rule
                    nonQualifiedRule: { method: 'fixedAmount', value: 0.25 } // 25% non-qualified rate rule
                }
            };
        });

        it('should apply allowance using calculateValue', () => {
            calculator.calculateInvestmentTax();
            // Verify calculateValue was called for the allowance
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'fixedAmount', value: 500 }), // Allowance rule
                expect.any(Object) // Context
            );
            // Taxable amount = 2000 - 500 = 1500
            // Tax calculation depends on qualified status...
        });

        it('should check qualified status using evaluateCondition', () => {
             mockSchemaEvaluator.evaluateCondition.mockReturnValue(true); // Simulate qualified
             calculator.calculateInvestmentTax();
             // Verify evaluateCondition was called for qualified check
             expect(mockSchemaEvaluator.evaluateCondition).toHaveBeenCalledWith(
                 expect.objectContaining({ conditionType: 'someCondition', value: true }), // Qualified rule
                 expect.any(Object) // Context
             );
             // Tax should use the qualified rate (10%)
             // Taxable = 1500. Rate = 10%. Tax = 150.
             expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(150);
        });

        it('should use non-qualified rate if evaluateCondition returns false', () => {
             mockSchemaEvaluator.evaluateCondition.mockReturnValue(false); // Simulate non-qualified
             calculator.calculateInvestmentTax();
             expect(mockSchemaEvaluator.evaluateCondition).toHaveBeenCalledWith(
                 expect.objectContaining({ conditionType: 'someCondition', value: true }),
                 expect.any(Object)
             );
             // Tax should use the non-qualified rate (25%)
             // Taxable = 1500. Rate = 25%. Tax = 375.
             expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(375);
        });

        it('should calculate tax using qualified rate rule via calculateValue', () => {
            mockSchemaEvaluator.evaluateCondition.mockReturnValue(true); // Qualified
            calculator.calculateInvestmentTax();
            // Verify calculateValue was called for the qualified rate rule
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'fixedAmount', value: 0.10 }), // Qualified rate rule
                expect.any(Object) // Context
            );
            expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(150); // 1500 * 10%
        });

         it('should calculate tax using non-qualified rate rule via calculateValue', () => {
            mockSchemaEvaluator.evaluateCondition.mockReturnValue(false); // Non-qualified
            calculator.calculateInvestmentTax();
            // Verify calculateValue was called for the non-qualified rate rule
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'fixedAmount', value: 0.25 }), // Non-qualified rate rule
                expect.any(Object) // Context
            );
            expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(375); // 1500 * 25%
        });
    });

    // --- Interest Tests ---
    describe('Interest', () => {
         beforeEach(() => {
            mockTaxman.incomeSources.investment.interest = 1000;
            mockTaxman.taxConfig.investmentIncomeTax.interest = {
                allowance: { calculationRule: { method: 'percentage', basis: 'adjustedGrossIncome', value: 0.01 } }, // 1% of AGI allowance rule
                taxationMethod: 'asOrdinaryIncome' // Tax as ordinary income
            };
        });

        it('should apply percentage allowance using calculateValue', () => {
            // Mock getBasisValue for AGI
            mockSchemaEvaluator.getBasisValue.mockImplementation((basis, context) => {
                if (basis === 'adjustedGrossIncome') return 50000;
                return 0;
            });
            calculator.calculateInvestmentTax();
            // Verify calculateValue called for allowance
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.01 }),
                expect.any(Object)
            );
            // Allowance = 1% of 50000 = 500
            // Taxable = 1000 - 500 = 500
            // Tax calculation depends on 'asOrdinaryIncome'...
        });

        it('should calculate tax using "asOrdinaryIncome" method', () => {
             // Mock getBasisValue for AGI
            mockSchemaEvaluator.getBasisValue.mockImplementation((basis, context) => {
                if (basis === 'adjustedGrossIncome') return 50000;
                return 0;
            });
            // Mock bracket calculation for income tax
            mockSchemaEvaluator.calculateBracketTax.mockImplementation((brackets, income) => {
                 // Simple mock: 10% on first 40k, 20% after (matches base taxable income)
                 if (income <= 40000) return income * 0.1;
                 return (40000 * 0.1) + ((income - 40000) * 0.2);
            });

            calculator.calculateInvestmentTax();
            // Allowance = 500. Taxable = 500.
            // Base taxable income = 40000. Tax on base = 40000 * 0.1 = 4000.
            // Total taxable income = 40000 + 500 = 40500.
            // Tax on total = (40000 * 0.1) + (500 * 0.2) = 4000 + 100 = 4100.
            // Incremental tax = 4100 - 4000 = 100.
            expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(100);
            // Verify calculateBracketTax was called twice
            expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledTimes(2);
            expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledWith(expect.any(Array), 40000); // Base
            expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledWith(expect.any(Array), 40500); // Base + Investment
        });
    });

     // --- Royalties Tests ---
    describe('Royalties', () => {
         beforeEach(() => {
            mockTaxman.incomeSources.investment.royalties = 3000;
            mockTaxman.taxConfig.investmentIncomeTax.royalties = {
                allowance: { calculationRule: { method: 'fixedAmount', value: 0 } }, // No allowance
                taxationMethod: 'asCapitalGains' // Tax as capital gains
            };
        });

        it('should calculate tax using "asCapitalGains" method', () => {
            calculator.calculateInvestmentTax();
            // Allowance = 0. Taxable = 3000.
            // Should call CGT calculator's rate lookup
            expect(mockCgtCalculator._getRateInfoForCGT).toHaveBeenCalledWith('longTerm', 'royalty');
            // Mock returns { type: 'flat', rate: 0.20 } for royalty type
            // Tax = 3000 * 0.20 = 600
            expect(mockTaxman.calculated.investmentIncomeTax).toBeCloseTo(600);
        });
    });

});