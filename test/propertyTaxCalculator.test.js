// test/propertyTaxCalculator.test.js

const PropertyTaxCalculator = require('../src/core/tax/PropertyTaxCalculator');
// No jest.mock needed if we pass a mock instance object

describe('PropertyTaxCalculator', () => {
    let mockTaxman;
    let mockSchemaEvaluator;
    let calculator;

    beforeEach(() => {
        // Mock SchemaEvaluator instance object
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
            evaluateCondition: jest.fn().mockReturnValue(true), // Default: conditions met
            getBasisValue: jest.fn((basis, context) => { // Mock getBasisValue if needed by rules
                 if (!basis) return 0;
                 if (context && context[basis] !== undefined) return context[basis];
                 return 0; // Default
            }),
        };

         // Mock Taxman instance
        mockTaxman = {
            taxConfig: {
                propertyTax: [] // Empty by default
            },
            currentState: {
                // ... state if needed by rules
            },
            calculated: {
                propertyTax: {} // Initialize
            },
            // Mock assets structure
            assets: {
                home: { type: 'primaryResidence', value: 500000, location: 'CountyA' },
                rental: { type: 'residential', value: 300000, location: 'CountyB' },
                office: { type: 'commercial', value: 1000000, location: 'CountyA' }
            },
            // Provide mocks
            evaluator: mockSchemaEvaluator,
             utils: {
                 evaluateFormula: jest.fn(),
                 executeCustomRule: jest.fn(),
            },
        };

        // Instantiate the calculator INSIDE each test after config is set
        // calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
    });

    it('should calculate zero tax if no rules or properties', () => {
        mockTaxman.assets = {};
        // Instantiate calculator for this part of the test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();
        expect(mockTaxman.calculated.propertyTax).toEqual({});

        mockTaxman.assets = { home: { type: 'primaryResidence', value: 500000 } };
        mockTaxman.taxConfig.propertyTax = [];
        // Re-instantiate calculator with updated config/assets for this part
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();
        expect(mockTaxman.calculated.propertyTax).toEqual({});
    });

    it('should apply a simple flat rate rule using calculateValue', () => {
        const rate = 0.01; // 1%
        mockTaxman.taxConfig.propertyTax = [
            {
                level: 'State',
                description: 'State Flat Tax',
                appliesToPropertyType: ['all'],
                taxBasis: { type: 'marketValue' },
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: rate } }
            }
        ];
        // Mock calculateValue specifically for this test's rate rule
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            // console.log(`[DEBUG TEST - Specific Mock] mockSchemaEvaluator.calculateValue called with rule:`, rule); // REMOVE DEBUG LOG
            if (rule.method === 'fixedAmount' && rule.value === rate) return rate;
            return 0; // Default return for other calls within this test
        });
        // Remove the specific mockImplementation for this test for now
        // Let's see if the basic jest.fn() from beforeEach registers the call

        // Instantiate calculator for this test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();

        // Verify calculateValue called for rate rule for each property
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: rate }),
            expect.objectContaining({ propertyValue: 500000 }) // Context for home
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: rate }),
            expect.objectContaining({ propertyValue: 300000 }) // Context for rental
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: rate }),
            expect.objectContaining({ propertyValue: 1000000 }) // Context for office
        );

        // Check calculated tax
        expect(mockTaxman.calculated.propertyTax['State Flat Tax']).toBeCloseTo(
            (500000 * rate) + (300000 * rate) + (1000000 * rate) // 5000 + 3000 + 10000 = 18000
        );
    });

    it('should apply assessment ratio using calculateValue', () => {
        const ratio = 0.6; // 60% assessment ratio
        const rate = 0.02; // 2% tax rate
        mockTaxman.taxConfig.propertyTax = [
            {
                level: 'County',
                description: 'County Assessed Tax',
                appliesToPropertyType: ['all'],
                taxBasis: { type: 'marketValue', assessmentRatioRule: { method: 'fixedAmount', value: ratio } },
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: rate } }
            }
        ];
         // Mock calculateValue for ratio and rate
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === ratio) return ratio;
            if (rule.method === 'fixedAmount' && rule.value === rate) return rate;
            return 0;
        });

        // Instantiate calculator for this test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();

        // Verify calculateValue called for ratio rule for each property
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: ratio }),
            expect.objectContaining({ propertyValue: 500000 }) // Context for home
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: ratio }),
            expect.objectContaining({ propertyValue: 300000 }) // Context for rental
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: ratio }),
            expect.objectContaining({ propertyValue: 1000000 }) // Context for office
        );

        // Check calculated tax
        // Home: Basis = 500k * 0.6 = 300k. Tax = 300k * 2% = 6000
        // Rental: Basis = 300k * 0.6 = 180k. Tax = 180k * 2% = 3600
        // Office: Basis = 1M * 0.6 = 600k. Tax = 600k * 2% = 12000
        // Total = 6000 + 3600 + 12000 = 21600
        expect(mockTaxman.calculated.propertyTax['County Assessed Tax']).toBeCloseTo(21600);
    });

    it('should apply value reduction exemption using calculateValue', () => {
        const reductionAmount = 50000;
        const rate = 0.01;
        mockTaxman.taxConfig.propertyTax = [
            {
                level: 'Local',
                description: 'Local Tax with Homestead Exemption',
                appliesToPropertyType: ['primaryResidence'], // Only applies to home
                taxBasis: { type: 'marketValue' },
                exemptions: [
                    { name: 'Homestead', type: 'valueReduction', amountRule: { method: 'fixedAmount', value: reductionAmount } }
                ],
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: rate } }
            }
        ];
         // Mock calculateValue for exemption amount and rate
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === reductionAmount) return reductionAmount;
            if (rule.method === 'fixedAmount' && rule.value === rate) return rate;
            return 0;
        });

        // Instantiate calculator for this test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();

        // Verify calculateValue called for exemption rule only for the home
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: reductionAmount }),
            expect.objectContaining({ propertyValue: 500000 }) // Context for home
        );
         expect(mockSchemaEvaluator.calculateValue).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: reductionAmount }),
            expect.objectContaining({ propertyValue: 300000 }) // Context for rental
        );

        // Check calculated tax (only for home)
        // Home: Basis = 500k. Exemption = 50k. Taxable Basis = 450k.
        // Tax = 450k * 1% = 4500
        expect(mockTaxman.calculated.propertyTax['Local Tax with Homestead Exemption']).toBeCloseTo(4500);
    });

     it('should apply rate reduction exemption using calculateValue', () => {
        const baseRate = 0.015;
        const rateReduction = 0.005;
        mockTaxman.taxConfig.propertyTax = [
            {
                level: 'SpecialDistrict',
                description: 'District Tax with Rate Reduction',
                appliesToPropertyType: ['residential', 'primaryResidence'], // Home and Rental
                taxBasis: { type: 'marketValue' },
                exemptions: [
                    { name: 'ResiDiscount', type: 'rateReduction', amountRule: { method: 'fixedAmount', value: rateReduction } }
                ],
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: baseRate } }
            }
        ];
         // Mock calculateValue for base rate and reduction amount
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === baseRate) return baseRate;
            if (rule.method === 'fixedAmount' && rule.value === rateReduction) return rateReduction;
            return 0;
        });

        // Instantiate calculator for this test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();

        // Verify calculateValue called for rate reduction rule for home and rental
        expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: rateReduction }),
            expect.objectContaining({ propertyValue: 500000, currentRate: baseRate }) // Context for home
        );
         expect(mockSchemaEvaluator.calculateValue).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'fixedAmount', value: rateReduction }),
            expect.objectContaining({ propertyValue: 300000, currentRate: baseRate }) // Context for rental
        );

        // Check calculated tax
        // Final Rate = 0.015 - 0.005 = 0.010 (1%)
        // Home Tax = 500k * 1% = 5000
        // Rental Tax = 300k * 1% = 3000
        // Total = 5000 + 3000 = 8000
        expect(mockTaxman.calculated.propertyTax['District Tax with Rate Reduction']).toBeCloseTo(8000);
    });

    it('should respect locationScope', () => {
        const rateCountyA = 0.01;
        const rateCountyB = 0.012;
        mockTaxman.taxConfig.propertyTax = [
            {
                level: 'County', description: 'County A Tax', locationScope: 'CountyA',
                appliesToPropertyType: ['all'], taxBasis: { type: 'marketValue' },
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: rateCountyA } }
            },
             {
                level: 'County', description: 'County B Tax', locationScope: 'CountyB',
                appliesToPropertyType: ['all'], taxBasis: { type: 'marketValue' },
                rateDefinition: { method: 'percentage', rateRule: { method: 'fixedAmount', value: rateCountyB } }
            }
        ];
         // Mock calculateValue for rates
        mockSchemaEvaluator.calculateValue.mockImplementation((rule, context) => {
            if (rule.method === 'fixedAmount' && rule.value === rateCountyA) return rateCountyA;
            if (rule.method === 'fixedAmount' && rule.value === rateCountyB) return rateCountyB;
            return 0;
        });

        // Instantiate calculator for this test
        calculator = new PropertyTaxCalculator(mockTaxman, mockSchemaEvaluator);
        calculator.calculatePropertyTax();

        // County A applies to home (500k) and office (1M)
        const expectedTaxA = (500000 * rateCountyA) + (1000000 * rateCountyA); // 5000 + 10000 = 15000
        // County B applies to rental (300k)
        const expectedTaxB = 300000 * rateCountyB; // 3600

        expect(mockTaxman.calculated.propertyTax['County A Tax']).toBeCloseTo(expectedTaxA);
        expect(mockTaxman.calculated.propertyTax['County B Tax']).toBeCloseTo(expectedTaxB);
    });

});