/* This file has to work on both the website and Google Sheets */

/**
 * Person class to encapsulate person-specific data and logic for the financial simulator.
 * This class handles individual pension management, age tracking, and income calculations.
 */
class Person {
  
  /**
   * Create a Person instance
   * @param {string} id - Unique identifier for the person (e.g., 'P1', 'P2')
   * @param {Object} personSpecificUIParams - Person-specific parameters from UI
   * @param {Object} commonSimParams - Common simulation parameters
   * @param {Object} commonPensionConfig - Pension configuration (growthRatePension, growthDevPension)
   */
  constructor(id, personSpecificUIParams, commonSimParams, commonPensionConfig) {
    this.id = id;
    
    // Initialize age (will be incremented at the start of the first simulation year)
    this.age = personSpecificUIParams.startingAge - 1;
    
    // Initialize phase to growth phase
    this.phase = Phases.growth;
    
    // Create and store pension instance
    this.pension = new Pension(commonPensionConfig.growthRatePension, commonPensionConfig.growthDevPension);
    
    // Store essential person-specific parameters
    this.retirementAgeParam = personSpecificUIParams.retirementAge;
    this.statePensionWeeklyParam = personSpecificUIParams.statePensionWeekly;
    this.pensionContributionPercentageParam = personSpecificUIParams.pensionContributionPercentage;
    
    // Reset yearly variables
    this.resetYearlyVariables();
  }
  
  /**
   * Initialize/reset person-specific yearly income accumulators
   */
  resetYearlyVariables() {
    this.yearlyIncomeStatePension = 0;
    this.yearlyIncomePrivatePension = 0;
  }
  
  /**
   * Add one year to the person's age and pension
   */
  addYear() {
    this.age++;
    this.pension.addYear();
  }
  
  /**
   * Calculate yearly pension income (both private and state)
   * @param {Object} config - Global configuration object
   * @returns {Object} Object with lumpSumAmount property
   */
  calculateYearlyPensionIncome(config) {
    let lumpSumAmount = 0;
    
    // Reset yearly income accumulators
    this.yearlyIncomeStatePension = 0;
    this.yearlyIncomePrivatePension = 0;
    
    // Lump Sum: Check if retirement age is reached and still in growth phase
    if (this.age === this.retirementAgeParam && this.phase === Phases.growth) {
      lumpSumAmount = this.pension.getLumpsum();
      this.phase = Phases.retired;
    }
    
    // Private Pension Drawdown: If retired, calculate drawdown
    if (this.phase === Phases.retired) {
      this.yearlyIncomePrivatePension = this.pension.drawdown(this.age);
    }
    
    // State Pension: Check if age qualifies for state pension
    if (this.statePensionWeeklyParam && this.statePensionWeeklyParam > 0 && 
        this.age >= config.statePensionQualifyingAge) {
      // Calculate yearly state pension (52 weeks)
      this.yearlyIncomeStatePension = 52 * adjust(this.statePensionWeeklyParam);
      
      // Add increase if age qualifies for state pension increase
      if (this.age >= config.statePensionIncreaseAge) {
        this.yearlyIncomeStatePension += 52 * adjust(config.statePensionIncreaseAmount);
      }
    }
    
    return { lumpSumAmount: lumpSumAmount };
  }
} 