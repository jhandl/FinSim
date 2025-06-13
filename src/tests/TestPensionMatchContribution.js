/* Pension Match Contribution Test
 * This test validates the new "Match" option for pension contributions,
 * where personal contribution equals employer match rate.
 */

const TestPensionMatchContribution = {
    name: "Pension Match Contribution Test",
    description: "Validates that pension contributions are capped to employer match rate when 'Match' option is selected",
    category: "pension",
    scenario: {
        parameters: {
            startingAge: 30,
            targetAge: 32,
            retirementAge: 65,
            initialSavings: 10000,
            initialPension: 0,
            initialFunds: 0,
            initialShares: 0,
            emergencyStash: 10000,
            FundsAllocation: 0.6,
            SharesAllocation: 0.4,
            
            // Key test: Use high pension percentage but cap to match
            pensionPercentage: 1.0,  // 100% of maximum allowed (would be 20% at age 30)
            pensionCapped: "Match",  // Cap to employer match rate
            
            statePensionWeekly: 289,
            growthRatePension: 0,    // Zero growth for predictable calculations
            growthDevPension: 0,
            growthRateFunds: 0.07,
            growthDevFunds: 0.0,
            growthRateShares: 0.08,
            growthDevShares: 0.0,
            inflation: 0.02,
            priorityCash: 1,
            priorityPension: 4,
            priorityFunds: 2,
            priorityShares: 3,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 1875,
            statePensionWeekly: 289
        },
        events: [
            {
                type: 'SI',
                id: 'salary-match-test',
                amount: 60000,           // €60,000 salary
                fromAge: 30,
                toAge: 31,
                rate: 0,                 // No salary increase
                match: 0.04              // 4% employer match (less than the 20% max personal rate)
            }
        ]
    },
    assertions: [
        {
            type: 'exact_value',
            target: 'age',
            age: 30,
            field: 'pensionContribution',
            expected: 4800,              // 4% personal + 4% employer = 8% total = €4,800 per year
            tolerance: 10
        },
        {
            type: 'exact_value',
            target: 'age',
            age: 30,
            field: 'pensionFund',
            expected: 4800,              // First year contribution
            tolerance: 10
        },
        {
            type: 'exact_value',
            target: 'age',
            age: 31,
            field: 'pensionFund',
            expected: 9600,              // Two years of contributions (4800 * 2)
            tolerance: 10
        }
    ]
};

module.exports = TestPensionMatchContribution; 