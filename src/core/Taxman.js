/* This file has to work on both the website and Google Sheets (formerly Revenue.js, renamed to Taxman.js) */

class Taxman {

  /**
   * Internal helper to record a specific tax amount, updating both the
   * dynamic taxTotals map and the attribution manager under key `tax:<id>`.
   */
  _recordTax(taxId, source, amount) {
    if (!this.taxTotals) this.taxTotals = {};
    this.taxTotals[taxId] = (this.taxTotals[taxId] || 0) + amount;
    if (this.attributionManager && typeof this.attributionManager.record === 'function') {
      this.attributionManager.record(`tax:${taxId}`, source, amount);
    }
  }

  declareSalaryIncome(amount, contribRate, person, description) {
    this.income += amount; // Total gross income
    this.attributionManager.record('income', description, amount);

    const contribution = contribRate * amount;
    // Use ruleset annual cap for pension relief exclusively
    var reliefAnnualCap = (this.ruleset && typeof this.ruleset.getPensionContributionAnnualCap === 'function')
      ? this.ruleset.getPensionContributionAnnualCap()
      : 0;
    const relief = contribRate * Math.min(amount, adjust(reliefAnnualCap));

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
    
  declareInvestmentGains(amount, taxRate, description, options) {
    // Backward-compatible API with optional options object for per-gain flags
    // options: { category: 'cgt'|'exitTax', eligibleForAnnualExemption: boolean, allowLossOffset: boolean }
    if (!this.gains.hasOwnProperty(taxRate)) {
      this.gains[taxRate] = { amount: 0, sources: {}, entries: [] };
    }
    const rateBucket = this.gains[taxRate];
    rateBucket.amount += amount;
    if (!rateBucket.sources[description]) {
      rateBucket.sources[description] = 0;
    }
    rateBucket.sources[description] += amount;
    // Store detailed entry for precise CGT/Exit Tax handling
    const entry = {
      amount: amount,
      description: description,
      category: (options && (options.category === 'exitTax' || options.category === 'cgt')) ? options.category : 'cgt',
      eligibleForAnnualExemption: options && typeof options.eligibleForAnnualExemption === 'boolean' ? options.eligibleForAnnualExemption : true,
      allowLossOffset: options && typeof options.allowLossOffset === 'boolean' ? options.allowLossOffset : true
    };
    rateBucket.entries.push(entry);
  };
    
  computeTaxes() {
    this.resetTaxAttributions();
    // Reset dynamic totals at start of each computation
    this.taxTotals = {};

    this.computeIT();
    this.computeSocialContributionsGeneric();
    this.computeAdditionalTaxesGeneric();
    this.computeCGT();
  };

  netIncome() {
    this.computeTaxes();
    let gross = this.income - (this.pensionContribAmountP1 + this.pensionContribAmountP2) + 
                  (this.privatePensionP1 + this.privatePensionP2) + 
                  this.statePension + this.investmentIncome + this.nonEuShares;
    
    const totalTax = this.getAllTaxesTotal();
    return gross - totalTax;
  };
  
  reset(person1, person2_optional, attributionManager, currentCountry, year) {
    this.attributionManager = attributionManager;
    this.currentYear = (typeof year === 'number') ? year : (this.currentYear || null);
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

    // Dynamic tax totals map for country-neutral engine
    this.taxTotals = {};

    this.person1Ref = person1 || null;
    this.person2Ref = person2_optional || null;

    this.people = this.person1Ref ? (this.person2Ref ? 2 : 1) : 0;

    this.married = ((typeof params.marriageYear === 'number') && (params.marriageYear > 0) && (typeof this.currentYear === 'number') && (this.currentYear >= params.marriageYear));
    
    if ((typeof params.oldestChildBorn === 'number') || (typeof params.youngestChildBorn === 'number')) {
      let dependentStartYear = (typeof params.oldestChildBorn === 'number' ? params.oldestChildBorn : params.youngestChildBorn);
      let dependentEndYear = (typeof params.youngestChildBorn === 'number' ? params.youngestChildBorn : params.oldestChildBorn) + 18;
      this.dependentChildren = ((typeof this.currentYear === 'number') && isBetween(this.currentYear, dependentStartYear, dependentEndYear));
    } else {
      this.dependentChildren = false;
    }
    // Load the active ruleset (IE). Tests and WebUI preload it into Config for sync use.
    const cfg = Config.getInstance();
    var countryCode = currentCountry || cfg.getDefaultCountry();
    this.ruleset = cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(countryCode) : null;
    if (!this.ruleset) {
      console.error(`TaxRuleSet not found for ${countryCode}`);
    }
    // Track country history for cross-border taxation
    if (!this.countryHistory) this.countryHistory = [];
    if (currentCountry && (typeof this.currentYear === 'number')) {
      var lastEntry = this.countryHistory[this.countryHistory.length - 1];
      if (!lastEntry || lastEntry.country !== currentCountry) {
        this.countryHistory.push({ country: currentCountry, fromYear: this.currentYear });
      }
    }
  };

  /**
   * Check if any previous countries have active post-emigration tax obligations.
   * Returns array of countries with active trailing taxation, or empty array.
   * Future phases will use this to apply multi-country tax rules.
   */
  getActiveCrossBorderTaxCountries() {
    if (!this.countryHistory || this.countryHistory.length <= 1) return [];
    if (!this.ruleset) return [];
    
    var active = [];
    var currentYear = (typeof this.currentYear === 'number') ? this.currentYear : null;
    if (currentYear === null) return [];
    var currentCountry = this.countryHistory[this.countryHistory.length - 1].country;
    
    // Check each previous country for trailing tax obligations
    for (var i = 0; i < this.countryHistory.length - 1; i++) {
      var entry = this.countryHistory[i];
      var exitYear = this.countryHistory[i + 1].fromYear;
      var yearsSinceExit = currentYear - exitYear;
      // Load the previous country's ruleset to check residency rules
      var cfg = Config.getInstance();
      var prevRuleset = cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(entry.country) : null;
      if (!prevRuleset) continue;
      
      var residencyRules = prevRuleset.getResidencyRules();
      var trailingYears = residencyRules.postEmigrationTaxYears || 0;
      var taxesForeign = residencyRules.taxesForeignIncome || false;
      
      // Include trailing taxation for full calendar years AFTER exit, inclusive of the final year.
      // Example: postEmigrationTaxYears = 3, exit at Y:
      // active in Y+1, Y+2, Y+3 (yearsSinceExit = 1..3); not active at Y (0) or Y+4 (4).
      if (trailingYears > 0 && yearsSinceExit >= 1 && yearsSinceExit <= trailingYears && taxesForeign) {
        active.push({
          country: entry.country,
          exitYear: exitYear,
          yearsSinceExit: yearsSinceExit,
          remainingYears: (trailingYears - yearsSinceExit + 1),
          ruleset: prevRuleset
        });
      }
    }
    
    return active;
  }

  resetTaxAttributions() {
    // Reset tax attributions to prevent double-counting when taxes are recomputed multiple times in the same year
    if (this.attributionManager && this.attributionManager.yearlyAttributions) {
      const keys = Object.keys(this.attributionManager.yearlyAttributions);
      for (const k of keys) {
        if (k.startsWith('tax:')) {
          this.attributionManager.yearlyAttributions[k] = new Attribution(k);
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

    const sortedLimits = Object.keys(adjustedBands)
      .map(k=>parseFloat(k))
      .sort((a,b)=>a-b);

    const totalTax = sortedLimits
      .map((lowerLimit, index) => {
        const upperLimit = sortedLimits[index + 1] !== undefined ? sortedLimits[index + 1] : Infinity;
        const rate = adjustedBands[String(lowerLimit)];
        const taxable = Math.min(income, upperLimit) - lowerLimit;
        return Math.max(taxable, 0) * rate;
      })
      .reduce((sum, amount) => sum + amount, 0);

    // Attribute the tax proportionally to the income sources
    const incomeSources = incomeAttribution.getBreakdown();
    for (const source in incomeSources) {
      const proportion = incomeSources[source] / income;
      this._recordTax(taxType, source, totalTax * proportion);
    }

    // Debug: log USC and capital gains progressive calculation details
    // Debug logging removed

    return totalTax;
  };

  /**
   * Compute tax on income using explicit bands map {limit: rate} where limits
   * are lower-bound thresholds. This mirrors the logic used by tests' helper
   * functions for USC calculation (tax applied on full gross income slices).
   */
  computeTaxFromBands(bands, income) {
    if (!bands || typeof bands !== 'object') return 0;
    const entries = Object.entries(bands).map(([limit, rate]) => [parseFloat(limit), rate]);
    entries.sort((a,b)=>a[0]-b[0]);
    let tax = 0;
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i][0];
      const rate = entries[i][1];
      const next = i + 1 < entries.length ? entries[i+1][0] : Infinity;
      if (income <= cur) break;
      const taxable = Math.min(income, next) - cur;
      if (taxable > 0) tax += taxable * rate;
      if (income <= next) break;
    }
    return tax;
  }
  
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

    // Determine brackets and married band increase using ruleset if available
    if (!this.ruleset) {
      console.error("Taxman.computeIT: ruleset is null, cannot compute income tax");
      return;
    }
    var itBands;
    var marriedBandIncrease = 0;
    var status = this.married ? 'married' : 'single';
    itBands = this.ruleset.getIncomeTaxBracketsFor(status, this.dependentChildren);
    if (this.married) {
      const p1TotalSalary = this.salariesP1.reduce(function(sum, s) { return sum + s.amount; }, 0);
      const p2TotalSalary = this.person2Ref ? this.salariesP2.reduce(function(sum, s) { return sum + s.amount; }, 0) : 0;
      var maxIncrease = adjust(this.ruleset.getIncomeTaxJointBandIncreaseMax());
      if (p1TotalSalary > 0 && p2TotalSalary > 0) {
        marriedBandIncrease = Math.min(maxIncrease, Math.min(p1TotalSalary, p2TotalSalary));
      } else if (p1TotalSalary > 0) {
        marriedBandIncrease = Math.min(maxIncrease, p1TotalSalary);
      } else if (p2TotalSalary > 0) {
        marriedBandIncrease = Math.min(maxIncrease, p2TotalSalary);
      }
    }

    let tax = this.computeProgressiveTax(itBands, taxableIncomeAttribution, 'incomeTax', 1, marriedBandIncrease);

    if (this.privatePensionLumpSumCountP1 > 0) {
        const lumpSumAttribution = new Attribution('pensionLumpSum');
        lumpSumAttribution.add('Pension Lump Sum P1', this.privatePensionLumpSumP1);
        var lumpBands = this.ruleset.getPensionLumpSumTaxBands();
        tax += this.computeProgressiveTax(lumpBands, lumpSumAttribution, 'incomeTax');
    }
    if (this.privatePensionLumpSumCountP2 > 0) {
        const lumpSumAttribution = new Attribution('pensionLumpSum');
        lumpSumAttribution.add('Pension Lump Sum P2', this.privatePensionLumpSumP2);
        var lumpBands2 = this.ruleset.getPensionLumpSumTaxBands();
        tax += this.computeProgressiveTax(lumpBands2, lumpSumAttribution, 'incomeTax');
    }
    
    let numSalaryEarners = (this.salariesP1.length > 0 ? 1 : 0) + (this.salariesP2.length > 0 ? 1 : 0);
    var employeeCredit = this.ruleset.getIncomeTaxEmployeeCredit();
    var ageCredit = this.ruleset.getIncomeTaxAgeCredit();
    var ageExemptionAge = this.ruleset.getIncomeTaxAgeExemptionAge();
    var ageExemptionLimit = this.ruleset.getIncomeTaxAgeExemptionLimit();

    // Compute per-person employee credit honoring declarative `min` / `max`
    var empSpec = (this.ruleset && typeof this.ruleset.getIncomeTaxEmployeeCreditSpec === 'function')
      ? this.ruleset.getIncomeTaxEmployeeCreditSpec()
      : { amount: employeeCredit, min: null, max: null };

    // Sum PAYE salaries per person
    const p1TotalSalary = this.salariesP1.reduce(function(sum, s) { return sum + s.amount; }, 0);
    const p2TotalSalary = this.salariesP2.reduce(function(sum, s) { return sum + s.amount; }, 0);

    const computePerPersonEmployeeCredit = (salaryTotal) => {
      if (!salaryTotal || salaryTotal <= 0) return 0;
      var base = empSpec.amount || 0;
      var candidate = base;
      // Apply `min` rule if present: credit = min(base, salaryTotal * rate) or min(base, amount)
      if (empSpec.min) {
        var minByRate = (empSpec.min.rate && typeof empSpec.min.rate === 'number') ? salaryTotal * empSpec.min.rate : null;
        var minByAmount = (empSpec.min.amount && typeof empSpec.min.amount === 'number') ? empSpec.min.amount : null;
        var minCandidates = [];
        if (minByRate !== null) minCandidates.push(minByRate);
        if (minByAmount !== null) minCandidates.push(minByAmount);
        if (minCandidates.length > 0) candidate = Math.min(base, Math.min.apply(null, minCandidates));
      }
      // Apply `max` rule if present: candidate = Math.min(candidate, salaryTotal * rate or amount)
      if (empSpec.max) {
        var maxByRate = (empSpec.max.rate && typeof empSpec.max.rate === 'number') ? salaryTotal * empSpec.max.rate : null;
        var maxByAmount = (empSpec.max.amount && typeof empSpec.max.amount === 'number') ? empSpec.max.amount : null;
        var maxCandidates = [];
        if (maxByRate !== null) maxCandidates.push(maxByRate);
        if (maxByAmount !== null) maxCandidates.push(maxByAmount);
        if (maxCandidates.length > 0) candidate = Math.min(candidate, Math.max.apply(null, maxCandidates));
      }
      return candidate;
    };

    var empCreditP1 = computePerPersonEmployeeCredit(p1TotalSalary);
    var empCreditP2 = computePerPersonEmployeeCredit(p2TotalSalary);

    let credit = adjust(params.personalTaxCredit + empCreditP1 + empCreditP2);
    if (this.person1Ref && this.person1Ref.age >= ageExemptionAge) {
      credit += adjust(ageCredit);
    }
    if (this.married && this.person2Ref && this.person2Ref.age >= ageExemptionAge) {
      credit += adjust(ageCredit);
    }
    
    let exemption = ageExemptionLimit * (this.married ? 2 : 1);

    let p1AgeEligible = (this.person1Ref && this.person1Ref.age >= ageExemptionAge);
    let p2AgeEligible = (this.married && this.person2Ref && this.person2Ref.age >= ageExemptionAge);
    let isEligibleForAgeExemption = p1AgeEligible || p2AgeEligible;
    
    const taxableAmount = taxableIncomeAttribution.getTotal();
    const ageExempt = (isEligibleForAgeExemption && taxableAmount <= adjust(exemption) && (this.privatePensionLumpSumCountP1 === 0 && this.privatePensionLumpSumCountP2 === 0));
    if (ageExempt) {
      // Clear any previously recorded income tax for age exemption case
      this.taxTotals['incomeTax'] = 0;
      // Also clear attribution slices for income tax to avoid UI inconsistencies
      try {
        if (this.attributionManager && this.attributionManager.yearlyAttributions && this.attributionManager.yearlyAttributions['tax:incomeTax']) {
          this.attributionManager.yearlyAttributions['tax:incomeTax'] = new Attribution('tax:incomeTax');
        }
      } catch (_) {}
    } else {
      // Apply credits exactly once as a negative record against band taxes already recorded above
      this._recordTax('incomeTax', 'Tax Credit', -Math.min(tax, credit));
    }

    // Minimal cross-border trailing income tax application
    // Apply trailing countries' income tax using their ruleset on non-employment and pension income
    const trailing = this.getActiveCrossBorderTaxCountries();
    if (trailing && trailing.length > 0) {
      const baseMap = {};
      // Start from the generic income attribution
      const incAttr = this.attributionManager.getAttribution('income');
      if (incAttr) {
        const bd = incAttr.getBreakdown();
        for (const k in bd) baseMap[k] = (baseMap[k] || 0) + bd[k];
      }
      // Include non-EU shares attribution (common non-employment income bucket)
      const neAttr = this.attributionManager.getAttribution('nonEuShares');
      if (neAttr) {
        const bd2 = neAttr.getBreakdown();
        for (const k in bd2) baseMap[k] = (baseMap[k] || 0) + bd2[k];
      }
      // Remove salary sources to focus on non-employment income
      var removeSalary = function(list) {
        list.forEach(function(s) {
          if (s && s.description && baseMap.hasOwnProperty(s.description)) delete baseMap[s.description];
        });
      };
      removeSalary(this.salariesP1);
      removeSalary(this.salariesP2);
      // Ensure private pension income is included explicitly
      if (this.privatePensionP1 > 0) baseMap['Private Pension P1'] = (baseMap['Private Pension P1'] || 0) + this.privatePensionP1;
      if (this.privatePensionP2 > 0) baseMap['Private Pension P2'] = (baseMap['Private Pension P2'] || 0) + this.privatePensionP2;

      // Convert consolidated map to an Attribution for progressive computation
      const xAttr = new Attribution('crossBorderIncome');
      for (const src in baseMap) {
        var val = baseMap[src];
        if (val !== 0) xAttr.add(src, val);
      }

      // Compute tax for each trailing country using its own bands; no credits/currency conversion here
      var status = this.married ? 'married' : 'single';
      for (var i = 0; i < trailing.length; i++) {
        var t = trailing[i];
        var bands = t.ruleset.getIncomeTaxBracketsFor(status, this.dependentChildren);
        this.computeProgressiveTax(bands, xAttr, 'incomeTax:' + t.country);
      }
    }
  };

  /**
   * Generic calculation of social contributions based on ruleset socialContributions[]
   */
  computeSocialContributionsGeneric() {
    const contributions = this.ruleset && typeof this.ruleset.getSocialContributions === 'function'
      ? this.ruleset.getSocialContributions() : [];
    if (!Array.isArray(contributions) || contributions.length === 0) return;

    const getRateForAge = function(contrib, age) {
      let rate = typeof contrib.rate === 'number' ? contrib.rate : 0;
      const adj = contrib.ageAdjustments || {};
      const thresholds = Object.keys(adj).map(k=>parseInt(k)).sort((a,b)=>a-b);
      for (let i=0;i<thresholds.length;i++) { if (age>=thresholds[i]) rate = adj[String(thresholds[i])]; }
      return rate;
    };

    const applyForPerson = (person, salariesList, nonPayeIncome, contribObj) => {
      if (!person) return;
      // Determine effective rate based on age adjustments, if any.
      const rate = getRateForAge(contribObj, person.age);
      if (rate <= 0) return;

      const taxId = String(contribObj.name || 'contrib').toLowerCase();

      // PAYE salaries
      salariesList.forEach(s => {
        const tax = s.amount * rate;
        this._recordTax(taxId, s.description, tax);
      });

      // Non-PAYE income split across persons where applicable.
      const allocation = this.person2Ref ? 0.5 : 1.0;
      for (const source in nonPayeIncome) {
        const amt = nonPayeIncome[source] * allocation;
        const tax = amt * rate;
        const srcLabel = this.person2Ref ? `${source} (${person === this.person1Ref ? 'P1' : 'P2'})` : source;
        this._recordTax(taxId, srcLabel, tax);
      }
    };

    // Build non PAYE income attribution once
    const nonPayeIncomeAttribution = {};
    const incomeAttr = this.attributionManager.getAttribution('income');
    if (incomeAttr) Object.assign(nonPayeIncomeAttribution, incomeAttr.getBreakdown());
    const nonEuAttr = this.attributionManager.getAttribution('nonEuShares');
    if (nonEuAttr) {
      const ne = nonEuAttr.getBreakdown();
      for (const k in ne) nonPayeIncomeAttribution[k] = (nonPayeIncomeAttribution[k]||0)+ne[k];
    }
    // Remove PAYE salary descriptions to avoid double-charging social contributions like PRSI.
    const removeSalarySources = (list) => {
      list.forEach(s => { if (s && s.description && nonPayeIncomeAttribution.hasOwnProperty(s.description)) delete nonPayeIncomeAttribution[s.description]; });
    };
    removeSalarySources(this.salariesP1);
    removeSalarySources(this.salariesP2);

    for (const contribObj of contributions) {
      applyForPerson(this.person1Ref, this.salariesP1, nonPayeIncomeAttribution, contribObj);
      if (this.person2Ref) applyForPerson(this.person2Ref, this.salariesP2, nonPayeIncomeAttribution, contribObj);
    }
  }

  /**
   * Generic calculation for additional progressive taxes (e.g., USC) using ruleset additionalTaxes[]
   */
  computeAdditionalTaxesGeneric() {
    const extras = this.ruleset && typeof this.ruleset.getAdditionalTaxes === 'function'
      ? this.ruleset.getAdditionalTaxes() : [];
    if (!Array.isArray(extras) || extras.length === 0) return;

    const buildAdditionalTaxIncomeAttribution = (personIdx, taxObj) => {
      const attr = new Attribution('additionalTaxIncome');
      const salaries = personIdx===1 ? this.salariesP1 : this.salariesP2;
      salaries.forEach(s=>attr.add(s.description, s.amount));
      const privPension = personIdx===1? this.privatePensionP1 : this.privatePensionP2;
      if (privPension>0) attr.add(`Private Pension P${personIdx}`, privPension);

      // Default base includes non-EU shares when tax base is 'income'
      const base = taxObj && taxObj.base ? taxObj.base : 'income';
      if (base === 'income') {
        const neAttr = this.attributionManager.getAttribution('nonEuShares');
        if (neAttr) {
          const bd = neAttr.getBreakdown();
          for (const source in bd) {
            const part = this.person2Ref ? bd[source]/2 : bd[source];
            attr.add(source, part);
          }
        }
      }

      return attr;
    };

    for (const taxObj of extras) {
      const taxId = String(taxObj.name||'addtax').toLowerCase();
      // New dual exemption model:
      // - incomeExemptionThreshold (cliff): if total income <= threshold, no tax; if above, tax applies on full base
      // - deductibleExemptionAmount (deduction): subtract this amount from taxable base before applying brackets
      // Backward-compat: legacy exemptAmount behaves like deductibleExemptionAmount
      const thresholdRaw = (this.ruleset && typeof this.ruleset.getAdditionalTaxIncomeExemptionThreshold === 'function')
        ? this.ruleset.getAdditionalTaxIncomeExemptionThreshold(taxObj.name)
        : (typeof taxObj.incomeExemptionThreshold === 'number' ? taxObj.incomeExemptionThreshold : 0);
      const deductibleRawExplicit = (this.ruleset && typeof this.ruleset.getAdditionalTaxDeductibleExemptionAmount === 'function')
        ? this.ruleset.getAdditionalTaxDeductibleExemptionAmount(taxObj.name)
        : (typeof taxObj.deductibleExemptionAmount === 'number' ? taxObj.deductibleExemptionAmount : 0);
      const legacyExemptRaw = (this.ruleset && typeof this.ruleset.getAdditionalTaxExemptAmount === 'function')
        ? this.ruleset.getAdditionalTaxExemptAmount(taxObj.name)
        : (typeof taxObj.exemptAmount === 'number' ? taxObj.exemptAmount : 0);
      const threshold = adjust(thresholdRaw);
      const deductible = adjust(deductibleRawExplicit > 0 ? deductibleRawExplicit : legacyExemptRaw);

      const processPerson = (person, attr) => {
        if (!person) return 0;
        const totalInc = attr.getTotal();
        // Apply cliff threshold first: if income is at or below threshold, no tax at all
        if (threshold > 0 && totalInc <= threshold) return 0;
        // Prefer using ruleset helpers where available (e.g., USC special handling)
        // Fallback to taxObj.brackets / ageBasedBrackets otherwise.
        let bands = taxObj.brackets || {};

        try {
          // Prefer generic ruleset helper which selects appropriate bands for any additional tax
          if (this.ruleset && typeof this.ruleset.getAdditionalTaxBandsFor === 'function') {
            bands = this.ruleset.getAdditionalTaxBandsFor(taxObj.name, person.age, totalInc) || bands;
          } else {
            // Fallback: First, handle explicit reducedRateAge logic (legacy shorthand)
            if (typeof taxObj.reducedRateAge === 'number' && typeof taxObj.reducedRateMaxIncome === 'number') {
              if (person.age >= taxObj.reducedRateAge && totalInc <= taxObj.reducedRateMaxIncome) {
                // Use the lowest-rate reduced band set when applicable (preserve semantics of rules)
                const reduced = taxObj.reducedTaxBands || taxObj.brackets && { '0': taxObj.brackets['0'] } || { '0': 0 };
                bands = reduced;
              }
            }

            // Next, ageBasedBrackets override if applicable
            const ageBands = taxObj.ageBasedBrackets || {};
            const thresholds = Object.keys(ageBands).map(k=>parseInt(k)).sort((a,b)=>a-b);
            let chosen = null;
            for (let i=0;i<thresholds.length;i++){ if(person.age>=thresholds[i]) chosen = thresholds[i]; }
            if(chosen!==null) bands = ageBands[String(chosen)];
          }
        } catch (e) {
          // If anything goes wrong picking bands, fall back to declared brackets
          bands = taxObj.brackets || bands;
        }

        // If a deductible amount is configured, compute tax on the taxable
        // portion (total - deductible) and attribute the tax proportionally to
        // the actual taxable shares of each source. Also ensure band
        // selection uses the taxable total so brackets are chosen
        // consistently with the taxable base.
        const total = attr.getTotal();
        if (deductible > 0) {
          if (total <= deductible) return 0;

          // Taxable total after exemption
          const taxableTotal = total - deductible;

          // If ruleset helper exists, prefer bands selected for the taxable total
          try {
            if (this.ruleset && typeof this.ruleset.getAdditionalTaxBandsFor === 'function') {
              bands = this.ruleset.getAdditionalTaxBandsFor(taxObj.name, person.age, taxableTotal) || bands;
            }
          } catch (e) {
            // swallow and fall back to previously determined bands
            bands = bands || {};
          }

          // Build a scaled attribution representing only the taxable shares
          const taxableAttr = new Attribution(attr.name + ':taxable');
          const breakdown = attr.getBreakdown();
          const scale = taxableTotal / total;
          if (!isFinite(scale) || scale <= 0) return 0;
          for (const src in breakdown) {
            const val = breakdown[src] * scale;
            if (val !== 0) taxableAttr.add(src, val);
          }

          // Compute progressive tax on the scaled attribution (no limitShift)
          return this.computeProgressiveTax(bands, taxableAttr, taxId);
        }

        return this.computeProgressiveTax(bands, attr, taxId);
      };

      const p1Attr = buildAdditionalTaxIncomeAttribution(1, taxObj);
      const p2Attr = this.person2Ref ? buildAdditionalTaxIncomeAttribution(2, taxObj) : null;

      // Debug logging removed

      const taxP1 = processPerson(this.person1Ref, p1Attr);
      const taxP2 = processPerson(this.person2Ref, p2Attr);
      // totals are recorded inside computeProgressiveTax via _recordTax
      // Legacy numeric fields should be derived from taxTotals if needed by callers.
    }
  }

  computeCGT() {
    if (!this.ruleset) {
      console.error("Taxman.computeCGT: ruleset is null, cannot compute capital gains tax");
      return;
    }
    // Separate handling for Exit Tax vs CGT, and respect per-gain flags
    let totalTax = 0;
    const annualExemption = adjust(this.ruleset.getCapitalGainsAnnualExemption());
    let remainingExemption = annualExemption;

    // Aggregate allowable losses from CGT entries that explicitly allow loss offset
    let remainingAllowableLosses = 0;
    for (const rateKey in this.gains) {
      const bucket = this.gains[rateKey];
      const entries = Array.isArray(bucket.entries) ? bucket.entries : [];
      for (const entry of entries) {
        if (entry && entry.category === 'cgt' && entry.amount < 0 && entry.allowLossOffset) {
          remainingAllowableLosses += (-entry.amount);
        }
      }
    }

    // Process gains in descending tax rate order to preserve previous behavior
    const sortedByRate = Object.keys(this.gains)
      .map(k => parseFloat(k))
      .sort((a, b) => b - a);

    // Track separate totals for CGT-typed entries and exit-tax-typed entries
    let totalCGTTax = 0;
    let totalExitTax = 0;
    // Track display-only relief tax saved (for tooltips), without affecting totals
    let displayReliefTax = 0;

    for (const rate of sortedByRate) {
      const bucket = this.gains[rate];
      const entries = Array.isArray(bucket.entries) ? bucket.entries : [];
      for (const entry of entries) {
        if (!entry || entry.amount <= 0) continue; // Ignore non-positive entries here
        const numericRate = parseFloat(rate);
        let remainingForThis = entry.amount;

        // Apply loss offset only for CGT entries that allow it
        if (entry.category === 'cgt' && entry.allowLossOffset && remainingAllowableLosses > 0) {
          const usedLoss = Math.min(remainingAllowableLosses, remainingForThis);
          remainingAllowableLosses -= usedLoss;
          remainingForThis -= usedLoss;
        }

        // For CGT entries, apply annual exemption if eligible
        if (entry.category === 'cgt' && entry.eligibleForAnnualExemption && remainingExemption > 0 && remainingForThis > 0) {
          const usedExemption = Math.min(remainingExemption, remainingForThis);
          remainingExemption -= usedExemption;
          remainingForThis -= usedExemption;
          // Record display-only tax relief corresponding to exempted gains at this entry's rate
          if (usedExemption > 0 && isFinite(numericRate) && numericRate > 0) {
            displayReliefTax += usedExemption * numericRate;
          }
        }

        if (remainingForThis > 0) {
          const taxOnEntry = remainingForThis * numericRate;
          // Attribute tax to the unified 'capitalGains' metric for backward compatibility
          this._recordTax('capitalGains', entry.description, taxOnEntry);
          if (entry.category === 'cgt') {
            totalCGTTax += taxOnEntry;
          } else if (entry.category === 'exitTax') {
            totalExitTax += taxOnEntry;
          } else {
            // Default to CGT behavior if category unspecified
            totalCGTTax += taxOnEntry;
          }
        }
      }
    }

    // Compute total tax combining exit tax and CGT (annual exemption already applied to CGT entries above)
    totalTax = totalExitTax + totalCGTTax;

    // Display-only attribution: show a CGT Relief line for tooltip without altering totals
    try {
      if (this.attributionManager && displayReliefTax > 0) {
        this.attributionManager.record('tax:capitalGains', 'CGT Relief', -displayReliefTax);
      }
    } catch (_) {}
  };
  
  clone() {
    const copy = new Taxman();
    copy.gains = {};
    for (let key of Object.keys(this.gains)) {
      const gainData = this.gains[key];
      copy.gains[key] = {
        amount: gainData.amount,
        sources: {},
        entries: Array.isArray(gainData.entries) ? gainData.entries.map(function(e){ return { amount: e.amount, description: e.description, category: e.category, eligibleForAnnualExemption: e.eligibleForAnnualExemption, allowLossOffset: e.allowLossOffset }; }) : []
      };
    }
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

    copy.salariesP1 = this.salariesP1.map(s => ({...s}));
    copy.salariesP2 = this.salariesP2.map(s => ({...s}));

    copy.taxTotals = this.taxTotals ? {...this.taxTotals} : {};

    copy.ruleset = this.ruleset;

    copy.married = this.married;
    copy.dependentChildren = this.dependentChildren;
    
    // Preserve cross-border tracking and temporal context in clone
    copy.countryHistory = Array.isArray(this.countryHistory) ? this.countryHistory.slice() : [];
    copy.currentYear = this.currentYear || null;
    
    copy.attributionManager = {
      record: function() {},
      getAttribution: function() { return null; },
      yearlyAttributions: {}
    };
    
    return copy;
  };

  /**
   * Get a specific tax amount by tax ID.
   * Returns 0 when the tax id has not been recorded.
   * @param {string} taxId The lowercase identifier of the tax (e.g., 'incomeTax', 'prsi').
   */
  getTaxByType(taxId) {
    if (!taxId) return 0;
    return (this.taxTotals && this.taxTotals[taxId]) ? this.taxTotals[taxId] : 0;
  }

  /**
   * Get the sum of all taxes.
   * @returns {number} The total of all recorded taxes.
   */
  getAllTaxesTotal() {
    if (!this.taxTotals || Object.keys(this.taxTotals).length === 0) return 0;
    return Object.values(this.taxTotals).reduce((a, b) => a + b, 0);
  }

  /**
   * Compatibility helper for legacy consumers (e.g., Simulator.js) that expect
   * a method to fetch the total amount of a particular tax bucket.
   * Returns 0 when the tax id has not been recorded.
   * @param {string} taxId The lowercase identifier of the tax (e.g., 'incomeTax', 'prsi').
   */
  getTaxTotal(taxId) {
    return this.getTaxByType(taxId);
  }
}

if (typeof this !== 'undefined') {
  this.Taxman = Taxman;
}
