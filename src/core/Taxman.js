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

  declareSalaryIncome(money, contribRate, person, description) {
    // Validate Money object
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareSalaryIncome requires a Money object');
    }

    // Validate currency matches residence currency
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    // Legacy numeric accumulation (primary path)
    const amount = money.amount;
    this.income += amount; // Total gross income
    this.attributionManager.record('income', description, amount);

    // Money accumulation
    Money.add(this.incomeMoney, money);

    /**
     * @assumes residenceCurrency - All salary amounts validated at input boundary
     */
    const contribution = contribRate * amount;
    // Use ruleset annual cap for pension relief exclusively
    var reliefAnnualCap = (this.ruleset && typeof this.ruleset.getPensionContributionAnnualCap === 'function')
      ? this.ruleset.getPensionContributionAnnualCap()
      : 0;
    const relief = contribRate * Math.min(amount, adjust(reliefAnnualCap));

    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.pensionContribAmountP1 += contribution;
      this.pensionContribReliefP1 += relief;
      this.totalSalaryP1 += amount;
      this.salariesP1.push({ amount: amount, contribRate: contribRate, description: description });
      if (this.salariesP1.length > 1) {
        this.salariesP1.sort((a, b) => a.amount - b.amount);
      }
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.pensionContribAmountP2 += contribution;
      this.pensionContribReliefP2 += relief;
      this.totalSalaryP2 += amount;
      this.salariesP2.push({ amount: amount, contribRate: contribRate, description: description });
      if (this.salariesP2.length > 1) {
        this.salariesP2.sort((a, b) => a.amount - b.amount);
      }
    }
  };

  declareInvestmentTypeIncome(money, investmentTypeKey, description) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareInvestmentTypeIncome requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const amount = money.amount;
    this.investmentTypeIncome[investmentTypeKey] = (this.investmentTypeIncome[investmentTypeKey] || 0) + amount;
    this.attributionManager.record('investmentTypeIncome:' + investmentTypeKey, description, amount);

    if (!this.investmentTypeIncomeMoney[investmentTypeKey]) {
      this.investmentTypeIncomeMoney[investmentTypeKey] = Money.zero(money.currency, money.country);
    }
    Money.add(this.investmentTypeIncomeMoney[investmentTypeKey], money);
  };

  declarePrivatePensionIncome(money, person, description) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declarePrivatePensionIncome requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const amount = money.amount;
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionP1 += amount;
      this.attributionManager.record('privatepensionp1', description, amount);

      Money.add(this.privatePensionP1Money, money);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionP2 += amount;
      this.attributionManager.record('privatepensionp2', description, amount);

      Money.add(this.privatePensionP2Money, money);
    }
  };

  declarePrivatePensionLumpSum(money, person) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declarePrivatePensionLumpSum requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const amount = money.amount;
    const description = 'Pension Lump Sum P' + person.id;
    if (person && this.person1Ref && person.id === this.person1Ref.id) {
      this.privatePensionLumpSumP1 += amount;
      this.privatePensionLumpSumCountP1++;
      this.attributionManager.record('privatepensionlumpsum', description, amount);

      Money.add(this.privatePensionLumpSumP1Money, money);
    } else if (person && this.person2Ref && person.id === this.person2Ref.id) {
      this.privatePensionLumpSumP2 += amount;
      this.privatePensionLumpSumCountP2++;
      this.attributionManager.record('privatepensionlumpsum', description, amount);

      Money.add(this.privatePensionLumpSumP2Money, money);
    }
  };

  declareStatePensionIncome(money) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareStatePensionIncome requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const amount = money.amount;
    this.statePension += amount;

    Money.add(this.statePensionMoney, money);
    // Attribution for state pension is handled in Simulator.js
  };

  declareInvestmentIncome(money, description, assetCountry) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareInvestmentIncome requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const grossAmount = money.amount;
    
    // Apply withholding tax if asset country is provided
    var withholdingAmount = 0;
    if (assetCountry) {
      withholdingAmount = this.getWithholdingTax('dividend', assetCountry, grossAmount);
      if (withholdingAmount > 0) {
        if (!this.withholdingEntries) this.withholdingEntries = [];
        this.withholdingEntries.push({
          source: assetCountry.toUpperCase() + ' Dividend Withholding',
          amount: withholdingAmount
        });
      }
    }
    
    // Record gross income; withholding is materialized as a tax during computeTaxes()
    this.investmentIncome += grossAmount;
    this.attributionManager.record('investmentincome', description, grossAmount);

    Money.add(this.investmentIncomeMoney, money);
  };

  declareOtherIncome(money, description) {
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareOtherIncome requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const amount = money.amount;
    this.income += amount;
    this.attributionManager.record('income', description, amount);

    Money.add(this.incomeMoney, money);
  };

  /**
   * Calculate withholding tax for investment income based on asset country.
   * @param {string} incomeType - Type of income ('dividend', 'interest', 'capitalGains')
   * @param {string} assetCountry - Country code where asset is domiciled
   * @param {number} grossAmount - Gross income amount before withholding
   * @returns {number} Withholding tax amount to deduct
   */
  getWithholdingTax(incomeType, assetCountry, grossAmount) {
    if (!assetCountry || grossAmount <= 0) return 0;
    const config = Config.getInstance();
    const rate = config.getAssetTax(incomeType, assetCountry);
    return grossAmount * rate;
  }

  declareInvestmentGains(money, taxRate, description, options, assetCountry) {
    // options: { category: 'cgt'|'exitTax', eligibleForAnnualExemption: boolean, allowLossOffset: boolean }
    if (!money || typeof money.amount !== 'number' || !money.currency || !money.country) {
      throw new Error('declareInvestmentGains requires a Money object');
    }
    var residenceCurrency = this.residenceCurrency;
    if (money.currency !== residenceCurrency) {
      throw new Error('Taxman expects residence currency (' + residenceCurrency + '), got ' + money.currency);
    }

    const grossAmount = money.amount;
    
    // Apply withholding tax if asset country is provided
    var withholdingAmount = 0;
    if (assetCountry) {
      withholdingAmount = this.getWithholdingTax('capitalGains', assetCountry, grossAmount);
      if (withholdingAmount > 0) {
        if (!this.withholdingEntries) this.withholdingEntries = [];
        this.withholdingEntries.push({
          source: assetCountry.toUpperCase() + ' Capital Gains Withholding',
          amount: withholdingAmount
        });
      }
    }
    
    // Record gross gains; withholding is materialized as a tax during computeTaxes()
    const amount = grossAmount;
    var currentCountry = money.country;
    if (!this.gains.hasOwnProperty(taxRate)) {
      this.gains[taxRate] = {
        amount: 0,
        amountMoney: Money.zero(residenceCurrency, currentCountry),
        sources: {},
        entries: []
      };
    }
    const rateBucket = this.gains[taxRate];

    // Validate currency before accumulation, mirroring other declare* methods
    Money.add(rateBucket.amountMoney, money);

    /**
     * @assumes residenceCurrency - amount validated via Money.add() above.
     * @performance Hot path - direct .amount access for gains accumulation.
     */
    rateBucket.amount += amount;
    if (!rateBucket.sources[description]) {
      rateBucket.sources[description] = 0;
    }
    rateBucket.sources[description] += amount;
    // Store detailed entry for precise CGT/Exit Tax handling
    const entry = {
      amount: amount,
      amountMoney: Money.create(amount, money.currency, money.country),
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

    // Re-apply declared withholding (declared during the year; materialized at compute time)
    if (this.withholdingEntries && this.withholdingEntries.length > 0) {
      for (var i = 0; i < this.withholdingEntries.length; i++) {
        var w = this.withholdingEntries[i];
        if (w && typeof w.amount === 'number' && w.amount !== 0) {
          this._recordTax('withholding', w.source || 'Withholding', w.amount);
        }
      }
    }

    this.computeIT();
    this.computeSocialContributionsGeneric();
    this.computeAdditionalTaxesGeneric();
    this.computeCGT();
  };

  netIncome() {
    this.computeTaxes();
    let investmentTypeGross = Object.values(this.investmentTypeIncome || {}).reduce((sum, val) => sum + val, 0);
    let gross = this.income - (this.pensionContribAmountP1 + this.pensionContribAmountP2) +
      (this.privatePensionP1 + this.privatePensionP2) +
      this.statePension + this.investmentIncome + investmentTypeGross;

    const totalTax = this.getAllTaxesTotal();
    return gross - totalTax;
  };

  reset(person1, person2_optional, attributionManager, currentCountry, year) {
    this.attributionManager = attributionManager;
    this.currentYear = (typeof year === 'number') ? year : (this.currentYear || null);
    this.gains = {};
    this.income = 0;
    this.investmentTypeIncome = {};
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
    this.totalSalaryP1 = 0;
    this.totalSalaryP2 = 0;

    // Dynamic tax totals map for country-neutral engine
    this.taxTotals = {};
    // Withholding declarations are accumulated during the year and materialized during computeTaxes()
    this.withholdingEntries = [];

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
    // Residence currency is defined by Simulator and is the canonical currency for all Taxman declarations.
    // Use the global `residenceCurrency` when available; fall back to ruleset locale currency.
    if (typeof residenceCurrency !== 'undefined' && residenceCurrency) {
      this.residenceCurrency = String(residenceCurrency).trim().toUpperCase();
    } else {
      this.residenceCurrency = (this.ruleset && typeof this.ruleset.getCurrencyCode === 'function')
        ? String(this.ruleset.getCurrencyCode()).trim().toUpperCase()
        : null;
    }
    // Money accumulators (maintained alongside numeric fields for currency context)
    this.incomeMoney = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.investmentTypeIncomeMoney = {};
    this.statePensionMoney = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.privatePensionP1Money = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.privatePensionP2Money = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.privatePensionLumpSumP1Money = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.privatePensionLumpSumP2Money = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
    this.investmentIncomeMoney = Money.zero(this.residenceCurrency || 'EUR', currentCountry || 'ie');
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

  /**
   * Compute progressive income tax using ruleset bands.
   * 
   * @assumes residenceCurrency - All income amounts validated at declaration boundaries.
   *          Tax bands and rates are in residence currency. Scalar arithmetic on .amount is safe.
   * @performance Hot path - direct numeric operations for tax calculation efficiency.
   */
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
      .map(k => parseFloat(k))
      .sort((a, b) => a - b);

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
    entries.sort((a, b) => a[0] - b[0]);
    let tax = 0;
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i][0];
      const rate = entries[i][1];
      const next = i + 1 < entries.length ? entries[i + 1][0] : Infinity;
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

    // Add investment type income sources (RSUs, etc.)
    for (const typeKey in this.investmentTypeIncome) {
      const attr = this.attributionManager.getAttribution('investmentTypeIncome:' + typeKey);
      if (attr) {
        const breakdown = attr.getBreakdown();
        for (const source in breakdown) {
          taxableIncomeAttribution.add(source, breakdown[source]);
        }
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
      const p1TotalSalary = this.totalSalaryP1 || 0;
      const p2TotalSalary = this.person2Ref ? (this.totalSalaryP2 || 0) : 0;
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

    var ageExemptionAge = this.ruleset.getIncomeTaxAgeExemptionAge();
    var ageExemptionLimit = this.ruleset.getIncomeTaxAgeExemptionLimit();
    const totalIncome = taxableIncomeAttribution.getTotal();
    const totalCredits = this._applyTaxCredits(
      this.ruleset,
      params,
      totalIncome,
      this.person1Ref ? this.person1Ref.age : null
    );
    let credit = adjust(totalCredits);

    let exemption = ageExemptionLimit * (this.married ? 2 : 1);

    let p1AgeEligible = (this.person1Ref && this.person1Ref.age >= ageExemptionAge);
    let p2AgeEligible = (this.married && this.person2Ref && this.person2Ref.age >= ageExemptionAge);
    let isEligibleForAgeExemption = p1AgeEligible || p2AgeEligible;

    const taxableAmount = totalIncome;
    const ageExempt = (isEligibleForAgeExemption && taxableAmount <= adjust(exemption) && (this.privatePensionLumpSumCountP1 === 0 && this.privatePensionLumpSumCountP2 === 0));
    if (ageExempt) {
      // Clear any previously recorded income tax for age exemption case
      this.taxTotals['incomeTax'] = 0;
      // Also clear attribution slices for income tax to avoid UI inconsistencies
      try {
        if (this.attributionManager && this.attributionManager.yearlyAttributions && this.attributionManager.yearlyAttributions['tax:incomeTax']) {
          this.attributionManager.yearlyAttributions['tax:incomeTax'] = new Attribution('tax:incomeTax');
        }
      } catch (_) { }
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
      // Include all investment type income attribution (e.g. RSUs - common non-employment income bucket)
      for (const typeKey in this.investmentTypeIncome) {
        const neAttr = this.attributionManager.getAttribution('investmentTypeIncome:' + typeKey);
        if (neAttr) {
          const bd2 = neAttr.getBreakdown();
          for (const k in bd2) baseMap[k] = (baseMap[k] || 0) + bd2[k];
        }
      }
      // Remove salary sources to focus on non-employment income
      var removeSalary = function (list) {
        list.forEach(function (s) {
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
   * Generic calculation for social contributions (e.g., PRSI) using ruleset socialContributions[]
   * @assumes residenceCurrency - All income amounts validated at input boundaries
   */
  computeSocialContributionsGeneric() {
    const contributions = this.ruleset && typeof this.ruleset.getSocialContributions === 'function'
      ? this.ruleset.getSocialContributions() : [];
    if (!Array.isArray(contributions) || contributions.length === 0) return;

    const getRateForAge = function (contrib, age) {
      let rate = typeof contrib.rate === 'number' ? contrib.rate : 0;
      const adj = contrib.ageAdjustments || {};
      const thresholds = Object.keys(adj).map(k => parseInt(k)).sort((a, b) => a - b);
      for (let i = 0; i < thresholds.length; i++) { if (age >= thresholds[i]) rate = adj[String(thresholds[i])]; }
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
    for (const typeKey in this.investmentTypeIncome) {
      const neAttr = this.attributionManager.getAttribution('investmentTypeIncome:' + typeKey);
      if (neAttr) {
        const ne = neAttr.getBreakdown();
        for (const k in ne) nonPayeIncomeAttribution[k] = (nonPayeIncomeAttribution[k] || 0) + ne[k];
      }
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
   * Apply all tax credits from the ruleset, with optional user overrides.
   * @param {TaxRuleSet} ruleset - Active tax ruleset
   * @param {Object} params - Simulation parameters
   * @param {number} grossIncome - Gross income for credit calculations
   * @param {number} age - Person's age for age-based credits
   * @returns {number} - Total credits amount
   */
  _applyTaxCredits(ruleset, params, grossIncome, age) {
    var spec = ruleset.getIncomeTaxSpec();
    var credits = spec.taxCredits || {};
    var totalCredits = 0;
    var country = null;
    if (this.countryHistory && this.countryHistory.length) {
      country = this.countryHistory[this.countryHistory.length - 1].country;
    } else if (ruleset && typeof ruleset.getCountryCode === 'function') {
      country = ruleset.getCountryCode();
    }
    if (country) country = String(country).toLowerCase();

    for (var creditId in credits) {
      if (!credits.hasOwnProperty(creditId)) continue;
      var creditDef = credits[creditId];
      var creditAmount = 0;

      // Check for user override first
      if (country && params.taxCreditsByCountry && params.taxCreditsByCountry[country]) {
        var override = params.taxCreditsByCountry[country][creditId];
        if (override !== undefined && override !== null && override !== '') {
          creditAmount = Number(override);
          totalCredits += creditAmount;
          continue;
        }
      }

      // Calculate based on credit type
      if (creditId === 'employee') {
        // Employee credit is applied per salary earner (P1/P2).
        // Preserve historical semantics: declarative `min` acts as a cap:
        // credit = min(baseAmount, salaryTotal * rate, min.amount).
        var empSpec = (ruleset && typeof ruleset.getIncomeTaxEmployeeCreditSpec === 'function')
          ? ruleset.getIncomeTaxEmployeeCreditSpec()
          : { amount: 0, min: null, max: null };
        var p1TotalSalary = this.totalSalaryP1 || 0;
        var p2TotalSalary = this.totalSalaryP2 || 0;
        var earners = (p1TotalSalary > 0 ? 1 : 0) + (p2TotalSalary > 0 ? 1 : 0);

        // If user override exists, treat it as a per-earner override.
        if (country && params.taxCreditsByCountry && params.taxCreditsByCountry[country]
          && params.taxCreditsByCountry[country][creditId] !== undefined
          && params.taxCreditsByCountry[country][creditId] !== null
          && params.taxCreditsByCountry[country][creditId] !== '') {
          creditAmount = Number(params.taxCreditsByCountry[country][creditId]) * earners;
          totalCredits += creditAmount;
          continue;
        }

        var computePerPersonEmployeeCredit = function (salaryTotal) {
          if (!salaryTotal || salaryTotal <= 0) return 0;
          var base = empSpec.amount || 0;
          var candidate = base;
          if (empSpec.min) {
            var minByRate = (typeof empSpec.min.rate === 'number') ? salaryTotal * empSpec.min.rate : null;
            var minByAmount = (typeof empSpec.min.amount === 'number') ? empSpec.min.amount : null;
            var minCandidates = [];
            if (minByRate !== null) minCandidates.push(minByRate);
            if (minByAmount !== null) minCandidates.push(minByAmount);
            if (minCandidates.length > 0) candidate = Math.min(base, Math.min.apply(null, minCandidates));
          }
          if (empSpec.max) {
            var maxByRate = (typeof empSpec.max.rate === 'number') ? salaryTotal * empSpec.max.rate : null;
            var maxByAmount = (typeof empSpec.max.amount === 'number') ? empSpec.max.amount : null;
            var maxCandidates = [];
            if (maxByRate !== null) maxCandidates.push(maxByRate);
            if (maxByAmount !== null) maxCandidates.push(maxByAmount);
            if (maxCandidates.length > 0) candidate = Math.min(candidate, Math.max.apply(null, maxCandidates));
          }
          return candidate;
        };

        var empCreditP1 = computePerPersonEmployeeCredit(p1TotalSalary);
        var empCreditP2 = computePerPersonEmployeeCredit(p2TotalSalary);
        creditAmount = empCreditP1 + empCreditP2;
      } else if (creditId === 'age') {
        // Age credit is applied per eligible person (P1/P2) using threshold map when present.
        var ageSpec = creditDef;
        var creditForAge = function (ageNum) {
          if (typeof ageSpec === 'number') return ageSpec;
          if (!ageSpec || typeof ageSpec !== 'object' || Array.isArray(ageSpec)) return 0;
          var thresholds = Object.keys(ageSpec)
            .map(function (k) { return parseInt(k); })
            .filter(function (n) { return !isNaN(n); })
            .sort(function (a, b) { return a - b; });
          var amt = 0;
          for (var i = 0; i < thresholds.length; i++) {
            if (ageNum >= thresholds[i]) {
              var val = ageSpec[String(thresholds[i])];
              if (typeof val === 'number') amt = val;
            }
          }
          return amt;
        };
        var p1Age = this.person1Ref ? this.person1Ref.age : age;
        var p2Age = (this.person2Ref && this.married) ? this.person2Ref.age : null;
        creditAmount = creditForAge(p1Age || 0) + (p2Age !== null ? creditForAge(p2Age) : 0);
      } else if (creditId === 'personal') {
        // Legacy compatibility: scenarios/tests can provide a single PersonalTaxCredit override.
        // This corresponds to the total personal credit amount to apply for the household.
        if (params && params.personalTaxCredit !== undefined && params.personalTaxCredit !== null && params.personalTaxCredit !== '') {
          creditAmount = Number(params.personalTaxCredit);
        } else if (typeof creditDef === 'number') creditAmount = creditDef;
        else if (creditDef && typeof creditDef === 'object' && typeof creditDef.amount === 'number') creditAmount = creditDef.amount;
      } else {
        if (typeof creditDef === 'number') creditAmount = creditDef;
        else if (creditDef && typeof creditDef === 'object' && typeof creditDef.amount === 'number') creditAmount = creditDef.amount;
      }

      totalCredits += creditAmount;
    }

    return totalCredits;
  }

  /**
   * Generic calculation for additional progressive taxes (e.g., USC) using ruleset additionalTaxes[]
   * 
   * @assumes residenceCurrency - All income amounts validated at declaration boundaries.
   *          USC/additional tax scalar multiplies on .amount values are currency-safe.
   * @performance Hot path - direct numeric operations for tax calculation efficiency.
   */
  computeAdditionalTaxesGeneric() {
    const extras = this.ruleset && typeof this.ruleset.getAdditionalTaxes === 'function'
      ? this.ruleset.getAdditionalTaxes() : [];
    if (!Array.isArray(extras) || extras.length === 0) return;

    const buildAdditionalTaxIncomeAttribution = (personIdx, taxObj) => {
      const attr = new Attribution('additionalTaxIncome');
      const salaries = personIdx === 1 ? this.salariesP1 : this.salariesP2;
      salaries.forEach(s => attr.add(s.description, s.amount));
      const privPension = personIdx === 1 ? this.privatePensionP1 : this.privatePensionP2;
      if (privPension > 0) attr.add(`Private Pension P${personIdx}`, privPension);

      // Default base includes investment type income (RSUs, etc.) when tax base is 'income'
      const base = taxObj && taxObj.base ? taxObj.base : 'income';
      if (base === 'income') {
        for (const typeKey in this.investmentTypeIncome) {
          const neAttr = this.attributionManager.getAttribution('investmentTypeIncome:' + typeKey);
          if (neAttr) {
            const bd = neAttr.getBreakdown();
            for (const source in bd) {
              const part = this.person2Ref ? bd[source] / 2 : bd[source];
              attr.add(source, part);
            }
          }
        }
      }

      return attr;
    };

    for (const taxObj of extras) {
      const taxId = String(taxObj.name || 'addtax').toLowerCase();
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
            const thresholds = Object.keys(ageBands).map(k => parseInt(k)).sort((a, b) => a - b);
            let chosen = null;
            for (let i = 0; i < thresholds.length; i++) { if (person.age >= thresholds[i]) chosen = thresholds[i]; }
            if (chosen !== null) bands = ageBands[String(chosen)];
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
    let remainingExemptionMoney = remainingExemption;

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
    let remainingAllowableLossesMoney = remainingAllowableLosses;

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
    } catch (_) { }
  };

  clone() {
    const copy = new Taxman();
    copy.gains = {};
    for (let key of Object.keys(this.gains)) {
      const gainData = this.gains[key];
      copy.gains[key] = {
        amount: gainData.amount,
        sources: {},
        entries: Array.isArray(gainData.entries) ? gainData.entries.map(function (e) { return { amount: e.amount, description: e.description, category: e.category, eligibleForAnnualExemption: e.eligibleForAnnualExemption, allowLossOffset: e.allowLossOffset }; }) : []
      };
    }
    copy.income = this.income;
    copy.investmentTypeIncome = {};
    for (let key of Object.keys(this.investmentTypeIncome || {})) {
      copy.investmentTypeIncome[key] = this.investmentTypeIncome[key];
    }
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

    copy.salariesP1 = this.salariesP1.map(s => ({ ...s }));
    copy.salariesP2 = this.salariesP2.map(s => ({ ...s }));

    copy.taxTotals = this.taxTotals ? { ...this.taxTotals } : {};

    copy.ruleset = this.ruleset;
    copy.residenceCurrency = this.residenceCurrency;

    copy.married = this.married;
    copy.dependentChildren = this.dependentChildren;

    // Preserve cross-border tracking and temporal context in clone
    copy.countryHistory = Array.isArray(this.countryHistory) ? this.countryHistory.slice() : [];
    copy.currentYear = this.currentYear || null;

    copy.attributionManager = {
      record: function () { },
      getAttribution: function () { return null; },
      yearlyAttributions: {}
    };

    var cloneCountry = null;
    if (this.countryHistory && this.countryHistory.length) {
      cloneCountry = this.countryHistory[this.countryHistory.length - 1].country;
    } else if (this.ruleset && typeof this.ruleset.getCountryCode === 'function') {
      cloneCountry = this.ruleset.getCountryCode();
    }
    var cloneCurrency = this.residenceCurrency;
    if (!cloneCurrency && this.ruleset && typeof this.ruleset.getCurrencyCode === 'function') {
      cloneCurrency = this.ruleset.getCurrencyCode();
    }
    cloneCurrency = cloneCurrency || 'EUR';
    cloneCountry = cloneCountry || 'ie';

    copy.incomeMoney = this.incomeMoney ? Money.create(this.incomeMoney.amount, this.incomeMoney.currency, this.incomeMoney.country) : null;
    copy.investmentTypeIncomeMoney = {};
    for (let key of Object.keys(this.investmentTypeIncomeMoney || {})) {
      var m = this.investmentTypeIncomeMoney[key];
      if (m) copy.investmentTypeIncomeMoney[key] = Money.create(m.amount, m.currency, m.country);
    }
    copy.statePensionMoney = this.statePensionMoney ? Money.create(this.statePensionMoney.amount, this.statePensionMoney.currency, this.statePensionMoney.country) : null;
    copy.privatePensionP1Money = this.privatePensionP1Money ? Money.create(this.privatePensionP1Money.amount, this.privatePensionP1Money.currency, this.privatePensionP1Money.country) : null;
    copy.privatePensionP2Money = this.privatePensionP2Money ? Money.create(this.privatePensionP2Money.amount, this.privatePensionP2Money.currency, this.privatePensionP2Money.country) : null;
    copy.privatePensionLumpSumP1Money = this.privatePensionLumpSumP1Money ? Money.create(this.privatePensionLumpSumP1Money.amount, this.privatePensionLumpSumP1Money.currency, this.privatePensionLumpSumP1Money.country) : null;
    copy.privatePensionLumpSumP2Money = this.privatePensionLumpSumP2Money ? Money.create(this.privatePensionLumpSumP2Money.amount, this.privatePensionLumpSumP2Money.currency, this.privatePensionLumpSumP2Money.country) : null;
    copy.investmentIncomeMoney = this.investmentIncomeMoney ? Money.create(this.investmentIncomeMoney.amount, this.investmentIncomeMoney.currency, this.investmentIncomeMoney.country) : null;
    if (copy.gains) {
      for (let rateKey of Object.keys(copy.gains)) {
        var bucket = copy.gains[rateKey];
        var sourceBucket = this.gains[rateKey];
        if (bucket && sourceBucket && sourceBucket.amountMoney) {
          var sm = sourceBucket.amountMoney;
          bucket.amountMoney = Money.create(sm.amount, sm.currency, sm.country);
        }
      }
    }

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
