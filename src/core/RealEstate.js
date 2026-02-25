/* This file has to work on both the website and Google Sheets */

class RealEstate {

  constructor() {
    this.properties = {}
    this.lastSaleBreakdowns = {};
  }

  buy(id, downpayment, appreciation, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].buy(downpayment, appreciation, currency, linkedCountry);
    return this.properties[id];
  }

  sell(id) {
    if (id in this.properties) {
      var breakdown = this.properties[id].getSaleBreakdown();
      this.lastSaleBreakdowns[id] = breakdown;
      let value = breakdown.netProceeds;
      delete this.properties[id];
      return value;
    }
    return 0;
  }

  mortgage(id, years, rate, payment, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].mortgage(years, rate, payment, currency, linkedCountry);
    return this.properties[id];
  }

  getValue(id) {
    if (id in this.properties) {
      return this.properties[id].getValue();
    }
    return 0;
  }

  getPayment(id) {
    if (id in this.properties) {
      return this.properties[id].getPayment();
    }
    return 0;
  }

  getRemainingPrincipal(id) {
    if (id in this.properties) {
      return this.properties[id].getRemainingPrincipal();
    }
    return 0;
  }

  getCurrency(id) {
    if (id in this.properties) {
      return this.properties[id].getCurrency();
    }
    return null;
  }

  getLinkedCountry(id) {
    if (id in this.properties) {
      return this.properties[id].getLinkedCountry();
    }
    return null;
  }

  settleMortgage(id) {
    if (id in this.properties) {
      return this.properties[id].settleForwardMortgage();
    }
    return 0;
  }

  overpayMortgage(id, amount) {
    if (id in this.properties) {
      return this.properties[id].overpayMortgage(amount);
    }
    return 0;
  }

  reverseMortgage(id, rate, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].setupReverseMortgage(rate, currency, linkedCountry);
    return this.properties[id];
  }

  advanceReverseMortgage(id, payoutAmount, rate, currency, linkedCountry) {
    if (!(id in this.properties)) {
      return { payout: 0, interestAccrued: 0, balanceAfter: 0, headroomBeforePayout: 0 };
    }
    if (!this.properties[id].hasReverseMortgage()) {
      this.properties[id].setupReverseMortgage(rate, currency, linkedCountry);
    }
    return this.properties[id].advanceReverseMortgage(payoutAmount);
  }

  getReverseMortgageBalance(id) {
    if (!(id in this.properties)) return 0;
    return this.properties[id].getReverseMortgageBalance();
  }

  getSaleBreakdown(id) {
    if (id in this.properties) {
      return this.properties[id].getSaleBreakdown();
    }
    return this.lastSaleBreakdowns[id] || null;
  }

  getPurchaseBasis(id) {
    if (!(id in this.properties)) return 0;
    return this.properties[id].getPurchaseBasis();
  }

  calculatePrimaryResidenceProportion(propertyCountry, propertyId, purchaseAge, saleAge, residencyTimeline, rentalEvents) {
    if (!propertyCountry) return 0;
    var totalYears = saleAge - purchaseAge;
    if (totalYears <= 0) return 0;

    var primaryYears = 0;
    for (var age = purchaseAge; age < saleAge; age++) {
      var residentCountry = null;
      if (residencyTimeline) {
        for (var i = 0; i < residencyTimeline.length; i++) {
          var entry = residencyTimeline[i];
          if (age >= entry.fromAge && (entry.toAge === null || age <= entry.toAge)) {
            residentCountry = entry.country;
            break;
          }
        }
      }

      var isRented = false;
      if (rentalEvents) {
        for (var j = 0; j < rentalEvents.length; j++) {
          var rental = rentalEvents[j];
          if (rental.id === propertyId && age >= rental.fromAge && age <= rental.toAge) {
            isRented = true;
            break;
          }
        }
      }

      if (residentCountry === propertyCountry && !isRented) {
        primaryYears++;
      }
    }

    return primaryYears / totalYears;
  }

  getPrimaryResidenceProportion(id, purchaseAge, saleAge, residencyTimeline, rentalEvents) {
    if (!(id in this.properties)) return 0;
    var property = this.properties[id];
    var propertyCountry = property.getLinkedCountry();
    return this.calculatePrimaryResidenceProportion(
      propertyCountry,
      id,
      purchaseAge,
      saleAge,
      residencyTimeline,
      rentalEvents
    );
  }

  /**
   * Get total value of all properties in their native currencies (summed without conversion).
   * 
   * @deprecated This method sums property values without currency conversion and may produce
   * incorrect results when properties span multiple currencies. Use getTotalValueConverted()
   * instead, which properly converts all properties to a target currency before summing.
   * 
   * @returns {number} Sum of property values (may mix currencies - use with caution)
   */
  getTotalValue() {
    let sum = 0;
    for (let id of Object.keys(this.properties)) {
      sum += this.properties[id].getValue();
    }
    return sum;
  }

  getTotalValueConverted(targetCurrency, currentCountry, currentYear) {
    if (typeof convertCurrencyAmount !== 'function') {
      return this.getTotalValue();
    }
    let sum = 0;
    const currency = (typeof normalizeCurrency === 'function') ? normalizeCurrency : function (code) { return (code || '').toString().trim().toUpperCase(); };
    const country = (typeof normalizeCountry === 'function') ? normalizeCountry : function (code) { return (code || '').toString().trim().toLowerCase(); };
    for (let id of Object.keys(this.properties)) {
      const property = this.properties[id];
      const value = property.getValue();
      const fromCurrency = currency(property.getCurrency());
      let fromCountry = country(property.getLinkedCountry());
      if (!fromCountry) {
        fromCountry = country(currentCountry);
      }
      var converted = convertCurrencyAmount(value, fromCurrency, fromCountry, targetCurrency, currentCountry, currentYear);
      if (converted === null) {
        // Strict mode failure: return null to signal error
        return null;
      }
      sum += converted;
    }
    return sum;
  }

  addYear() {
    for (let id of Object.keys(this.properties)) {
      this.properties[id].addYear();
    }
  }

}


/**
 * Property represents a single real estate asset with optional mortgage.
 * 
 * @invariant Same currency per property: All monetary fields (paid, borrowed, payment)
 *            must share the same currency and country. This is enforced at buy/mortgage
 *            time and validated in getValue() to prevent silent currency mixing.
 */
class Property {

  constructor() {
    this.appreciation = 0;
    this.periods = 0;
    this.terms = 0;
    this.totalPayments = 0;
    this.monthsPaid = 0;
    this.monthlyRate = 0;
    this.monthlyPaymentAmount = 0;
    this.fractionRepaid = 0;
    this.purchaseBasisAmount = 0;
    this.paid = null;
    this.borrowed = null;
    this.payment = null;
    this.reverseRate = 0;
    this.reverseBalance = null;
  }

  buy(paid, appreciation, currency, linkedCountry) {
    this.appreciation = appreciation;
    var normalizedCurrency = (currency !== undefined && currency !== null && currency !== '') ? String(currency).toUpperCase() : 'EUR';
    var normalizedCountry = (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') ? String(linkedCountry).toLowerCase() : 'ie';
    if (this.borrowed) {
      if (this.borrowed.currency !== normalizedCurrency) {
        throw new Error('Property currency mismatch: paid=' + normalizedCurrency + ', borrowed=' + this.borrowed.currency);
      }
      if (this.borrowed.country !== normalizedCountry) {
        throw new Error('Property country mismatch: paid=' + normalizedCountry + ', borrowed=' + this.borrowed.country);
      }
    }
    this.paid = Money.create(paid, normalizedCurrency, normalizedCountry);
    this.updatePurchaseBasis();
  }

  mortgage(years, rate, payment, currency, linkedCountry) {
    const n = years * 12;
    const r = rate / 12;
    const monthlyPayment = payment / 12;
    var borrowedAmount;
    if (r === 0) {
      borrowedAmount = monthlyPayment * n;
    } else {
      const c = Math.pow(1 + r, n);
      borrowedAmount = monthlyPayment * (c - 1) / (r * c);
    }
    this.terms = years;
    this.totalPayments = n;
    this.monthsPaid = 0;
    this.monthlyRate = r;
    this.monthlyPaymentAmount = monthlyPayment;
    this.fractionRepaid = 0;
    var normalizedCurrency = (currency !== undefined && currency !== null && currency !== '') ? String(currency).toUpperCase() : (this.paid ? this.paid.currency : 'EUR');
    var normalizedCountry = (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') ? String(linkedCountry).toLowerCase() : (this.paid ? this.paid.country : 'ie');
    if (this.paid) {
      if (this.paid.currency !== normalizedCurrency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', borrowed=' + normalizedCurrency);
      }
      if (this.paid.country !== normalizedCountry) {
        throw new Error('Property country mismatch: paid=' + this.paid.country + ', borrowed=' + normalizedCountry);
      }
    }
    if (!this.paid) {
      this.paid = Money.create(0, normalizedCurrency, normalizedCountry);
    }
    this.payment = Money.create(payment, normalizedCurrency, normalizedCountry);
    this.borrowed = Money.create(borrowedAmount, normalizedCurrency, normalizedCountry);
    this.updatePurchaseBasis();
  }

  clearForwardMortgageState() {
    this.borrowed = null;
    this.payment = null;
    this.totalPayments = 0;
    this.monthsPaid = 0;
    this.monthlyRate = 0;
    this.monthlyPaymentAmount = 0;
    this.fractionRepaid = this.purchaseBasisAmount > 0 ? 1 : 0;
  }

  settleForwardMortgage() {
    const remaining = this.getRemainingPrincipal();
    this.clearForwardMortgageState();
    return remaining;
  }

  overpayMortgage(amount) {
    if (!(amount > 0)) return 0;
    const remaining = this.getRemainingPrincipal();
    if (!(remaining > 0)) return 0;

    var applied = amount;
    if (applied > remaining) applied = remaining;
    var remainingAfter = remaining - applied;
    if (remainingAfter <= 0) {
      this.clearForwardMortgageState();
      return applied;
    }

    var monthsLeft = this.totalPayments - this.monthsPaid;
    if (!(monthsLeft > 0)) {
      this.clearForwardMortgageState();
      return applied;
    }

    this.borrowed = Money.create(remainingAfter, this.borrowed.currency, this.borrowed.country);
    this.totalPayments = monthsLeft;
    this.monthsPaid = 0;
    return applied;
  }

  hasReverseMortgage() {
    return !!this.reverseBalance;
  }

  setupReverseMortgage(rate, currency, linkedCountry) {
    var normalizedCurrency = (currency !== undefined && currency !== null && currency !== '') ? String(currency).toUpperCase() : this.getCurrency();
    var normalizedCountry = (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') ? String(linkedCountry).toLowerCase() : this.getLinkedCountry();
    if (!normalizedCurrency) normalizedCurrency = 'EUR';
    if (!normalizedCountry) normalizedCountry = 'ie';
    if (this.paid) {
      if (this.paid.currency !== normalizedCurrency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', reverse=' + normalizedCurrency);
      }
      if (this.paid.country !== normalizedCountry) {
        throw new Error('Property country mismatch: paid=' + this.paid.country + ', reverse=' + normalizedCountry);
      }
    }
    if (!this.paid) {
      this.paid = Money.create(0, normalizedCurrency, normalizedCountry);
    }
    if (!this.reverseBalance) {
      this.reverseBalance = Money.create(0, normalizedCurrency, normalizedCountry);
    }
    this.reverseRate = (rate !== undefined && rate !== null && rate !== '') ? Number(rate) : 0;
    if (isNaN(this.reverseRate)) this.reverseRate = 0;
  }

  getReverseMortgageBalance() {
    return this.reverseBalance ? this.reverseBalance.amount : 0;
  }

  advanceReverseMortgage(payoutAmount) {
    if (!this.reverseBalance) {
      return { payout: 0, interestAccrued: 0, balanceAfter: 0, headroomBeforePayout: 0 };
    }
    var requested = Number(payoutAmount);
    if (!(requested > 0)) requested = 0;

    var grossValue = this.getGrossMarketValue();
    var currentBalance = this.getReverseMortgageBalance();
    var headroom = grossValue - currentBalance;
    if (!(headroom > 0)) headroom = 0;

    var payout = requested;
    if (payout > headroom) payout = headroom;

    var beforeInterest = currentBalance + payout;
    var interestAccrued = 0;
    var afterInterest = beforeInterest;
    if (beforeInterest > 0 && this.reverseRate > 0) {
      interestAccrued = beforeInterest * this.reverseRate;
      afterInterest = beforeInterest + interestAccrued;
    }

    this.reverseBalance.amount = afterInterest;
    return {
      payout: payout,
      interestAccrued: interestAccrued,
      balanceAfter: afterInterest,
      headroomBeforePayout: headroom
    };
  }

  addYear() {
    this.periods++;
    if (this.borrowed && this.totalPayments > 0 && this.monthsPaid < this.totalPayments) {
      this.monthsPaid += 12;
      if (this.monthsPaid > this.totalPayments) {
        this.monthsPaid = this.totalPayments;
      }
    }
    if (this.borrowed && this.borrowed.amount > 0) {
      this.fractionRepaid = 1 - (this.getRemainingPrincipal() / this.borrowed.amount);
      if (this.fractionRepaid < 0) this.fractionRepaid = 0;
      if (this.fractionRepaid > 1) this.fractionRepaid = 1;
    } else {
      if (this.purchaseBasisAmount > 0) {
        this.fractionRepaid = 1;
      } else {
        this.fractionRepaid = 0;
      }
    }
  }

  getPayment() {
    return this.payment ? this.payment.amount : 0;
  }

  getRemainingPrincipal() {
    if (!this.borrowed) return 0;
    var principal = this.borrowed.amount;
    if (!(principal > 0)) return 0;
    if (this.totalPayments <= 0) return principal;
    var k = this.monthsPaid;
    if (!(k > 0)) return principal;
    if (k >= this.totalPayments) return 0;

    if (this.monthlyRate === 0) {
      var remainingZeroRate = principal - (this.monthlyPaymentAmount * k);
      return (remainingZeroRate > 0) ? remainingZeroRate : 0;
    }

    var growth = Math.pow(1 + this.monthlyRate, k);
    var remaining = principal * growth - this.monthlyPaymentAmount * ((growth - 1) / this.monthlyRate);
    return (remaining > 0) ? remaining : 0;
  }

  updatePurchaseBasis() {
    var basis = 0;
    if (this.paid) basis += this.paid.amount;
    if (this.borrowed) basis += this.borrowed.amount;
    this.purchaseBasisAmount = basis;
  }

  getPurchaseBasis() {
    return this.purchaseBasisAmount;
  }

  resolveAppreciationRate() {
    var resolvedRate = null;

    // Preserve legacy behaviour when an explicit appreciation rate is set.
    if (this.appreciation !== null && this.appreciation !== undefined && this.appreciation !== '') {
      resolvedRate = this.appreciation;
    } else {
      // When no explicit rate is provided, resolve an inflation rate for the
      // asset's country so that nominal growth is pegged to the property's
      // own country, not the simulator's current residency.
      try {
        if (typeof InflationService !== 'undefined' &&
          InflationService &&
          typeof InflationService.resolveInflationRate === 'function') {

          // Determine the asset country: linkedCountry -> params.StartCountry -> '' (let service decide).
          var assetCountry = '';
          var derivedCountry = this.getLinkedCountry();
          if (derivedCountry !== null && derivedCountry !== undefined && derivedCountry !== '') {
            assetCountry = derivedCountry;
          } else {
            try {
              if (typeof params !== 'undefined' && params && params.StartCountry) {
                assetCountry = params.StartCountry;
              }
            } catch (_) {
              assetCountry = '';
            }
          }

          // Prefer the current simulation year when available; otherwise let the
          // service fall back to its own defaults.
          var currentYear = null;
          try {
            if (typeof year === 'number') {
              currentYear = year;
            }
          } catch (_) {
            currentYear = null;
          }

          resolvedRate = InflationService.resolveInflationRate(assetCountry, currentYear, {
            params: (function () {
              try { return (typeof params !== 'undefined') ? params : null; } catch (_) { return null; }
            })(),
            countryInflationOverrides: (function () {
              try { return (typeof countryInflationOverrides !== 'undefined') ? countryInflationOverrides : null; } catch (_) { return null; }
            })()
          });
        }
      } catch (_) {
        resolvedRate = null;
      }

      // Fallback for environments without InflationService (legacy tests/GAS).
      if (resolvedRate === null || resolvedRate === undefined) {
        var fallbackRate = 0;
        try {
          if (typeof params !== 'undefined' && params && typeof params.inflation === 'number') {
            fallbackRate = params.inflation;
          }
        } catch (_) {
          fallbackRate = 0;
        }
        resolvedRate = fallbackRate;
      }
    }
    return resolvedRate;
  }

  getGrossMarketValue() {
    var propertyCurrency = this.getCurrency();
    var propertyCountry = this.getLinkedCountry();
    if (!propertyCurrency || !propertyCountry) return 0;

    if (!(this.purchaseBasisAmount > 0)) {
      if (!this.paid && !this.borrowed) return 0;
    }

    // Money path: safe currency-aware market value basis
    var baseMoney = Money.create(this.purchaseBasisAmount, propertyCurrency, propertyCountry);

    // Safety: enforce same-currency invariant per property
    if (this.paid && this.borrowed) {
      if (this.paid.currency !== this.borrowed.currency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', borrowed=' + this.borrowed.currency);
      }
      if (this.paid.country !== this.borrowed.country) {
        throw new Error('Property country mismatch: paid=' + this.paid.country + ', borrowed=' + this.borrowed.country);
      }
    }
    if (this.paid && this.payment) {
      if (this.paid.currency !== this.payment.currency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', payment=' + this.payment.currency);
      }
      if (this.paid.country !== this.payment.country) {
        throw new Error('Property country mismatch: paid=' + this.paid.country + ', payment=' + this.payment.country);
      }
    }
    if (this.borrowed && this.payment) {
      if (this.borrowed.currency !== this.payment.currency) {
        throw new Error('Property currency mismatch: borrowed=' + this.borrowed.currency + ', payment=' + this.payment.currency);
      }
      if (this.borrowed.country !== this.payment.country) {
        throw new Error('Property country mismatch: borrowed=' + this.borrowed.country + ', payment=' + this.payment.country);
      }
    }
    if (this.reverseBalance && this.paid) {
      if (this.paid.currency !== this.reverseBalance.currency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', reverse=' + this.reverseBalance.currency);
      }
      if (this.paid.country !== this.reverseBalance.country) {
        throw new Error('Property country mismatch: paid=' + this.paid.country + ', reverse=' + this.reverseBalance.country);
      }
    }

    var resolvedRate = this.resolveAppreciationRate();
    return adjust(baseMoney.amount, resolvedRate, this.periods);
  }

  getSaleBreakdown() {
    var grossValue = this.getGrossMarketValue();
    var forwardBalance = this.getRemainingPrincipal();
    var forwardPayoff = forwardBalance;
    if (forwardPayoff > grossValue) forwardPayoff = grossValue;

    var afterForward = grossValue - forwardPayoff;
    if (!(afterForward > 0)) afterForward = 0;

    var reverseBalance = this.getReverseMortgageBalance();
    var reversePayoff = reverseBalance;
    if (reversePayoff > afterForward) reversePayoff = afterForward;

    var reverseWriteOff = reverseBalance - reversePayoff;
    if (!(reverseWriteOff > 0)) reverseWriteOff = 0;

    var netProceeds = afterForward - reversePayoff;
    if (!(netProceeds > 0)) netProceeds = 0;

    return {
      grossValue: grossValue,
      forwardMortgagePayoff: forwardPayoff,
      reverseMortgagePayoff: reversePayoff,
      reverseMortgageWriteOff: reverseWriteOff,
      netProceeds: netProceeds
    };
  }

  /**
   * Calculate current property value including appreciation and mortgage repayment.
   * 
   * @returns {number} Property value in native currency
   * @assumes Same currency per property - paid, borrowed, and payment must share currency/country.
   *          This invariant is enforced at buy/mortgage time and validated here.
   * @performance Rare call (yearly per property), direct .amount arithmetic for zero overhead.
   */
  getValue() {
    var grossValue = this.getGrossMarketValue();
    var remainingPrincipal = this.getRemainingPrincipal();
    var reverseBalance = this.getReverseMortgageBalance();
    var equityAmount = grossValue - remainingPrincipal - reverseBalance;
    return (equityAmount > 0) ? equityAmount : 0;
  }

  getCurrency() {
    if (this.paid) return this.paid.currency;
    if (this.borrowed) return this.borrowed.currency;
    if (this.payment) return this.payment.currency;
    if (this.reverseBalance) return this.reverseBalance.currency;
    return null;
  }

  getLinkedCountry() {
    if (this.paid) return this.paid.country;
    if (this.borrowed) return this.borrowed.country;
    if (this.payment) return this.payment.country;
    if (this.reverseBalance) return this.reverseBalance.country;
    return null;
  }

}
