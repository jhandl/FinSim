/* This file has to work on both the website and Google Sheets */

class Revenue {

  declareSalaryIncome(amount, pensionContribRate) {
    this.income += amount;
    this.pensionContribAmount += pensionContribRate * amount;
    this.pensionContribRelief += pensionContribRate * Math.min(amount, adjust(config.pensionContribEarningLimit));
    this.salaries.push(amount);
    this.salaries.sort((a,b) => a-b); // sort lower to higher
    if (this.salaries.length > 1) this.people = 2;
  }
  
  declareNonEuSharesIncome(amount) {
    this.nonEuShares += amount;
  }
  
  declarePrivatePensionIncome(amount) {
    this.privatePension += amount;
  }
  
  declarePrivatePensionLumpSum(amount) {
    this.privatePensionLumpSum += amount;
    this.privatePensionLumpSumCount++;
  }
  
  declareStatePensionIncome(amount) {
    this.statePension += amount;
  }
  
  declareInvestmentIncome(amount) {
    this.investmentIncome += amount;
  }
  
  declareOtherIncome(amount) {
    this.income += amount;
  }
    
  declareInvestmentGains(amount, taxRate) {
    if (!this.gains.hasOwnProperty(taxRate)) {
      this.gains[taxRate] = 0;
    }
    this.gains[taxRate] += amount;
  }
    
  computeTaxes() {
    this.computeIT();
    this.computePRSI();
    this.computeUSC();
    this.computeCGT();
  }
   
  netIncome() {
    this.computeTaxes();
    let gross = this.income - this.pensionContribAmount + this.privatePension + this.statePension + this.investmentIncome + this.nonEuShares;
    let taxCredit = (age < 65) ? 0 : adjust(this.people * config.ageTaxCredit);
    let tax = Math.max(this.it + this.prsi + this.usc + this.cgt - taxCredit, 0);
    return gross - tax;
  }
  
  reset() {
    this.gains = [];
    this.income = 0;
    this.nonEuShares = 0;
    this.statePension = 0;
    this.privatePension = 0;
    this.privatePensionLumpSum = 0;
    this.privatePensionLumpSumCount = 0;
    this.investmentIncome = 0;
    this.pensionContribAmount = 0;
    this.pensionContribRelief = 0;
    this.people = 1;
    this.salaries = [];
    this.it = 0;
    this.prsi = 0;
    this.usc = 0;
    this.cgt = 0;
    this.married = ((typeof params.marriageYear === 'number') && (year >= params.marriageYear));
    if ((typeof params.oldestChildBorn === 'number') || (typeof params.youngestChildBorn === 'number')) {
      let dependentStartYear = (typeof params.oldestChildBorn === 'number' ? params.oldestChildBorn : params.youngestChildBorn);
      let dependentEndYear = (typeof params.youngestChildBorn === 'number' ? params.youngestChildBorn : params.oldestChildBorn) + 18;
      this.dependentChildren = (isBetween(year, dependentStartYear, dependentEndYear));
    } else {
      this.dependentChildren = false;
    }
  }

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
  }
  
  computeIT() {
    // standard income
    let taxable = this.income + this.privatePension + this.nonEuShares - this.pensionContribRelief;
    
    let itBands = config.itSingleNoChildrenBands;
    let marriedBandIncrease = 0;
    if (this.married) {
      itBands = config.itMarriedBands;
      if (this.salaries.length > 1) {
        marriedBandIncrease = Math.min(config.itMaxMarriedBandIncrease, this.salaries[0]);
      }
    } else if (this.dependentChildren) {
      itBands = config.itSingleDependentChildrenBands;
    }
    let tax = this.computeProgressiveTax(itBands, taxable, 1, marriedBandIncrease);

    if (this.privatePensionLumpSumCount > 0) {
      tax += this.computeProgressiveTax(config.pensionLumpSumTaxBands, this.privatePensionLumpSum, this.privatePensionLumpSumCount);
    }
    let credit = adjust(params.personalTaxCredit + Math.min(this.salaries.length, 2) * config.itEmployeeTaxCredit);
    let exemption = config.itExemptionLimit * (this.married ? 2 : 1);
    if ((age < config.itExemptionAge) || (taxable > adjust(exemption)) || (this.privatePensionLumpSumCount > 0)) {
      this.it = Math.max(tax - credit, 0);
    } else {
      this.it = 0;
    }
  }
  
  computePRSI() {
    let taxable = this.income + this.nonEuShares;
    let tax = (age <= config.prsiExcemptAge) ? taxable * config.prsiRate : 0;
    this.prsi = tax;
  }
  
  computeUSC() {
    // USC is applied to each individual's salary separately. 
    // Any extra taxable income is applied to the lowest salary for tax efficiency.
    // To do this the extra is added to the first salary, as they are sorted in ascending order.
    this.usc = 0;
    let extraIncome = this.privatePension + this.nonEuShares;
    if (this.salaries.length > 0) {
      for (let income of this.salaries) {
        let taxable = income + extraIncome;
        extraIncome = 0;
        let exempt = adjust(config.uscExemptAmount);
        let exceed = adjust(config.uscReducedRateMaxIncome);
        let tax = 0;
        if (taxable > exempt) {
          if ((age >= config.uscRaducedRateAge) && (taxable <= exceed)) {
            tax = this.computeProgressiveTax(config.uscReducedTaxBands, taxable);
          } else {
            tax = this.computeProgressiveTax(config.uscTaxBands, taxable);
          }
        }
        this.usc += tax;
      }
    } else {
      let taxable = extraIncome;
      let exempt = adjust(config.uscExemptAmount);
      let exceed = adjust(config.uscReducedRateMaxIncome);
      let tax = 0;
      if (taxable > exempt) {
        if ((age >= config.uscRaducedRateAge) && (taxable <= exceed)) {
          tax = this.computeProgressiveTax(config.uscReducedTaxBands, taxable);
        } else {
          tax = this.computeProgressiveTax(config.uscTaxBands, taxable);
        }
      }
      this.usc += tax;
    }
  }

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
  }

}