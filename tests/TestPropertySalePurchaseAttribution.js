module.exports = {
    name: 'TestPropertySalePurchaseAttribution',
    description: 'Test that property sales and purchases are correctly recorded in attribution with proper tooltips',
    category: 'attribution',
    scenario: {
        parameters: {
            startingAge: 30,
            targetAge: 35,
            retirementAge: 65,
            initialSavings: 100000, // Start with 100k cash
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
            economyMode: 'deterministic',
            StartCountry: 'ie'
        },
        events: [
            {
                type: 'SI', // Salary income
                id: 'Salary',
                amount: 80000,
                fromAge: 30,
                toAge: 34,
                rate: 0,
                match: 0
            },
            {
                type: 'R', // Buy first property
                id: 'First Property',
                amount: 200000,
                fromAge: 30,
                toAge: 32, // Sell at age 32
                rate: 0.03
            },
            {
                type: 'R', // Buy second property
                id: 'Second Property',
                amount: 150000,
                fromAge: 32,
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
            expected: 100000, // Should show unfunded portion (200k - 100k cash)
            tolerance: 1
        },
        {
            type: 'exact_value',
            target: 'age',
            age: 32,
            field: 'expenses',
            expected: 0, // Should show 0 (sale proceeds cover purchase)
            tolerance: 1
        },
        {
            type: 'comparison',
            target: 'age',
            age: 32,
            field: 'cash',
            expected: {
                operator: '>',
                value: 0 // Should have positive cash after sale
            }
        }
    ]
}; 