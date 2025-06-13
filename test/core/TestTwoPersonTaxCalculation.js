// Test suite for two-person tax calculations
// Verifies IT credits, PRSI exemptions, and USC bands for couples with different ages.

console.log('Loading TestTwoPersonTaxCalculation.js');

function runTwoPersonTaxCalculationTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestTwoPersonTaxCalculation tests.');
        return;
    }

    // Destructure necessary functions and objects from the testFramework
    const { describe, it, beforeAll, afterAll, beforeEach, afterEach, config,
        createPerson, initializeSimulator, runSimulationForYear, getRevenueInstance } = testFramework;

    describe('Two-Person Tax Calculations', () => {
        // --- Test Suite Setup ---
        let revenue;
        let person1, person2;
        let simConfig = { ...config }; // Clone global config for local modifications

        beforeEach(() => {
            // Reset or re-initialize variables before each test
            initializeSimulator({
                StartingAge: 30,
                P2StartingAge: null, // Default to no P2
                // ... other necessary minimal params
            }, []);
            revenue = getRevenueInstance(); // Get a fresh revenue instance
            simConfig = { ...config }; // Reset simConfig
        });

        // --- Income Tax (IT) Tests ---
        describe('Income Tax (IT) for Two Persons', () => {
            it('should correctly apply P2s age tax credit when P2 is eligible and P1 is not', () => {
                const P1_AGE = config.itExemptionAge - 5; // e.g., 60 if exemption age is 65
                const P2_AGE_ELIGIBLE = config.itExemptionAge;     // e.g., 65
                const P2_AGE_NOT_ELIGIBLE = config.itExemptionAge - 1; // e.g., 64

                const p1Salary = 60000;
                const p2Salary = 40000;

                const baseParams = {
                    TargetAge: 90,
                    MarriageYear: 2000, // Ensures married status for tax year 1
                    PersonalTaxCredit: 1875, // Example value
                    Inflation: 0.0,      // Simplifies adjust() to return original value
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P1_AGE + 10,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%', // No pension contributions to simplify IT calc
                    StatePensionWeekly: 0,
                    // Ensure P1 is not eligible for age credit
                    StartingAge: P1_AGE - 1, // Becomes P1_AGE in year 1
                };

                // Scenario A: P2 is NOT age credit eligible
                initializeSimulator({
                    ...baseParams,
                    P2StartingAge: P2_AGE_NOT_ELIGIBLE - 1, // Becomes P2_AGE_NOT_ELIGIBLE in year 1
                }, []);
                // Global person1 & person2 should be updated by initializeSimulator
                let revenue_A = getRevenueInstance(); // Get revenue instance for this state

                revenue_A.declareSalaryIncome(p1Salary, 0, person1);
                revenue_A.declareSalaryIncome(p2Salary, 0, person2);
                revenue_A.computeIT();
                const it_A = revenue_A.it;

                // Scenario B: P2 IS age credit eligible
                initializeSimulator({
                    ...baseParams,
                    P2StartingAge: P2_AGE_ELIGIBLE - 1, // Becomes P2_AGE_ELIGIBLE in year 1
                }, []);
                let revenue_B = getRevenueInstance(); // Get revenue instance for this new state

                revenue_B.declareSalaryIncome(p1Salary, 0, person1); // Same incomes
                revenue_B.declareSalaryIncome(p2Salary, 0, person2);
                revenue_B.computeIT();
                const it_B = revenue_B.it;

                const expected_credit_value = config.ageTaxCredit; // Since inflation is 0

                let actual_it_reduction = it_A - it_B;
                let expected_it_reduction_due_to_credit = 0;

                // The credit applies if there's IT to reduce.
                // If it_A was positive, the reduction should be min(it_A, expected_credit_value)
                if (it_A > 0) {
                    expected_it_reduction_due_to_credit = Math.min(it_A, expected_credit_value);
                }
                
                // Check if the actual reduction matches the expected reduction from the credit
                testFramework.assert(Math.abs(actual_it_reduction - expected_it_reduction_due_to_credit) < 0.01,
                    `P2 age credit (P1 not elig): Expected IT reduction of approx ${expected_it_reduction_due_to_credit.toFixed(2)}, got ${actual_it_reduction.toFixed(2)}. IT_A (P2 not elig): ${it_A.toFixed(2)}, IT_B (P2 elig): ${it_B.toFixed(2)}`);
            });

            it('should correctly apply age-related IT credits when both persons are over the age threshold', () => {
                const AGE_ELIGIBLE = config.itExemptionAge;     // e.g., 65
                const AGE_NOT_ELIGIBLE = config.itExemptionAge - 1; // e.g., 64

                const p1Salary = 70000; // Sufficient income to ensure tax liability > 2x credit
                const p2Salary = 50000;

                const baseParams = {
                    TargetAge: 90,
                    MarriageYear: 2000, 
                    PersonalTaxCredit: 1875, 
                    Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: AGE_ELIGIBLE + 10,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%',
                    StatePensionWeekly: 0,
                };

                // Scenario A: Neither P1 nor P2 eligible for age credit
                initializeSimulator({
                    ...baseParams,
                    StartingAge: AGE_NOT_ELIGIBLE - 1,       // Becomes AGE_NOT_ELIGIBLE in year 1
                    P2StartingAge: AGE_NOT_ELIGIBLE - 1,   // Becomes AGE_NOT_ELIGIBLE in year 1
                }, []);
                let revenue_A = getRevenueInstance();
                revenue_A.declareSalaryIncome(p1Salary, 0, person1);
                revenue_A.declareSalaryIncome(p2Salary, 0, person2);
                revenue_A.computeIT();
                const it_A_neither_eligible = revenue_A.it;

                // Scenario B: P1 IS eligible, P2 is NOT eligible
                initializeSimulator({
                    ...baseParams,
                    StartingAge: AGE_ELIGIBLE - 1,           // Becomes AGE_ELIGIBLE in year 1
                    P2StartingAge: AGE_NOT_ELIGIBLE - 1,   // Becomes AGE_NOT_ELIGIBLE in year 1
                }, []);
                let revenue_B = getRevenueInstance();
                revenue_B.declareSalaryIncome(p1Salary, 0, person1);
                revenue_B.declareSalaryIncome(p2Salary, 0, person2);
                revenue_B.computeIT();
                const it_B_p1_eligible_only = revenue_B.it;

                // Scenario C: Both P1 AND P2 ARE eligible
                initializeSimulator({
                    ...baseParams,
                    StartingAge: AGE_ELIGIBLE - 1,           // Becomes AGE_ELIGIBLE in year 1
                    P2StartingAge: AGE_ELIGIBLE - 1,       // Becomes AGE_ELIGIBLE in year 1
                }, []);
                let revenue_C = getRevenueInstance();
                revenue_C.declareSalaryIncome(p1Salary, 0, person1);
                revenue_C.declareSalaryIncome(p2Salary, 0, person2);
                revenue_C.computeIT();
                const it_C_both_eligible = revenue_C.it;

                const single_age_credit_value = config.ageTaxCredit; // Since inflation is 0

                // Calculate expected reduction due to P1's credit
                let expected_reduction_p1 = 0;
                if (it_A_neither_eligible > 0) {
                    expected_reduction_p1 = Math.min(it_A_neither_eligible, single_age_credit_value);
                }
                const actual_reduction_p1 = it_A_neither_eligible - it_B_p1_eligible_only;

                testFramework.assert(Math.abs(actual_reduction_p1 - expected_reduction_p1) < 0.01,
                    `P1 age credit (P2 not elig): Expected IT reduction of approx ${expected_reduction_p1.toFixed(2)}, got ${actual_reduction_p1.toFixed(2)}. IT_A: ${it_A_neither_eligible.toFixed(2)}, IT_B: ${it_B_p1_eligible_only.toFixed(2)}`);

                // Calculate expected reduction due to P2's credit (on top of P1's)
                let expected_reduction_p2_on_top = 0;
                if (it_B_p1_eligible_only > 0) {
                    expected_reduction_p2_on_top = Math.min(it_B_p1_eligible_only, single_age_credit_value);
                }
                const actual_reduction_p2_on_top = it_B_p1_eligible_only - it_C_both_eligible;

                testFramework.assert(Math.abs(actual_reduction_p2_on_top - expected_reduction_p2_on_top) < 0.01,
                    `P2 age credit (P1 already elig): Expected IT reduction of approx ${expected_reduction_p2_on_top.toFixed(2)}, got ${actual_reduction_p2_on_top.toFixed(2)}. IT_B: ${it_B_p1_eligible_only.toFixed(2)}, IT_C: ${it_C_both_eligible.toFixed(2)}`);
                
                // Overall check: Reduction from neither eligible to both eligible should be sum of individual effective credits
                const total_expected_reduction = expected_reduction_p1 + expected_reduction_p2_on_top;
                const total_actual_reduction = it_A_neither_eligible - it_C_both_eligible;
                 testFramework.assert(Math.abs(total_actual_reduction - total_expected_reduction) < 0.01,
                    `Both age credits: Expected total IT reduction of approx ${total_expected_reduction.toFixed(2)}, got ${total_actual_reduction.toFixed(2)}. IT_A (Neither): ${it_A_neither_eligible.toFixed(2)}, IT_C (Both): ${it_C_both_eligible.toFixed(2)}`);
            });

            it('should correctly apply IT exemption when one person is eligible and income is below joint threshold (married)', () => {
                const P1_AGE_ELIGIBLE = config.itExemptionAge;      // e.g., 65
                const P2_AGE_NOT_ELIGIBLE = config.itExemptionAge - 5; // e.g., 60

                // Ensure config has itExemptionLimit, otherwise this test is invalid
                if (typeof config.itExemptionLimit !== 'number') {
                    console.error('Test skipped: config.itExemptionLimit is not defined.');
                    testFramework.assert(false, 'Test skipped due to missing config.itExemptionLimit');
                    return;
                }
                const jointExemptionThreshold = config.itExemptionLimit * 2; // Since married
                const p1Salary = jointExemptionThreshold * 0.4; // e.g., 40% of threshold
                const p2Salary = jointExemptionThreshold * 0.3; // e.g., 30% of threshold
                // Total salary is 70% of threshold, well below it.

                const params = {
                    TargetAge: 90,
                    MarriageYear: 2000, // Married
                    PersonalTaxCredit: 1875, // Standard credit, shouldn't matter if IT is 0 due to exemption
                    Inflation: 0.0,      // Simplifies adjust()
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P1_AGE_ELIGIBLE + 5,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%',
                    StatePensionWeekly: 0,
                    StartingAge: P1_AGE_ELIGIBLE - 1,    // P1 becomes eligible in year 1
                    P2StartingAge: P2_AGE_NOT_ELIGIBLE -1 // P2 is not eligible
                };

                initializeSimulator(params, []);
                let currentRevenue = getRevenueInstance();

                currentRevenue.declareSalaryIncome(p1Salary, 0, person1);
                currentRevenue.declareSalaryIncome(p2Salary, 0, person2);
                currentRevenue.computeIT();

                testFramework.assert(currentRevenue.it === 0,
                    `IT exemption (P1 elig, married, income < joint limit): Expected IT to be 0, got ${currentRevenue.it.toFixed(2)}. Joint Income: ${(p1Salary+p2Salary).toFixed(2)}, Joint Threshold: ${jointExemptionThreshold.toFixed(2)}`);
            });

             it('should NOT apply IT exemption when age eligible but income is above joint threshold (married)', () => {
                const P1_AGE_ELIGIBLE = config.itExemptionAge;      // e.g., 65
                const P2_AGE_NOT_ELIGIBLE = config.itExemptionAge - 5; // e.g., 60

                if (typeof config.itExemptionLimit !== 'number') {
                    console.error('Test skipped: config.itExemptionLimit is not defined.');
                    testFramework.assert(false, 'Test skipped due to missing config.itExemptionLimit');
                    return;
                }
                const jointExemptionThreshold = config.itExemptionLimit * 2;
                const p1Salary = jointExemptionThreshold * 0.8; // e.g., 80% of threshold
                const p2Salary = jointExemptionThreshold * 0.7; // e.g., 70% of threshold
                // Total salary is 150% of threshold, well above it.
                const totalSalary = p1Salary + p2Salary;

                const testPersonalTaxCredit = 1875;

                const params = {
                    TargetAge: 90,
                    MarriageYear: 2000, // Married
                    PersonalTaxCredit: testPersonalTaxCredit,
                    Inflation: 0.0,      // Simplifies adjust()
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P1_AGE_ELIGIBLE + 5,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%',
                    StatePensionWeekly: 0,
                    StartingAge: P1_AGE_ELIGIBLE - 1,    // P1 becomes eligible in year 1
                    P2StartingAge: P2_AGE_NOT_ELIGIBLE - 1 // P2 is not eligible
                };

                initializeSimulator(params, []);
                let currentRevenue = getRevenueInstance();

                currentRevenue.declareSalaryIncome(p1Salary, 0, person1);
                currentRevenue.declareSalaryIncome(p2Salary, 0, person2);
                currentRevenue.computeIT();

                testFramework.assert(currentRevenue.it > 0,
                    `IT exemption (P1 elig, married, income > joint limit): Expected IT > 0, got ${currentRevenue.it.toFixed(2)}. Joint Income: ${totalSalary.toFixed(2)}, Joint Threshold: ${jointExemptionThreshold.toFixed(2)}`);

                // More detailed check: IT should be gross tax - credits
                // Calculate expected credits (assuming 0% inflation)
                let expectedCredits = testPersonalTaxCredit; // Personal Tax Credit from params
                expectedCredits += (2 * config.itEmployeeTaxCredit); // Two PAYE earners
                expectedCredits += config.ageTaxCredit; // P1 is age eligible
                
                // Calculate gross tax (bands are auto-adjusted for marriage and income in computeProgressiveTax via computeIT)
                let itBands = config.itMarriedBands;
                let marriedBandIncrease = 0;
                if (p1Salary > 0 && p2Salary > 0) { 
                    marriedBandIncrease = Math.min(config.itMaxMarriedBandIncrease, Math.min(p1Salary, p2Salary));
                } else if (p1Salary > 0) { 
                    marriedBandIncrease = Math.min(config.itMaxMarriedBandIncrease, p1Salary);
                } else if (p2Salary > 0) { 
                    marriedBandIncrease = Math.min(config.itMaxMarriedBandIncrease, p2Salary);
                }
                // Taxable income is totalSalary as no reliefs/pension contributions
                const grossTax = currentRevenue.computeProgressiveTax(itBands, totalSalary, 1, marriedBandIncrease);
                const expectedNetIT = Math.max(0, grossTax - expectedCredits);

                testFramework.assert(Math.abs(currentRevenue.it - expectedNetIT) < 0.01,
                    `IT calculation (P1 elig, income > limit): Expected IT ${expectedNetIT.toFixed(2)}, got ${currentRevenue.it.toFixed(2)}. Gross: ${grossTax.toFixed(2)}, Credits: ${expectedCredits.toFixed(2)}`);
            });
        });

        // --- PRSI Tests ---
        describe('PRSI for Two Persons', () => {
            it('should grant PRSI exemption to P2 when P2 is over exemption age and P1 is not', () => {
                const P1_AGE_LIABLE = config.prsiExemptAge - 5;  // e.g., 61 if exempt age is 66
                const P2_AGE_EXEMPT = config.prsiExemptAge;      // e.g., 66

                const p1Salary = 50000;
                const p2Salary = 40000;

                const params = {
                    TargetAge: 90,
                    MarriageYear: 0, // Not relevant for PRSI calculation here
                    PersonalTaxCredit: 1875,
                    Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P2_AGE_EXEMPT + 5,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%',
                    StatePensionWeekly: 0,
                    StartingAge: P1_AGE_LIABLE - 1,    // P1 becomes liable in year 1
                    P2StartingAge: P2_AGE_EXEMPT - 1     // P2 becomes exempt in year 1
                };

                initializeSimulator(params, []);
                let currentRevenue = getRevenueInstance();

                currentRevenue.declareSalaryIncome(p1Salary, 0, person1);
                currentRevenue.declareSalaryIncome(p2Salary, 0, person2);
                currentRevenue.computePRSI();

                const expectedPrsi = p1Salary * config.prsiRate; // Only P1 pays PRSI

                testFramework.assert(Math.abs(currentRevenue.prsi - expectedPrsi) < 0.01,
                    `PRSI exemption (P2 elig, P1 not): Expected PRSI ${expectedPrsi.toFixed(2)}, got ${currentRevenue.prsi.toFixed(2)}. P1 Salary: ${p1Salary}, P2 Salary: ${p2Salary}`);
            });

            it('should apply PRSI to both if both are under exemption age', () => {
                const P1_AGE_LIABLE = config.prsiExemptAge - 10; // e.g., 56 if exempt age is 66
                const P2_AGE_LIABLE = config.prsiExemptAge - 5;  // e.g., 61 if exempt age is 66

                const p1Salary = 50000;
                const p2Salary = 40000;

                const params = {
                    TargetAge: 90,
                    MarriageYear: 0, 
                    PersonalTaxCredit: 1875,
                    Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: config.prsiExemptAge + 5,
                    EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%',
                    StatePensionWeekly: 0,
                    StartingAge: P1_AGE_LIABLE - 1,    // P1 becomes liable in year 1
                    P2StartingAge: P2_AGE_LIABLE - 1     // P2 also becomes liable in year 1
                };

                initializeSimulator(params, []);
                let currentRevenue = getRevenueInstance();

                currentRevenue.declareSalaryIncome(p1Salary, 0, person1);
                currentRevenue.declareSalaryIncome(p2Salary, 0, person2);
                currentRevenue.computePRSI();

                const expectedPrsiP1 = p1Salary * config.prsiRate;
                const expectedPrsiP2 = p2Salary * config.prsiRate;
                const totalExpectedPrsi = expectedPrsiP1 + expectedPrsiP2;

                testFramework.assert(Math.abs(currentRevenue.prsi - totalExpectedPrsi) < 0.01,
                    `PRSI (both liable): Expected PRSI ${totalExpectedPrsi.toFixed(2)}, got ${currentRevenue.prsi.toFixed(2)}. P1 Sal: ${p1Salary}, P2 Sal: ${p2Salary}`);
            });
        });

        // --- USC Tests ---
        describe('USC for Two Persons', () => {
            it('should apply correct USC bands for Person 1 based on their age and income level', () => {
                const P1_AGE_YOUNG = config.uscReducedRateAge - 1; // Younger than threshold for reduced USC rates
                const P1_AGE_OLD_ELIGIBLE = config.uscReducedRateAge; // At threshold for reduced USC rates

                const INCOME_HIGH = (config.uscReducedRateThreshold || 60000) * 1.5; // Income that exceeds reduced rate threshold
                const INCOME_LOW_FOR_REDUCED = (config.uscReducedRateThreshold || 60000) * 0.8; // Income below reduced rate threshold

                const baseParamsNoP2 = {
                    TargetAge: 90, MarriageYear: 0, PersonalTaxCredit: 1875, Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P1_AGE_OLD_ELIGIBLE + 10, EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%', StatePensionWeekly: 0, P2StartingAge: null // Ensure no P2
                };

                // Sub-Scenario 1: P1 Young, High Income (uses standard USC bands)
                let params1 = { ...baseParamsNoP2, StartingAge: P1_AGE_YOUNG - 1 };
                initializeSimulator(params1, []);
                let revenue1 = getRevenueInstance();
                revenue1.declareSalaryIncome(INCOME_HIGH, 0, person1); // person1 is global from initializeSimulator
                revenue1.declareStatePensionIncome(0); // Ensure no state pension interference for USC calc
                revenue1.declareNonEuSharesIncome(0); // Ensure no non-EU shares for USC calc
                revenue1.computeUSC();
                let expectedUsc1 = revenue1.computeProgressiveTax(config.uscBands, INCOME_HIGH);
                testFramework.assert(Math.abs(revenue1.usc - expectedUsc1) < 0.01,
                    `USC P1 (Young, High Income): Expected ${expectedUsc1.toFixed(2)}, Got ${revenue1.usc.toFixed(2)} using std bands`);

                // Sub-Scenario 2: P1 Old, Low Income (uses reduced USC bands)
                let params2 = { ...baseParamsNoP2, StartingAge: P1_AGE_OLD_ELIGIBLE - 1 };
                initializeSimulator(params2, []);
                let revenue2 = getRevenueInstance();
                revenue2.declareSalaryIncome(INCOME_LOW_FOR_REDUCED, 0, person1);
                revenue2.declareStatePensionIncome(0);
                revenue2.declareNonEuSharesIncome(0);
                revenue2.computeUSC();
                let expectedUsc2 = revenue2.computeProgressiveTax(config.uscReducedRateBands, INCOME_LOW_FOR_REDUCED);
                testFramework.assert(Math.abs(revenue2.usc - expectedUsc2) < 0.01,
                    `USC P1 (Old, Low Income - elig for reduced): Expected ${expectedUsc2.toFixed(2)}, Got ${revenue2.usc.toFixed(2)} using reduced bands`);

                // Sub-Scenario 3: P1 Old, High Income (uses standard USC bands due to income > threshold)
                let params3 = { ...baseParamsNoP2, StartingAge: P1_AGE_OLD_ELIGIBLE - 1 };
                initializeSimulator(params3, []);
                let revenue3 = getRevenueInstance();
                revenue3.declareSalaryIncome(INCOME_HIGH, 0, person1);
                revenue3.declareStatePensionIncome(0);
                revenue3.declareNonEuSharesIncome(0);
                revenue3.computeUSC();
                let expectedUsc3 = revenue3.computeProgressiveTax(config.uscBands, INCOME_HIGH);
                testFramework.assert(Math.abs(revenue3.usc - expectedUsc3) < 0.01,
                    `USC P1 (Old, High Income - reverts to std): Expected ${expectedUsc3.toFixed(2)}, Got ${revenue3.usc.toFixed(2)} using std bands`);
            });

            it('should apply correct USC bands for Person 2 based on their age and income level', () => {
                const P2_AGE_YOUNG = config.uscReducedRateAge - 1;
                const P2_AGE_OLD_ELIGIBLE = config.uscReducedRateAge;

                const INCOME_HIGH = (config.uscReducedRateThreshold || 60000) * 1.5;
                const INCOME_LOW_FOR_REDUCED = (config.uscReducedRateThreshold || 60000) * 0.8;

                // Base parameters, P1 exists but has no income impacting USC
                const baseParamsWithP2 = {
                    StartingAge: 30, // P1's age, not relevant for P2's USC here
                    TargetAge: 90, MarriageYear: 0, PersonalTaxCredit: 1875, Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P2_AGE_OLD_ELIGIBLE + 10, EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%', StatePensionWeekly: 0
                };

                // Sub-Scenario 1: P2 Young, High Income (uses standard USC bands)
                let params1 = { ...baseParamsWithP2, P2StartingAge: P2_AGE_YOUNG - 1 };
                initializeSimulator(params1, []);
                let revenue1 = getRevenueInstance();
                revenue1.declareSalaryIncome(0, 0, person1); // P1 no income
                revenue1.declareSalaryIncome(INCOME_HIGH, 0, person2); // P2 has income
                revenue1.declareStatePensionIncome(0);
                revenue1.declareNonEuSharesIncome(0);
                revenue1.computeUSC();
                let expectedUscP2_1 = revenue1.computeProgressiveTax(config.uscBands, INCOME_HIGH);
                testFramework.assert(Math.abs(revenue1.usc - expectedUscP2_1) < 0.01,
                    `USC P2 (Young, High Income): Expected ${expectedUscP2_1.toFixed(2)}, Got ${revenue1.usc.toFixed(2)} using std bands`);

                // Sub-Scenario 2: P2 Old, Low Income (uses reduced USC bands)
                let params2 = { ...baseParamsWithP2, P2StartingAge: P2_AGE_OLD_ELIGIBLE - 1 };
                initializeSimulator(params2, []);
                let revenue2 = getRevenueInstance();
                revenue2.declareSalaryIncome(0, 0, person1);
                revenue2.declareSalaryIncome(INCOME_LOW_FOR_REDUCED, 0, person2);
                revenue2.declareStatePensionIncome(0);
                revenue2.declareNonEuSharesIncome(0);
                revenue2.computeUSC();
                let expectedUscP2_2 = revenue2.computeProgressiveTax(config.uscReducedRateBands, INCOME_LOW_FOR_REDUCED);
                testFramework.assert(Math.abs(revenue2.usc - expectedUscP2_2) < 0.01,
                    `USC P2 (Old, Low Income - elig for reduced): Expected ${expectedUscP2_2.toFixed(2)}, Got ${revenue2.usc.toFixed(2)} using reduced bands`);

                // Sub-Scenario 3: P2 Old, High Income (uses standard USC bands due to income > threshold)
                let params3 = { ...baseParamsWithP2, P2StartingAge: P2_AGE_OLD_ELIGIBLE - 1 };
                initializeSimulator(params3, []);
                let revenue3 = getRevenueInstance();
                revenue3.declareSalaryIncome(0, 0, person1);
                revenue3.declareSalaryIncome(INCOME_HIGH, 0, person2);
                revenue3.declareStatePensionIncome(0);
                revenue3.declareNonEuSharesIncome(0);
                revenue3.computeUSC();
                let expectedUscP2_3 = revenue3.computeProgressiveTax(config.uscBands, INCOME_HIGH);
                testFramework.assert(Math.abs(revenue3.usc - expectedUscP2_3) < 0.01,
                    `USC P2 (Old, High Income - reverts to std): Expected ${expectedUscP2_3.toFixed(2)}, Got ${revenue3.usc.toFixed(2)} using std bands`);
            });

            it('should apply different USC bands if P1 and P2 are in different age/income categories for USC', () => {
                const P1_AGE_YOUNG = config.uscReducedRateAge - 5;
                const P2_AGE_OLD_ELIGIBLE = config.uscReducedRateAge + 5;

                const p1Income = 80000; // High income for P1, standard bands
                const p2Income = (config.uscReducedRateThreshold || 60000) * 0.7; // Low income for P2, reduced bands

                if (typeof config.uscReducedRateAge !== 'number' || typeof config.uscReducedRateThreshold !== 'number') {
                    console.error('Test skipped: USC reduced rate config (age/threshold) not defined.');
                    testFramework.assert(false, 'Test skipped due to missing USC reduced rate config');
                    return;
                }

                const params = {
                    StartingAge: P1_AGE_YOUNG - 1,
                    P2StartingAge: P2_AGE_OLD_ELIGIBLE -1,
                    TargetAge: 90, MarriageYear: 0, PersonalTaxCredit: 1875, Inflation: 0.0,
                    InitialSavings: 0, InitialPension: 0, InitialFunds: 0, InitialShares: 0,
                    RetirementAge: P2_AGE_OLD_ELIGIBLE + 10, EmergencyStash: 0, FundsAllocation: '0%', SharesAllocation: '0%',
                    PensionContributionPercentage: '0%', StatePensionWeekly: 0
                };

                initializeSimulator(params, []);
                let currentRevenue = getRevenueInstance();

                currentRevenue.declareSalaryIncome(p1Income, 0, person1);
                currentRevenue.declareSalaryIncome(p2Income, 0, person2);
                currentRevenue.declareStatePensionIncome(0); // Ensure no interference
                currentRevenue.declareNonEuSharesIncome(0); // Ensure no interference
                currentRevenue.computeUSC();

                // Expected USC for P1 (young, high income -> standard bands)
                const expectedUscP1 = currentRevenue.computeProgressiveTax(config.uscBands, p1Income);

                // Expected USC for P2 (old, low income -> reduced bands)
                const expectedUscP2 = currentRevenue.computeProgressiveTax(config.uscReducedRateBands, p2Income);

                const totalExpectedUsc = expectedUscP1 + expectedUscP2;

                testFramework.assert(Math.abs(currentRevenue.usc - totalExpectedUsc) < 0.01,
                    `USC (P1 young/high, P2 old/low): Expected ${totalExpectedUsc.toFixed(2)} (P1: ${expectedUscP1.toFixed(2)}, P2: ${expectedUscP2.toFixed(2)}), Got ${currentRevenue.usc.toFixed(2)}`);
            });
        });

        // Add more tests as needed for joint assessment, specific income types etc.
    });
}

// Example of how tests might be run or registered with a test framework
// This part might vary based on your actual test runner setup.
if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('TwoPersonTaxCalculation', runTwoPersonTaxCalculationTests);
} else {
    // Fallback or direct run if TestFramework is not used in this context
    // runTwoPersonTaxCalculationTests(); // Or a mock framework for standalone testing
    console.log('TestTwoPersonTaxCalculation.js loaded - TestFramework not detected for registration.');
} 