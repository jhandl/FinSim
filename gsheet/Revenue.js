class Revenue {

  constructor() {
    this.reset();
  }
  
  declareSalaryIncome(amount, pensionContribRate) {
    this.income += amount;
    this.pensionContribAmount += pensionContribRate * amount;
    this.pensionContribRelief += pensionContribRate * Math.min(amount, adjust_(config.pensionContribEarningLimit, inflation));
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
    let taxCredit = (age < 65) ? 0 : adjust_(this.people * config.ageTaxCredit, inflation);
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
  }

  computeProgressiveTax(bands, income, multiplier=1) {
    // bands is a map in the form {"limit1": rate1, "limit2": rate2, "limit3": rate3, ...}
    // where anything between limit1 and limit2 is taxed at rate1, 
    //       anything between limit2 and limit3 is taxed at rate2,
    //       and anything above the last limit is taxed at the lat rate. 
    // The limits have to be in ascending order.
    const adjustedBands = Object.fromEntries(Object.entries(bands)
                            .map(([k, v]) => [String(adjust_(parseInt(k)*multiplier,inflation)), v]));
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
    let limit = adjust_(incomeTaxBracket + (this.people > 1 ? Math.min(config.itMaxMarriedBandIncrease, this.salaries[0]) : 0), inflation);
    let tax = config.itLowerBandRate * Math.min(taxable, limit) 
            + config.itHigherBandRate * Math.max(taxable - limit, 0);
    if (this.privatePensionLumpSumCount > 0) {
      tax += this.computeProgressiveTax(config.pensionLumpSumTaxBands, this.privatePensionLumpSum, this.privatePensionLumpSumCount);
    }
    let credit = adjust_(personalTaxCredit + this.salaries.length * config.itEmployeeTaxCredit, inflation);
    let exemption = this.people * config.itExemptionLimit;
    if ((age < config.itExemptionAge) || (taxable > adjust_(exemption, inflation)) || (this.privatePensionLumpSumCount > 0)) {
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
    for (let income of this.salaries) {
      let taxable = income + extraIncome;
      extraIncome = 0;
      let exempt = adjust_(config.uscExemptAmount, inflation);
      let exceed = adjust_(config.uscReducedRateMaxIncome, inflation);
      let tax = 0;
      if (taxable > exempt) {
        if (age >= config.uscRaducedRateAge && taxable <= exceed) {
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
    let taxable = -adjust_(config.cgtTaxRelief, inflation); // capital gains tax relief
    // go through the gains from the highest taxed to the least taxed, so that the credit has more impact
    for (let [taxRate, gains] of Object.entries(this.gains).sort((a,b) => b[0].localeCompare(a[0]))) {
      taxable += gains;
      tax += Math.max(taxable * taxRate, 0);
    }
    this.cgt = tax;
  }
    
}