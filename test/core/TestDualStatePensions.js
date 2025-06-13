// Test suite for dual state pension calculations for two persons.
// Verifies correct timing, individual amounts, and age-related increases.

console.log('Loading TestDualStatePensions.js');

function runDualStatePensionTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestDualStatePensions tests.');
        return;
    }

    const { describe, it, beforeEach, afterEach, config, Constants, Utils,
        initializeSimulator, runSimulationToAge, getPerson, getRevenueInstance, getSimulatorGlobals, assert } = testFramework;

    describe('Dual State Pension Functionalities', () => {
        let person1_g, person2_g;
        let simConfig; // For storing potentially modified config values for a test

        beforeEach(() => {
            // Default parameters. Specific ages and state pension amounts will be set per test.
            const baseParams = {
                StartingAge: 50,
                P2StartingAge: 48,
                TargetAge: 90,
                MarriageYear: 0,
                PersonalTaxCredit: 1875,
                Inflation: 0.0,      // Keep inflation at 0 for predictable adjust() results
                InitialSavings: 10000,
                InitialPension: 0, InitialPensionP2: 0,
                RetirementAge: 70, P2RetirementAge: 70, // Not directly relevant for state pension test
                StatePensionWeekly: 0, P2StatePensionWeekly: 0, // Default to 0, set in tests
                config: { // Ensure test-specific config can be set
                    ...config,
                    statePensionQualifyingAge: config.statePensionQualifyingAge || 66, // Use global or default
                    statePensionIncreaseAge: config.statePensionIncreaseAge || 80,
                    statePensionIncreaseAmount: config.statePensionIncreaseAmount || 20
                }
            };
            initializeSimulator(baseParams, []);
            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            // simConfig can be set within tests if they need to modify global config values like statePensionQualifyingAge
        });

        it('P1 should receive their state pension at qualifying age, P2 not yet eligible', () => {
            const P1_WEEKLY_STATE_PENSION = 250;
            const P2_WEEKLY_STATE_PENSION = 200;
            const QUALIFYING_AGE = config.statePensionQualifyingAge || 66;

            const testParams = {
                StartingAge: QUALIFYING_AGE, // P1 will be QUALIFYING_AGE in year 1
                P2StartingAge: QUALIFYING_AGE - 2, // P2 will be QUALIFYING_AGE - 2 (not eligible)
                TargetAge: QUALIFYING_AGE + 5,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_STATE_PENSION,
                P2StatePensionWeekly: P2_WEEKLY_STATE_PENSION,
                InitialSavings:0, InitialPension:0, InitialPensionP2:0, // No other income/assets
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0, // No salaries
                config: { // Ensure specific config for test
                    ...config,
                    statePensionQualifyingAge: QUALIFYING_AGE,
                    statePensionIncreaseAge: QUALIFYING_AGE + 10, // Ensure no increase applies yet
                    statePensionIncreaseAmount: 20
                }
            };
            initializeSimulator(testParams, []);

            // Run for 1 year, P1 will be QUALIFYING_AGE
            runSimulationToAge(QUALIFYING_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            const simGlobals_end_year = getSimulatorGlobals();

            const expectedP1YearlyStatePension = P1_WEEKLY_STATE_PENSION * 52;

            assert(person1_g.age === QUALIFYING_AGE, `P1 age should be ${QUALIFYING_AGE}, was ${person1_g.age}`);
            assert(person2_g.age === QUALIFYING_AGE - 2, `P2 age should be ${QUALIFYING_AGE - 2}, was ${person2_g.age}`);

            assert(Math.abs(person1_g.yearlyIncomeStatePension - expectedP1YearlyStatePension) < 0.01,
                `P1 yearlyIncomeStatePension: Expected ${expectedP1YearlyStatePension.toFixed(2)}, Got ${person1_g.yearlyIncomeStatePension.toFixed(2)}`);

            assert(person2_g.yearlyIncomeStatePension === 0,
                `P2 yearlyIncomeStatePension: Expected 0, Got ${person2_g.yearlyIncomeStatePension.toFixed(2)} (P2 age ${person2_g.age})`);

            assert(Math.abs(simGlobals_end_year.incomeStatePension - expectedP1YearlyStatePension) < 0.01,
                `Global incomeStatePension: Expected ${expectedP1YearlyStatePension.toFixed(2)}, Got ${simGlobals_end_year.incomeStatePension.toFixed(2)}`);
        });

        it('P2 should receive their state pension at qualifying age, P1 status verified (already receiving OR not yet eligible)', () => {
            const P1_WEEKLY_STATE_PENSION = 260;
            const P2_WEEKLY_STATE_PENSION = 220;
            const QUALIFYING_AGE = config.statePensionQualifyingAge || 66;
            const P1_AGE_ELIGIBLE = QUALIFYING_AGE + 2;
            const P1_AGE_NOT_ELIGIBLE = QUALIFYING_AGE - 2;

            // --- Part A: P1 already eligible and receiving --- 
            let testParamsA = {
                StartingAge: P1_AGE_ELIGIBLE,      // P1 older, already eligible
                P2StartingAge: QUALIFYING_AGE,     // P2 becomes eligible
                TargetAge: QUALIFYING_AGE + 5,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_STATE_PENSION,
                P2StatePensionWeekly: P2_WEEKLY_STATE_PENSION,
                InitialSavings:0, InitialPension:0, InitialPensionP2:0,
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                config: { ...config, statePensionQualifyingAge: QUALIFYING_AGE, statePensionIncreaseAge: QUALIFYING_AGE + 20 }
            };
            initializeSimulator(testParamsA, []);
            runSimulationToAge(QUALIFYING_AGE, 'P2'); // Run until P2 is QUALIFYING_AGE

            let p1_A = getPerson('P1');
            let p2_A = getPerson('P2');
            let simGlobals_A = getSimulatorGlobals();

            const expectedP1YearlyA = P1_WEEKLY_STATE_PENSION * 52;
            const expectedP2YearlyA = P2_WEEKLY_STATE_PENSION * 52;
            const expectedTotalA = expectedP1YearlyA + expectedP2YearlyA;

            assert(p2_A.age === QUALIFYING_AGE, `Part A - P2 age: Expected ${QUALIFYING_AGE}, Got ${p2_A.age}`);
            assert(p1_A.age === P1_AGE_ELIGIBLE, `Part A - P1 age: Expected ${P1_AGE_ELIGIBLE}, Got ${p1_A.age}`);
            assert(Math.abs(p2_A.yearlyIncomeStatePension - expectedP2YearlyA) < 0.01, 
                `Part A - P2 yearlyIncomeStatePension: Expected ${expectedP2YearlyA.toFixed(2)}, Got ${p2_A.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(p1_A.yearlyIncomeStatePension - expectedP1YearlyA) < 0.01, 
                `Part A - P1 yearlyIncomeStatePension: Expected ${expectedP1YearlyA.toFixed(2)}, Got ${p1_A.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(simGlobals_A.incomeStatePension - expectedTotalA) < 0.01, 
                `Part A - Global incomeStatePension: Expected ${expectedTotalA.toFixed(2)}, Got ${simGlobals_A.incomeStatePension.toFixed(2)}`);

            // --- Part B: P1 NOT yet eligible --- 
            let testParamsB = {
                StartingAge: P1_AGE_NOT_ELIGIBLE,  // P1 younger, not yet eligible
                P2StartingAge: QUALIFYING_AGE,     // P2 becomes eligible
                TargetAge: QUALIFYING_AGE + 5,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_STATE_PENSION,
                P2StatePensionWeekly: P2_WEEKLY_STATE_PENSION,
                InitialSavings:0, InitialPension:0, InitialPensionP2:0,
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                config: { ...config, statePensionQualifyingAge: QUALIFYING_AGE, statePensionIncreaseAge: QUALIFYING_AGE + 20 }
            };
            initializeSimulator(testParamsB, []);
            runSimulationToAge(QUALIFYING_AGE, 'P2'); // Run until P2 is QUALIFYING_AGE

            let p1_B = getPerson('P1');
            let p2_B = getPerson('P2');
            let simGlobals_B = getSimulatorGlobals();

            const expectedP1YearlyB = 0; // P1 not eligible
            const expectedP2YearlyB = P2_WEEKLY_STATE_PENSION * 52;
            const expectedTotalB = expectedP2YearlyB; // Only P2 contributes

            assert(p2_B.age === QUALIFYING_AGE, `Part B - P2 age: Expected ${QUALIFYING_AGE}, Got ${p2_B.age}`);
            assert(p1_B.age === P1_AGE_NOT_ELIGIBLE, `Part B - P1 age: Expected ${P1_AGE_NOT_ELIGIBLE}, Got ${p1_B.age}`);
            assert(p1_B.yearlyIncomeStatePension === expectedP1YearlyB, 
                `Part B - P1 yearlyIncomeStatePension: Expected ${expectedP1YearlyB}, Got ${p1_B.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(p2_B.yearlyIncomeStatePension - expectedP2YearlyB) < 0.01, 
                `Part B - P2 yearlyIncomeStatePension: Expected ${expectedP2YearlyB.toFixed(2)}, Got ${p2_B.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(simGlobals_B.incomeStatePension - expectedTotalB) < 0.01, 
                `Part B - Global incomeStatePension: Expected ${expectedTotalB.toFixed(2)}, Got ${simGlobals_B.incomeStatePension.toFixed(2)}`);
        });

        it('Both P1 and P2 should receive state pensions if both are at/above qualifying age, and amounts sum correctly', () => {
            const P1_WEEKLY_STATE_PENSION = 255;
            const P2_WEEKLY_STATE_PENSION = 215;
            const QUALIFYING_AGE = config.statePensionQualifyingAge || 66;

            const testParams = {
                StartingAge: QUALIFYING_AGE,       // P1 becomes eligible
                P2StartingAge: QUALIFYING_AGE + 1, // P2 also eligible (slightly older)
                TargetAge: QUALIFYING_AGE + 5,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_STATE_PENSION,
                P2StatePensionWeekly: P2_WEEKLY_STATE_PENSION,
                InitialSavings:0, InitialPension:0, InitialPensionP2:0,
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                config: { ...config, statePensionQualifyingAge: QUALIFYING_AGE, statePensionIncreaseAge: QUALIFYING_AGE + 20 }
            };
            initializeSimulator(testParams, []);
            
            // Run for 1 year. P1 will be QUALIFYING_AGE, P2 will be QUALIFYING_AGE + 1
            runSimulationToAge(QUALIFYING_AGE, 'P1'); 

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            const simGlobals_end_year = getSimulatorGlobals();

            const expectedP1Yearly = P1_WEEKLY_STATE_PENSION * 52;
            const expectedP2Yearly = P2_WEEKLY_STATE_PENSION * 52;
            const expectedTotalYearly = expectedP1Yearly + expectedP2Yearly;

            assert(person1_g.age === QUALIFYING_AGE, `P1 age: Expected ${QUALIFYING_AGE}, Got ${person1_g.age}`);
            assert(person2_g.age === QUALIFYING_AGE + 1, `P2 age: Expected ${QUALIFYING_AGE + 1}, Got ${person2_g.age}`);

            assert(Math.abs(person1_g.yearlyIncomeStatePension - expectedP1Yearly) < 0.01,
                `P1 yearlyIncomeStatePension: Expected ${expectedP1Yearly.toFixed(2)}, Got ${person1_g.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(person2_g.yearlyIncomeStatePension - expectedP2Yearly) < 0.01,
                `P2 yearlyIncomeStatePension: Expected ${expectedP2Yearly.toFixed(2)}, Got ${person2_g.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(simGlobals_end_year.incomeStatePension - expectedTotalYearly) < 0.01,
                `Global incomeStatePension: Expected sum ${expectedTotalYearly.toFixed(2)}, Got ${simGlobals_end_year.incomeStatePension.toFixed(2)}`);
        });

        it('P1 should receive state pension increase at the statePensionIncreaseAge', () => {
            const P1_WEEKLY_BASE = 250;
            const QUALIFYING_AGE_TEST = 66;
            const INCREASE_AGE_TEST = 80;
            const INCREASE_AMOUNT_WEEKLY_TEST = 20;

            const testParams = {
                StartingAge: INCREASE_AGE_TEST,       // P1 will be INCREASE_AGE_TEST in year 1
                P2StartingAge: QUALIFYING_AGE_TEST - 5, // P2 young, not eligible
                TargetAge: INCREASE_AGE_TEST + 2,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_BASE,
                P2StatePensionWeekly: 0, // P2 gets no state pension
                InitialSavings:0, InitialPension:0, InitialPensionP2:0,
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                config: {
                    ...config,
                    statePensionQualifyingAge: QUALIFYING_AGE_TEST,
                    statePensionIncreaseAge: INCREASE_AGE_TEST,
                    statePensionIncreaseAmount: INCREASE_AMOUNT_WEEKLY_TEST
                }
            };
            initializeSimulator(testParams, []);

            // Run for 1 year, P1 will be INCREASE_AGE_TEST
            runSimulationToAge(INCREASE_AGE_TEST, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            const simGlobals_end_year = getSimulatorGlobals();

            const expectedP1YearlyTotal = (P1_WEEKLY_BASE + INCREASE_AMOUNT_WEEKLY_TEST) * 52;

            assert(person1_g.age === INCREASE_AGE_TEST, `P1 age: Expected ${INCREASE_AGE_TEST}, Got ${person1_g.age}`);
            
            assert(Math.abs(person1_g.yearlyIncomeStatePension - expectedP1YearlyTotal) < 0.01,
                `P1 yearlyIncomeStatePension with increase: Expected ${expectedP1YearlyTotal.toFixed(2)}, Got ${person1_g.yearlyIncomeStatePension.toFixed(2)}`);
            
            assert(person2_g.yearlyIncomeStatePension === 0,
                `P2 yearlyIncomeStatePension: Expected 0, Got ${person2_g.yearlyIncomeStatePension.toFixed(2)}`);

            assert(Math.abs(simGlobals_end_year.incomeStatePension - expectedP1YearlyTotal) < 0.01,
                `Global incomeStatePension with P1 increase: Expected ${expectedP1YearlyTotal.toFixed(2)}, Got ${simGlobals_end_year.incomeStatePension.toFixed(2)}`);
        });

        it('P2 should receive state pension increase at the statePensionIncreaseAge, independently of P1', () => {
            const P1_WEEKLY_BASE = 250;
            const P2_WEEKLY_BASE = 200;
            const QUALIFYING_AGE_TEST = 66;
            const INCREASE_AGE_TEST = 80;
            const INCREASE_AMOUNT_WEEKLY_TEST = 20;

            // --- Sub-Scenario A: P1 receiving base, P2 gets increase --- 
            const p1AgeScenarioA = QUALIFYING_AGE_TEST + 5; // e.g., 71 (eligible for base, not increase)
            let testParamsA = {
                StartingAge: p1AgeScenarioA,
                P2StartingAge: INCREASE_AGE_TEST, // P2 will be INCREASE_AGE_TEST
                TargetAge: INCREASE_AGE_TEST + 2,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_BASE,
                P2StatePensionWeekly: P2_WEEKLY_BASE,
                config: {
                    ...config,
                    statePensionQualifyingAge: QUALIFYING_AGE_TEST,
                    statePensionIncreaseAge: INCREASE_AGE_TEST,
                    statePensionIncreaseAmount: INCREASE_AMOUNT_WEEKLY_TEST
                }
            };
            initializeSimulator(testParamsA, []);
            runSimulationToAge(INCREASE_AGE_TEST, 'P2'); // Run until P2 is at INCREASE_AGE_TEST

            let p1_A = getPerson('P1');
            let p2_A = getPerson('P2');
            let simGlobals_A = getSimulatorGlobals();

            const expectedP1YearlyA = P1_WEEKLY_BASE * 52;
            const expectedP2YearlyA_total = (P2_WEEKLY_BASE + INCREASE_AMOUNT_WEEKLY_TEST) * 52;
            const expectedGlobalTotalA = expectedP1YearlyA + expectedP2YearlyA_total;

            assert(p2_A.age === INCREASE_AGE_TEST, `SubA - P2 age: Expected ${INCREASE_AGE_TEST}, Got ${p2_A.age}`);
            assert(p1_A.age === p1AgeScenarioA, `SubA - P1 age: Expected ${p1AgeScenarioA}, Got ${p1_A.age}`);
            assert(Math.abs(p2_A.yearlyIncomeStatePension - expectedP2YearlyA_total) < 0.01,
                `SubA - P2 yearlyIncomeStatePension with increase: Expected ${expectedP2YearlyA_total.toFixed(2)}, Got ${p2_A.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(p1_A.yearlyIncomeStatePension - expectedP1YearlyA) < 0.01,
                `SubA - P1 yearlyIncomeStatePension (base only): Expected ${expectedP1YearlyA.toFixed(2)}, Got ${p1_A.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(simGlobals_A.incomeStatePension - expectedGlobalTotalA) < 0.01,
                `SubA - Global incomeStatePension: Expected ${expectedGlobalTotalA.toFixed(2)}, Got ${simGlobals_A.incomeStatePension.toFixed(2)}`);

            // --- Sub-Scenario B: P1 not eligible, P2 gets increase ---
            const p1AgeScenarioB = QUALIFYING_AGE_TEST - 5; // e.g., 61 (not eligible)
            let testParamsB = {
                StartingAge: p1AgeScenarioB,
                P2StartingAge: INCREASE_AGE_TEST, // P2 will be INCREASE_AGE_TEST
                TargetAge: INCREASE_AGE_TEST + 2,
                Inflation: 0.0,
                StatePensionWeekly: P1_WEEKLY_BASE, // P1 has an amount, but age makes them ineligible
                P2StatePensionWeekly: P2_WEEKLY_BASE,
                config: {
                    ...config,
                    statePensionQualifyingAge: QUALIFYING_AGE_TEST,
                    statePensionIncreaseAge: INCREASE_AGE_TEST,
                    statePensionIncreaseAmount: INCREASE_AMOUNT_WEEKLY_TEST
                }
            };
            initializeSimulator(testParamsB, []);
            runSimulationToAge(INCREASE_AGE_TEST, 'P2');

            let p1_B = getPerson('P1');
            let p2_B = getPerson('P2');
            let simGlobals_B = getSimulatorGlobals();

            const expectedP1YearlyB = 0; // P1 not eligible
            const expectedP2YearlyB_total = (P2_WEEKLY_BASE + INCREASE_AMOUNT_WEEKLY_TEST) * 52;
            const expectedGlobalTotalB = expectedP2YearlyB_total;

            assert(p2_B.age === INCREASE_AGE_TEST, `SubB - P2 age: Expected ${INCREASE_AGE_TEST}, Got ${p2_B.age}`);
            assert(p1_B.age === p1AgeScenarioB, `SubB - P1 age: Expected ${p1AgeScenarioB}, Got ${p1_B.age}`);
            assert(Math.abs(p2_B.yearlyIncomeStatePension - expectedP2YearlyB_total) < 0.01,
                `SubB - P2 yearlyIncomeStatePension with increase: Expected ${expectedP2YearlyB_total.toFixed(2)}, Got ${p2_B.yearlyIncomeStatePension.toFixed(2)}`);
            assert(p1_B.yearlyIncomeStatePension === 0,
                `SubB - P1 yearlyIncomeStatePension (not eligible): Expected 0, Got ${p1_B.yearlyIncomeStatePension.toFixed(2)}`);
            assert(Math.abs(simGlobals_B.incomeStatePension - expectedGlobalTotalB) < 0.01,
                `SubB - Global incomeStatePension: Expected ${expectedGlobalTotalB.toFixed(2)}, Got ${simGlobals_B.incomeStatePension.toFixed(2)}`);
        });

        it('A person with StatePensionWeeklyParam set to 0 should not receive state pension, even if age eligible', () => {
            const QUALIFYING_AGE_TEST = config.statePensionQualifyingAge || 66;

            const testParams = {
                StartingAge: QUALIFYING_AGE_TEST, // P1 will be QUALIFYING_AGE_TEST in year 1
                P2StartingAge: QUALIFYING_AGE_TEST - 5, // P2 younger, not eligible
                TargetAge: QUALIFYING_AGE_TEST + 2,
                Inflation: 0.0,
                StatePensionWeekly: 0, // P1 is age-eligible but has 0 weekly amount
                P2StatePensionWeekly: 200, // P2 has an amount, but is not age-eligible
                InitialSavings:0, InitialPension:0, InitialPensionP2:0,
                PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                config: {
                    ...config,
                    statePensionQualifyingAge: QUALIFYING_AGE_TEST,
                    statePensionIncreaseAge: QUALIFYING_AGE_TEST + 10, // Ensure no increase applies
                    statePensionIncreaseAmount: 20
                }
            };
            initializeSimulator(testParams, []);

            // Run for 1 year, P1 will be QUALIFYING_AGE_TEST
            runSimulationToAge(QUALIFYING_AGE_TEST, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            const simGlobals_end_year = getSimulatorGlobals();

            assert(person1_g.age === QUALIFYING_AGE_TEST, `P1 age: Expected ${QUALIFYING_AGE_TEST}, Got ${person1_g.age}`);
            
            assert(person1_g.yearlyIncomeStatePension === 0,
                `P1 yearlyIncomeStatePension: Expected 0 (weekly amount is 0), Got ${person1_g.yearlyIncomeStatePension.toFixed(2)}`);
            
            assert(person2_g.yearlyIncomeStatePension === 0,
                `P2 yearlyIncomeStatePension: Expected 0 (not age eligible), Got ${person2_g.yearlyIncomeStatePension.toFixed(2)}`);

            assert(simGlobals_end_year.incomeStatePension === 0,
                `Global incomeStatePension: Expected 0, Got ${simGlobals_end_year.incomeStatePension.toFixed(2)}`);
        });

    });
}

if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('DualStatePensions', runDualStatePensionTests);
} else {
    console.log('TestDualStatePensions.js loaded - TestFramework not detected for registration.');
} 