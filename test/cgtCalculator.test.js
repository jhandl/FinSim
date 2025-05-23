// test/cgtCalculator.test.js

const CapitalGainsTaxCalculator = require('../src/core/tax/CapitalGainsTaxCalculator');
const SchemaEvaluator = require('../src/core/tax/SchemaEvaluator'); // Assuming dependency

// Mock SchemaEvaluator if needed, similar to incomeTaxCalculator.test.js
jest.mock('../src/core/tax/SchemaEvaluator');

describe('CapitalGainsTaxCalculator', () => {
    let calculator;
    let mockTaxman; // Mock Taxman instance to hold config and state
    let mockSchemaEvaluator;

    beforeEach(() => {
        // Reset mocks
        // SchemaEvaluator.mockClear(); // We are not mocking the class anymore

        // Create a more robust mock instance for SchemaEvaluator
        mockSchemaEvaluator = {
            calculateValue: jest.fn((rule, context) => {
                // Generalized mock based on method
                if (!rule || !rule.method) return 0;
                const basisValue = mockSchemaEvaluator.getBasisValue(rule.basis, context); // Use mocked getBasisValue
                let calculatedValue = 0;
                switch (rule.method) {
                    case 'fixedAmount': calculatedValue = rule.value ?? 0; break;
                    case 'percentage': calculatedValue = basisValue * (rule.value ?? 0); break;
                    // Add other methods if needed for CGT tests (e.g., lookup)
                    default: calculatedValue = rule.value ?? 0; // Fallback for simplicity in CGT tests
                }
                 // Apply min/max if present
                 if (rule.minValue !== undefined) calculatedValue = Math.max(calculatedValue, rule.minValue);
                 if (rule.maxValue !== undefined) calculatedValue = Math.min(calculatedValue, rule.maxValue);
                 return calculatedValue;
            }),
            evaluateCondition: jest.fn().mockReturnValue(true), // Default mock
            calculateBracketTax: jest.fn((brackets, income) => income * 0.2), // Simple mock if needed
            getBasisValue: jest.fn((basis, context) => { // Mock getBasisValue
                 if (!basis) return 0;
                 if (context && context[basis] !== undefined) return context[basis];
                 return mockTaxman?.calculated?.[basis] ?? mockTaxman?.currentState?.[basis] ?? 0;
            }),
             getIncomeBracketLabel: jest.fn().mockReturnValue('standard'), // Mock if integrated rates used
             getMarginalIncomeRate: jest.fn().mockReturnValue(0.25), // Mock if integrated rates used
            // Mock other methods if used by CGT calculator
        };
        // No need for SchemaEvaluator.mockImplementation if we pass the instance directly

        // Basic mock Taxman structure needed by the calculator
        mockTaxman = {
            taxConfig: {
                capitalGainsTax: {
                    "description": "Mock CGT Rules",
                    "annualExemption": {
                         "calculationRule": { "method": "fixedAmount", "value": 12300 }, // Use CalculationRule
                         "appliesPer": "individual"
                    },
                    "holdingPeriods": [ // Define periods if needed by rules
                        { "label": "shortTerm", "maxMonths": 12 },
                        { "label": "longTerm", "minMonths": 12.01 }
                    ],
                    "taxationMethod": {
                        "method": "flatRate",
                        "flatRateRule": { "method": "fixedAmount", "value": 0.20 } // Use CalculationRule
                    },
                    "ratesByAssetAndHolding": [
                        // Rule for regular shares (using flat rate from taxationMethod)
                        {
                            "assetType": "shares",
                            "holdingPeriodLabel": "any"
                            // No specific applicableRateRule, will use taxationMethod.flatRateRule
                        },
                        // Rule for index funds with deemed disposal
                        {
                            "assetType": "index_fund", // Matches type used in Equities.js
                            "holdingPeriodLabel": "any",
                            "deemedDisposalRule": {
                                "applies": true,
                                "periodYearsRule": { "method": "fixedAmount", "value": 8 }, // Use CalculationRule
                                "taxRateRule": { "method": "fixedAmount", "value": 0.41 }, // Use CalculationRule
                                "description": "8-year deemed disposal for index funds"
                            }
                            // Could add an 'applicableRate' here for regular sales if different
                        },
                         // Rule for property (using flat rate)
                        {
                            "assetType": "property",
                            "holdingPeriodLabel": "any"
                        }
                    ],
                    "lossTreatment": {
                        "offsetGains": {
                            "allowWithinSameAssetType": true,
                            "allowAcrossAssetTypes": false, // Test basic same-type offset first
                            "allowAgainstHoldingPeriod": "any"
                        },
                        "offsetAgainstIncome": { // Updated structure from Design.md
                            "enabled": false, // Disabled for most tests, enable specifically
                            "limitRule": { "method": "fixedAmount", "value": 3000 } // Example limit rule
                        },
                        "carryforward": {
                            "allowed": true,
                            "durationYears": null, // Indefinite
                            "type": "combined" // Losses combined for carryforward
                        }
                    }
                } // End capitalGainsTax
            },
            currentState: { // Provide minimal state if needed
                year: 2024,
                filingStatus: 'single',
                cgtLossCarryforward: {},
                assets: [] // Initialize assets array, specific tests will populate this based on purchaseYear/currentYear
                // ... other state properties like age, income if needed by complex rules
            },
            calculated: { // Store intermediate results if needed
                taxableIncome: 50000 // Example value if rates depend on income bands
            },
            // Provide the evaluator instance
            evaluator: mockSchemaEvaluator, // Assuming calculator accesses it via this.taxman.evaluator if needed elsewhere
            // Mock utils if the calculator uses this.taxman.utils directly
            utils: {
                 evaluateFormula: jest.fn(),
                 executeCustomRule: jest.fn(),
            },
            // Mock other Taxman methods/properties if needed
        };

        // Pass the mock Taxman instance AND the mocked evaluator instance
        calculator = new CapitalGainsTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.reset(); // Ensure clean state for each test
    });

    test('should declare and aggregate gains/losses correctly by type', () => {
        calculator.declareGainOrLoss({ type: 'shares', amount: 10000, costBasis: 5000, proceeds: 15000 }); // Use amount
        calculator.declareGainOrLoss({ type: 'shares', amount: 5000, costBasis: 2000, proceeds: 7000 }); // Use amount
        calculator.declareGainOrLoss({ type: 'property', amount: -3000, costBasis: 50000, proceeds: 47000 }); // Use amount (negative for loss)
        calculator.declareGainOrLoss({ type: 'shares', amount: -2000, costBasis: 10000, proceeds: 8000 }); // Use amount (negative for loss)

        const result = calculator.calculateCapitalGainsTax();

        // This reflects net gains *after* same-type and cross-type loss offsetting (as currently implemented)
        // Shares: 15000 gain - 2000 shares loss - 3000 property loss = 10000 net gain
        // Property: 0 gain - 3000 property loss (offset against shares) = 0 net gain
        // This reflects net gains *after* same-type loss offsetting ONLY.
        // Shares: 15000 gain - 2000 shares loss = 13000 net gain
        // Property: 0 gain - 3000 property loss (loss becomes carryforward) = 0 net gain
        expect(result.details.totalNetGainsByType).toEqual({
            shares: 13000,
            property: 0
        });
        expect(result.totalGrossGains).toBe(15000); // 10000 + 5000
        expect(result.totalLossesDeclared).toBe(5000); // 3000 + 2000
    });

    test('should apply annual exemption correctly (using calculationRule)', () => {
        const exemptionAmount = 1000;
        const flatRate = 0.20;
        // Update mock config to use calculationRule for exemption
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod.flatRateRule = { method: 'fixedAmount', value: flatRate };

        // Configure mock evaluator to return the values based on the rules
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             if (rule.method === 'fixedAmount' && rule.value === flatRate) return flatRate; // Return the rate itself
             return 0;
        });

        // Gain less than exemption
        calculator.declareGainOrLoss({ type: 'shares', amount: 500 }); // Use amount
        let result = calculator.calculateCapitalGainsTax();
        expect(result.taxableGains).toBeCloseTo(0);
        expect(result.taxDue).toBe(0);
        expect(result.details.exemptionUsed).toBe(500);

        // Gain equal to exemption
        calculator.reset();
        calculator.declareGainOrLoss({ type: 'shares', amount: 1000 }); // Use amount
        result = calculator.calculateCapitalGainsTax();
        expect(result.taxableGains).toBeCloseTo(0);
        expect(result.taxDue).toBe(0);
        expect(result.details.exemptionUsed).toBe(1000);

        // Gain greater than exemption
        calculator.reset();
        calculator.declareGainOrLoss({ type: 'shares', amount: 2500 }); // Use amount
        result = calculator.calculateCapitalGainsTax();
        expect(result.taxableGains).toBeCloseTo(1500); // 2500 - 1000
        expect(result.taxDue).toBeCloseTo(300); // 1500 * 20%
        expect(result.details.exemptionUsed).toBe(1000);
        // Verify calculateValue was called for the exemption rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: exemptionAmount }),
            expect.any(Object) // Context
        );
    });

    test('should apply basic flat rate correctly (using calculationRule)', () => {
        const exemptionAmount = 1000;
        const flatRate = 0.20;
        // Update mock config to use calculationRule
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod.flatRateRule = { method: 'fixedAmount', value: flatRate };
        // Mock evaluator
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             if (rule.method === 'fixedAmount' && rule.value === flatRate) return flatRate;
             return 0;
        });


        calculator.declareGainOrLoss({ type: 'shares', amount: 5000 }); // Use amount
        const result = calculator.calculateCapitalGainsTax();

        expect(result.taxableGains).toBeCloseTo(4000); // 5000 - 1000 exemption
        expect(result.taxDue).toBeCloseTo(800); // 4000 * 20%
        // Verify calculateValue was called for the rate rule via _getRateInfoForCGT
        // Note: This is an indirect check. We trust _getRateInfoForCGT calls calculateValue.
        // A more direct test could spy on _getRateInfoForCGT or calculateValue.
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: flatRate }),
            expect.any(Object) // Context passed to _getRateInfoForCGT
        );
    });

     test('should apply percentage rate correctly (using calculationRule)', () => {
        const exemptionAmount = 1000;
        const percentageRate = 0.15; // 15%
        mockTaxman.calculated.taxableIncome = 50000; // Example basis for percentage rate
        // Update mock config to use flatRate method with a percentage rule for the rate
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod = {
             method: 'flatRate', // Use standard flatRate method
             flatRateRule: { method: 'percentage', basis: 'taxableIncome', value: percentageRate } // Rate is calculated via percentage rule
        };
         // Mock calculateValue specifically for this test's rules
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             // This mock should return the *rate* (0.15) when the percentage rule is passed
             if (rule.method === 'percentage' && rule.basis === 'taxableIncome' && rule.value === percentageRate) {
                 return percentageRate;
             }
             return 0;
        });
         // Mock getBasisValue for taxableIncome
         mockSchemaEvaluator.getBasisValue.mockImplementation((basis, context) => {
             if (basis === 'taxableIncome') return 50000;
             // Add specific handling for the percentage rate rule if needed by this test
             if (rule.method === 'percentage' && rule.basis === 'taxableIncome') {
                 const basisVal = mockSchemaEvaluator.getBasisValue(rule.basis, context);
                 // Return the rate value itself, not the calculated tax amount
                 return rule.value ?? 0;
             }
             return 0;
         });

        calculator.declareGainOrLoss({ type: 'shares', amount: 5000 });
        const result = calculator.calculateCapitalGainsTax();

        const expectedRateValue = 50000 * 0.15; // Rate is 15% of 50k = 7500 (This seems wrong, rate should be 0.15)
        // Let's assume the rate *value* is 0.15
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             if (rule.method === 'percentage' && rule.basis === 'taxableIncome') return percentageRate; // Return the rate 0.15
             // Removed extra brace here
             return 0; // Default for other unexpected calls
        });


        const taxableGain = 4000; // 5000 - 1000 exemption
        expect(result.taxableGains).toBeCloseTo(taxableGain);
        expect(result.taxDue).toBeCloseTo(taxableGain * percentageRate); // 4000 * 15% = 600
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'percentage', basis: 'taxableIncome', value: percentageRate }),
            expect.any(Object)
        );
    });


    test('should offset losses within the year for the same type', () => {
        const exemptionAmount = 1000;
        const flatRate = 0.20;
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod.flatRateRule = { method: 'fixedAmount', value: flatRate };
        // Mock evaluator
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             if (rule.method === 'fixedAmount' && rule.value === flatRate) return flatRate;
             return 0;
        });

        calculator.declareGainOrLoss({ type: 'shares', amount: 10000 }); // Use amount
        calculator.declareGainOrLoss({ type: 'shares', amount: -3000 }); // Use amount
        const result = calculator.calculateCapitalGainsTax();

        expect(result.details.totalNetGainsByType).toEqual({ shares: 7000 });
        expect(result.taxableGains).toBeCloseTo(6000); // 7000 net gain - 1000 exemption
        expect(result.taxDue).toBe(1200); // 6000 * 20%
        expect(result.details.lossesOffsetCurrentYear).toBe(3000);
        expect(result.lossCarryforward).toBe(0);
    });

     test('should calculate loss carryforward correctly when losses exceed gains', () => {
        const exemptionAmount = 1000;
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        // Mock evaluator - exemption shouldn't be calculated if net loss
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) {
                 // This shouldn't be called ideally, but mock defensively
                 return exemptionAmount;
             }
             return 0; // No rate needed, no tax due
        });

        calculator.declareGainOrLoss({ type: 'shares', amount: 5000 }); // Use amount
        calculator.declareGainOrLoss({ type: 'shares', amount: -8000 }); // Use amount
        calculator.declareGainOrLoss({ type: 'property', amount: -2000 }); // Use amount

        const result = calculator.calculateCapitalGainsTax();

        // Note: The calculator now calculates net gains *after* offsetting.
        // A net loss for a type means the gain for that type is 0 after offsetting.
        // The remaining loss is tracked in lossCarryforwardByType.
        // So, totalNetGainsByType should reflect the gains *after* offsetting but *before* exemption.
        // In this case, shares gain 5000 is offset by 5000 of the 8000 loss. Net gain for shares is 0. Property has no gain.
        expect(result.details.totalNetGainsByType).toEqual({ shares: 0, property: 0 });
        expect(result.taxableGains).toBe(0);
        expect(result.taxDue).toBe(0);
        expect(result.details.lossesOffsetCurrentYear).toBe(5000); // Loss offset gain within 'shares'
        expect(result.lossCarryforward).toBe(5000); // Remaining 3000 shares loss + 2000 property loss
        expect(result.details.lossCarryforwardByType).toEqual({ shares: { shortTerm: 3000, longTerm: 0 }, property: { shortTerm: 2000, longTerm: 0 } }); // Assuming losses were short-term based on test setup
    });

    test('should use loss carryforward from previous year', () => {
        const exemptionAmount = 1000;
        const flatRate = 0.20;
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemptionAmount };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod.flatRateRule = { method: 'fixedAmount', value: flatRate };
        // Mock evaluator
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === exemptionAmount) return exemptionAmount;
             if (rule.method === 'fixedAmount' && rule.value === flatRate) return flatRate;
             return 0;
        });

        // Simulate carryforward input from currentState
        mockTaxman.currentState.cgtLossCarryforward = { shares: 2000, property: 500 };

        // Re-instantiate with updated state
        calculator = new CapitalGainsTaxCalculator(mockTaxman, mockSchemaEvaluator); // Pass evaluator

        calculator.declareGainOrLoss({ type: 'shares', amount: 7000 }); // Use amount
        const result = calculator.calculateCapitalGainsTax();

        expect(result.details.totalNetGainsByType).toEqual({ shares: 5000 }); // 7000 gain - 2000 loss carryforward offset
        expect(result.details.lossesBroughtForward).toBe(2500);
        expect(result.details.lossesOffsetCurrentYear).toBe(2000); // Offset shares gain with shares loss carryforward
        expect(result.taxableGains).toBeCloseTo(4000); // 7000 gain - 2000 loss carryforward - 1000 exemption
        expect(result.taxDue).toBe(800); // 4000 * 20%
        expect(result.lossCarryforward).toBe(500); // Remaining property loss carryforward
        expect(result.details.lossCarryforwardByType).toEqual({ property: { shortTerm: 0, longTerm: 500 } }); // Assuming loss was long-term based on test setup
    });

     test('should apply loss offset against income limit correctly (using calculationRule)', () => {
        const limitAmount = 2500;
        // Enable offset against income and set the limit rule
        mockTaxman.taxConfig.capitalGainsTax.lossTreatment.offsetAgainstIncome = {
            enabled: true,
            limitRule: { method: 'fixedAmount', value: limitAmount }
        };
        // Mock evaluator to return the limit AND handle the annual exemption call
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            const exemptionRule = mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule;
            const limitRule = mockTaxman.taxConfig.capitalGainsTax.lossTreatment.offsetAgainstIncome.limitRule;

            // Check if the passed rule matches the limitRule structure
            if (rule && limitRule && rule.method === limitRule.method && rule.value === limitRule.value) {
                // console.log("[DEBUG MOCK] Limit rule called");
                return limitAmount;
            }
            // Check if the passed rule matches the exemptionRule structure
            if (rule && exemptionRule && rule.method === exemptionRule.method && rule.value === exemptionRule.value) {
                 // console.log("[DEBUG MOCK] Exemption rule called in offset test, returning 0");
                 return 0; // Return 0 for exemption in this specific test
            }
            // console.warn("[DEBUG MOCK] Unexpected calculateValue call in offset test:", rule);
            return 0; // Default for any other calls
        });

        calculator.declareGainOrLoss({ type: 'shares', amount: -8000 }); // 8000 loss

        const result = calculator.calculateCapitalGainsTax();

        expect(result.lossCarryforward).toBe(5500); // 8000 total loss - 2500 offset limit
        expect(result.details.lossOffsetAgainstIncome).toBe(limitAmount); // Amount offset is the limit
        // Verify calculateValue was called for the limit rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: limitAmount }),
            expect.any(Object) // Context
        );
    });


    // --- Unrealized Gains Tax Tests ---

    test('should NOT calculate unrealized gains tax if holding period is below threshold', () => {
        mockTaxman.currentState.year = 2024;
        mockTaxman.currentState.assets = [
            { id: 'fund1', type: 'index_fund', purchaseYear: 2017, value: 15000, costBasis: 10000 } // Held 7 years
        ];
        // Mock evaluator for period and rate rules (shouldn't be called for period check)
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period years
             // Rate rule shouldn't be called if period doesn't match
             if (rule.method === 'fixedAmount' && rule.value === 0.41) return 0.41;
             return 0;
        });

        const result = calculator.calculateCapitalGainsTax();

        expect(result.unrealizedGainsTax.taxAmount).toBe(0);
        expect(result.unrealizedGainsTax.taxableAmount).toBe(0);
        expect(result.unrealizedGainsTax.details.length).toBe(0);
        expect(result.taxDue).toBe(0); // Assuming no other gains/losses declared
        expect(result.costBasisUpdates.length).toBe(0);
        // Verify calculateValue was called for the period rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 8 }), // periodYearsRule
            expect.any(Object)
        );
        // Verify calculateValue was NOT called for the rate rule
        expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 0.41 }), // taxRateRule
            expect.any(Object)
        );
    });

    test('should NOT calculate unrealized gains tax if asset type does not match rule', () => {
        mockTaxman.currentState.year = 2024;
        mockTaxman.currentState.assets = [
            { id: 'share1', type: 'shares', purchaseYear: 2016, value: 15000, costBasis: 10000 } // Held 8 years, but type 'shares' doesn't have deemedDisposalRule
        ];
        // Mock evaluator (only period rule should be called)
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period years
             return 0;
        });

        const result = calculator.calculateCapitalGainsTax();

        expect(result.unrealizedGainsTax.taxAmount).toBe(0);
        expect(result.unrealizedGainsTax.details.length).toBe(0);
        expect(result.costBasisUpdates.length).toBe(0);
    });

     test('should calculate unrealized gains tax correctly when threshold met', () => {
        mockTaxman.currentState.year = 2024;
        const assetValue = 15000;
        const costBasis = 10000;
        const expectedGain = assetValue - costBasis; // 5000
        const expectedRate = 0.41;
        const expectedTax = expectedGain * expectedRate; // 2050

        mockTaxman.currentState.assets = [
            { id: 'fund1', type: 'index_fund', purchaseYear: 2016, value: assetValue, costBasis: costBasis } // Held 8 years
        ];
        // Mock evaluator to return period years and rate based on rules
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period years
             if (rule.method === 'fixedAmount' && rule.value === expectedRate) return expectedRate; // Rate
             return 0;
        });

        const result = calculator.calculateCapitalGainsTax();

        expect(result.unrealizedGainsTax.taxableAmount).toBeCloseTo(expectedGain);
        expect(result.unrealizedGainsTax.taxAmount).toBeCloseTo(expectedTax);
        expect(result.unrealizedGainsTax.details.length).toBe(1);
        expect(result.unrealizedGainsTax.details[0]).toEqual(expect.objectContaining({
            assetId: 'fund1',
            unrealizedGain: expectedGain,
            taxRate: expectedRate,
            taxAmount: expectedTax,
            previousCostBasis: costBasis,
            newValueForBasis: assetValue
        }));
        expect(result.taxDue).toBeCloseTo(expectedTax); // Assumes no other tax
        expect(result.costBasisUpdates.length).toBe(1);
        expect(result.costBasisUpdates[0]).toEqual({ assetId: 'fund1', assetType: 'index_fund', newCostBasis: assetValue });
        // Verify evaluator was called for period rule and rate rule
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: 8 }), // periodYearsRule
            expect.objectContaining({ asset: expect.objectContaining({ id: 'fund1' }) }) // Context
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: expectedRate }), // taxRateRule
            expect.objectContaining({ asset: expect.objectContaining({ id: 'fund1' }), unrealizedGain: expectedGain }) // Context
        );
    });

     test('should NOT apply annual CGT exemption against unrealized gains tax (typical behavior)', () => {
        // Note: Most systems tax unrealized gains separately without the annual exemption.
        // Verify this assumption based on requirements if necessary.
        mockTaxman.currentState.year = 2024;
        const assetValue = 15000;
        const costBasis = 10000;
        const expectedGain = 5000;
        const expectedRate = 0.41;
        const expectedTax = expectedGain * expectedRate; // 2050

        mockTaxman.currentState.assets = [
            { id: 'fund1', type: 'index_fund', purchaseYear: 2016, value: assetValue, costBasis: costBasis }
        ];
        // Mock evaluator for period, rate AND exemption (exemption shouldn't be used for this tax)
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period
             if (rule.method === 'fixedAmount' && rule.value === expectedRate) return expectedRate; // Rate
             if (rule.method === 'fixedAmount' && rule.value === 10000) return 10000; // Exemption amount (from config)
             return 0;
        });
        // Set exemption in config
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: 10000 };

        const result = calculator.calculateCapitalGainsTax();

        expect(result.unrealizedGainsTax.taxableAmount).toBeCloseTo(expectedGain);
        expect(result.unrealizedGainsTax.taxAmount).toBeCloseTo(expectedTax);
        expect(result.taxDue).toBeCloseTo(expectedTax); // Tax is due, exemption not applied here
        expect(result.details.exemptionUsed).toBe(0); // Exemption not used by unrealized gains tax part
        expect(result.costBasisUpdates.length).toBe(1);
    });

     test('should calculate unrealized gains tax alongside regular CGT', () => {
        mockTaxman.currentState.year = 2024;
        const fundValue = 15000;
        const fundCostBasis = 10000;
        const unrealizedGain = fundValue - fundCostBasis; // 5000
        const unrealizedRate = 0.41;
        const unrealizedTax = unrealizedGain * unrealizedRate; // 2050

        const shareGain = 7000;
        const shareRate = 0.20; // From basicRate rule
        const exemption = 1000;
        const taxableShareGain = shareGain - exemption; // 6000
        const shareTax = taxableShareGain * shareRate; // 1200

        // Reset carryforward for this specific test to avoid inheriting state
        mockTaxman.currentState.cgtLossCarryforward = {};
        mockTaxman.currentState.assets = [
            { id: 'fund1', type: 'index_fund', purchaseYear: 2016, value: fundValue, costBasis: fundCostBasis }
        ];
        // Mock evaluator for period, rates, and exemption
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period
             if (rule.method === 'fixedAmount' && rule.value === unrealizedRate) return unrealizedRate; // Unrealized rate
             if (rule.method === 'fixedAmount' && rule.value === shareRate) return shareRate; // Share rate
             if (rule.method === 'fixedAmount' && rule.value === exemption) return exemption; // Exemption
             return 0;
        });
        // Set rules in config
        mockTaxman.taxConfig.capitalGainsTax.annualExemption.calculationRule = { method: 'fixedAmount', value: exemption };
        mockTaxman.taxConfig.capitalGainsTax.taxationMethod.flatRateRule = { method: 'fixedAmount', value: shareRate };
        // Deemed disposal rules are already set in beforeEach config


        // Declare a regular gain
        calculator.declareGainOrLoss({ type: 'shares', amount: shareGain }); // Use amount

        const result = calculator.calculateCapitalGainsTax();

        // Unrealized tax part
        expect(result.unrealizedGainsTax.taxableAmount).toBeCloseTo(unrealizedGain);
        expect(result.unrealizedGainsTax.taxAmount).toBeCloseTo(unrealizedTax);
        expect(result.costBasisUpdates.length).toBe(1);
        expect(result.costBasisUpdates[0]).toEqual({ assetId: 'fund1', assetType: 'index_fund', newCostBasis: fundValue });

        // Regular CGT part
        expect(result.totalGrossGains).toBe(shareGain);
        expect(result.taxableGains).toBe(taxableShareGain);
        expect(result.details.exemptionUsed).toBe(exemption);

        // Total tax
        expect(result.taxDue).toBeCloseTo(unrealizedTax + shareTax);
    });

     test('should handle multiple assets subject to unrealized gains tax', () => {
        mockTaxman.currentState.year = 2024;
        const expectedRate = 0.41;

        mockTaxman.currentState.assets = [
            { id: 'fund1', type: 'index_fund', purchaseYear: 2016, value: 15000, costBasis: 10000 }, // 8 years, Gain=5000
            { id: 'fund2', type: 'index_fund', purchaseYear: 2016, value: 8000, costBasis: 5000 },  // 8 years, Gain=3000
            { id: 'fund3', type: 'index_fund', purchaseYear: 2017, value: 12000, costBasis: 11000 } // 7 years, No tax
        ];
         // Mock evaluator for period and rate
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
             if (rule.method === 'fixedAmount' && rule.value === 8) return 8; // Period
             if (rule.method === 'fixedAmount' && rule.value === expectedRate) return expectedRate; // Rate
             return 0;
        });

        const result = calculator.calculateCapitalGainsTax();

        const expectedGain1 = 5000;
        const expectedTax1 = expectedGain1 * expectedRate;
        const expectedGain2 = 3000;
        const expectedTax2 = expectedGain2 * expectedRate;

        expect(result.unrealizedGainsTax.taxableAmount).toBeCloseTo(expectedGain1 + expectedGain2);
        expect(result.unrealizedGainsTax.taxAmount).toBeCloseTo(expectedTax1 + expectedTax2);
        expect(result.unrealizedGainsTax.details.length).toBe(2); // Only fund1 and fund2 taxed
        expect(result.taxDue).toBeCloseTo(expectedTax1 + expectedTax2);
        expect(result.costBasisUpdates.length).toBe(2);
        expect(result.costBasisUpdates).toEqual(expect.arrayContaining([
            { assetId: 'fund1', assetType: 'index_fund', newCostBasis: 15000 },
            { assetId: 'fund2', assetType: 'index_fund', newCostBasis: 8000 }
        ]));
    });

    // TODO: Add tests for interaction with loss carryforward if rules specify interaction.
    // Typically, unrealized gains tax is due even if there are carried-forward losses from sales.

});