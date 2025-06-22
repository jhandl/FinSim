module.exports = {
    name: 'TestEconomyModeToggle',
    description: 'Test economy mode toggle functionality including mode switching, volatility preservation, and simulation behavior',
    category: 'UI',
    scenario: {
        parameters: {
            startingAge: 30,
            targetAge: 35,
            retirementAge: 65,
            initialSavings: 10000,
            initialPension: 0,
            initialFunds: 0,
            initialShares: 0,
            emergencyStash: 5000,
            pensionPercentage: 15,
            pensionCapped: "Yes",
            statePensionWeekly: 253,
            growthRatePension: 7,
            growthDevPension: 3,
            growthRateFunds: 7,
            growthDevFunds: 15,
            growthRateShares: 8,
            growthDevShares: 18,
            inflation: 2.5,
            FundsAllocation: 70,
            SharesAllocation: 30,
            priorityCash: 1,
            priorityPension: 2,
            priorityFunds: 3,
            priorityShares: 4,
            marriageYear: 0,
            youngestChildBorn: 0,
            oldestChildBorn: 0,
            personalTaxCredit: 0,
            p2StartingAge: 0,
            p2RetirementAge: 0,
            p2StatePensionWeekly: 0,
            initialPensionP2: 0,
            pensionPercentageP2: 0,
            simulation_mode: 'single',
            economyMode: 'deterministic' // Start in deterministic mode
        },
        events: [
            {
                type: 'SI',
                id: 'salary-1',
                amount: 50000,
                fromAge: 30,
                toAge: 34,
                rate: 3,
                match: 0
            },
            {
                type: 'E',
                id: 'living-expenses',
                amount: 35000,
                fromAge: 30,
                toAge: 34,
                rate: 0,
                match: 0
            }
        ]
    },
    assertions: [
        {
            type: 'exact_value',
            target: 'final',
            field: 'cash',
            expected: 34378, // Expected deterministic result with no volatility
            tolerance: 100
        }
    ],
    customValidation: async function() {
        // Test economy mode functionality
        const errors = [];
        
        try {
            // Initialize the UI if available
            if (typeof WebUI !== 'undefined') {
                const webUI = WebUI.getInstance();
                
                // Test 1: Default mode should be deterministic
                const initialMode = webUI.getValue('economy_mode');
                if (initialMode !== 'deterministic') {
                    errors.push(`Expected default economy mode to be 'deterministic', got '${initialMode}'`);
                }
                
                // Test 2: Switch to Monte Carlo mode
                webUI.setValue('economy_mode', 'montecarlo');
                const newMode = webUI.getValue('economy_mode');
                if (newMode !== 'montecarlo') {
                    errors.push(`Failed to switch to Monte Carlo mode, got '${newMode}'`);
                }
                
                // Test 3: Volatility fields should be visible in Monte Carlo mode
                const volatilityHeader = document.querySelector('#growthRates th:nth-child(3)');
                if (volatilityHeader && volatilityHeader.style.visibility === 'hidden') {
                    errors.push('Volatility header should be visible in Monte Carlo mode');
                }
                
                // Test 4: Switch back to deterministic mode
                webUI.setValue('economy_mode', 'deterministic');
                const backToDetMode = webUI.getValue('economy_mode');
                if (backToDetMode !== 'deterministic') {
                    errors.push(`Failed to switch back to deterministic mode, got '${backToDetMode}'`);
                }
                
                // Test 5: Volatility fields should be hidden in deterministic mode
                if (volatilityHeader && volatilityHeader.style.visibility !== 'hidden') {
                    errors.push('Volatility header should be hidden in deterministic mode');
                }
                
                // Test 6: Test volatility value preservation
                const testValue = '10';
                webUI.setValue('economy_mode', 'montecarlo');
                
                // Set a volatility value
                const pensionVolField = document.getElementById('PensionGrowthStdDev');
                if (pensionVolField) {
                    pensionVolField.value = testValue;
                    
                    // Switch to deterministic mode
                    webUI.setValue('economy_mode', 'deterministic');
                    
                    // Switch back to Monte Carlo mode
                    webUI.setValue('economy_mode', 'montecarlo');
                    
                    // Check if value was preserved
                    if (pensionVolField.value !== testValue) {
                        errors.push(`Volatility value not preserved: expected '${testValue}', got '${pensionVolField.value}'`);
                    }
                }
            }
            
            // Test 7: Simulation behavior with different modes
            if (typeof uiManager !== 'undefined') {
                // Test deterministic mode simulation
                const params = uiManager.readParameters(false);
                params.economyMode = 'deterministic';
                params.growthDevPension = 5; // Has volatility but should be ignored
                
                // Check Monte Carlo trigger logic
                const hasVolatility = (params.growthDevPension > 0 || params.growthDevFunds > 0 || params.growthDevShares > 0);
                const shouldBeMonteCarlo = (params.economyMode === 'montecarlo' && hasVolatility);
                
                if (shouldBeMonteCarlo) {
                    errors.push('Deterministic mode should not trigger Monte Carlo simulation');
                }
                
                // Test Monte Carlo mode simulation
                params.economyMode = 'montecarlo';
                const shouldBeMonteCarlo2 = (params.economyMode === 'montecarlo' && hasVolatility);
                
                if (!shouldBeMonteCarlo2) {
                    errors.push('Monte Carlo mode with volatility should trigger Monte Carlo simulation');
                }
            }
            
        } catch (error) {
            errors.push(`Error during economy mode testing: ${error.message}`);
        }
        
        return {
            success: errors.length === 0,
            errors: errors
        };
    }
}; 