const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

/**
 * Test to verify non-joint filing logic.
 */
describe('Non-Joint Filing Mode', () => {
    test('should calculate tax separately for P1 and P2 when jointFilingAllowed is false', async () => {
        // 1. Setup a custom ruleset with jointFilingAllowed: false and specific progressive brackets
        const TOY_AA_NOJOINT = JSON.parse(JSON.stringify(TOY_AA));
        TOY_AA_NOJOINT.jointFilingAllowed = false;
        // Ensure bracketsByStatus exists
        TOY_AA_NOJOINT.incomeTax.bracketsByStatus = {};
        // Use progressive brackets to make difference observable: 10% on first 20k, 20% above
        TOY_AA_NOJOINT.incomeTax.bracketsByStatus.single = { "0": 0.10, "20000": 0.20 };
        TOY_AA_NOJOINT.incomeTax.taxCredits = {}; // No credits to keep math simple

        const params = microParams({
            targetAge: 41,
            startingAge: 40,
            simulation_mode: 'couple',
            StartCountry: 'aa',
            p2StartingAge: 40,
            marriageYear: 2020 // Ensure they are married
        });

        const events = [
            { type: 'SI', id: 'p1-salary', amount: 30000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 },
            { type: 'SI2np', id: 'p2-salary', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 }
        ];

        const scenarioDef = {
            name: 'Non-Joint Test',
            scenario: {
                parameters: params,
                events: events
            },
            assertions: [] // Mandatory
        };

        const framework = new TestFramework();
        framework.loadScenario(scenarioDef);
        installTestTaxRules(framework, { aa: TOY_AA_NOJOINT });
        const results = await framework.runSimulation();

        expect(results.success).toBe(true);
        const row40 = results.dataSheet.find(r => r && r.age === 40);
        expect(row40).toBeDefined();

        /**
         * Expected Hand-Calculation (Non-Joint):
         * P1: 20,000 * 0.10 + 10,000 * 0.20 = 2,000 + 2,000 = 4,000
         * P2: 10,000 * 0.10 = 1,000
         * Total IT = 5,000
         */
        expect(row40.Tax__incomeTax).toBeCloseTo(5000, 0);

        // 2. Verification: Run again with jointFilingAllowed: true and verify different result
        const TOY_AA_JOINT = JSON.parse(JSON.stringify(TOY_AA_NOJOINT));
        TOY_AA_JOINT.jointFilingAllowed = true;
        TOY_AA_JOINT.incomeTax.bracketsByStatus.married = { "0": 0.10, "40000": 0.20 };
        
        const frameworkJoint = new TestFramework();
        frameworkJoint.loadScenario(scenarioDef);
        installTestTaxRules(frameworkJoint, { aa: TOY_AA_JOINT });
        const resultsJoint = await frameworkJoint.runSimulation();

        expect(resultsJoint.success).toBe(true);
        const row40Joint = resultsJoint.dataSheet.find(r => r && r.age === 40);
        
        /**
         * Expected Hand-Calculation (Joint):
         * Total Income = 40,000
         * Joint Brackets: 40,000 * 0.10 = 4,000
         * Total IT = 4,000
         */
        expect(row40Joint.Tax__incomeTax).toBeCloseTo(4000, 0);
        expect(row40Joint.Tax__incomeTax).not.toBeCloseTo(row40.Tax__incomeTax, 0);
    });

    test('should apply tax credits according to their scope in non-joint mode', async () => {
        const TOY_AA_CREDITS = JSON.parse(JSON.stringify(TOY_AA));
        TOY_AA_CREDITS.jointFilingAllowed = false;
        TOY_AA_CREDITS.incomeTax.bracketsByStatus = {
            single: { "0": 0.20 } // Flat 20%
        };
        TOY_AA_CREDITS.incomeTax.taxCredits = {
            household_credit: { amount: 1000, scope: 'household' },
            person_credit: { amount: 500, scope: 'person' },
            earner_credit: { amount: 200, scope: 'earner' }
        };

        const params = microParams({
            targetAge: 41,
            startingAge: 40,
            simulation_mode: 'couple',
            StartCountry: 'aa',
            p2StartingAge: 40,
            marriageYear: 2020
        });

        // P1 earns 10k, P2 earns 0
        const events = [
            { type: 'SI', id: 'p1-salary', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 }
        ];

        const scenarioDef = {
            name: 'Credits Scope Test',
            scenario: { parameters: params, events: events },
            assertions: []
        };

        const framework = new TestFramework();
        framework.loadScenario(scenarioDef);
        installTestTaxRules(framework, { aa: TOY_AA_CREDITS });
        const results = await framework.runSimulation();

        expect(results.success).toBe(true);
        const row40 = results.dataSheet.find(r => r && r.age === 40);

        /**
         * Expected Hand-Calculation:
         * P1 Gross: 10,000. Tax (20%): 2,000.
         * P1 Credits:
         * - household_credit: 1,000 (applied for P1)
         * - person_credit: 500
         * - earner_credit: 200 (P1 is earner)
         * Total P1 Credits: 1,700.
         * P1 Net Tax: 2,000 - 1,700 = 300.
         *
         * P2 Gross: 0. Tax (20%): 0.
         * P2 Credits:
         * - household_credit: skip (scope household, already applied to P1)
         * - person_credit: 500
         * - earner_credit: skip (scope earner, P2 not earner)
         * Total P2 Credits: 500.
         * P2 Net Tax: 0 (capped at 0).
         *
         * Total IT: 300.
         */
        expect(row40.Tax__incomeTax).toBeCloseTo(300, 0);
    });

    test('should apply age exemption independently in non-joint mode', async () => {
        const TOY_AA_SENIOR = JSON.parse(JSON.stringify(TOY_AA));
        TOY_AA_SENIOR.jointFilingAllowed = false;
        TOY_AA_SENIOR.incomeTax.bracketsByStatus = { single: { "0": 0.20 } };
        TOY_AA_SENIOR.incomeTax.ageExemptionAge = 65;
        TOY_AA_SENIOR.incomeTax.ageExemptionLimit = 18000;
        TOY_AA_SENIOR.incomeTax.taxCredits = {};

        const params = microParams({
            targetAge: 66,
            startingAge: 65,
            simulation_mode: 'couple',
            StartCountry: 'aa',
            p2StartingAge: 60, // P2 is not a senior
            marriageYear: 2000
        });

        // P1 earns 15k (under 18k limit), P2 earns 10k
        const events = [
            { type: 'SI', id: 'p1-salary', amount: 15000, fromAge: 65, toAge: 65, currency: 'AAA', rate: 0, match: 0 },
            { type: 'SI2np', id: 'p2-salary', amount: 10000, fromAge: 65, toAge: 65, currency: 'AAA', rate: 0, match: 0 }
        ];

        const scenarioDef = {
            name: 'Age Exemption Non-Joint',
            scenario: { parameters: params, events: events },
            assertions: []
        };

        const framework = new TestFramework();
        framework.loadScenario(scenarioDef);
        installTestTaxRules(framework, { aa: TOY_AA_SENIOR });
        const results = await framework.runSimulation();

        expect(results.success).toBe(true);
        const row65 = results.dataSheet.find(r => r && r.age === 65);

        /**
         * Expected Calculation:
         * P1: 65, earning 15k. Exempt (15k <= 18k). Tax = 0.
         * P2: 60, earning 10k. Not exempt. Tax (20%) = 2000.
         * Total IT = 2000.
         */
        expect(row65.Tax__incomeTax).toBeCloseTo(2000, 0);
    });

    test('should default unscoped generic credits to household (P1 only) in non-joint mode', async () => {
        const TOY_AA_DEFAULT_SCOPE = JSON.parse(JSON.stringify(TOY_AA));
        TOY_AA_DEFAULT_SCOPE.jointFilingAllowed = false;
        TOY_AA_DEFAULT_SCOPE.incomeTax.bracketsByStatus = { single: { "0": 0.20 } };
        TOY_AA_DEFAULT_SCOPE.incomeTax.taxCredits = {
            generic_credit: { amount: 1000 } // No scope defined
        };

        const params = microParams({
            targetAge: 41,
            startingAge: 40,
            simulation_mode: 'couple',
            StartCountry: 'aa',
            p2StartingAge: 40,
            marriageYear: 2020
        });

        // Each earns 10k
        const events = [
            { type: 'SI', id: 'p1-salary', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 },
            { type: 'SI2np', id: 'p2-salary', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 }
        ];

        const scenarioDef = {
            name: 'Default Scope Test',
            scenario: { parameters: params, events: events },
            assertions: []
        };

        const framework = new TestFramework();
        framework.loadScenario(scenarioDef);
        installTestTaxRules(framework, { aa: TOY_AA_DEFAULT_SCOPE });
        const results = await framework.runSimulation();

        expect(results.success).toBe(true);
        const row40 = results.dataSheet.find(r => r && r.age === 40);

        /**
         * Expected Calculation:
         * P1 Gross: 10k. Tax: 2k. Credit: 1k (P1 gets household default). Net IT P1: 1k.
         * P2 Gross: 10k. Tax: 2k. Credit: 0 (household already applied). Net IT P2: 2k.
         * Total IT = 3k.
         */
        expect(row40.Tax__incomeTax).toBeCloseTo(3000, 0);
    });

    test('non-joint + applicableIncomeTypes excludes employment → salary not taxed', async () => {
        // Setup a custom ruleset with jointFilingAllowed: false and applicableIncomeTypes: ['rental']
        const TOY_AA_FILTERED = JSON.parse(JSON.stringify(TOY_AA));
        TOY_AA_FILTERED.jointFilingAllowed = false;
        TOY_AA_FILTERED.incomeTax.applicableIncomeTypes = ['rental'];
        TOY_AA_FILTERED.incomeTax.bracketsByStatus = { single: { "0": 0.10 } }; // 10% flat
        TOY_AA_FILTERED.incomeTax.taxCredits = {};

        const params = microParams({
            targetAge: 41,
            startingAge: 40,
            simulation_mode: 'couple',
            StartCountry: 'aa',
            p2StartingAge: 40,
            marriageYear: 2020
        });

        const events = [
            { type: 'SI', id: 'p1-salary', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 },
            { type: 'RI', id: 'p1-rental', amount: 5000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 },
            { type: 'SI2np', id: 'p2-salary', amount: 8000, fromAge: 40, toAge: 40, currency: 'AAA', rate: 0, match: 0 }
        ];

        const scenarioDef = {
            name: 'Filtered Income Non-Joint',
            scenario: { parameters: params, events: events },
            assertions: []
        };

        const framework = new TestFramework();
        framework.loadScenario(scenarioDef);
        installTestTaxRules(framework, { aa: TOY_AA_FILTERED });
        const results = await framework.runSimulation();

        expect(results.success).toBe(true);
        const row40 = results.dataSheet.find(r => r && r.age === 40);

        /**
         * Expected Calculation:
         * Salary (10k + 8k) is EXCLUDED from tax base.
         * Rental (5k) is INCLUDED.
         * Rental is "shared income" in non-joint path (split 50/50).
         * P1: 2,500 rental. Tax (10%) = 250.
         * P2: 2,500 rental. Tax (10%) = 250.
         * Total IT = 500.
         */
        expect(row40.Tax__incomeTax).toBeCloseTo(500, 0);
    });
});
