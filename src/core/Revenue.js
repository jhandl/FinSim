/* This file has to work on both the website and Google Sheets */

class Revenue {

  declareSalaryIncome(amount, contribRate, person, description) {
    this.income += amount; // Total gross income
    this.attributionManager.record('income', description, amount);

    const contribution = contribRate * amount;
    const relief = contribRate * Math.min(amount, adjust(config.pensionContribEarningLimit));

    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.pensionContribAmountP1 += contribution;
      this.pensionContribReliefP1 += relief;
      this.salariesP1.push({amount: amount, contribRate: contribRate, description: description});
      this.salariesP1.sort((a,b) => a.amount - b.amount);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.pensionContribAmountP2 += contribution;
      this.pensionContribReliefP2 += relief;
      this.salariesP2.push({amount: amount, contribRate: contribRate, description: description});
      this.salariesP2.sort((a,b) => a.amount - b.amount);
   }
  };
  
  declareNonEuSharesIncome(amount, description) {
    this.nonEuShares += amount;
    this.attributionManager.record('nonEuShares', description, amount);
  };
  
  declarePrivatePensionIncome(amount, person, description) {
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionP1 += amount;
      this.attributionManager.record('privatepensionp1', description, amount);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionP2 += amount;
      this.attributionManager.record('privatepensionp2', description, amount);
    }
  };
  
  declarePrivatePensionLumpSum(amount, person) {
    const description = `Pension Lump Sum P${person.id}`;
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionLumpSumP1 += amount;
      this.privatePensionLumpSumCountP1++;
      this.attributionManager.record('privatepensionlumpsum', description, amount);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionLumpSumP2 += amount;
      this.privatePensionLumpSumCountP2++;
      this.attributionManager.record('privatepensionlumpsum', description, amount);
    }
  };
  
  declareStatePensionIncome(amount) {
    this.statePension += amount;
    // Attribution for state pension is handled in Simulator.js
  };
  
  declareInvestmentIncome(amount, description) {
    this.investmentIncome += amount;
    this.attributionManager.record('investmentincome', description, amount);
  };
  
  declareOtherIncome(amount, description) {
    this.income += amount;
    this.attributionManager.record('income', description, amount);
  };
    
  declareInvestmentGains(amount, taxRate, description) {
    if (!this.gains.hasOwnProperty(taxRate)) {
      this.gains[taxRate] = { amount: 0, sources: {} };
    }
    this.gains[taxRate].amount += amount;
    if (!this.gains[taxRate].sources[description]) {
      this.gains[taxRate].sources[description] = 0;
    }
    this.gains[taxRate].sources[description] += amount;
  };
    
  computeTaxes() {
    this.resetTaxAttributions();
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
  
  reset(person1, person2_optional, attributionManager) {
    this.attributionManager = attributionManager;
    this.gains = {};
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

  resetTaxAttributions() {
    // Reset tax attributions to prevent double-counting when taxes are recomputed multiple times in the same year
    const taxMetrics = ['it', 'prsi', 'usc', 'cgt'];
    if (this.attributionManager && this.attributionManager.yearlyAttributions) {
      for (const metric of taxMetrics) {
        if (this.attributionManager.yearlyAttributions[metric]) {
          this.attributionManager.yearlyAttributions[metric] = new Attribution(metric);
        }
      }
    }
  };


  computeProgressiveTax(bands, incomeAttribution, taxType, multiplier = 1, limitShift = 0) {
    // bands is a map in the form {"limit1": rate1, "limit2": rate2, ...}
    // The limits are shifted by "limitShift" and multiplied by "multiplier".
    const income = incomeAttribution.getTotal();
    if (income <= 0) {
      return 0;
    }

    const adjustedBands = Object.fromEntries(Object.entries(bands)
      .map(([limit, rate]) => {
        let newLimit = parseInt(limit);
        if (newLimit > 0) {
          newLimit += limitShift;
        }
        newLimit = adjust(newLimit) * multiplier;
        return [String(newLimit), rate];
      }));

    const totalTax = Object.keys(adjustedBands)
      .map((lowerLimit, index, arr) => {
        const upperLimit = arr[index + 1] || Infinity;
        const rate = adjustedBands[lowerLimit];
        const taxable = Math.min(income, upperLimit) - lowerLimit;
        return Math.max(taxable, 0) * rate;
      })
      .reduce((sum, amount) => sum + amount, 0);

    // Attribute the tax proportionally to the income sources
    const incomeSources = incomeAttribution.getBreakdown();
    for (const source in incomeSources) {
      const proportion = incomeSources[source] / income;
      this.attributionManager.record(taxType, source, totalTax * proportion);
    }

    return totalTax;
  };
  
  computeIT() {
    // Create an attribution object for taxable income
    const taxableIncomeAttribution = new Attribution('taxableIncome');
      
    // Add income sources
    const incomeAttribution = this.attributionManager.getAttribution('income');
    if (incomeAttribution) {
        const incomeBreakdown = incomeAttribution.getBreakdown();
        for (const source in incomeBreakdown) {
            taxableIncomeAttribution.add(source, incomeBreakdown[source]);
        }
    }

    // Add private pension income
    if (this.privatePensionP1 > 0) taxableIncomeAttribution.add('Private Pension P1', this.privatePensionP1);
    if (this.privatePensionP2 > 0) taxableIncomeAttribution.add('Private Pension P2', this.privatePensionP2);

    // Add non-EU shares income
    const nonEuSharesAttribution = this.attributionManager.getAttribution('nonEuShares');
    if (nonEuSharesAttribution) {
        const nonEuSharesBreakdown = nonEuSharesAttribution.getBreakdown();
        for (const source in nonEuSharesBreakdown) {
            taxableIncomeAttribution.add(source, nonEuSharesBreakdown[source]);
        }
    }

    // Subtract pension contribution relief
    taxableIncomeAttribution.add('Your Pension Relief', -this.pensionContribReliefP1);
    taxableIncomeAttribution.add('Their Pension Relief', -this.pensionContribReliefP2);

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
    
    let tax = this.computeProgressiveTax(itBands, taxableIncomeAttribution, 'it', 1, marriedBandIncrease);

    if (this.privatePensionLumpSumCountP1 > 0) {
        const lumpSumAttribution = new Attribution('pensionLumpSum');
        lumpSumAttribution.add('Pension Lump Sum P1', this.privatePensionLumpSumP1);
        tax += this.computeProgressiveTax(config.pensionLumpSumTaxBands, lumpSumAttribution, 'it');
    }
    if (this.privatePensionLumpSumCountP2 > 0) {
        const lumpSumAttribution = new Attribution('pensionLumpSum');
        lumpSumAttribution.add('Pension Lump Sum P2', this.privatePensionLumpSumP2);
        tax += this.computeProgressiveTax(config.pensionLumpSumTaxBands, lumpSumAttribution, 'it');
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
    
    const taxableAmount = taxableIncomeAttribution.getTotal();
    if (isEligibleForAgeExemption && taxableAmount <= adjust(exemption) && (this.privatePensionLumpSumCountP1 === 0 && this.privatePensionLumpSumCountP2 === 0)) {
      this.it = 0;
    } else {
      this.it = Math.max(tax - credit, 0);
    }
    this.attributionManager.record('it', 'Tax Credit', -Math.min(tax, credit));
  };
  
  computePRSI() {
    this.prsi = 0;

    // PRSI for P1's PAYE income
    if (this.person1Ref && this.person1Ref.age < config.prsiExcemptAge) {
        this.salariesP1.forEach(s => {
            const prsi = s.amount * config.prsiRate;
            this.prsi += prsi;
            this.attributionManager.record('prsi', s.description, prsi);
        });
    }

    // PRSI for P2's PAYE income
    if (this.person2Ref && this.person2Ref.age < config.prsiExcemptAge) {
        this.salariesP2.forEach(s => {
            const prsi = s.amount * config.prsiRate;
            this.prsi += prsi;
            this.attributionManager.record('prsi', s.description, prsi);
        });
    }

    // PRSI for non-PAYE income
    const nonPayeIncomeAttribution = new Attribution('nonPayeIncome');
    const incomeAttribution = this.attributionManager.getAttribution('income');
    const nonEuSharesAttribution = this.attributionManager.getAttribution('nonEuShares');

    // Add non-PAYE income sources
    if (incomeAttribution) {
        const incomeBreakdown = incomeAttribution.getBreakdown();
        for (const source in incomeBreakdown) {
            if (!this.salariesP1.some(s => s.description === source) && !this.salariesP2.some(s => s.description === source)) {
                nonPayeIncomeAttribution.add(source, incomeBreakdown[source]);
            }
        }
    }
    
    // Add non-EU shares income
    if (nonEuSharesAttribution) {
        const nonEuSharesBreakdown = nonEuSharesAttribution.getBreakdown();
        for (const source in nonEuSharesBreakdown) {
            nonPayeIncomeAttribution.add(source, nonEuSharesBreakdown[source]);
        }
    }

    // Calculate PRSI on non-PAYE income
    const nonPayeBreakdown = nonPayeIncomeAttribution.getBreakdown();
    for (const source in nonPayeBreakdown) {
        const income = nonPayeBreakdown[source];
        if (this.person2Ref) { // Two people, split 50/50
            if (this.person1Ref && this.person1Ref.age < config.prsiExcemptAge) {
                const prsi = (income / 2) * config.prsiRate;
                this.prsi += prsi;
                this.attributionManager.record('prsi', `${source} (P1)`, prsi);
            }
            if (this.person2Ref.age < config.prsiExcemptAge) {
                const prsi = (income / 2) * config.prsiRate;
                this.prsi += prsi;
                this.attributionManager.record('prsi', `${source} (P2)`, prsi);
            }
        } else { // One person
            if (this.person1Ref && this.person1Ref.age < config.prsiExcemptAge) {
                const prsi = income * config.prsiRate;
                this.prsi += prsi;
                this.attributionManager.record('prsi', source, prsi);
            }
        }
    }
  };
  
  computeUSC() {
    this.usc = 0;

    const uscExemptAmount = adjust(config.uscExemptAmount);
    const uscReducedRateAge = config.uscReducedRateAge;
    const uscReducedRateMaxIncome = adjust(config.uscReducedRateMaxIncome);

    const calculateUscForPerson = (person, personUscLiableIncomeAttribution) => {
        const totalPersonUscLiableIncome = personUscLiableIncomeAttribution.getTotal();
        if (totalPersonUscLiableIncome <= uscExemptAmount) {
            return 0;
        }

        const personAge = person ? person.age : undefined;
        let bands = config.uscTaxBands;
        if ((personAge !== undefined && personAge >= uscReducedRateAge) &&
            (totalPersonUscLiableIncome <= uscReducedRateMaxIncome)) {
            bands = config.uscReducedTaxBands;
        }
        
        return this.computeProgressiveTax(bands, personUscLiableIncomeAttribution, 'usc');
    };

    // Person 1 Analysis
    if (this.person1Ref) {
        const p1UscAttribution = new Attribution('p1UscIncome');
        this.salariesP1.forEach(s => p1UscAttribution.add(s.description, s.amount));
        if (this.privatePensionP1 > 0) p1UscAttribution.add('Private Pension P1', this.privatePensionP1);

        if (!this.person2Ref) { // Single person
            const nonEuSharesAttribution = this.attributionManager.getAttribution('nonEuShares');
            if (nonEuSharesAttribution) {
                const nonEuSharesBreakdown = nonEuSharesAttribution.getBreakdown();
                for (const source in nonEuSharesBreakdown) {
                    p1UscAttribution.add(source, nonEuSharesBreakdown[source]);
                }
            }
        } else { // Two people, split non-EU shares
            const nonEuSharesAttribution = this.attributionManager.getAttribution('nonEuShares');
            if (nonEuSharesAttribution) {
                const nonEuSharesBreakdown = nonEuSharesAttribution.getBreakdown();
                for (const source in nonEuSharesBreakdown) {
                    p1UscAttribution.add(source, nonEuSharesBreakdown[source] / 2);
                }
            }
        }
        this.usc += calculateUscForPerson(this.person1Ref, p1UscAttribution);
    }

    // Person 2 Analysis
    if (this.person2Ref) {
        const p2UscAttribution = new Attribution('p2UscIncome');
        this.salariesP2.forEach(s => p2UscAttribution.add(s.description, s.amount));
        if (this.privatePensionP2 > 0) p2UscAttribution.add('Private Pension P2', this.privatePensionP2);
        
        const nonEuSharesAttribution = this.attributionManager.getAttribution('nonEuShares');
        if (nonEuSharesAttribution) {
            const nonEuSharesBreakdown = nonEuSharesAttribution.getBreakdown();
            for (const source in nonEuSharesBreakdown) {
                p2UscAttribution.add(source, nonEuSharesBreakdown[source] / 2);
            }
        }
        this.usc += calculateUscForPerson(this.person2Ref, p2UscAttribution);
    }
  };

  computeCGT() {
    let tax = 0;
    let remainingRelief = adjust(config.cgtTaxRelief);
    let totalLosses = 0;

    // Calculate total losses first
    for (const taxRate in this.gains) {
        if (this.gains[taxRate].amount < 0) {
            totalLosses -= this.gains[taxRate].amount;
        }
    }

    // Process gains, sorted by tax rate descending
    const sortedGains = Object.entries(this.gains).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

    for (const [taxRate, gainData] of sortedGains) {
        if (gainData.amount > 0) {
            let gainAfterLosses = Math.max(gainData.amount - totalLosses, 0);
            totalLosses = Math.max(totalLosses - gainData.amount, 0);
            
            let taxableGains = Math.max(gainAfterLosses - remainingRelief, 0);
            let usedRelief = Math.min(remainingRelief, gainAfterLosses);
            remainingRelief = Math.max(remainingRelief - gainAfterLosses, 0);
            
            const taxOnThisGain = taxableGains * parseFloat(taxRate);
            tax += taxOnThisGain;

            // Attribute the tax proportionally to the sources of this gain
            const totalGainAmount = gainData.amount;
            for (const source in gainData.sources) {
                const proportion = gainData.sources[source] / totalGainAmount;
                const attributedTax = taxOnThisGain * proportion;
                this.attributionManager.record('cgt', source, attributedTax);
            }
        }
    }
    this.cgt = tax;
    if (remainingRelief > 0 && tax > 0) {
        this.attributionManager.record('cgt', 'CGT Relief', -Math.min(tax, adjust(config.cgtTaxRelief)));
    }
  };
  
  // Create a new Revenue instance with a deep copy of this one's state
  clone() {
    const copy = new Revenue();
    // Deep clone gains (including nested sources objects)
    copy.gains = {};
    for (let key of Object.keys(this.gains)) {
      const gainData = this.gains[key];
      copy.gains[key] = {
        amount: gainData.amount,
        sources: {}
      };
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
    
    // Create a dummy AttributionManager that does nothing to prevent attribution pollution
    copy.attributionManager = {
      record: function() {}, // No-op function
      getAttribution: function() { return null; }, // Always return null
      yearlyAttributions: {} // Empty object
    };
    
    return copy;
  };
}