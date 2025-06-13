// Test suite for establishing and verifying baseline scenarios for two-person simulations.
// These tests ensure that key financial outputs remain consistent over code changes.

console.log('Loading TestRegressionTwoPerson.js');

function runRegressionTwoPersonTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestRegressionTwoPerson tests.');
        return;
    }

    const { describe, it, beforeEach, afterEach, config, Constants, Utils,
        initializeSimulator, runSimulationToAge, getPerson, getRevenueInstance, getSimulatorGlobals, assert } = testFramework;

    describe('Two-Person Regression Tests - Baseline Scenarios', () => {
        let person1_g, person2_g;
        let simGlobals;
        let baseRegressionParams;

        beforeEach(() => {
            // Define a common set of parameters for regression tests - deterministic!
            baseRegressionParams = {
                StartingAge: 30,
                P2StartingAge: 28,
                TargetAge: 90,
                MarriageYear: 0, // Assuming not married for tax simplicity unless specified
                PersonalTaxCredit: 1875,
                Inflation: 0.0, // NO INFLATION for stable regression values
                InitialSavings: 10000,
                InitialPension: 5000, InitialPensionP2: 2000,
                InitialFunds: 0, InitialShares: 0,
                RetirementAge: 65, P2RetirementAge: 65,
                EmergencyStash: 20000,
                FundsAllocation: '0%', SharesAllocation: '0%', // No other investments for simplicity now
                PensionContributionPercentage: 0.15, // 15% for P1
                PensionContributionPercentageP2: 0.10, // 10% for P2
                StatePensionWeekly: 250, P2StatePensionWeekly: 230,
                simulation_mode: 'couple', // Ensure couple mode for P2 events
                // Deterministic growth rates
                PensionGrowthRate: 0.04, PensionGrowthStdDev: 0.0,
                FundsGrowthRate: 0.05, FundsGrowthStdDev: 0.0,
                SharesGrowthRate: 0.06, SharesGrowthStdDev: 0.0,
                config: { // Ensure specific config for tests, like state pension ages
                    ...config,
                    statePensionQualifyingAge: 67,
                    statePensionIncreaseAge: 80,
                    statePensionIncreaseAmount: 25
                }
            };
        });

        it('should match key financial metrics for baseline scenario at P1 Age 60', () => {
            const P1_TARGET_AGE = 60;
            // P2 will be P1_TARGET_AGE - (P1_StartAge - P2_StartAge) = 60 - (30 - 28) = 58

            const scenarioParams = {
                ...baseRegressionParams
                // Modify any specific params for this scenario if needed, otherwise uses base.
            };

            const scenarioEvents = [
                { type: 'SI', name: 'P1 Salary', amount: 70000, fromAge: 30, toAge: 64, rate: 0, extra: '' },
                { type: 'SI2', name: 'P2 Salary', amount: 50000, fromAge: 28, toAge: 64, rate: 0, extra: '' },
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: 30, toAge: 89, rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_TARGET_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();

            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            const expectedP1Pension = 302061.35;
            const expectedP2Pension = 122114.93;
            const expectedCash = -60011.66;
            const expectedP1Age = P1_TARGET_AGE;
            const expectedP2Age = P1_TARGET_AGE - (scenarioParams.StartingAge - scenarioParams.P2StartingAge);

            assert(person1_g.age === expectedP1Age, `P1 Age: Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age: Expected ${expectedP2Age}, Got ${person2_g.age}`);

            assert(Math.abs(person1_g.pension.capital() - expectedP1Pension) < 0.01,
                `P1 Pension Capital at Age ${expectedP1Age}: Expected ${expectedP1Pension.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(person2_g.pension.capital() - expectedP2Pension) < 0.01,
                `P2 Pension Capital at Age ${expectedP2Age}: Expected ${expectedP2Pension.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash at P1 Age ${expectedP1Age}: Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);
            
            // Add more assertions for other key metrics as needed (e.g., total worth, specific year's tax)
        });

        it('should match key financial metrics at P1 Retirement Age', () => {
            const P1_RETIREMENT_AGE = baseRegressionParams.RetirementAge; // 65
            // P2 will be P1_RETIREMENT_AGE - (P1_StartAge - P2_StartAge) = 65 - (30 - 28) = 63

            const scenarioParams = {
                ...baseRegressionParams
                // Modify any specific params for this scenario if needed
            };

            const scenarioEvents = [
                { type: 'SI', name: 'P1 Salary', amount: 70000, fromAge: 30, toAge: 64, rate: 0, extra: '' }, // Salary stops before retirement
                { type: 'SI2', name: 'P2 Salary', amount: 50000, fromAge: 28, toAge: 64, rate: 0, extra: '' },// P2 salary also stops at 64 for this test. SInp -> SI2
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: 30, toAge: 89, rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_RETIREMENT_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();
            const revenue = getRevenueInstance();


            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            const expectedP1PensionPotAfterLumpSum = 259797.91; // Placeholder - P1 takes lump sum
            const expectedP1LumpSum = 86599.30; // Placeholder
            const expectedP2Pension = 153361.64; // Placeholder
            const expectedCash = -21535.06; // Placeholder - includes P1 lump sum
            const expectedP1Age = P1_RETIREMENT_AGE;
            const expectedP2Age = P1_RETIREMENT_AGE - (scenarioParams.StartingAge - scenarioParams.P2StartingAge);

            assert(person1_g.age === expectedP1Age, `P1 Age at P1 Retirement: Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age at P1 Retirement: Expected ${expectedP2Age}, Got ${person2_g.age}`);

            // Check P1 phase
            assert(person1_g.phase === Constants.Phases.retired, `P1 Phase at Retirement: Expected ${Constants.Phases.retired}, Got ${person1_g.phase}`);

            // Check P1 pension pot (after lump sum)
            assert(Math.abs(person1_g.pension.capital() - expectedP1PensionPotAfterLumpSum) < 0.01,
                `P1 Pension Capital at Age ${expectedP1Age} (Post-LumpSum): Expected ${expectedP1PensionPotAfterLumpSum.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            // Check P2 pension pot
            assert(Math.abs(person2_g.pension.capital() - expectedP2Pension) < 0.01,
                `P2 Pension Capital at P1 Retirement (Age ${expectedP2Age}): Expected ${expectedP2Pension.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            // Check cash (should include P1's lump sum)
            // To verify lump sum, we can check if cash increased by roughly the lump sum amount compared to a state just before it.
            // Or, more directly, check if the revenue instance recorded it.
            // For now, we'll check the total cash.
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash at P1 Age ${expectedP1Age}: Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);

            // Check if lump sum was declared to revenue (using the placeholder value for now)
            // This requires revenue instance to track lump sums in a testable way.
            // Assuming revenue instance has a property to check declared lump sums for the year.
            // This might need a slight refactor in Revenue.js or a specific getter if not available.
            // For now, this is a conceptual check.
            // const declaredLumpSums = revenue.getYearlyLumpSumsForPerson(person1_g); // Imaginary getter
            // assert(Math.abs(declaredLumpSums - expectedP1LumpSum) < 0.01, `P1 Lump Sum declared: Expected ${expectedP1LumpSum}, Got ${declaredLumpSums}`);
        });

        it('should match key financial metrics at P2 Retirement Age', () => {
            const P2_RETIREMENT_AGE = baseRegressionParams.P2RetirementAge; // 65
            // P1 will be P2_RETIREMENT_AGE + (P1_StartAge - P2_StartAge) = 65 + (30 - 28) = 67
            const P1_TARGET_AGE_FOR_P2_RETIREMENT = P2_RETIREMENT_AGE + (baseRegressionParams.StartingAge - baseRegressionParams.P2StartingAge);

            const scenarioParams = {
                ...baseRegressionParams,
                // P1 retires at 65, P2 also at 65.
                // So P1 will be retired when P2 retires.
            };

            const scenarioEvents = [
                // P1 Salary stops at 64 (i.e., before age 65)
                { type: 'SI', name: 'P1 Salary', amount: 70000, fromAge: baseRegressionParams.StartingAge, toAge: baseRegressionParams.RetirementAge - 1, rate: 0, extra: '' },
                // P2 Salary stops at 64 (i.e., before age 65)
                { type: 'SI2', name: 'P2 Salary', amount: 50000, fromAge: baseRegressionParams.P2StartingAge, toAge: baseRegressionParams.P2RetirementAge - 1, rate: 0, extra: '' }, // SInp -> SI2
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: baseRegressionParams.StartingAge, toAge: baseRegressionParams.TargetAge -1 , rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_TARGET_AGE_FOR_P2_RETIREMENT, 'P1'); // Run until P1 is at the age corresponding to P2's retirement

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();
            const revenue = getRevenueInstance();

            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            const expectedP1Pension = 243606.01; // Placeholder - P1 already took lump sum and had some drawdown
            const expectedP2PensionPotAfterLumpSum = 130154.51; // Placeholder - P2 takes lump sum
            const expectedP2LumpSum = 65077.26; // Placeholder
            const expectedCash = -40342.50;    // Placeholder - includes P2 lump sum, P1 pension drawdown
            const expectedP1Age = P1_TARGET_AGE_FOR_P2_RETIREMENT;
            const expectedP2Age = P2_RETIREMENT_AGE;

            assert(person1_g.age === expectedP1Age, `P1 Age at P2 Retirement: Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age at P2 Retirement: Expected ${expectedP2Age}, Got ${person2_g.age}`);

            // Check P1 phase (should be retired)
            assert(person1_g.phase === Constants.Phases.retired, `P1 Phase at P2 Retirement: Expected ${Constants.Phases.retired}, Got ${person1_g.phase}`);
            // Check P2 phase (should now be retired)
            assert(person2_g.phase === Constants.Phases.retired, `P2 Phase at Retirement: Expected ${Constants.Phases.retired}, Got ${person2_g.phase}`);

            // Check P1 pension pot
            assert(Math.abs(person1_g.pension.capital() - expectedP1Pension) < 0.01,
                `P1 Pension Capital at P1 Age ${expectedP1Age}: Expected ${expectedP1Pension.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            // Check P2 pension pot (after lump sum)
            assert(Math.abs(person2_g.pension.capital() - expectedP2PensionPotAfterLumpSum) < 0.01,
                `P2 Pension Capital at Age ${expectedP2Age} (Post-LumpSum): Expected ${expectedP2PensionPotAfterLumpSum.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            // Check cash
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash at P1 Age ${expectedP1Age} (P2 Retires): Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);

            // Conceptual check for P2's lump sum declaration, similar to the P1 retirement test
            // const declaredLumpSumsP2 = revenue.getYearlyLumpSumsForPerson(person2_g); // Imaginary getter
            // assert(Math.abs(declaredLumpSumsP2 - expectedP2LumpSum) < 0.01, `P2 Lump Sum declared: Expected ${expectedP2LumpSum}, Got ${declaredLumpSumsP2}`);
        });

        it('should match key financial metrics towards end of simulation (P1 Age 85)', () => {
            const P1_TARGET_AGE = 85;
            // P2 will be P1_TARGET_AGE - (P1_StartAge - P2_StartAge) = 85 - (30 - 28) = 83

            const scenarioParams = {
                ...baseRegressionParams,
                // Both P1 and P2 retire at 65 as per baseRegressionParams
            };

            const scenarioEvents = [
                // P1 Salary stops at 64
                { type: 'SI', name: 'P1 Salary', amount: 70000, fromAge: baseRegressionParams.StartingAge, toAge: baseRegressionParams.RetirementAge - 1, rate: 0, extra: '' },
                // P2 Salary stops at 64
                { type: 'SI2', name: 'P2 Salary', amount: 50000, fromAge: baseRegressionParams.P2StartingAge, toAge: baseRegressionParams.P2RetirementAge - 1, rate: 0, extra: '' }, // SInp -> SI2
                // Living costs up to P1 age 89 (TargetAge - 1)
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: baseRegressionParams.StartingAge, toAge: baseRegressionParams.TargetAge - 1, rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_TARGET_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();

            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            // Values will reflect 20 years of P1 retirement and 18 years of P2 retirement
            const expectedP1Pension = 10000.00; // Placeholder - pension likely depleting or low
            const expectedP2Pension = 20000.00; // Placeholder - pension likely depleting or low
            const expectedCash = -500000.00;   // Placeholder - cash likely significantly negative with ongoing expenses
            const expectedP1Age = P1_TARGET_AGE;
            const expectedP2Age = P1_TARGET_AGE - (scenarioParams.StartingAge - scenarioParams.P2StartingAge);

            assert(person1_g.age === expectedP1Age, `P1 Age at P1 Age ${P1_TARGET_AGE}: Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age at P1 Age ${P1_TARGET_AGE}: Expected ${expectedP2Age}, Got ${person2_g.age}`);

            // Check phases (both should be retired)
            assert(person1_g.phase === Constants.Phases.retired, `P1 Phase at Age ${P1_TARGET_AGE}: Expected ${Constants.Phases.retired}, Got ${person1_g.phase}`);
            assert(person2_g.phase === Constants.Phases.retired, `P2 Phase at Age ${expectedP2Age}: Expected ${Constants.Phases.retired}, Got ${person2_g.phase}`);

            // Check P1 pension pot
            assert(Math.abs(person1_g.pension.capital() - expectedP1Pension) < 0.01,
                `P1 Pension Capital at Age ${expectedP1Age}: Expected ${expectedP1Pension.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            // Check P2 pension pot
            assert(Math.abs(person2_g.pension.capital() - expectedP2Pension) < 0.01,
                `P2 Pension Capital at Age ${expectedP2Age}: Expected ${expectedP2Pension.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            // Check cash
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash at P1 Age ${expectedP1Age}: Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);
        });

        it('should match key financial metrics for different income profile (P1 Age 60)', () => {
            const P1_TARGET_AGE = 60;
            // P2 will be P1_TARGET_AGE - (P1_StartAge - P2_StartAge) = 60 - (30 - 28) = 58

            const scenarioParams = {
                ...baseRegressionParams,
                PensionContributionPercentage: 0.20, // P1: Higher contribution
                PensionContributionPercentageP2: 0.05, // P2: Lower contribution
                // Using default retirement ages (65 for both)
            };

            const scenarioEvents = [
                // P1: Lower salary
                { type: 'SI', name: 'P1 Salary', amount: 55000, fromAge: scenarioParams.StartingAge, toAge: scenarioParams.RetirementAge - 1, rate: 0, extra: '' },
                // P2: Higher salary
                { type: 'SI2', name: 'P2 Salary', amount: 85000, fromAge: scenarioParams.P2StartingAge, toAge: scenarioParams.P2RetirementAge - 1, rate: 0, extra: '' }, // SInp -> SI2
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: scenarioParams.StartingAge, toAge: scenarioParams.TargetAge - 1, rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_TARGET_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();

            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            const expectedP1Pension = 300000.00; // Placeholder
            const expectedP2Pension = 100000.00; // Placeholder
            const expectedCash = -70000.00;    // Placeholder
            const expectedP1Age = P1_TARGET_AGE;
            const expectedP2Age = P1_TARGET_AGE - (scenarioParams.StartingAge - scenarioParams.P2StartingAge);

            assert(person1_g.age === expectedP1Age, `P1 Age (Diff Income): Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age (Diff Income): Expected ${expectedP2Age}, Got ${person2_g.age}`);

            assert(Math.abs(person1_g.pension.capital() - expectedP1Pension) < 0.01,
                `P1 Pension Capital (Diff Income) at Age ${expectedP1Age}: Expected ${expectedP1Pension.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(person2_g.pension.capital() - expectedP2Pension) < 0.01,
                `P2 Pension Capital (Diff Income) at Age ${expectedP2Age}: Expected ${expectedP2Pension.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash (Diff Income) at P1 Age ${expectedP1Age}: Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);
        });

        it('should match key financial metrics for married scenario (P1 Age 60)', () => {
            const P1_TARGET_AGE = 60;
            // P2 will be P1_TARGET_AGE - (P1_StartAge - P2_StartAge) = 60 - (30 - 28) = 58

            const scenarioParams = {
                ...baseRegressionParams,
                MarriageYear: 1, // Married from the start of simulation (year >= 1)
                PersonalTaxCredit: 3750, // Married person's tax credit (e.g., IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_MARRIED)
                // Using default retirement ages (65 for both)
            };

            const scenarioEvents = [
                { type: 'SI', name: 'P1 Salary', amount: 70000, fromAge: scenarioParams.StartingAge, toAge: scenarioParams.RetirementAge - 1, rate: 0, extra: '' },
                { type: 'SI2', name: 'P2 Salary', amount: 50000, fromAge: scenarioParams.P2StartingAge, toAge: scenarioParams.P2RetirementAge - 1, rate: 0, extra: '' }, // SInp -> SI2
                { type: 'E', name: 'Annual Living Costs', amount: 30000, fromAge: scenarioParams.StartingAge, toAge: scenarioParams.TargetAge - 1, rate: 0, extra: '' }
            ];

            initializeSimulator(scenarioParams, scenarioEvents);
            runSimulationToAge(P1_TARGET_AGE, 'P1');

            person1_g = getPerson('P1');
            person2_g = getPerson('P2');
            simGlobals = getSimulatorGlobals();
            const revenue = getRevenueInstance(); // Revenue instance for the last simulated year

            // --- IMPORTANT: These expected values are placeholders. ---
            // --- Update these with actual values from a trusted simulation run. ---
            const expectedP1Pension = 302061.35; // Placeholder - Same as non-married base, tax diffs affect cash
            const expectedP2Pension = 122114.93; // Placeholder - Same as non-married base, tax diffs affect cash
            const expectedCash = -50000.00;    // Placeholder - Expected to be different due to married tax rules
            const expectedIncomeTaxLastYear = 15000.00; // Placeholder for revenue.it in the year P1 turns 60
            const expectedP1Age = P1_TARGET_AGE;
            const expectedP2Age = P1_TARGET_AGE - (scenarioParams.StartingAge - scenarioParams.P2StartingAge);

            assert(person1_g.age === expectedP1Age, `P1 Age (Married): Expected ${expectedP1Age}, Got ${person1_g.age}`);
            assert(person2_g.age === expectedP2Age, `P2 Age (Married): Expected ${expectedP2Age}, Got ${person2_g.age}`);

            assert(Math.abs(person1_g.pension.capital() - expectedP1Pension) < 0.01,
                `P1 Pension Capital (Married) at Age ${expectedP1Age}: Expected ${expectedP1Pension.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(person2_g.pension.capital() - expectedP2Pension) < 0.01,
                `P2 Pension Capital (Married) at Age ${expectedP2Age}: Expected ${expectedP2Pension.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);
            
            assert(Math.abs(simGlobals.cash - expectedCash) < 0.01,
                `Total Cash (Married) at P1 Age ${expectedP1Age}: Expected ${expectedCash.toFixed(2)}, Got ${simGlobals.cash.toFixed(2)}`);

            assert(Math.abs(revenue.it - expectedIncomeTaxLastYear) < 0.01,
                `Income Tax (Married) for P1 Age ${expectedP1Age} year: Expected ${expectedIncomeTaxLastYear.toFixed(2)}, Got ${revenue.it.toFixed(2)}`);
        });

        // Add more regression test cases for different scenarios or different checkpoints.

    });
}

if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('RegressionTwoPerson', runRegressionTwoPersonTests);
} else {
    console.log('TestRegressionTwoPerson.js loaded - TestFramework not detected for registration.');
} 