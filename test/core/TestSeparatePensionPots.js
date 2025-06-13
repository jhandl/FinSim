// Test suite for separate pension pot functionalities for two persons.
// Verifies individual contributions, lump sums, drawdowns, and P2 withdrawal logic.

console.log('Loading TestSeparatePensionPots.js');

function runSeparatePensionPotsTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestSeparatePensionPots tests.');
        return;
    }

    const { describe, it, beforeEach, afterEach, config, Constants, Utils,
        createPerson, initializeSimulator, runSimulationToAge, getPerson, getRevenueInstance, getSimulatorGlobals, assert } = testFramework;

    describe('Separate Pension Pot Functionalities', () => {
        let person1_g, person2_g; // To store person objects from getPerson
        let baseParams, baseEvents;

        beforeEach(() => {
            baseParams = {
                StartingAge: 30,
                P2StartingAge: 28,
                TargetAge: 90,
                MarriageYear: 0,
                PersonalTaxCredit: 1875,
                Inflation: 0.0, // Number
                InitialSavings: 10000,
                InitialPension: 0, InitialPensionP2: 0, // Start with no initial pension
                InitialFunds: 0, InitialShares: 0,
                RetirementAge: 65, P2RetirementAge: 65,
                EmergencyStash: 5000,
                PensionContributionPercentage: 0.10, // 10% for P1
                PensionContributionPercentageP2: 0.08, // 8% for P2
                StatePensionWeekly: 250, P2StatePensionWeekly: 240,
                PensionGrowthRate: 0.05, // 5%
                PensionGrowthStdDev: 0.0 // For deterministic growth
            };
            baseEvents = []; 
            // Note: initializeSimulator is called within each test with specific params/events
        });

        describe('Individual Pension Contributions', () => {
            it('P1 and P2 should accumulate pension funds separately based on their individual contribution rates via SI (P1) and SI2 (P2) events', () => {
                const p1StartAge = 30;
                const p2StartAge = 28; // P2 is 2 years younger
                const numContributionYears = 5;

                const p1Salary = 50000;
                const p2Salary = 40000;

                // Override necessary baseParams
                const currentParams = {
                    ...baseParams,
                    StartingAge: p1StartAge,
                    P2StartingAge: p2StartAge,
                    simulation_mode: 'couple' // Ensure couple mode for SI2
                };

                const currentEvents = [
                    { type: 'SI', name: 'P1 Salary', amount: p1Salary, fromAge: p1StartAge, toAge: p1StartAge + numContributionYears - 1, rate: 0.0, extra: '' },
                    { type: 'SI2', name: 'P2 Salary', amount: p2Salary, fromAge: p2StartAge, toAge: p2StartAge + numContributionYears - 1, rate: 0.0, extra: '' } // Changed SInp to SI2
                ];

                initializeSimulator(currentParams, currentEvents);
                
                // Simulate for numContributionYears. P1 will reach age p1StartAge + numContributionYears.
                // Person's age is incremented at the start of resetYearlyVariables.
                // Contributions are made in processEvents. Pension growth in person.addYear() -> pension.addYear().
                // If P1 starts at 30, after 5 years of contributions (at ages 30,31,32,33,34), P1's age will be 35.
                runSimulationToAge(p1StartAge + numContributionYears, 'P1'); 

                person1_g = getPerson('P1');
                person2_g = getPerson('P2');

                // Expected values calculated manually:
                // P1: 5 years, 50k salary, 10% contrib (5k/yr), 5% growth. Expected: 29009.5640625
                // P2: 5 years, 40k salary, 8% contrib (3.2k/yr), 5% growth. Expected: 18566.121
                const expectedP1Pension = 29009.5640625;
                const expectedP2Pension = 18566.121;
                
                assert(person1_g && person1_g.pension, 'P1 object or P1 pension is null/undefined.');
                assert(person2_g && person2_g.pension, 'P2 object or P2 pension is null/undefined.');

                const p1PensionCapital = person1_g.pension.capital();
                const p2PensionCapital = person2_g.pension.capital();

                assert(Math.abs(p1PensionCapital - expectedP1Pension) < 0.01,
                    `P1 pension capital after ${numContributionYears} years: Expected ${expectedP1Pension.toFixed(2)}, Got ${p1PensionCapital.toFixed(2)}`);
                
                assert(Math.abs(p2PensionCapital - expectedP2Pension) < 0.01,
                    `P2 pension capital after ${numContributionYears} years: Expected ${expectedP2Pension.toFixed(2)}, Got ${p2PensionCapital.toFixed(2)} (P2 age is ${person2_g.age})`);
            });
        });

        describe('Individual Lump Sums', () => {
            it('P1 should receive their pension lump sum at their retirement age, P2 fund unaffected', () => {
                const P1_START_AGE = 50;
                const P1_RETIREMENT_AGE = 65;
                const P2_START_AGE = 45;
                const P2_RETIREMENT_AGE = 67;

                const p1InitialPension = 20000;
                const p2InitialPension = 15000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_START_AGE,
                    RetirementAge: P1_RETIREMENT_AGE,
                    InitialPension: p1InitialPension,
                    P2StartingAge: P2_START_AGE,
                    P2RetirementAge: P2_RETIREMENT_AGE,
                    InitialPensionP2: p2InitialPension,
                    PensionContributionPercentage: 0.10, // P1 contrib
                    PensionContributionPercentageP2: 0.08, // P2 contrib
                    PensionGrowthRate: 0.05, PensionGrowthStdDev: 0.0,
                    Inflation: 0.0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    // Make salaries high enough that pension contributions are significant
                };

                const currentEvents = [
                    { type: 'SI', name: 'P1 Sal', amount: 60000, fromAge: P1_START_AGE, toAge: P1_RETIREMENT_AGE - 1, rate: 0, extra: '' },
                    { type: 'SI2', name: 'P2 Sal', amount: 50000, fromAge: P2_START_AGE, toAge: P2_RETIREMENT_AGE -1 , rate: 0, extra: '' } // Changed SInp to SI2
                ];

                initializeSimulator(currentParams, currentEvents);

                // Run simulation up to the year P1 is about to retire (age 64)
                runSimulationToAge(P1_RETIREMENT_AGE -1, 'P1');
                person1_g = getPerson('P1');
                person2_g = getPerson('P2');
                const simGlobals_before_lumpsum = getSimulatorGlobals();
                const p1Pension_before_lumpsum = person1_g.pension.capital();
                const p2Pension_before_lumpsum = person2_g.pension.capital();
                const cash_before_lumpsum = simGlobals_before_lumpsum.cash;
                const p1Phase_before_lumpsum = person1_g.phase;
                const p2Phase_before_lumpsum = person2_g.phase;

                assert(p1Phase_before_lumpsum === Constants.Phases.growth, `P1 phase should be growth before retirement, was ${p1Phase_before_lumpsum}`);
                assert(p2Phase_before_lumpsum === Constants.Phases.growth, `P2 phase should be growth, was ${p2Phase_before_lumpsum}`);

                // Run one more year for P1 to retire (age 65)
                runSimulationToAge(P1_RETIREMENT_AGE, 'P1');
                person1_g = getPerson('P1'); // Refresh person objects
                person2_g = getPerson('P2');
                const simGlobals_after_lumpsum = getSimulatorGlobals();
                const p1Pension_after_lumpsum = person1_g.pension.capital();
                const p2Pension_after_lumpsum = person2_g.pension.capital();
                const cash_after_lumpsum = simGlobals_after_lumpsum.cash;
                const p1Phase_after_lumpsum = person1_g.phase;

                // 1. Calculate P1's expected pension just before lump sum (after growth for the year P1 turns 65)
                // P1 makes one last contribution at age 64. Pension grows for one more year.
                let p1Pension_at_retirement_before_lump = p1Pension_before_lumpsum;
                // Last contribution was made when P1 was P1_RETIREMENT_AGE - 1 (e.g. 64)
                // The SI event ran for toAge: P1_RETIREMENT_AGE - 1.
                // So, no more contributions in the year P1 turns P1_RETIREMENT_AGE.
                // Pension just grows for one year.
                p1Pension_at_retirement_before_lump *= (1 + currentParams.PensionGrowthRate);
                
                const expectedLumpSum = p1Pension_at_retirement_before_lump * config.pensionLumpSumLimit;
                const expectedP1Pension_after_lumpsum = p1Pension_at_retirement_before_lump * (1 - config.pensionLumpSumLimit);

                assert(Math.abs(cash_after_lumpsum - (cash_before_lumpsum + expectedLumpSum)) < 0.01,
                    `Cash after P1 lump sum: Expected ~${(cash_before_lumpsum + expectedLumpSum).toFixed(2)}, Got ${cash_after_lumpsum.toFixed(2)}`);
                
                assert(p1Phase_after_lumpsum === Constants.Phases.retired, `P1 phase should be retired, was ${p1Phase_after_lumpsum}`);
                
                assert(Math.abs(p1Pension_after_lumpsum - expectedP1Pension_after_lumpsum) < 0.01,
                    `P1 pension capital after lump sum: Expected ${expectedP1Pension_after_lumpsum.toFixed(2)}, Got ${p1Pension_after_lumpsum.toFixed(2)}`);

                // 2. P2's pension fund should only have grown by one year, unaffected by P1's lump sum
                // P2 makes a contribution at age P2_START_AGE + (P1_RETIREMENT_AGE - P1_START_AGE) -1
                // and then grows for one more year.
                let p2ExpectedPension_after_p1_lumpsum = p2Pension_before_lumpsum;
                 // P2 is P1_RETIREMENT_AGE - P1_START_AGE years older than P2_START_AGE.
                // Current P2 age is P2_START_AGE + (P1_RETIREMENT_AGE - P1_START_AGE).
                // If P2's current age is less than P2_RETIREMENT_AGE, they contribute.
                const p2CurrentAge = person2_g.age; // Age after P1 turned P1_RETIREMENT_AGE
                if (p2CurrentAge <= P2_RETIREMENT_AGE -1) { // If P2 is still contributing
                    const p2Contrib = 50000 * currentParams.PensionContributionPercentageP2;
                    p2ExpectedPension_after_p1_lumpsum += p2Contrib;
                }
                p2ExpectedPension_after_p1_lumpsum *= (1 + currentParams.PensionGrowthRate);

                assert(Math.abs(p2Pension_after_lumpsum - p2ExpectedPension_after_p1_lumpsum) < 0.01,
                    `P2 pension capital: Expected ~${p2ExpectedPension_after_p1_lumpsum.toFixed(2)}, Got ${p2Pension_after_lumpsum.toFixed(2)}. P2 should be unaffected by P1 lump sum.`);
                assert(person2_g.phase === Constants.Phases.growth, `P2 phase should still be growth, was ${person2_g.phase}`);
            });

            it('P2 should receive their pension lump sum at their retirement age, P1 fund unaffected', () => {
                const P1_START_AGE = 30;
                const P1_RETIREMENT_AGE = 70; // P1 retires much later
                const P1_INITIAL_PENSION = 10000;
                const P1_SALARY = 60000;
                const P1_CONTRIB_PERCENT = 0.10;

                const P2_START_AGE = 50;
                const P2_RETIREMENT_AGE = 65; // P2 retires first
                const P2_INITIAL_PENSION = 20000;
                const P2_SALARY = 50000;
                const P2_CONTRIB_PERCENT = 0.08;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_START_AGE,
                    RetirementAge: P1_RETIREMENT_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    PensionContributionPercentage: P1_CONTRIB_PERCENT,
                    P2StartingAge: P2_START_AGE,
                    P2RetirementAge: P2_RETIREMENT_AGE,
                    InitialPensionP2: P2_INITIAL_PENSION,
                    PensionContributionPercentageP2: P2_CONTRIB_PERCENT,
                    // Ensure state pensions don't trigger early
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0, 
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { // Override global config for this test if necessary, e.g. state pension age
                         ...config, // Spread existing config
                         statePensionQualifyingAge: 99 
                    }
                };

                const currentEvents = [
                    { type: 'SI', name: 'P1 Sal', amount: P1_SALARY, fromAge: P1_START_AGE, toAge: P1_RETIREMENT_AGE - 1, rate: 0, extra: '' },
                    { type: 'SI2', name: 'P2 Sal', amount: P2_SALARY, fromAge: P2_START_AGE, toAge: P2_RETIREMENT_AGE - 1, rate: 0, extra: '' } // Changed SInp to SI2
                ];

                initializeSimulator(currentParams, currentEvents);

                // Run simulation up to the year P2 is about to retire (age 64)
                // P1 will be P1_START_AGE + (P2_RETIREMENT_AGE - 1 - P2_START_AGE) = 30 + (64 - 50) = 30 + 14 = 44
                runSimulationToAge(P2_RETIREMENT_AGE - 1, 'P2');
                
                let p1_before_p2_lump = getPerson('P1');
                let p2_before_p2_lump = getPerson('P2');
                const simGlobals_before_p2_lump = getSimulatorGlobals();
                
                const p1Pension_val_before_p2_lump = p1_before_p2_lump.pension.capital();
                const p2Pension_val_before_p2_lump = p2_before_p2_lump.pension.capital();
                const cash_val_before_p2_lump = simGlobals_before_p2_lump.cash;

                assert(p1_before_p2_lump.phase === Constants.Phases.growth, `P1 phase should be growth, was ${p1_before_p2_lump.phase}`);
                assert(p2_before_p2_lump.phase === Constants.Phases.growth, `P2 phase should be growth before retirement, was ${p2_before_p2_lump.phase}`);
                assert(p2_before_p2_lump.age === P2_RETIREMENT_AGE - 1, `P2 age should be ${P2_RETIREMENT_AGE - 1}, was ${p2_before_p2_lump.age}`);

                // Run one more year for P2 to retire (P2 turns 65, P1 turns 45)
                runSimulationToAge(P2_RETIREMENT_AGE, 'P2');
                
                let p1_after_p2_lump = getPerson('P1');
                let p2_after_p2_lump = getPerson('P2');
                const simGlobals_after_p2_lump = getSimulatorGlobals();

                // P2 Assertions (Lump Sum)
                const p2Pension_grown_for_retire_year = p2Pension_val_before_p2_lump * (1 + currentParams.PensionGrowthRate);
                const expectedP2LumpSum = p2Pension_grown_for_retire_year * config.pensionLumpSumLimit;
                const expectedP2Pension_after_lumpsum = p2Pension_grown_for_retire_year * (1 - config.pensionLumpSumLimit);

                assert(Math.abs(simGlobals_after_p2_lump.cash - (cash_val_before_p2_lump + expectedP2LumpSum)) < 0.01,
                    `Cash after P2 lump sum: Expected increase of ${expectedP2LumpSum.toFixed(2)}. Before: ${cash_val_before_p2_lump.toFixed(2)}, After: ${simGlobals_after_p2_lump.cash.toFixed(2)}`);
                assert(p2_after_p2_lump.phase === Constants.Phases.retired, `P2 phase should be retired, was ${p2_after_p2_lump.phase}`);
                assert(Math.abs(p2_after_p2_lump.pension.capital() - expectedP2Pension_after_lumpsum) < 0.01,
                    `P2 pension capital after lump sum: Expected ${expectedP2Pension_after_lumpsum.toFixed(2)}, Got ${p2_after_p2_lump.pension.capital().toFixed(2)}`);

                // P1 Assertions (Fund Unaffected other than own growth/contributions)
                // P1 contributes at age P1_START_AGE + (P2_RETIREMENT_AGE - P2_START_AGE) = 30 + (65-50) = 45
                const p1_contrib_in_p2_retire_year = P1_SALARY * P1_CONTRIB_PERCENT;
                const p1_pension_grown_in_p2_retire_year = p1Pension_val_before_p2_lump * (1 + currentParams.PensionGrowthRate);
                const expectedP1Pension_final = p1_pension_grown_in_p2_retire_year + p1_contrib_in_p2_retire_year;
                
                assert(p1_after_p2_lump.phase === Constants.Phases.growth, `P1 phase should remain growth, was ${p1_after_p2_lump.phase}`);
                assert(Math.abs(p1_after_p2_lump.pension.capital() - expectedP1Pension_final) < 0.01,
                    `P1 pension capital: Expected ${expectedP1Pension_final.toFixed(2)}, Got ${p1_after_p2_lump.pension.capital().toFixed(2)}. P1 fund should be unaffected by P2 lump sum.`);
            });
        });

        describe('Individual Pension Drawdowns', () => {
            it('P1 should draw down from their pension pot after retirement, P2 pot unaffected', () => {
                const P1_START_AGE = 60;
                const P1_RETIREMENT_AGE = 65;
                const P1_INITIAL_PENSION = 100000;

                const P2_START_AGE = 58;
                const P2_RETIREMENT_AGE = 68; // P2 retires later
                const P2_INITIAL_PENSION = 80000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_START_AGE,
                    RetirementAge: P1_RETIREMENT_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    PensionContributionPercentage: 0, // No P1 contributions for simplicity
                    P2StartingAge: P2_START_AGE,
                    P2RetirementAge: P2_RETIREMENT_AGE,
                    InitialPensionP2: P2_INITIAL_PENSION,
                    PensionContributionPercentageP2: 0, // No P2 contributions for simplicity
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { 
                        ...config, statePensionQualifyingAge: 99 
                    }
                };

                initializeSimulator(currentParams, []); // No ongoing salary events

                // Run to P1's retirement age (65). P1 takes lump sum.
                runSimulationToAge(P1_RETIREMENT_AGE, 'P1');
                let p1_at_retirement = getPerson('P1');
                let p2_at_p1_retirement = getPerson('P2');
                
                const p1_capital_after_lump = p1_at_retirement.pension.capital();
                const p2_capital_at_p1_retire_p2age63 = p2_at_p1_retirement.pension.capital();
                assert(p1_at_retirement.phase === Constants.Phases.retired, `P1 should be retired at age ${P1_RETIREMENT_AGE}`);

                // Run one more year for P1 drawdown (P1 is 66, P2 is 64)
                runSimulationToAge(P1_RETIREMENT_AGE + 1, 'P1');
                let p1_after_drawdown_year = getPerson('P1');
                let p2_after_p1_drawdown_year = getPerson('P2');
                const simGlobals_after_drawdown = getSimulatorGlobals();

                // P1 Drawdown Assertions (P1 is age 66)
                const p1_capital_grown_for_drawdown = p1_capital_after_lump * (1 + currentParams.PensionGrowthRate);
                
                // Manually determine drawdown rate for age 66 from config.pensionMinDrawdownBands
                // Example: {0: 0.04, 60: 0.05, 70: 0.06}
                let drawdown_rate_p1_age_66 = 0.04; // Default or lowest band
                if (config.pensionMinDrawdownBands) {
                    const ageBands = Object.keys(config.pensionMinDrawdownBands).map(Number).sort((a,b) => a-b);
                    for (let i = ageBands.length - 1; i >= 0; i--) {
                        if (p1_after_drawdown_year.age >= ageBands[i]) {
                            drawdown_rate_p1_age_66 = config.pensionMinDrawdownBands[ageBands[i]];
                            break;
                        }
                    }
                }
                const expected_p1_actual_drawdown_value = p1_capital_grown_for_drawdown * drawdown_rate_p1_age_66;
                const p1_recorded_drawdown = p1_after_drawdown_year.yearlyIncomePrivatePension;

                assert(Math.abs(p1_recorded_drawdown - expected_p1_actual_drawdown_value) < 0.01,
                    `P1 Drawdown at age ${p1_after_drawdown_year.age}: Expected ${expected_p1_actual_drawdown_value.toFixed(2)}, Got ${p1_recorded_drawdown.toFixed(2)} (Rate: ${drawdown_rate_p1_age_66})`);

                const expected_p1_capital_after_drawdown = p1_capital_grown_for_drawdown - expected_p1_actual_drawdown_value;
                assert(Math.abs(p1_after_drawdown_year.pension.capital() - expected_p1_capital_after_drawdown) < 0.01,
                    `P1 Pension Capital after drawdown: Expected ${expected_p1_capital_after_drawdown.toFixed(2)}, Got ${p1_after_drawdown_year.pension.capital().toFixed(2)}`);
                assert(p1_after_drawdown_year.phase === Constants.Phases.retired, `P1 phase should remain retired, was ${p1_after_drawdown_year.phase}`);

                // P2 Unaffected Assertions (P2 is age 64)
                const expected_p2_capital_grown = p2_capital_at_p1_retire_p2age63 * (1 + currentParams.PensionGrowthRate);
                assert(Math.abs(p2_after_p1_drawdown_year.pension.capital() - expected_p2_capital_grown) < 0.01,
                    `P2 Pension Capital: Expected ${expected_p2_capital_grown.toFixed(2)} (unaffected by P1 drawdown), Got ${p2_after_p1_drawdown_year.pension.capital().toFixed(2)}`);
                assert(p2_after_p1_drawdown_year.phase === Constants.Phases.growth, `P2 phase should remain growth, was ${p2_after_p1_drawdown_year.phase}`);
            });

            it('P2 should draw down from their pension pot after retirement, P1 pot unaffected', () => {
                const P2_START_AGE = 60;
                const P2_RETIREMENT_AGE = 65;
                const P2_INITIAL_PENSION = 100000;

                const P1_START_AGE = 58;
                const P1_RETIREMENT_AGE = 68; // P1 retires later
                const P1_INITIAL_PENSION = 80000;

                const currentParams = {
                    ...baseParams,
                    P2StartingAge: P2_START_AGE,
                    P2RetirementAge: P2_RETIREMENT_AGE,
                    InitialPensionP2: P2_INITIAL_PENSION,
                    PensionContributionPercentageP2: 0, // No P2 contributions
                    StartingAge: P1_START_AGE,
                    RetirementAge: P1_RETIREMENT_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    PensionContributionPercentage: 0, // No P1 contributions
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { 
                        ...config, statePensionQualifyingAge: 99 
                    }
                };

                initializeSimulator(currentParams, []); 

                // Run to P2's retirement age (65). P2 takes lump sum. P1 will be 63.
                runSimulationToAge(P2_RETIREMENT_AGE, 'P2');
                let p2_at_retirement = getPerson('P2');
                let p1_at_p2_retirement = getPerson('P1');
                
                const p2_capital_after_lump = p2_at_retirement.pension.capital();
                const p1_capital_at_p2_retire_p1age63 = p1_at_p2_retirement.pension.capital();
                assert(p2_at_retirement.phase === Constants.Phases.retired, `P2 should be retired at age ${P2_RETIREMENT_AGE}`);

                // Run one more year for P2 drawdown (P2 is 66, P1 is 64)
                runSimulationToAge(P2_RETIREMENT_AGE + 1, 'P2');
                let p2_after_drawdown_year = getPerson('P2');
                let p1_after_p2_drawdown_year = getPerson('P1');

                // P2 Drawdown Assertions (P2 is age 66)
                const p2_capital_grown_for_drawdown = p2_capital_after_lump * (1 + currentParams.PensionGrowthRate);
                
                let drawdown_rate_p2_age_66 = 0.04; // Default
                if (config.pensionMinDrawdownBands) {
                    const ageBands = Object.keys(config.pensionMinDrawdownBands).map(Number).sort((a,b) => a-b);
                    for (let i = ageBands.length - 1; i >= 0; i--) {
                        if (p2_after_drawdown_year.age >= ageBands[i]) {
                            drawdown_rate_p2_age_66 = config.pensionMinDrawdownBands[ageBands[i]];
                            break;
                        }
                    }
                }
                const expected_p2_actual_drawdown_value = p2_capital_grown_for_drawdown * drawdown_rate_p2_age_66;
                const p2_recorded_drawdown = p2_after_drawdown_year.yearlyIncomePrivatePension;

                assert(Math.abs(p2_recorded_drawdown - expected_p2_actual_drawdown_value) < 0.01,
                    `P2 Drawdown at age ${p2_after_drawdown_year.age}: Expected ${expected_p2_actual_drawdown_value.toFixed(2)}, Got ${p2_recorded_drawdown.toFixed(2)} (Rate: ${drawdown_rate_p2_age_66})`);

                const expected_p2_capital_after_drawdown = p2_capital_grown_for_drawdown - expected_p2_actual_drawdown_value;
                assert(Math.abs(p2_after_drawdown_year.pension.capital() - expected_p2_capital_after_drawdown) < 0.01,
                    `P2 Pension Capital after drawdown: Expected ${expected_p2_capital_after_drawdown.toFixed(2)}, Got ${p2_after_drawdown_year.pension.capital().toFixed(2)}`);
                assert(p2_after_drawdown_year.phase === Constants.Phases.retired, `P2 phase should remain retired, was ${p2_after_drawdown_year.phase}`);

                // P1 Unaffected Assertions (P1 is age 64)
                const expected_p1_capital_grown = p1_capital_at_p2_retire_p1age63 * (1 + currentParams.PensionGrowthRate);
                assert(Math.abs(p1_after_p2_drawdown_year.pension.capital() - expected_p1_capital_grown) < 0.01,
                    `P1 Pension Capital: Expected ${expected_p1_capital_grown.toFixed(2)} (unaffected by P2 drawdown), Got ${p1_after_p2_drawdown_year.pension.capital().toFixed(2)}`);
                assert(p1_after_p2_drawdown_year.phase === Constants.Phases.growth, `P1 phase should remain growth, was ${p1_after_p2_drawdown_year.phase}`);
            });
        });

        describe('Deficit Handling & P2 Pension Withdrawal (via Simulator.withdraw)', () => {
            it('If deficit occurs, P1 pension should be used first (if P1 retired/at retirement age)', () => {
                const P1_RETIRE_AGE = 65;
                const P1_INITIAL_PENSION = 50000;
                const P2_INITIAL_PENSION = 40000;
                const INITIAL_CASH = 1000;
                const LARGE_EXPENSE = 20000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_RETIRE_AGE, // P1 starts at retirement age
                    RetirementAge: P1_RETIRE_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    P2StartingAge: P1_RETIRE_AGE - 5, // P2 is younger, not retired (age 60)
                    P2RetirementAge: P1_RETIRE_AGE + 3, // P2 retires at 68
                    InitialPensionP2: P2_INITIAL_PENSION,
                    InitialSavings: INITIAL_CASH,
                    PensionGrowthRate: 0.0, // No growth for simplicity
                    PensionContributionPercentage: 0, PensionContributionPercentageP2: 0, // No contributions
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { ...config, statePensionQualifyingAge: 99, pensionLumpSumLimit: 0.25 }
                };

                const currentEvents = [
                    { type: 'E', name: 'Big Deficit Expense', amount: LARGE_EXPENSE, fromAge: P1_RETIRE_AGE, toAge: P1_RETIRE_AGE, rate: 0, extra: '' }
                ];

                initializeSimulator(currentParams, currentEvents);

                // Run for one year where P1 retires and deficit occurs
                // P1 will be P1_RETIRE_AGE (e.g. 65)
                runSimulationToAge(P1_RETIRE_AGE, 'P1'); 
                
                person1_g = getPerson('P1');
                person2_g = getPerson('P2');
                const simGlobals_end_year = getSimulatorGlobals();

                // Calculations based on the thought process:
                // 1. Initial cash: 1000
                // 2. P1 lump sum (25% of 50k): +12500. Cash = 13500. P1 Pension = 37500.
                // 3. P1 scheduled drawdown (age 65, e.g., 5% of 37.5k): 1875. P1 Pension = 35625. Income = 1875.
                // 4. Expense: 20000.
                // 5. Deficit = Expense - Income = 20000 - 1875 = 18125.
                // 6. Cash needed from withdrawal = Deficit - CurrentCash = 18125 - 13500 = 4625.
                // 7. P1 pension covers 4625. P1 Pension becomes 35625 - 4625 = 31000.
                // 8. Final cash = 4625 (amount withdrawn to cover the post-cash-depletion deficit part).

                const expectedP1PensionFinal = 31000;
                const expectedP2PensionFinal = P2_INITIAL_PENSION; // No growth, no activity
                const expectedFinalCash = 4625;

                assert(person1_g.phase === Constants.Phases.retired, `P1 should be retired. Phase: ${person1_g.phase}`);
                assert(person2_g.phase === Constants.Phases.growth, `P2 should be in growth. Phase: ${person2_g.phase}`);

                assert(Math.abs(person1_g.pension.capital() - expectedP1PensionFinal) < 0.01,
                    `P1 Pension after deficit: Expected ${expectedP1PensionFinal.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
                
                assert(Math.abs(person2_g.pension.capital() - expectedP2PensionFinal) < 0.01,
                    `P2 Pension after P1 deficit: Expected ${expectedP2PensionFinal.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)} (should be untouched)`);

                assert(Math.abs(simGlobals_end_year.cash - expectedFinalCash) < 0.01,
                    `Final cash after deficit handling: Expected ${expectedFinalCash.toFixed(2)}, Got ${simGlobals_end_year.cash.toFixed(2)}`);
                
                // Also check cashDeficit if available (expect 0 if deficit fully covered)
                if (simGlobals_end_year.hasOwnProperty('cashDeficit')) {
                    assert(simGlobals_end_year.cashDeficit === 0, `cashDeficit should be 0 if P1 pension covered it, was ${simGlobals_end_year.cashDeficit}`);
                }
            });

            it('If deficit remains after P1 pension (or P1 not eligible), P2 pension should be used if P2 is retired or at retirement age', () => {
                const P1_RETIRE_AGE = 65;
                const P1_INITIAL_PENSION = 10000; // Small, will be depleted
                const P2_RETIRE_AGE = 66;
                const P2_INITIAL_PENSION = 50000; // Larger, to cover remaining
                const INITIAL_CASH = 1000;
                const HUGE_EXPENSE = 30000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_RETIRE_AGE,       // P1 starts at 65
                    RetirementAge: P1_RETIRE_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    P2StartingAge: P2_RETIRE_AGE,     // P2 starts at 66
                    P2RetirementAge: P2_RETIRE_AGE,
                    InitialPensionP2: P2_INITIAL_PENSION,
                    InitialSavings: INITIAL_CASH,
                    PensionGrowthRate: 0.0, PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { 
                        ...config, 
                        statePensionQualifyingAge: 99, 
                        pensionLumpSumLimit: 0.25,
                        // Assuming a 5% drawdown rate for ages 65 & 66 for this test logic
                        pensionMinDrawdownBands: {...config.pensionMinDrawdownBands, 60: 0.05, 65:0.05, 66:0.05} 
                    }
                };

                const currentEvents = [
                    { type: 'E', name: 'Huge Deficit Expense', amount: HUGE_EXPENSE, fromAge: P1_RETIRE_AGE, toAge: P1_RETIRE_AGE, rate: 0, extra: '' }
                ];

                initializeSimulator(currentParams, currentEvents);

                // Run for one year. P1 is 65, P2 is 66. Both retire.
                runSimulationToAge(P1_RETIRE_AGE, 'P1'); 
                
                person1_g = getPerson('P1');
                person2_g = getPerson('P2');
                const simGlobals_end_year = getSimulatorGlobals();

                // Expected values based on thought process detailed above:
                const expectedP1PensionFinal = 0;
                const expectedP2PensionFinal = 31000;
                const expectedFinalCash = 11750;

                assert(person1_g.phase === Constants.Phases.retired, `P1 should be retired. Phase: ${person1_g.phase}`);
                assert(person2_g.phase === Constants.Phases.retired, `P2 should be retired. Phase: ${person2_g.phase}`);

                assert(Math.abs(person1_g.pension.capital() - expectedP1PensionFinal) < 0.01,
                    `P1 Pension after deficit: Expected ${expectedP1PensionFinal.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
                
                assert(Math.abs(person2_g.pension.capital() - expectedP2PensionFinal) < 0.01,
                    `P2 Pension after P1 deficit: Expected ${expectedP2PensionFinal.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);

                assert(Math.abs(simGlobals_end_year.cash - expectedFinalCash) < 0.01,
                    `Final cash after deficit handling: Expected ${expectedFinalCash.toFixed(2)}, Got ${simGlobals_end_year.cash.toFixed(2)}`);
                
                if (simGlobals_end_year.hasOwnProperty('cashDeficit')) {
                    assert(simGlobals_end_year.cashDeficit === 0, `cashDeficit should be 0, was ${simGlobals_end_year.cashDeficit}`);
                }
            });

            it('P2 pension should NOT be used for deficit if P2 is not retired and not yet at retirement age', () => {
                const P1_RETIRE_AGE = 65;
                const P1_INITIAL_PENSION = 5000; // Very small, easily depleted

                const P2_AGE_CURRENT = 60;
                const P2_RETIREMENT_AGE_PARAM = 68; // P2 not retired and younger than retirement age parameter
                const P2_INITIAL_PENSION = 50000; // Substantial, but should be untouched
                
                const INITIAL_CASH = 1000;
                const MASSIVE_EXPENSE = 30000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: P1_RETIRE_AGE,         // P1 starts at 65
                    RetirementAge: P1_RETIRE_AGE,
                    InitialPension: P1_INITIAL_PENSION,
                    P2StartingAge: P2_AGE_CURRENT,      // P2 starts at 60
                    P2RetirementAge: P2_RETIREMENT_AGE_PARAM,
                    InitialPensionP2: P2_INITIAL_PENSION,
                    InitialSavings: INITIAL_CASH,
                    PensionGrowthRate: 0.0, PensionContributionPercentage: 0, PensionContributionPercentageP2: 0,
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0,
                    simulation_mode: 'couple', // Ensure couple mode for SI2
                    config: { 
                        ...config, 
                        statePensionQualifyingAge: 99, 
                        pensionLumpSumLimit: 0.25,
                        // Assuming a 5% drawdown rate for P1 at age 65 for this test logic
                        pensionMinDrawdownBands: {...config.pensionMinDrawdownBands, 60: 0.05, 65:0.05 } 
                    }
                };

                const currentEvents = [
                    { type: 'E', name: 'Massive Deficit Expense', amount: MASSIVE_EXPENSE, fromAge: P1_RETIRE_AGE, toAge: P1_RETIRE_AGE, rate: 0, extra: '' }
                ];

                initializeSimulator(currentParams, currentEvents);

                // Run for one year. P1 is 65, P2 is 60.
                runSimulationToAge(P1_RETIRE_AGE, 'P1'); 
                
                person1_g = getPerson('P1');
                person2_g = getPerson('P2');
                const simGlobals_end_year = getSimulatorGlobals();

                // Expected values based on thought process detailed in comments:
                const expectedP1PensionFinal = 0; // P1 pension fully depleted
                const expectedP2PensionFinal = P2_INITIAL_PENSION; // P2 pension untouched
                const expectedFinalCash = 1000 + (5000 * 0.25) + (5000 * 0.75 * 0.05) - (5000 * 0.75 * (1-0.05)); // Cash + P1 lump + P1 DD - P1 Deficit Used
                                            // More directly: P1 lump sum val + P1 drawdown val - P1 pension used for deficit
                                            // P1 lump sum = 1250. P1 pension after lump = 3750.
                                            // P1 drawdown = 3750 * 0.05 = 187.5. P1 pension after DD = 3562.5.
                                            // Total cash before deficit withdrawal = 1000 (initial) + 1250 (lump) = 2250.
                                            // Deficit after income = 30000 - 187.5 = 29812.5
                                            // Cash used for deficit = 2250.
                                            // Remaining deficit = 29812.5 - 2250 = 27562.5
                                            // P1 pension used for deficit = 3562.5 (all of it)
                                            // Final cash = 0 (after cash depletion) + 3562.5 (from P1 pension) = 3562.5

                const calculatedFinalCash = 3562.5;
                const expectedUncoveredDeficit = 24000;

                assert(person1_g.phase === Constants.Phases.retired, `P1 should be retired. Phase: ${person1_g.phase}`);
                assert(person2_g.age === P2_AGE_CURRENT, `P2 age should be ${P2_AGE_CURRENT}, was ${person2_g.age}`);
                assert(person2_g.phase === Constants.Phases.growth, `P2 should be in growth. Phase: ${person2_g.phase}`);

                assert(Math.abs(person1_g.pension.capital() - expectedP1PensionFinal) < 0.01,
                    `P1 Pension after deficit: Expected ${expectedP1PensionFinal.toFixed(2)}, Got ${person1_g.pension.capital().toFixed(2)}`);
                
                assert(Math.abs(person2_g.pension.capital() - expectedP2PensionFinal) < 0.01,
                    `P2 Pension (should be untouched): Expected ${expectedP2PensionFinal.toFixed(2)}, Got ${person2_g.pension.capital().toFixed(2)}`);

                assert(Math.abs(simGlobals_end_year.cash - calculatedFinalCash) < 0.01,
                    `Final cash: Expected ${calculatedFinalCash.toFixed(2)}, Got ${simGlobals_end_year.cash.toFixed(2)}`);
                
                if (simGlobals_end_year.hasOwnProperty('cashDeficit')) {
                    assert(Math.abs(simGlobals_end_year.cashDeficit - expectedUncoveredDeficit) < 0.01, 
                           `cashDeficit should be ${expectedUncoveredDeficit.toFixed(2)}, was ${simGlobals_end_year.cashDeficit.toFixed(2)}`);
                }
            });
        });

        // NEW DESCRIBE BLOCK FOR NON-PENSIONABLE SALARIES
        describe('Non-Pensionable Salary Events', () => {
            it('SInp event for P1 should provide income without pension contribution to P1 (in single mode)', () => {
                const p1StartAge = 30;
                const initialP1Pension = 5000;
                const params_single_sinp = {
                    targetAge: p1StartAge + 2,
                    startingAge: p1StartAge,
                    P2StartingAge: null, // No P2 for this specific test, or P2 is irrelevant
                    simulation_mode: 'single', // <<<< This should be single
                    InitialPension: initialP1Pension,
                    PensionContributionPercentage: 0.10, // P1 has a default contrib rate, but SInp should ignore it
                    StatePensionWeekly: 0, P2StatePensionWeekly: 0, // No state pensions
                    config: { ...config, statePensionQualifyingAge: 99 }
                };

                const currentEvents = [
                    { type: 'SInp', name: 'P1 NonPensionSalary', amount: 45000, fromAge: p1StartAge, toAge: p1StartAge, rate: 0.0, extra: '' }
                ];

                initializeSimulator(params_single_sinp, currentEvents);
                runSimulationToAge(p1StartAge, 'P1'); // Run for the year the event occurs

                person1_g = getPerson('P1');
                const revenueInst = getRevenueInstance(); // Get revenue to check declarations

                assert(person1_g && person1_g.pension, 'P1 object or P1 pension is null/undefined.');
                
                // P1 pension should only be the initial amount (no growth, no contribution from SInp)
                const p1PensionCapital = person1_g.pension.capital();
                assert(Math.abs(p1PensionCapital - initialP1Pension) < 0.01,
                    `P1 pension capital with SInp: Expected ${initialP1Pension.toFixed(2)} (initial only), Got ${p1PensionCapital.toFixed(2)}`);
                
                // Verify income was declared to revenue (conceptual, depends on Revenue.js tracking)
                // This requires revenue.declareSalaryIncome to be spied upon or have a getter for last call if we want to check contribRate was 0.
                // For now, we trust Simulator.js logic and focus on pension capital.
                const simGlobals = getSimulatorGlobals();
                assert(simGlobals.incomeSalaries === 45000, `Global incomeSalaries should be ${45000}, Got ${simGlobals.incomeSalaries}`);
            });

            it('SI2np event for P2 should provide income without pension contribution to P2 (in couple mode)', () => {
                const p1StartAge = 30;
                const p2StartAge = 32;
                const p2SalaryAmount = 35000;
                const initialP2Pension = 5000;

                const currentParams = {
                    ...baseParams,
                    StartingAge: p1StartAge,
                    P2StartingAge: p2StartAge,
                    simulation_mode: 'couple',
                    InitialPensionP2: initialP2Pension,
                    PensionContributionPercentageP2: 0.12, // P2 has a default contrib rate, but SI2np should ignore it
                    PensionGrowthRate: 0.0 // No growth to isolate contribution effect
                };

                const currentEvents = [
                    { type: 'SI2np', name: 'P2 NonPensionSalary', amount: p2SalaryAmount, fromAge: p2StartAge, toAge: p2StartAge, rate: 0.0, extra: '' }
                ];

                initializeSimulator(currentParams, currentEvents);
                runSimulationToAge(p2StartAge, 'P2'); // Run until P2 is the age the event occurs

                person2_g = getPerson('P2');
                const revenueInst = getRevenueInstance();

                assert(person2_g && person2_g.pension, 'P2 object or P2 pension is null/undefined.');
                
                const p2PensionCapital = person2_g.pension.capital();
                assert(Math.abs(p2PensionCapital - initialP2Pension) < 0.01,
                    `P2 pension capital with SI2np: Expected ${initialP2Pension.toFixed(2)} (initial only), Got ${p2PensionCapital.toFixed(2)}`);

                const simGlobals = getSimulatorGlobals();
                assert(simGlobals.incomeSalaries === p2SalaryAmount, `Global incomeSalaries should be ${p2SalaryAmount}, Got ${simGlobals.incomeSalaries}`);
            });
        });

    });
}

if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('SeparatePensionPots', runSeparatePensionPotsTests);
} else {
    console.log('TestSeparatePensionPots.js loaded - TestFramework not detected for registration.');
} 