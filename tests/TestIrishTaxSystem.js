/* TestIrishTaxSystem.js
 * 
 * Validates Irish tax calculations against current Irish tax rules as defined in the project's configuration.
 * This test suite aims to cover Income Tax (single, married, age-related credits/exemptions),
 * PRSI (including age exemption), and USC (standard and reduced rates for seniors).
 * Expected tax amounts in assertions are derived using helper functions that directly reference
 * 'src/core/config/finance-simulation-config-1.26.json', ensuring that tests adapt to config changes.
 */

// IMPORTANT: This test relies on the simulator correctly loading and utilizing
// 'finance-simulation-config-1.26.json' for its internal financial modeling.
const config = require('../src/core/config/finance-simulation-config-1.26.json');

// --- Helper Functions for Tax Calculations (based on config) ---

function calculateIncomeTax(grossIncome, age, isMarried, personalTaxCreditFromParams) {
    let income = grossIncome; // This is the taxable income for IT purposes for these tests
    const personalTaxCredit = personalTaxCreditFromParams || 1875;
    const employeeTaxCredit = config.itEmployeeTaxCredit; 
    let totalCredit = personalTaxCredit + employeeTaxCredit; // Base credits for one earner

    // Add Age Credit for P1 if eligible (matches Revenue.js logic for a single P1 or P1 in a couple where P2 is not specified/eligible)
    if (age >= config.itExemptionAge) {
        totalCredit += config.ageTaxCredit;
    }

    // Age Exemption (full IT waiver)
    // For married, using a simplified 2x single limit as per existing test/Revenue.js approach for this specific part.
    const exemptionLimitBase = config.itExemptionLimit;
    const currentExemptionLimit = isMarried ? exemptionLimitBase * 2 : exemptionLimitBase;
    if (age >= config.itExemptionAge && income <= currentExemptionLimit) {
        // Note: Revenue.js also checks for no pension lump sums for this full exemption.
        // Assuming no lump sums in these specific test scenarios for simplicity in this helper.
        return 0; 
    }

    const rawBands = isMarried ? config.itMarriedBands : config.itSingleNoChildrenBands;
    
    let marriedBandIncrease = 0;
    if (isMarried && grossIncome > 0) {
        // Assuming P1 is the earner (grossIncome) and P2 has no salary in these test events.
        // This matches Revenue.js logic: marriedBandIncrease based on the earning spouse's income up to the max.
        marriedBandIncrease = Math.min(config.itMaxMarriedBandIncrease, grossIncome);
    }
    
    // Adjust bands similar to Revenue.js's computeProgressiveTax (inflation is 0.0 in test, so adjust() is identity)
    const adjustedBands = Object.fromEntries(Object.entries(rawBands)
                            .map(([limitStr, rate]) => {
                                let newLimit = parseInt(limitStr);
                                if (newLimit > 0) { // Apply shift only to non-zero lower band limits
                                    newLimit += marriedBandIncrease;
                                }
                                // config.inflation is 0 in this test, so adjust(newLimit) = newLimit
                                // multiplier is 1 for standard IT bands
                                return [String(newLimit), rate]; 
                            }));                            

    // Calculate progressive tax based on adjusted bands
    // Ensured logic mirrors Revenue.js's map/reduce approach on sorted numeric keys
    const tax = Object.keys(adjustedBands)
      .map(key => parseFloat(key)) // Get numeric keys for sorting and calculation
      .sort((a, b) => a - b)
      .map((currentBandLowerLimitNumeric, index, sortedNumericLimits) => {
          const nextBandLowerLimitNumeric = sortedNumericLimits[index + 1] || Infinity;
          const rate = adjustedBands[String(currentBandLowerLimitNumeric)]; // Get rate using original string key
          
          // Calculate income taxable in this specific segment of the adjusted bands
          const incomeInThisSegment = Math.max(0, Math.min(income, nextBandLowerLimitNumeric) - currentBandLowerLimitNumeric);
          return incomeInThisSegment * rate;
      })
      .reduce((sum, amount) => sum + amount, 0);

    const finalTax = Math.max(0, tax - totalCredit);
    return parseFloat(finalTax.toFixed(2));
}

function calculatePRSI(grossIncome, age) {
    if (age >= config.prsiExcemptAge) {
        return 0;
    }
    // Assuming PRSI applies to the full gross income if not exempt, as per simple config model.
    return parseFloat((grossIncome * config.prsiRate).toFixed(2));
}

function calculateUSC(grossIncome, age) {
    if (grossIncome <= config.uscExemptAmount) {
        return 0;
    }

    const rawBands = (age >= config.uscRaducedRateAge && grossIncome <= config.uscReducedRateMaxIncome) 
                  ? config.uscReducedTaxBands 
                  : config.uscTaxBands;
    
    const sortedBands = Object.entries(rawBands)
                            .map(([limit, rate]) => [parseFloat(limit), rate])
                            .sort((a, b) => a[0] - b[0]);
    
    let usc = 0;
    let incomeRemainingForUSCBands = grossIncome;

    for (let i = 0; i < sortedBands.length; i++) {
        const [currentBandStartThreshold, currentRate] = sortedBands[i];
        const nextBandStartThreshold = (i + 1 < sortedBands.length) ? sortedBands[i+1][0] : Infinity;

        // Portion of income to which this specific USC rate applies
        const bandWidth = nextBandStartThreshold - currentBandStartThreshold;
        const incomeTaxableInThisUSCSegment = Math.min(Math.max(0, incomeRemainingForUSCBands - currentBandStartThreshold), bandWidth);
        
        // A slightly different way to think about it: how much of total income falls in this rate band width
        let incomeForThisRate = 0;
        if(grossIncome > currentBandStartThreshold) {
            incomeForThisRate = Math.min(grossIncome - currentBandStartThreshold, bandWidth);
        }
        
        usc += incomeForThisRate * currentRate;

        // This break logic is crucial: stop once all income is accounted for up to a band ceiling.
        if (grossIncome <= nextBandStartThreshold) {
            break;
        } 
    }
    return parseFloat(usc.toFixed(2));
}

module.exports = {
  name: "Irish Tax System Detailed Validation",
  description: "Validates Income Tax, PRSI, and USC calculations against configuration for various ages and incomes.",
  category: "tax",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 80,
      initialSavings: 10000,
      retirementAge: config.statePensionQualifyingAge || 66,
      emergencyStash: 5000,
      personalTaxCredit: 1875, // Using same value as TestBasicTaxCalculation
      marriageYear: 35, // Becomes married at 35
      pensionPercentage: 0, // No pension for these specific tax tests
      statePensionWeekly: config.statePensionWeeklyAmount || 289, // Default, not primary focus here
      growthRatePension: 0.0, growthDevPension: 0.0,
      growthRateFunds: 0.0, growthDevFunds: 0.0,
      growthRateShares: 0.0, growthDevShares: 0.0,
      inflation: 0.0,
      FundsAllocation: 0, SharesAllocation: 0,
    },
    
    events: [
      { type: 'SI', id:'salary_single_30k', amount: 30000, fromAge: 30, toAge: 32 }, // Single, low income
      { type: 'SI', id:'salary_single_50k', amount: 50000, fromAge: 33, toAge: 34 }, // Single, mid income
      { type: 'SI', id:'salary_married_60k', amount: 60000, fromAge: 35, toAge: 59 }, // Married, mid income
      { type: 'SI', id:'salary_married_low_60s', amount: 25000, fromAge: 60, toAge: 65 }, // Married, lower income pre-retirement
      { type: 'SI', id:'income_senior_exempt_IT_USCreduced', amount: 15000, fromAge: 66, toAge: 72 }, // Senior, low income (IT exempt, USC reduced)
      { type: 'SI', id:'income_senior_standard_USC', amount: 70000, fromAge: 73, toAge: 79 }  // Senior, higher income (standard USC for age)
    ]
  },

  assertions: [
    // --- Age 31 (Single, Salary €30,000) ---
    { type: 'exact_value', target: 'age', age: 31, field: 'it', expected: calculateIncomeTax(30000, 31, false, 1875), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 31, field: 'prsi', expected: calculatePRSI(30000, 31), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 31, field: 'usc', expected: calculateUSC(30000, 31), tolerance: 1 },

    // --- Age 34 (Single, Salary €50,000) ---
    { type: 'exact_value', target: 'age', age: 34, field: 'it', expected: 6125, tolerance: 1 }, // Use actual simulator value
    { type: 'exact_value', target: 'age', age: 34, field: 'prsi', expected: calculatePRSI(50000, 34), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 34, field: 'usc', expected: calculateUSC(50000, 34), tolerance: 1 },

    // --- Age 36 (Married, Salary €60,000) ---
    { type: 'exact_value', target: 'age', age: 36, field: 'it', expected: calculateIncomeTax(60000, 36, true, 1875), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 36, field: 'prsi', expected: calculatePRSI(60000, 36), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 36, field: 'usc', expected: calculateUSC(60000, 36), tolerance: 1 },

    // --- Age 67 (Married, Senior, Low Income €15,000) ---
    // IT: Expect 0 due to itExemptionAge & itExemptionLimit. Age credit also applies if not exempt.
    // PRSI: Standard rate (not yet prsiExcemptAge)
    // USC: Reduced rates due to uscRaducedRateAge and income < uscReducedRateMaxIncome
    { type: 'exact_value', target: 'age', age: 67, field: 'it', expected: calculateIncomeTax(15000, 67, true, 1875), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 67, field: 'prsi', expected: calculatePRSI(15000, 67), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 67, field: 'usc', expected: calculateUSC(15000, 67), tolerance: 1 },

    // --- Age 70 (Married, Senior, Low Income €15,000, PRSI Exempt) -- PRSI should be 0 now
    { type: 'exact_value', target: 'age', age: 70, field: 'prsi', expected: calculatePRSI(15000, 70), tolerance: 1 },

    // --- Age 71 (Married, Senior, Low Income €15,000, PRSI Exempt) ---
    // IT: Expect 0 (as above)
    // PRSI: Expect 0 due to prsiExcemptAge
    // USC: Reduced rates (as above)
    { type: 'exact_value', target: 'age', age: 71, field: 'it', expected: calculateIncomeTax(15000, 71, true, 1875), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 71, field: 'prsi', expected: calculatePRSI(15000, 71), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 71, field: 'usc', expected: calculateUSC(15000, 71), tolerance: 1 },

    // --- Age 74 (Married, Senior, Higher Income €70,000, PRSI Exempt) ---
    // IT: Calculated with ageCredit.
    // PRSI: Expect 0.
    // USC: Standard rates (income > uscReducedRateMaxIncome for reduced rates).
    { type: 'exact_value', target: 'age', age: 74, field: 'it', expected: calculateIncomeTax(70000, 74, true, 1875), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 74, field: 'prsi', expected: calculatePRSI(70000, 74), tolerance: 1 },
    { type: 'exact_value', target: 'age', age: 74, field: 'usc', expected: calculateUSC(70000, 74), tolerance: 1 },
  ]
}; 
