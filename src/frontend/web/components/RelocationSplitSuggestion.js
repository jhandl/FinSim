/* Shared split-suggestion helpers used by detector, assistant, and table actions. */

var RelocationSplitSuggestion = {
  // Bump only when split-suggestion behavior itself changes (formula, country pairing, rounding, etc.).
  // Do not bump for economic-data updates; those remain "economic" drift.
  SPLIT_SUGGESTION_MODEL_VERSION: 1,

  RELATIVE_TOLERANCE: 0.01,

  parseAmountValue: function (amount) {
    var raw = (amount == null) ? '' : String(amount);
    var sanitized = raw.replace(/[^0-9.\-]/g, '');
    if (sanitized === '' || sanitized === '-' || sanitized === '.' || sanitized === '-.') return NaN;
    var numeric = Number(sanitized);
    if (isNaN(numeric)) numeric = Number(amount);
    return isNaN(numeric) ? NaN : numeric;
  },

  getSuggestedAmount: function (baseAmount, fromCountry, toCountry) {
    var numeric = this.parseAmountValue(baseAmount);
    if (isNaN(numeric)) return NaN;
    var economicData = Config.getInstance().getEconomicData();
    if (!economicData || !economicData.ready) return Math.round(numeric);
    var pppRatio = economicData.getPPP(fromCountry, toCountry);
    if (pppRatio === null) {
      var fxRate = economicData.getFX(fromCountry, toCountry);
      if (fxRate === null) return Math.round(numeric);
      return Math.round(numeric * fxRate);
    }
    return Math.round(numeric * pppRatio);
  },

  amountsRoughlyEqual: function (a, b) {
    if (isNaN(a) || isNaN(b)) return false;
    var denominator = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.abs(a - b) / denominator < this.RELATIVE_TOLERANCE;
  },

  isMaterialDistanceIncrease: function (currentDistance, previousDistance) {
    if (isNaN(currentDistance) || isNaN(previousDistance)) return false;
    if (currentDistance <= previousDistance) return false;
    return !this.amountsRoughlyEqual(currentDistance, previousDistance);
  }
};

this.RelocationSplitSuggestion = RelocationSplitSuggestion;
