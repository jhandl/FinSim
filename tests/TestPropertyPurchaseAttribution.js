module.exports = {
    name: 'TestPropertyPurchaseAttribution',
    description: 'Test that property purchase attribution shows the full purchase amount with proper breakdown of cash vs expense',
    category: 'attribution',
    scenario: {
        parameters: {
            startingAge: 30,
            targetAge: 35,
            retirementAge: 65,
            initialSavings: 20000, // Start with 20k cash (less than property cost)
            initialPension: 0,
            initialFunds: 0,
            initialShares: 0,
            initialPensionP2: 0,
            initialFundsP2: 0,
            initialSharesP2: 0,
            emergencyStash: 0,
            FundsAllocation: 0,
            SharesAllocation: 0,
            priorityCash: 1,
            priorityPension: 2,
            priorityFunds: 3,
            priorityShares: 4,
            pensionPercentage: 0.05,
            pensionPercentageP2: 0.05,
            pensionCapped: "No",
            simulation_mode: 'single',
            p2StartingAge: 0,
            p2RetirementAge: 65,
            p2StatePensionWeekly: 0,
            statePensionWeekly: 0,
            growthRateFunds: 0.07,
            growthDevFunds: 0,
            growthRateShares: 0.08,
            growthDevShares: 0,
            growthRatePension: 0.06,
            growthDevPension: 0,
            economyMode: 'deterministic'
        },
        events: [
            {
                type: 'SI', // Salary income to provide funds
                id: 'Salary',
                amount: 100000, // 100k salary
                fromAge: 30,
                toAge: 34,
                rate: 0,
                match: 0
            },
            {
                type: 'R', // Real estate purchase
                id: 'Test Property',
                amount: 50000, // 50k downpayment
                fromAge: 30,
                toAge: 34,
                rate: 0.03
            }
        ]
    },
    assertions: [
        {
            type: 'exact_value',
            target: 'age',
            age: 30,
            field: 'expenses',
            expected: 30000, // Should show only unfunded portion (50k - 20k cash)
            tolerance: 1
        },
        {
            type: 'exact_value',
            target: 'age',
            age: 30,
            field: 'cash',
            expected: 0, // Should have 0 cash remaining (all cash used for property purchase)
            tolerance: 1
        }
    ]
}; 