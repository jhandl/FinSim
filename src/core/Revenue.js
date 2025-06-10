/* This file has to work on both the website and Google Sheets */

class Revenue {

  declareSalaryIncome(amount, contribRate, person) {
    this.income += amount; // Total gross income

    const contribution = contribRate * amount;
    const relief = contribRate * Math.min(amount, adjust(config.pensionContribEarningLimit));

    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.pensionContribAmountP1 += contribution;
      this.pensionContribReliefP1 += relief;
      this.salariesP1.push({amount: amount, contribRate: contribRate});
      this.salariesP1.sort((a,b) => a.amount - b.amount);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.pensionContribAmountP2 += contribution;
      this.pensionContribReliefP2 += relief;
      this.salariesP2.push({amount: amount, contribRate: contribRate});
      this.salariesP2.sort((a,b) => a.amount - b.amount);
   }
  };
  
  declareNonEuSharesIncome(amount) {
    this.nonEuShares += amount;
  };
  
  declarePrivatePensionIncome(amount, person) {
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionP1 += amount;
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionP2 += amount;
    }
  };
  
  declarePrivatePensionLumpSum(amount, person) {
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionLumpSumP1 += amount;
      this.privatePensionLumpSumCountP1++;
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionLumpSumP2 += amount;
      this.privatePensionLumpSumCountP2++;
    } else {
      // Fallback if person is not identifiable, though this should ideally not happen
      // For safety, and to maintain existing behavior if called without person, assign to P1
      // However, calls from Pension.declareRevenue should always include a person.
      // Consider logging a warning if person is null/undefined here.
      if (this.person1Ref) { // Default to P1 if no specific person provided for some reason
          this.privatePensionLumpSumP1 += amount;
          this.privatePensionLumpSumCountP1++;
      } 
      // console.warn("declarePrivatePensionLumpSum called without a clearly identifiable person.");
    }
  };
  
  declareStatePensionIncome(amount) {
    this.statePension += amount;
  };
  
  declareInvestmentIncome(amount) {
    this.investmentIncome += amount;
  };
  
  declareOtherIncome(amount) {
    this.income += amount;
  };
    
  declareInvestmentGains(amount, taxRate) {
    if (!this.gains.hasOwnProperty(taxRate)) {
      this.gains[taxRate] = 0;
    }
    this.gains[taxRate] += amount;
  };
    
  computeTaxes() {
    this.computeIT();
    this.computePRSI();
    this.computeUSC();
    this.computeCGT();
  };
   
  netIncome() {
    this.computeTaxes();
    let gross = this.income - (this.pensionContribAmountP1 + this.pensionContribAmountP2) + 
                  (this.privatePensionP1 + this.privatePensionP2) + 
                  this.statePension + this.investmentIncome + this.nonEuShares;
    
    let tax = Math.max(this.it + this.prsi + this.usc + this.cgt, 0);
    return gross - tax;
  };
  
  reset(person1, person2_optional) {
    this.gains = [];
    this.income = 0;
    this.nonEuShares = 0;
    this.statePension = 0;
    this.privatePensionP1 = 0;
    this.privatePensionP2 = 0;
    this.privatePensionLumpSumP1 = 0;
    this.privatePensionLumpSumCountP1 = 0;
    this.privatePensionLumpSumP2 = 0;
    this.privatePensionLumpSumCountP2 = 0;
    this.investmentIncome = 0;
    this.pensionContribAmountP1 = 0;
    this.pensionContribAmountP2 = 0;
    this.pensionContribReliefP1 = 0;
    this.pensionContribReliefP2 = 0;

    this.people = 1;
    this.salariesP1 = [];
    this.salariesP2 = [];

    this.it = 0;
    this.prsi = 0;
    this.usc = 0;
    this.cgt = 0;

    this.person1Ref = person1 || null;
    this.person2Ref = person2_optional || null;

    this.people = this.person1Ref ? (this.person2Ref ? 2 : 1) : 0;

    this.married = ((typeof params.marriageYear === 'number') && (params.marriageYear > 0) && (year >= params.marriageYear));
    if ((typeof params.oldestChildBorn === 'number') || (typeof params.youngestChildBorn === 'number')) {
      let dependentStartYear = (typeof params.oldestChildBorn === 'number' ? params.oldestChildBorn : params.youngestChildBorn);
      let dependentEndYear = (typeof params.youngestChildBorn === 'number' ? params.youngestChildBorn : params.oldestChildBorn) + 18;
      this.dependentChildren = (isBetween(year, dependentStartYear, dependentEndYear));
    } else {
      this.dependentChildren = false;
    }
  };

  computeProgressiveTax(bands, income, multiplier=1, limitShift=0) {
    // bands is a map in the form {"limit1": rate1, "limit2": rate2, "limit3": rate3, ...}
    // where anything between limit1 and limit2 is taxed at rate1, 
    //       anything between limit2 and limit3 is taxed at rate2,
    //       and anything above the last limit is taxed at the lat rate. 
    // The limits have to be in ascending order.
    // The limits are shifted by "limitShift" and multiplied by "multiplier", if defined, in that order.
    const adjustedBands = Object.fromEntries(Object.entries(bands)
                            .map(([limit, rate]) => {
                                let newLimit = parseInt(limit);
                                if (newLimit > 0) {
                                    newLimit += limitShift;
                                }
                                newLimit = adjust(newLimit) * multiplier;
                                return [String(newLimit), rate];
                            }));
    return Object.keys(adjustedBands)
      .map((lowerLimit, index, arr) => {
          const upperLimit = arr[index + 1] || Infinity;
          const rate = adjustedBands[lowerLimit];
          const taxable = Math.min(income, upperLimit) - lowerLimit;
          return Math.max(taxable, 0) * rate;
      })
      .reduce((sum, amount) => sum + amount, 0);
  };
  
  computeIT() {
    // standard income
    let taxable = this.income + (this.privatePensionP1 + this.privatePensionP2) + 
                  this.nonEuShares - (this.pensionContribReliefP1 + this.pensionContribReliefP2);
    
    let itBands = config.itSingleNoChildrenBands;
    let marriedBandIncrease = 0;
    if (this.married) {
      itBands = config.itMarriedBands;
      const p1TotalSalary = this.salariesP1.reduce((sum, s) => sum + s.amount, 0);
      const p2TotalSalary = this.person2Ref ? this.salariesP2.reduce((sum, s) => sum + s.amount, 0) : 0;

      if (p1TotalSalary > 0 && p2TotalSalary > 0) { // Both have salary income
        marriedBandIncrease = Math.min(adjust(config.itMaxMarriedBandIncrease), Math.min(p1TotalSalary, p2TotalSalary));
      } else if (p1TotalSalary > 0) { // Only P1 has salary
        marriedBandIncrease = Math.min(adjust(config.itMaxMarriedBandIncrease), p1TotalSalary);
      } else if (p2TotalSalary > 0) { // Only P2 has salary
        marriedBandIncrease = Math.min(adjust(config.itMaxMarriedBandIncrease), p2TotalSalary);
      } // If neither has salary, marriedBandIncrease remains 0.
    } else if (this.dependentChildren) {
      itBands = config.itSingleDependentChildrenBands;
    }
    let tax = this.computeProgressiveTax(itBands, taxable, 1, marriedBandIncrease);

    if (this.privatePensionLumpSumCountP1 > 0 || this.privatePensionLumpSumCountP2 > 0) {
      tax += this.computeProgressiveTax(config.pensionLumpSumTaxBands, this.privatePensionLumpSumP1, this.privatePensionLumpSumCountP1) +
             this.computeProgressiveTax(config.pensionLumpSumTaxBands, this.privatePensionLumpSumP2, this.privatePensionLumpSumCountP2);
    }
    
    let numSalaryEarners = (this.salariesP1.length > 0 ? 1 : 0) + (this.salariesP2.length > 0 ? 1 : 0);
    let credit = adjust(params.personalTaxCredit + numSalaryEarners * config.itEmployeeTaxCredit);
    if (this.person1Ref && this.person1Ref.age >= config.itExemptionAge) {
      credit += adjust(config.ageTaxCredit);
    }
    if (this.married && this.person2Ref && this.person2Ref.age >= config.itExemptionAge) {
      credit += adjust(config.ageTaxCredit);
    }
    
    let exemption = config.itExemptionLimit * (this.married ? 2 : 1);

    let p1AgeEligible = (this.person1Ref && this.person1Ref.age >= config.itExemptionAge);
    let p2AgeEligible = (this.married && this.person2Ref && this.person2Ref.age >= config.itExemptionAge);
    let isEligibleForAgeExemption = p1AgeEligible || p2AgeEligible;
    
    if (isEligibleForAgeExemption && taxable <= adjust(exemption) && (this.privatePensionLumpSumCountP1 === 0 && this.privatePensionLumpSumCountP2 === 0)) {
      this.it = 0;
    } else {
      this.it = Math.max(tax - credit, 0);
    }
  };
  
  computePRSI() {
    this.prsi = 0;
    let p1TotalSalaryIncome = 0;
    let p2TotalSalaryIncome = 0;

    // Calculate PRSI for P1's PAYE income (salaries)
    p1TotalSalaryIncome = this.salariesP1.reduce((sum, s) => sum + s.amount, 0);
    if (this.person1Ref && this.person1Ref.age < config.prsiExcemptAge) {
      this.prsi += p1TotalSalaryIncome * config.prsiRate;
    }

    // Calculate PRSI for P2's PAYE income (salaries)
    if (this.person2Ref) {
      p2TotalSalaryIncome = this.salariesP2.reduce((sum, s) => sum + s.amount, 0);
      if (this.person2Ref.age < config.prsiExcemptAge) {
        this.prsi += p2TotalSalaryIncome * config.prsiRate;
      }
    }
    
    // Calculate PRSI for non-PAYE income
    const totalSalaryIncome = p1TotalSalaryIncome + p2TotalSalaryIncome;
    const nonSalaryGeneralIncome = this.income - totalSalaryIncome; // Income from declareOtherIncome() or unassigned
    
    let nonPAYEIncomeP1 = 0;
    let nonPAYEIncomeP2 = 0;

    if (this.person2Ref) { // Two people
      // Split non-salary general income and non-EU shares 50/50 for PRSI purposes
      // This is a simplification; ideally, these income sources would also be person-specific
      nonPAYEIncomeP1 = (nonSalaryGeneralIncome / 2) + (this.nonEuShares / 2);
      nonPAYEIncomeP2 = (nonSalaryGeneralIncome / 2) + (this.nonEuShares / 2);
    } else { // One person
      nonPAYEIncomeP1 = nonSalaryGeneralIncome + this.nonEuShares;
    }

    if (this.person1Ref && this.person1Ref.age < config.prsiExcemptAge) {
      this.prsi += nonPAYEIncomeP1 * config.prsiRate;
    }
    if (this.person2Ref && this.person2Ref.age < config.prsiExcemptAge) {
      this.prsi += nonPAYEIncomeP2 * config.prsiRate;
    }
  };
  
  computeUSC() {
    this.usc = 0;
    const uscExemptAmount = adjust(config.uscExemptAmount);
    const uscReducedRateAge = config.uscReducedRateAge; // Assuming this is defined in config
    const uscReducedRateMaxIncome = adjust(config.uscReducedRateMaxIncome);

    // Helper function to calculate USC for a single person's income slice
    const calculateUscForPerson = (totalPersonUscLiableIncome, personAge) => {
      let personUsc = 0;
      if (totalPersonUscLiableIncome > uscExemptAmount) {
        if ((personAge !== undefined && personAge >= uscReducedRateAge) && 
            (totalPersonUscLiableIncome <= uscReducedRateMaxIncome)) {
          personUsc = this.computeProgressiveTax(config.uscReducedTaxBands, totalPersonUscLiableIncome);
        } else {
          personUsc = this.computeProgressiveTax(config.uscTaxBands, totalPersonUscLiableIncome);
        }
      }
      return personUsc;
    };

    // Person 1 Analysis
    if (this.person1Ref) {
      let p1TotalSalaryIncome = this.salariesP1.reduce((sum, s) => sum + s.amount, 0);
      let p1TotalUscLiableIncome = p1TotalSalaryIncome + this.privatePensionP1;
      
      if (!this.person2Ref) { // Person 1 is single for tax purposes here (or P2 not present)
        // If single, P1 gets all nonEuShares for USC calculation.
        p1TotalUscLiableIncome += this.nonEuShares; 
        this.usc += calculateUscForPerson(p1TotalUscLiableIncome, (this.person1Ref ? this.person1Ref.age : undefined));
      } else {
        // If two people, P1 gets half of nonEuShares for USC calculation.
        p1TotalUscLiableIncome += (this.nonEuShares / 2);
        this.usc += calculateUscForPerson(p1TotalUscLiableIncome, (this.person1Ref ? this.person1Ref.age : undefined));
      }
    }

    // Person 2 Analysis
    if (this.person2Ref) {
      let p2TotalSalaryIncome = this.salariesP2.reduce((sum, s) => sum + s.amount, 0);
      let p2TotalUscLiableIncome = p2TotalSalaryIncome + this.privatePensionP2;
      p2TotalUscLiableIncome += (this.nonEuShares / 2); // Person 2 gets their half of non-EU shares for USC

      this.usc += calculateUscForPerson(p2TotalUscLiableIncome, (this.person2Ref ? this.person2Ref.age : undefined));
    }
  };

computeCGT() {
    let tax = 0;
    let remainingRelief = adjust(config.cgtTaxRelief);
    let totalLosses = 0;
    for (let [_, gains] of Object.entries(this.gains)) {
      if (gains < 0) {
        totalLosses -= gains;
      }
    }
    for (let [taxRate, gains] of Object.entries(this.gains).sort((a,b) => b[0].localeCompare(a[0]))) {
      if (gains > 0) {
        let gainAfterLosses = Math.max(gains - totalLosses, 0);
        totalLosses = Math.max(totalLosses - gains, 0);
        let taxableGains = Math.max(gainAfterLosses - remainingRelief, 0);
        remainingRelief = Math.max(remainingRelief - gainAfterLosses, 0);
        tax += taxableGains * taxRate;
      }
    }
    this.cgt = tax;
  };

  // Create a new Revenue instance with a deep copy of this one's state
  clone() {
    const copy = new Revenue();
    // Clone gains (might be an array with string keys)
    copy.gains = {};
    for (let key of Object.keys(this.gains)) {
      copy.gains[key] = this.gains[key];
    }
    // Clone primitive fields
    copy.income = this.income;
    copy.nonEuShares = this.nonEuShares;
    copy.statePension = this.statePension;
    copy.privatePensionP1 = this.privatePensionP1;
    copy.privatePensionP2 = this.privatePensionP2;
    copy.privatePensionLumpSumP1 = this.privatePensionLumpSumP1;
    copy.privatePensionLumpSumCountP1 = this.privatePensionLumpSumCountP1;
    copy.privatePensionLumpSumP2 = this.privatePensionLumpSumP2;
    copy.privatePensionLumpSumCountP2 = this.privatePensionLumpSumCountP2;
    copy.investmentIncome = this.investmentIncome;
    copy.pensionContribAmountP1 = this.pensionContribAmountP1;
    copy.pensionContribAmountP2 = this.pensionContribAmountP2;
    copy.pensionContribReliefP1 = this.pensionContribReliefP1;
    copy.pensionContribReliefP2 = this.pensionContribReliefP2;

    copy.people = this.people;

    copy.person1Ref = this.person1Ref;
    copy.person2Ref = this.person2Ref;

    // Clone arrays
    copy.salariesP1 = this.salariesP1.map(s => ({...s}));
    copy.salariesP2 = this.salariesP2.map(s => ({...s}));

    // Clone tax liabilities
    copy.it = this.it;
    copy.prsi = this.prsi;
    copy.usc = this.usc;
    copy.cgt = this.cgt;

    // Clone marital/dependent flags
    copy.married = this.married;
    copy.dependentChildren = this.dependentChildren;
    return copy;
  };
}