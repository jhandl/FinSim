// test/taxman.test.js

// Require the necessary classes directly
// Node.js/Jest will use the module.exports we added.
const Taxman = require('../src/core/Taxman');
// Require dependencies needed for Taxman constructor (even if not directly used in this basic test)
const SchemaEvaluator = require('../src/core/tax/SchemaEvaluator');
const IncomeTaxCalculator = require('../src/core/tax/IncomeTaxCalculator');
const SocialContributionsCalculator = require('../src/core/tax/SocialContributionsCalculator');
const CapitalGainsTaxCalculator = require('../src/core/tax/CapitalGainsTaxCalculator');
const InvestmentIncomeTaxCalculator = require('../src/core/tax/InvestmentIncomeTaxCalculator');
const WealthTaxCalculator = require('../src/core/tax/WealthTaxCalculator');
const PropertyTaxCalculator = require('../src/core/tax/PropertyTaxCalculator');

describe('Taxman Core Logic Tests', () => {
    let validConfig; // Define in outer scope
    let minimalContext; // Define in outer scope
    let taxman;

    beforeEach(() => {
        // Assign values in outer beforeEach
        validConfig = { schemaName: "GenericTaxSystem", schemaVersion: "1.0", countryCode: "XX", capitalGainsTax: { holdingPeriods: [{ label: 'shortTerm', maxMonths: 12 }, { label: 'longTerm', minMonths: 12.01 }] } };
        minimalContext = {
            evaluateFormula: jest.fn((formula, vars) => 0),
            executeCustomRule: jest.fn((identifier, context) => null),
            isBetween: (num, min, max) => (num >= min && num <= max)
        };
        taxman = new Taxman(validConfig, minimalContext); // Instantiate taxman for general tests
        // Removed log check
        // Removed log check
    });

    // --- Instantiation Tests ---
    test('should instantiate successfully with valid config and context', () => {
        const taxman = new Taxman(validConfig, minimalContext);
        expect(taxman).toBeInstanceOf(Taxman);
        expect(taxman.taxConfig).toEqual(validConfig);
        expect(taxman.simContext).toEqual(minimalContext);
        // Check if calculators are instantiated (basic check)
        expect(taxman.incomeTaxCalculator).toBeDefined();
        expect(taxman.cgtCalculator).toBeDefined();
    });

    test('should throw error if config is invalid (missing schemaName)', () => {
        const invalidConfig = { schemaVersion: "1.0", countryCode: "XX" };
        expect(() => {
            new Taxman(invalidConfig, minimalContext);
        }).toThrow("Invalid or missing tax configuration provided to Taxman.");
    });

    test('should throw error if config is missing', () => {
        expect(() => {
            new Taxman(null, minimalContext);
        }).toThrow("Invalid or missing tax configuration provided to Taxman.");
    });

    // --- declareIncome Tests ---
    describe('declareIncome', () => {
        let taxman;
        beforeEach(() => {
            taxman = new Taxman(validConfig, minimalContext);
        });

        test('should correctly add employment income', () => {
            taxman.declareIncome('employment', 50000);
            expect(taxman.incomeSources.employment.gross).toBe(50000);
            expect(taxman.totalGrossIncome).toBe(50000);
            taxman.declareIncome('Salary', 10000); // Test case insensitivity/alias
            expect(taxman.incomeSources.employment.gross).toBe(60000);
            expect(taxman.totalGrossIncome).toBe(60000);
        });

        test('should correctly add multiple income types', () => {
            taxman.declareIncome('employment', 50000);
            taxman.declareIncome('rental', 10000);
            taxman.declareIncome('dividend', 500);
            expect(taxman.incomeSources.employment.gross).toBe(50000);
            expect(taxman.incomeSources.rental.gross).toBe(10000);
            expect(taxman.incomeSources.investment.dividends).toBe(500);
            expect(taxman.totalGrossIncome).toBe(60500);
        });

        test('should handle zero and invalid amounts', () => {
            taxman.declareIncome('employment', 50000);
            taxman.declareIncome('rental', 0);
            taxman.declareIncome('dividend', NaN);
            taxman.declareIncome('interest', null);
            expect(taxman.totalGrossIncome).toBe(50000);
        });

        test('should calculate pension contribution from employment income', () => {
            taxman.declareIncome('employment', 60000, { pensionContribRate: 0.1 });
            expect(taxman.incomeSources.employment.gross).toBe(60000);
            expect(taxman.incomeSources.employment.pensionContribAmount).toBe(6000);
            expect(taxman.totalGrossIncome).toBe(60000);
        });
    });

    // --- reset Tests ---
    describe('reset', () => {
        let taxman;
        beforeEach(() => {
            taxman = new Taxman(validConfig, minimalContext);
            // Add some initial state
            taxman.declareIncome('employment', 50000);
            // Pass gain/loss details as a single object
            taxman.declareCapitalGainOrLoss({ type: 'shares', amount: 1000, holdingPeriodYears: 0.5 }); // Example short term gain
            taxman.calculated.incomeTax = 5000; // Simulate previous calculation
        });

        test('should reset income sources and totals', () => {
            taxman.reset({});
            expect(taxman.incomeSources.employment.gross).toBe(0);
            expect(taxman.incomeSources.employment.pensionContribAmount).toBe(0);
            expect(taxman.incomeSources.investment.dividends).toBe(0);
            expect(taxman.totalGrossIncome).toBe(0);
        });

        test('should reset capital gains entries (but keep carryforward structure)', () => {
            taxman.reset({});
            expect(taxman.capitalGains.entries).toEqual([]);
            expect(taxman.capitalGains.summary.shortTerm.netGain).toBe(0);
            expect(taxman.capitalGains.lossCarryforward).toEqual({ shortTerm: 0, longTerm: 0 }); // Default reset
            expect(taxman.capitalGains.newLossCarryforward).toEqual({ shortTerm: 0, longTerm: 0 });
        });

        test('should reset calculated results', () => {
            taxman.reset({});
            expect(taxman.calculated.incomeTax).toBe(0);
            expect(taxman.calculated.totalTaxLiability).toBe(0);
            expect(taxman.calculated.adjustedGrossIncome).toBe(0);
        });

        test('should update currentState properties', () => {
            const newState = { year: 2025, age: 41, filingStatus: 'marriedJointly', dependents: [{}], cgtLossCarryforward: { shortTerm: 100, longTerm: 200 } };
            taxman.reset(newState);
            expect(taxman.currentState).toEqual(newState);
            expect(taxman.age).toBe(41);
            expect(taxman.filingStatus).toBe('marriedJointly');
            expect(taxman.isCouple).toBe(true);
            expect(taxman.dependents).toHaveLength(1);
            expect(taxman.capitalGains.lossCarryforward).toEqual({ shortTerm: 100, longTerm: 200 }); // Updated from newState
        });
    });

    // --- computeTaxes Tests (with Mocks) ---
    describe('computeTaxes', () => {
        let taxman;
        let minimalState;

        beforeEach(() => {
            taxman = new Taxman(validConfig, minimalContext);
            minimalState = {
                year: 2024, age: 30, filingStatus: 'single', dependents: [],
                expenses: {}, assets: {}, netWorth: 10000,
                cgtLossCarryforward: { shortTerm: 50, longTerm: 150 }
            };

            // --- Mock all calculator methods called by computeTaxes ---
            // We spy on the instance methods directly after instantiation
            jest.spyOn(taxman.incomeTaxCalculator, 'calculateAdjustments').mockImplementation(() => {});
            jest.spyOn(taxman.incomeTaxCalculator, 'calculateDeductionsAndAllowances').mockImplementation(() => {});
            jest.spyOn(taxman.incomeTaxCalculator, 'calculateIncomeTax').mockImplementation(() => { taxman.calculated.incomeTax = 1000; }); // Simulate setting a value
            jest.spyOn(taxman.socialContributionsCalculator, 'calculateContributions').mockImplementation(() => { taxman.calculated.socialContributions = { employee: 500 }; });
            jest.spyOn(taxman.cgtCalculator, 'calculateCapitalGainsTax').mockImplementation(() => { /* Simulate return value */ return { taxDue: 200, lossCarryforward: 0, details: { lossCarryforwardByType: { shortTerm: 10, longTerm: 20 } } }; });
            jest.spyOn(taxman.investmentIncomeTaxCalculator, 'calculateInvestmentTax').mockImplementation(() => { taxman.calculated.investmentIncomeTax = 50; });
            jest.spyOn(taxman.wealthTaxCalculator, 'calculateWealthTax').mockImplementation(() => { taxman.calculated.wealthTax = 0; });
            jest.spyOn(taxman.propertyTaxCalculator, 'calculatePropertyTax').mockImplementation(() => { taxman.calculated.propertyTax = { main: 300 }; });
            jest.spyOn(taxman.incomeTaxCalculator, 'calculateCredits').mockImplementation(() => { taxman.calculated.totalNonRefundableCredits = 100; taxman.calculated.totalRefundableCredits = 20; });
            // Spy on the private method too, to ensure it's called
            jest.spyOn(taxman, '_calculateTotalTaxLiability').mockClear(); // Clear any calls from constructor/reset
            jest.spyOn(taxman, '_calculateTotalTaxLiability').mockImplementation(() => {
                 // Simplified version for testing call order - real method is complex
                 taxman.calculated.totalTaxLiability = (taxman.calculated.incomeTax || 0)
                    + (taxman.calculated.socialContributions?.employee || 0)
                    + (taxman.calculated.capitalGainsTax || 0)
                    + (taxman.calculated.investmentIncomeTax || 0)
                    + (taxman.calculated.wealthTax || 0)
                    + (taxman.calculated.propertyTax?.main || 0)
                    - (taxman.calculated.totalNonRefundableCredits || 0) // Simplified application
                    - (taxman.calculated.totalRefundableCredits || 0);
            });
        });

        test('should call calculator methods in the correct order', () => {
            taxman.computeTaxes(minimalState);

            const incomeTaxMock = taxman.incomeTaxCalculator.calculateIncomeTax.mock;
            const socialMock = taxman.socialContributionsCalculator.calculateContributions.mock;
            const cgtMock = taxman.cgtCalculator.calculateCapitalGainsTax.mock;
            const creditsMock = taxman.incomeTaxCalculator.calculateCredits.mock;
            const finalLiabilityMock = taxman._calculateTotalTaxLiability.mock;


            expect(taxman.incomeTaxCalculator.calculateAdjustments).toHaveBeenCalledTimes(1);
            expect(taxman.incomeTaxCalculator.calculateDeductionsAndAllowances).toHaveBeenCalledTimes(1);
            expect(incomeTaxMock.invocationCallOrder[0]).toBeLessThan(socialMock.invocationCallOrder[0]);
            expect(socialMock.invocationCallOrder[0]).toBeLessThan(cgtMock.invocationCallOrder[0]);
            // ... check order for all major calculators ...
            expect(cgtMock.invocationCallOrder[0]).toBeLessThan(creditsMock.invocationCallOrder[0]); // Credits calculated after main taxes
            expect(creditsMock.invocationCallOrder[0]).toBeLessThan(finalLiabilityMock.invocationCallOrder[0]); // Final liability calculated last
        });

        test('should call reset if currentState is provided', () => {
            const resetSpy = jest.spyOn(taxman, 'reset');
            taxman.computeTaxes(minimalState);
            expect(resetSpy).toHaveBeenCalledWith(minimalState);
        });

        test('should return the calculated results and new loss carryforward', () => {
            const result = taxman.computeTaxes(minimalState);

            // Check that mocked values were used in the final calculation (using the simplified mock implementation)
            // 1000 (Income) + 500 (Social) + 200 (CGT) + 50 (Invest) + 0 (Wealth) + 300 (Prop) - 100 (NonRef) - 20 (Ref) = 1930
            expect(taxman.calculated.totalTaxLiability).toBe(1930);

            // Check the structure of the returned object
            expect(result).toBeDefined();
            expect(result.totalTaxLiability).toBe(1930);
            expect(result.incomeTax).toBe(1000); // From mock
            expect(result.socialContributions).toEqual({ employee: 500 }); // From mock
            expect(result.capitalGainsTax).toBe(200); // From mock
            expect(result.newLossCarryforward).toEqual({ shortTerm: 10, longTerm: 20 }); // From mock
            expect(result.appliedNonRefundableCredits).toBe(0); // Initialized to 0 by reset() and included in the result spread
        });

         test('should use existing currentState if none is provided', () => {
            // Set initial state via reset
            taxman.reset(minimalState);
            const resetSpy = jest.spyOn(taxman, 'reset'); // Spy *after* initial reset

            taxman.computeTaxes(); // Call without args

            expect(resetSpy).not.toHaveBeenCalled(); // Should not reset again
            expect(taxman.currentState).toEqual(minimalState); // Should still have the state from initial reset
            expect(taxman.incomeTaxCalculator.calculateIncomeTax).toHaveBeenCalledTimes(1); // Ensure calculation still ran
        });
    });
});

// --- _executeCustomRule Tests ---
describe('_executeCustomRule', () => {
    let taxman;
    let testContext;

    beforeEach(() => {
        // Removed log check
        // Removed log check
        // Define config and context locally for this block to avoid scoping issues
        const localValidConfig = { schemaName: "GenericTaxSystem", schemaVersion: "1.0", countryCode: "XX", capitalGainsTax: { holdingPeriods: [{ label: 'shortTerm', maxMonths: 12 }, { label: 'longTerm', minMonths: 12.01 }] } };
        const localMinimalContext = {
            evaluateFormula: jest.fn((formula, vars) => 0),
            executeCustomRule: jest.fn((identifier, context) => null),
            isBetween: (num, min, max) => (num >= min && num <= max)
        };
        taxman = new Taxman(localValidConfig, localMinimalContext); // Instantiate using local copies
        testContext = { someData: 123, expectedType: 'number' }; // Example context
        // Spy on console.warn for these tests
        // Re-spy on console.warn here to reset it for each test in this block
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    // No afterEach needed if we re-spy in beforeEach

    test('should log a warning for an unhandled identifier', () => {
        const identifier = 'unhandledRuleIdentifier';
        taxman._executeCustomRule(identifier, testContext);
        expect(console.warn).toHaveBeenCalledWith(
            `Execution needed for unhandled custom rule '${identifier}'. No specific handler implemented.`
        );
    });

    test('should return 0 as default for unhandled identifier when expectedType is not boolean', () => {
        const identifier = 'anotherUnhandledRule';
        const result = taxman._executeCustomRule(identifier, { expectedType: 'number' });
        expect(result).toBe(0);
    });

     test('should return false as default for unhandled identifier when expectedType is boolean', () => {
        const identifier = 'booleanUnhandledRule';
        const result = taxman._executeCustomRule(identifier, { expectedType: 'boolean' });
        expect(result).toBe(false);
    });

     test('should return 0 as default for unhandled identifier when expectedType is missing', () => {
        const identifier = 'missingTypeRule';
        const result = taxman._executeCustomRule(identifier, {}); // No expectedType
        expect(result).toBe(0); // Defaults to 0 if type is not boolean
    });

    test('should receive the correct identifier and context', () => {
        const identifier = 'specificRule';
        const context = { value: 42 };
        // We can't easily check the internal logic without modifying the method,
        // but we can ensure the warning log receives the correct identifier.
        taxman._executeCustomRule(identifier, context);
         expect(console.warn).toHaveBeenCalledWith(
            `Execution needed for unhandled custom rule '${identifier}'. No specific handler implemented.`
        );
        // If we mocked the internal dispatcher logic, we could check args here.
    });
});

// --- Taxman Module Enhancements Integration Tests ---
// These tests verify that Taxman correctly passes context/config
// related to specific enhancements to the relevant calculators.
// Detailed logic is tested in the calculator-specific test files.
describe('Taxman Module Enhancements Integration Tests', () => {
    let taxman;
    let testState;
    let testConfig;
    let mockContext;

    beforeEach(() => {
        // Base config and context
        testConfig = {
            schemaName: "GenericTaxSystem", schemaVersion: "1.0", countryCode: "XX",
            systemSettings: { filingStatuses: [{ id: 'single' }] }, // Needed for income tax calc
            incomeTax: { filingStatusRules: { single: {} } }, // Basic structure
            capitalGainsTax: { // Basic CGT structure
                holdingPeriods: [{ label: 'shortTerm', maxMonths: 12 }, { label: 'longTerm', minMonths: 12.01 }],
                taxationMethod: { method: 'flatRate', flatRate: 0.1 },
                annualExemption: { amount: 0 },
                ratesByAssetAndHolding: [],
                lossTreatment: {}
            },
            investmentIncomeTax: { // Basic Investment structure
                dividends: { taxationMethod: 'flatRate', rates: { nonQualified: 0.1 } },
                interest: { taxationMethod: 'flatRate', rates: {} }
            },
            pensionRules: { contributionTaxTreatment: [], withdrawalTaxTreatment: [] },
            propertyTax: [],
            residencyRules: { nonResidentTaxation: {}, foreignTaxRelief: {} }
        };
        mockContext = {
            evaluateFormula: jest.fn(() => 0),
            executeCustomRule: jest.fn(() => null),
            isBetween: (num, min, max) => (num >= min && num <= max)
        };
        testState = {
            year: 2024, age: 35, filingStatus: 'single', dependents: [],
            expenses: {}, assets: { cash: 10000 }, netWorth: 10000, liabilities: 0,
            cgtLossCarryforward: { shortTerm: 0, longTerm: 0 },
            residencyStatus: 'resident', // Default
            pensionPlanType: 'defaultPlan' // Default
        };

        taxman = new Taxman(testConfig, mockContext);

        // Mock all calculator methods to isolate Taxman's role
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateAdjustments').mockImplementation(() => {});
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateDeductionsAndAllowances').mockImplementation(() => {});
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateIncomeTax').mockImplementation(() => {});
        jest.spyOn(taxman.socialContributionsCalculator, 'calculateContributions').mockImplementation(() => {});
        jest.spyOn(taxman.cgtCalculator, 'calculateCapitalGainsTax').mockImplementation(() => ({ taxDue: 0, details: { lossCarryforwardByType: { shortTerm: 0, longTerm: 0 }, lossOffsetAgainstIncome: 0 }, costBasisUpdates: [] }));
        jest.spyOn(taxman.investmentIncomeTaxCalculator, 'calculateInvestmentTax').mockImplementation(() => {});
        jest.spyOn(taxman.wealthTaxCalculator, 'calculateWealthTax').mockImplementation(() => {});
        jest.spyOn(taxman.propertyTaxCalculator, 'calculatePropertyTax').mockImplementation(() => {});
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateCredits').mockImplementation(() => {});
        jest.spyOn(taxman, '_calculateTotalTaxLiability').mockImplementation(() => {}); // Mock final step too
        jest.spyOn(taxman.cgtCalculator, 'declareGainOrLoss').mockImplementation(() => {}); // Mock declaration for CGT tests
        // Removed mock for non-existent declarePensionContribution
    });

    // II.1: CGT Asset Type Specificity (verify declaration passes type)
    test('should pass asset type to cgtCalculator.declareGainOrLoss', () => {
        taxman.declareCapitalGainOrLoss({ type: 'realEstate', amount: 5000, holdingPeriodYears: 5 });
        expect(taxman.cgtCalculator.declareGainOrLoss).toHaveBeenCalledWith(expect.objectContaining({ type: 'realEstate' }));
    });

    // II.2: CGT integratedWithIncome (verify context passed to calculation)
    test('should calculate taxableIncome before calling cgtCalculator when integrated', () => {
        taxman.taxConfig.capitalGainsTax.taxationMethod.method = 'integratedWithIncome';
        // Mock the method that sets taxableIncome
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateDeductionsAndAllowances').mockImplementation(() => {
            taxman.calculated.taxableIncome = 50000; // Set the state needed by CGT calc
        });

        taxman.computeTaxes(testState);

        // Verify the prerequisite was called before the target
        const deductionsMock = taxman.incomeTaxCalculator.calculateDeductionsAndAllowances.mock;
        const cgtMock = taxman.cgtCalculator.calculateCapitalGainsTax.mock;
        expect(deductionsMock.invocationCallOrder[0]).toBeLessThan(cgtMock.invocationCallOrder[0]);

        // Verify the target calculator was called
        expect(taxman.cgtCalculator.calculateCapitalGainsTax).toHaveBeenCalled();
    });

    // II.3: Investment Income asOrdinaryIncome (verify context passed)
    test('should calculate taxableIncome before calling investmentIncomeTaxCalculator when method is asOrdinaryIncome', () => {
        taxman.taxConfig.investmentIncomeTax.dividends.taxationMethod = 'asOrdinaryIncome';
        // Mock the method that sets taxableIncome
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateDeductionsAndAllowances').mockImplementation(() => {
            taxman.calculated.taxableIncome = 60000; // Set the state needed
        });

        taxman.computeTaxes(testState);

        // Verify the prerequisite was called before the target
        const deductionsMock = taxman.incomeTaxCalculator.calculateDeductionsAndAllowances.mock;
        const investmentMock = taxman.investmentIncomeTaxCalculator.calculateInvestmentTax.mock;
        expect(deductionsMock.invocationCallOrder[0]).toBeLessThan(investmentMock.invocationCallOrder[0]);

        // Verify the target calculator was called
        expect(taxman.investmentIncomeTaxCalculator.calculateInvestmentTax).toHaveBeenCalled();
    });

    // II.4: Investment Income Allowance by Bracket (verify context passed)
    test('should calculate adjustedGrossIncome before calling investmentIncomeTaxCalculator for bracketed allowances', () => {
        taxman.taxConfig.investmentIncomeTax.dividends.allowance = { amountByIncomeBracket: [{ incomeBracketLabel: 'basic', amount: 1000 }] };
        // Mock the method that sets adjustedGrossIncome
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateAdjustments').mockImplementation(() => {
            taxman.calculated.adjustedGrossIncome = 70000; // Set the state needed
        });

        taxman.computeTaxes(testState);

        // Verify the prerequisite was called before the target
        const adjustmentsMock = taxman.incomeTaxCalculator.calculateAdjustments.mock;
        const investmentMock = taxman.investmentIncomeTaxCalculator.calculateInvestmentTax.mock;
        expect(adjustmentsMock.invocationCallOrder[0]).toBeLessThan(investmentMock.invocationCallOrder[0]);

        // Verify the target calculator was called
        expect(taxman.investmentIncomeTaxCalculator.calculateInvestmentTax).toHaveBeenCalled();
    });

    // II.5: Residency Rules - Non-Resident (verify state passed)
    test('should set non-resident status on instance for calculators', () => {
        testState.residencyStatus = 'nonResident';
        taxman.computeTaxes(testState); // This calls reset() internally
        // Verify the status was set on the instance after reset
        expect(taxman.residencyStatus).toEqual('nonResident');
        // Verify calculators were still called
        expect(taxman.incomeTaxCalculator.calculateIncomeTax).toHaveBeenCalled();
        expect(taxman.cgtCalculator.calculateCapitalGainsTax).toHaveBeenCalled();
    });

     // II.5: Residency Rules - Foreign Tax Relief (verify state passed)
    test('should have foreign income details available for tax relief calculation', () => {
        testState.foreignIncome = { source: 'US', amount: 10000, taxPaid: 1500 };
        taxman.taxConfig.residencyRules.foreignTaxRelief = { applies: true, method: 'credit' };
        taxman.computeTaxes(testState); // Calls reset()
        // Verify the foreign income details are part of the currentState on the instance
        expect(taxman.currentState.foreignIncome).toEqual({ source: 'US', amount: 10000, taxPaid: 1500 });
        // Verify the relevant calculator was called (assuming income tax handles relief)
        expect(taxman.incomeTaxCalculator.calculateIncomeTax).toHaveBeenCalled();
         // Or potentially check a dedicated residency handler if implemented
    });


    // II.6: Pension Plan Type Matching (verify state passed to declaration/adjustment)
    test('should pass pension plan type context for contribution treatment', () => {
        testState.pensionPlanType = 'specialPlan401k';
        taxman.taxConfig.pensionRules.contributionTaxTreatment.push({
            planTypeRegex: 'specialPlan.*', treatmentType: 'deduction', limitRule: { method: 'fixedAmount', value: 1000 }
        });
        // Simulate declaring income which triggers pension contribution declaration internally
        taxman.declareIncome('employment', 50000, { pensionContribRate: 0.1, planType: 'specialPlan401k' });
        taxman.computeTaxes(testState); // This calls calculateAdjustments

        // Verify that calculateAdjustments was called.
        // We can't easily check the *internal* use of pensionPlanType without more complex mocking or refactoring,
        // but we ensure the method runs with the state potentially available to it.
        expect(taxman.incomeTaxCalculator.calculateAdjustments).toHaveBeenCalled();
        // We can also check that the currentState used internally by the calculator instance had the correct value
        expect(taxman.currentState.pensionPlanType).toEqual('specialPlan401k');

    });

    // II.7: Property Tax Location Check (verify asset location passed)
    test('should have asset location context available for propertyTaxCalculator', () => {
        testState.assets.primaryHome = { type: 'realEstate', value: 300000, location: 'Dublin' };
        taxman.taxConfig.propertyTax.push({
            level: 'local', description: 'Local Property Tax', appliesToPropertyType: ['residential'],
            taxBasis: { type: 'assessedValue' }, rateDefinition: { method: 'percentage', rate: 0.01 }
        });
        taxman.computeTaxes(testState); // Calls reset()
        // Verify the asset details are part of the state on the instance
        expect(taxman.assets.primaryHome.location).toEqual('Dublin');
        // Verify the calculator was called
        expect(taxman.propertyTaxCalculator.calculatePropertyTax).toHaveBeenCalled();
    });

    // II.8 / Step 4.5: CGT Loss Offset vs Income (verify final liability reduction)
    test('should reduce totalTaxLiability based on lossOffsetAgainstIncome and marginal rate', () => {
        const incomeTaxAmount = 10000;
        const lossOffsetAmount = 3000; // Amount of loss to offset against income
        const marginalRate = 0.25; // Example marginal income tax rate
        const expectedTaxBenefit = lossOffsetAmount * marginalRate; // 750

        // Mock income tax calculation
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateIncomeTax').mockImplementation(() => {
            taxman.calculated.incomeTax = incomeTaxAmount;
        });
        // Mock CGT calculation to return the loss offset
        jest.spyOn(taxman.cgtCalculator, 'calculateCapitalGainsTax').mockImplementation(() => {
            // Ensure the mock correctly sets the state Taxman reads
             taxman.capitalGains.currentYearLossOffsettingIncome = lossOffsetAmount;
            return {
                taxDue: 0, // No CGT due in this scenario
                details: {
                    lossOffsetAgainstIncome: lossOffsetAmount,
                    lossCarryforwardByType: {} // Assume no further carryforward for simplicity
                },
                costBasisUpdates: []
            };
        });
        // Mock the evaluator to return a specific marginal rate
        jest.spyOn(taxman.evaluator, 'getMarginalIncomeRate').mockReturnValue(marginalRate);
        // Mock other taxes to zero for simplicity
        jest.spyOn(taxman.socialContributionsCalculator, 'calculateContributions').mockImplementation(() => {});
        jest.spyOn(taxman.investmentIncomeTaxCalculator, 'calculateInvestmentTax').mockImplementation(() => {});
        // Mock credits to zero
        jest.spyOn(taxman.incomeTaxCalculator, 'calculateCredits').mockImplementation(() => {
             taxman.calculated.totalNonRefundableCredits = 0;
             taxman.calculated.totalRefundableCredits = 0;
             taxman.calculated.appliedNonRefundableCredits = 0; // Ensure this is reset by mock
        });
         // Unmock the method we are testing (allow the real implementation to run)
         // We mocked it in the main beforeEach, so we need to restore it here.
         // Use mockRestore to completely remove the mock and restore original implementation.
         if (jest.isMockFunction(taxman._calculateTotalTaxLiability)) {
            taxman._calculateTotalTaxLiability.mockRestore();
         }
         // Spy on it again just to confirm it's called, but let it execute
         const liabilitySpy = jest.spyOn(taxman, '_calculateTotalTaxLiability');


        // --- Execute ---
        const result = taxman.computeTaxes(testState);

        // --- Assert ---
        expect(liabilitySpy).toHaveBeenCalled();
        // Expected liability = incomeTax - taxBenefit
        const expectedLiability = incomeTaxAmount - expectedTaxBenefit;
        expect(result.totalTaxLiability).toBeCloseTo(expectedLiability);
        // Verify the loss offset amount was stored correctly by computeTaxes
        expect(taxman.capitalGains.currentYearLossOffsettingIncome).toBe(lossOffsetAmount);
    });
});