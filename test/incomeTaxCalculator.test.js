// test/incomeTaxCalculator.test.js

const IncomeTaxCalculator = require('../src/core/tax/IncomeTaxCalculator');
// We need to mock Taxman and SchemaEvaluator
// jest.mock('../src/core/Taxman'); // Mocking the whole class might be complex, let's create mock instances
// jest.mock('../src/core/tax/SchemaEvaluator');

describe('IncomeTaxCalculator', () => {
    let mockTaxman;
    let mockSchemaEvaluator;
    let incomeTaxCalculator;
    let simpleTaxConfig;

    beforeEach(() => {
        // Reset mocks and config before each test
        mockSchemaEvaluator = {
            evaluateCondition: jest.fn().mockReturnValue(true), // Default to conditions being met
            calculateValue: jest.fn((rule, context) => {
                // More sophisticated mock based on rule.method
                if (!rule || !rule.method) return 0; // Invalid rule

                const basisValue = mockSchemaEvaluator.getBasisValue(rule.basis, context); // Use mocked getBasisValue

                let calculatedValue = 0;
                switch (rule.method) {
                    case 'fixedAmount':
                        calculatedValue = rule.value ?? 0;
                        break;
                    case 'percentage':
                        calculatedValue = basisValue * (rule.value ?? 0);
                        break;
                    case 'perDependent':
                        // Simplified mock - assumes countDependents is mocked or returns a fixed value
                        const dependentCount = mockTaxman.dependents?.length || 0;
                        calculatedValue = (rule.amountPerDependent ?? 0) * dependentCount;
                        break;
                    case 'formula':
                        // Use the existing mock evaluateFormula utility
                        calculatedValue = mockTaxman.utils.evaluateFormula(rule.formula, { ...mockTaxman.currentState, ...mockTaxman.calculated, ...context });
                        break;
                    case 'lookup':
                        const lookupKey = context?.lookupKey ?? basisValue; // Prioritize context key
                        const entry = rule.lookupTable?.find(item => item.key === lookupKey);
                        calculatedValue = entry?.value ?? 0;
                        break;
                    case 'brackets':
                        // Delegate to the mocked calculateBracketTax, using the basis value
                        // Note: calculateBracketTax mock needs to be robust enough or specific per test
                        const bracketsToUse = rule.brackets || mockTaxman.taxConfig?.incomeTax?.filingStatusRules?.[mockTaxman.filingStatus]?.taxCalculationMethod?.brackets;
                        calculatedValue = mockSchemaEvaluator.calculateBracketTax(bracketsToUse, basisValue);
                        break;
                    case 'custom':
                        calculatedValue = mockTaxman.utils.executeCustomRule(rule.customRuleIdentifier, { ...mockTaxman.currentState, ...mockTaxman.calculated, ...context });
                        break;
                    default:
                        calculatedValue = 0; // Unknown method
                }
                 // Apply min/max if present in the rule (simplified mock)
                 if (rule.minValue !== undefined) calculatedValue = Math.max(calculatedValue, rule.minValue);
                 if (rule.maxValue !== undefined) calculatedValue = Math.min(calculatedValue, rule.maxValue);

                 return calculatedValue;
                // Note: This mock doesn't handle phaseOut application within calculateValue itself,
                // assuming those are handled separately or tested via applyPhaseOut mock.
            }),
            applyPhaseOut: jest.fn((baseAmount, rule, context) => baseAmount), // Default: no phase-out
            // Mock calculateBracketTax (can be overridden in specific tests)
            calculateBracketTax: jest.fn((brackets, income) => {
                // Default simple mock - can be made more specific in tests
                if (!brackets || brackets.length === 0) return 0;
                // Example: 10% on first 10k, 20% after (matches some tests)
                if (income <= 10000) return income * 0.1;
                return (10000 * 0.1) + ((income - 10000) * 0.2);
            }),
            // Ensure getBasisValue mock is present and functional
            getBasisValue: jest.fn((basis, context) => {
                if (!basis) return 0;
                if (context && context[basis] !== undefined) return context[basis];
                // Check calculated, then currentState, then incomeSources (simplified)
                // Handle dot notation simply for age/filingStatus
                if (basis === 'age') return mockTaxman.currentState?.age ?? 0;
                if (basis === 'filingStatus') return mockTaxman.currentState?.filingStatus ?? '';

                return mockTaxman.calculated?.[basis] ?? mockTaxman.currentState?.[basis] ?? mockTaxman.incomeSources?.[basis]?.gross ?? 0;
            }),
             // Mock evaluateFormula and executeCustomRule on utils
             utils: {
                 evaluateFormula: jest.fn((formula, context) => {
                     if (formula === 'context.value * 2') return context.value * 2;
                     if (formula === 'currentState.someStateValue + 10') return mockTaxman.currentState.someStateValue + 10;
                     return 999; // Default
                 }),
                 executeCustomRule: jest.fn((identifier, context) => {
                     if (identifier === 'customValue123') return 123;
                     return 0; // Default
                 }),
             },
        };

        mockTaxman = {
            // Properties accessed by IncomeTaxCalculator
            taxConfig: {}, // Will be set per test group if needed
            currentState: { // Basic state
                year: 2024,
                age: 40,
                filingStatus: 'single',
                dependents: [],
                expenses: {},
                // ... other state if needed by rules
            },
            totalGrossIncome: 0,
            incomeSources: { // Basic structure
                employment: { gross: 0, pensionContribAmount: 0 },
                // ... other sources if needed
            },
            // Ensure calculated object is reset cleanly each time
            calculated: {},
            expenses: {},
            dependents: [],
            filingStatus: 'single',
            age: 40,
            isCouple: false,
            _getIncomeSourceGross: jest.fn(type => mockTaxman.incomeSources[type]?.gross || 0),
        };
         // Initialize calculated object structure within beforeEach AFTER mockTaxman is defined
         mockTaxman.calculated = {
            adjustedGrossIncome: 0,
            pensionContributionReliefAmount: 0,
            personalAllowanceAmount: 0,
            standardDeductionAmount: 0,
            itemizedDeductionAmount: 0,
            taxableIncome: 0,
            incomeTax: 0,
            totalNonRefundableCredits: 0,
            totalRefundableCredits: 0,
            totalCredits: 0,
        };


        // Instantiate the calculator with mocks - MOVED TO INDIVIDUAL TESTS
        // incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);

        // Define a simple default config structure
        simpleTaxConfig = {
            incomeTax: {
                filingStatusRules: {
                    single: { // Rules for 'single' status
                        personalAllowances: [],
                        standardDeductions: [],
                        itemizedDeductions: [],
                        taxCalculationMethod: { method: 'brackets', taxBase: 'taxableIncome', brackets: [] },
                        taxCredits: [],
                    }
                },
                incomeAdjustments: [],
                allowChoiceBetweenStandardAndItemizedDeduction: true,
            },
            pensionRules: {
                contributionTaxTreatment: []
            },
            systemSettings: {}
        };
        mockTaxman.taxConfig = simpleTaxConfig; // Assign the simple config
    });

    // --- Test calculateAdjustments ---
    describe('calculateAdjustments', () => {
        it('should calculate AGI equal to gross income if no adjustments', () => {
            mockTaxman.totalGrossIncome = 50000;
            // Reset relevant calculated properties
            mockTaxman.calculated.adjustedGrossIncome = 0;
            // Removed duplicate reset lines

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateAdjustments();
            expect(mockTaxman.calculated.adjustedGrossIncome).toBe(50000);
            expect(mockTaxman.calculated.pensionContributionReliefAmount).toBe(0);
        });

        it('should apply a simple fixed deduction adjustment', () => {
            mockTaxman.totalGrossIncome = 60000;
            // Define test-specific config
            mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [
                        { name: 'Simple Deduction', type: 'deduction', calculationRule: { method: 'fixedAmount', value: 5000 } } // Added method
                    ],
                    filingStatusRules: { single: {} } // Ensure structure exists
                },
                pensionRules: {}, systemSettings: {}
            };
            // Reset relevant calculated properties
            mockTaxman.calculated.adjustedGrossIncome = 0;
            // No need to override calculateValue here, the beforeEach mock should handle it

            // Log the config array *before* calling the method
            // console.log("[THEORY TEST] Adjustments in mockTaxman.taxConfig before call:", JSON.stringify(mockTaxman.taxConfig.incomeTax.incomeAdjustments)); // Removed log
            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateAdjustments();
            // console.log("[DEBUG] Test 'should apply a simple fixed deduction adjustment' - AGI after calc:", mockTaxman.calculated.adjustedGrossIncome); // Removed log
            expect(mockTaxman.calculated.adjustedGrossIncome).toBe(55000);
        });

        it('should calculate pension contribution relief as a deduction', () => {
            mockTaxman.totalGrossIncome = 70000;
            mockTaxman.incomeSources.employment = { gross: 70000, pensionContribAmount: 4000 };
            // Define test-specific config
             mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [], // Keep empty if not testing adjustments here
                    filingStatusRules: { single: {} }
                },
                pensionRules: {
                    contributionTaxTreatment: [
                        { treatmentType: 'deduction', limitRule: { value: 10000 } }
                    ]
                },
                systemSettings: {}
            };
            // Reset relevant calculated properties
            mockTaxman.calculated.adjustedGrossIncome = 0;
            mockTaxman.calculated.pensionContributionReliefAmount = 0;

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateAdjustments();
            expect(mockTaxman.calculated.adjustedGrossIncome).toBe(66000); // 70000 - 4000
            expect(mockTaxman.calculated.pensionContributionReliefAmount).toBe(4000);
        });
    });

    // --- Test calculateDeductionsAndAllowances ---
    describe('calculateDeductionsAndAllowances', () => {
        beforeEach(() => {
            // Assume AGI is calculated for these tests
            mockTaxman.calculated.adjustedGrossIncome = 50000;
        });

        it('should calculate taxable income after a personal allowance (using percentage method)', () => {
            mockTaxman.calculated.adjustedGrossIncome = 50000; // AGI for basis
            // Define test-specific config with percentage allowance
            mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [],
                    filingStatusRules: {
                        single: {
                            personalAllowances: [
                                {
                                    name: 'Percentage Allowance',
                                    calculationRule: {
                                        method: 'percentage',
                                        basis: 'adjustedGrossIncome', // Base calculation on AGI
                                        value: 0.10 // 10% of AGI
                                    }
                                }
                            ],
                            standardDeductions: [], itemizedDeductions: [],
                            taxCalculationMethod: {}, taxCredits: []
                        }
                    },
                    allowChoiceBetweenStandardAndItemizedDeduction: true
                },
                pensionRules: {}, systemSettings: {}
            };
            mockTaxman.calculated.personalAllowanceAmount = 0;
            mockTaxman.calculated.taxableIncome = 0;

            // Instantiate calculator
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateDeductionsAndAllowances();

            // Expected allowance: 10% of 50000 = 5000
            expect(mockTaxman.calculated.personalAllowanceAmount).toBe(5000);
            // Expected taxable income: 50000 AGI - 5000 Allowance = 45000
            expect(mockTaxman.calculated.taxableIncome).toBe(45000);
            // Verify calculateValue was called correctly
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.10 }),
                expect.any(Object) // Context object
            );
        });

        it('should calculate taxable income after a personal allowance (using lookup method based on age)', () => {
            mockTaxman.calculated.adjustedGrossIncome = 50000;
            mockTaxman.currentState.age = 65; // Set age for lookup
            // Define test-specific config with lookup allowance
            mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [],
                    filingStatusRules: {
                        single: {
                            personalAllowances: [
                                {
                                    name: 'Age Based Allowance',
                                    calculationRule: {
                                        method: 'lookup',
                                        basis: 'age', // Lookup based on age
                                        lookupTable: [
                                            { key: 40, value: 10000 }, // Value for age 40
                                            { key: 65, value: 15000 }  // Value for age 65
                                        ]
                                    }
                                }
                            ],
                            standardDeductions: [], itemizedDeductions: [],
                            taxCalculationMethod: {}, taxCredits: []
                        }
                    },
                    allowChoiceBetweenStandardAndItemizedDeduction: true
                },
                pensionRules: {}, systemSettings: {}
            };
            mockTaxman.calculated.personalAllowanceAmount = 0;
            mockTaxman.calculated.taxableIncome = 0;

            // Instantiate calculator
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateDeductionsAndAllowances();

            // Expected allowance (for age 65): 15000
            expect(mockTaxman.calculated.personalAllowanceAmount).toBe(15000);
            // Expected taxable income: 50000 AGI - 15000 Allowance = 35000
            expect(mockTaxman.calculated.taxableIncome).toBe(35000);
            // Verify calculateValue was called correctly
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'lookup', basis: 'age' }),
                expect.any(Object)
            );
        });

        it('should calculate taxable income using standard deduction (percentage method)', () => {
            mockTaxman.calculated.adjustedGrossIncome = 50000;
            // Define test-specific config
             mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [],
                    filingStatusRules: {
                        single: {
                            personalAllowances: [], // Ensure empty
                            standardDeductions: [
                                {
                                    name: 'Standard Deduction Pct',
                                    calculationRule: {
                                        method: 'percentage',
                                        basis: 'adjustedGrossIncome',
                                        value: 0.20 // 20% of AGI
                                    }
                                }
                            ],
                            itemizedDeductions: [], // Ensure empty
                            taxCalculationMethod: {}, taxCredits: []
                        }
                    },
                    allowChoiceBetweenStandardAndItemizedDeduction: true
                },
                pensionRules: {}, systemSettings: {}
            };
            // Reset relevant calculated properties
            mockTaxman.calculated.standardDeductionAmount = 0;
            mockTaxman.calculated.taxableIncome = 0;

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateDeductionsAndAllowances();

            // Expected deduction: 20% of 50000 = 10000
            expect(mockTaxman.calculated.standardDeductionAmount).toBe(10000);
            expect(mockTaxman.calculated.taxableIncome).toBe(40000); // 50000 AGI - 10000 Deduction
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.20 }),
                expect.any(Object)
            );
        });

         it('should choose the higher of standard (fixed) vs itemized (percentage) deduction if allowed', () => {
            mockTaxman.calculated.adjustedGrossIncome = 80000; // Use a different AGI
            // Define test-specific config
             mockTaxman.taxConfig = {
                incomeTax: {
                    incomeAdjustments: [],
                    filingStatusRules: {
                        single: {
                            personalAllowances: [],
                            standardDeductions: [
                                { name: 'Standard Deduction Fixed', calculationRule: { method: 'fixedAmount', value: 12000 } }
                            ],
                            itemizedDeductions: [
                                 {
                                     name: 'Mock Itemized Pct',
                                     calculationRule: {
                                         method: 'percentage',
                                         basis: 'adjustedGrossIncome',
                                         value: 0.10 // 10% of AGI
                                     },
                                     // Add expense type mapping if needed by calculator logic (though mock bypasses it)
                                     expenseTypes: ['Mock Itemized Pct']
                                 }
                            ],
                            taxCalculationMethod: {}, taxCredits: []
                        }
                    },
                    allowChoiceBetweenStandardAndItemizedDeduction: true
                },
                pensionRules: {}, systemSettings: {}
            };
            // Add mock expense data
            mockTaxman.expenses['Mock Itemized Pct'] = 5000; // Need some expense amount > 0

            // Reset relevant calculated properties
            mockTaxman.calculated.standardDeductionAmount = 0;
            mockTaxman.calculated.itemizedDeductionAmount = 0;
            mockTaxman.calculated.taxableIncome = 0;

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateDeductionsAndAllowances(); // Execute the function

            // Assertions
            // Standard deduction = 12000 (fixed)
            // Itemized deduction = 10% of 80000 = 8000
            expect(mockTaxman.calculated.standardDeductionAmount).toBe(12000);
            expect(mockTaxman.calculated.itemizedDeductionAmount).toBe(8000); // Verify itemized amount was stored
            // Taxable income = 80000 AGI - max(12000, 8000) = 80000 - 12000 = 68000
            expect(mockTaxman.calculated.taxableIncome).toBe(68000);
             // Verify calculateValue calls
             expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                 expect.objectContaining({ method: 'fixedAmount', value: 12000 }),
                 expect.any(Object)
             );
             expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                 expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.10 }),
                 expect.objectContaining({ expenseAmount: 5000 }) // Check context passed
             );
        });
    });


    // --- Test calculateIncomeTax ---
    describe('calculateIncomeTax', () => {
        beforeEach(() => {
            // Assume taxable income is calculated
            mockTaxman.calculated.taxableIncome = 40000;
        });

        it('should calculate tax using simple brackets', () => {
            // Modify config *before* calling the method
            simpleTaxConfig.incomeTax.filingStatusRules.single.taxCalculationMethod = {
                method: 'brackets',
                taxBase: 'taxableIncome',
                brackets: [
                    { threshold: 10000, rate: 0.10 },
                    { threshold: 50000, rate: 0.20 },
                    { rate: 0.30 } // Above 50000
                ]
            };

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateIncomeTax();

            // Expected tax: (10000 * 0.10) + (30000 * 0.20) = 1000 + 6000 = 7000
            expect(mockTaxman.calculated.incomeTax).toBeCloseTo(7000);
            expect(mockSchemaEvaluator.calculateBracketTax).toHaveBeenCalledWith(
                simpleTaxConfig.incomeTax.filingStatusRules.single.taxCalculationMethod.brackets,
                40000 // Taxable income
            );
        });
    });

    // --- Test calculateCredits ---
    describe('calculateCredits', () => {
         beforeEach(() => {
            // Assume AGI is calculated for phase-outs etc.
            mockTaxman.calculated.adjustedGrossIncome = 60000;
        });

        it('should calculate a non-refundable credit (percentage method)', () => {
            mockTaxman.calculated.adjustedGrossIncome = 60000;
            simpleTaxConfig.incomeTax.filingStatusRules.single.taxCredits.push({
                name: 'Pct NonRef Credit',
                type: 'nonRefundable',
                calculationRule: {
                    method: 'percentage',
                    basis: 'adjustedGrossIncome',
                    value: 0.05 // 5% of AGI
                }
            });

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateCredits();

            // Expected credit: 5% of 60000 = 3000
            expect(mockTaxman.calculated.totalNonRefundableCredits).toBe(3000);
            expect(mockTaxman.calculated.totalRefundableCredits).toBe(0);
            expect(mockTaxman.calculated.totalCredits).toBe(3000);
            expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.05 }),
                expect.any(Object)
            );
        });

         it('should calculate a refundable credit (percentage method)', () => {
             mockTaxman.calculated.adjustedGrossIncome = 60000;
            simpleTaxConfig.incomeTax.filingStatusRules.single.taxCredits.push({
                name: 'Pct Ref Credit',
                type: 'refundable',
                 calculationRule: {
                    method: 'percentage',
                    basis: 'adjustedGrossIncome',
                    value: 0.02 // 2% of AGI
                }
            });

            // Instantiate calculator for this test
            incomeTaxCalculator = new IncomeTaxCalculator(mockTaxman, mockSchemaEvaluator);
            incomeTaxCalculator.calculateCredits();

             // Expected credit: 2% of 60000 = 1200
            expect(mockTaxman.calculated.totalNonRefundableCredits).toBe(0);
            expect(mockTaxman.calculated.totalRefundableCredits).toBe(1200);
            expect(mockTaxman.calculated.totalCredits).toBe(1200);
             expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'percentage', basis: 'adjustedGrossIncome', value: 0.02 }),
                expect.any(Object)
            );
        });
    });

});