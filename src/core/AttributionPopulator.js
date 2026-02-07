function populateAttributionFields(dataRow, investmentAssets, attributionManager, revenue) {
  // Record portfolio statistics for tooltip attribution
  if (investmentAssets && Array.isArray(investmentAssets)) {
    for (var i = 0; i < investmentAssets.length; i++) {
      var entry = investmentAssets[i];
      if (!entry || !entry.asset) continue;
      
      var metricKey = null;
      var baseKey = entry.key;
      // Map to legacy metric keys for backward compatibility
      if (baseKey === 'indexFunds' || String(baseKey).indexOf('indexFunds_') === 0) {
        metricKey = 'indexfundscapital';
      } else if (baseKey === 'shares' || String(baseKey).indexOf('shares_') === 0) {
        metricKey = 'sharescapital';
      } else {
        // Fallback for new types: lowercase key + 'capital'
        metricKey = String(baseKey).toLowerCase() + 'capital';
      }

      const stats = entry.asset.getPortfolioStats();
      const net = stats.yearlyBought - stats.yearlySold;
      
      if (net > 0) {
        attributionManager.record(metricKey, 'Bought', net);
      } else if (net < 0) {
        attributionManager.record(metricKey, 'Sold', -net);
      }
      attributionManager.record(metricKey, 'Principal', stats.principal);
      attributionManager.record(metricKey, 'P/L', stats.totalGain);
    }
  }

  const currentAttributions = attributionManager.getAllAttributions();
  for (const metric in currentAttributions) {
    // Preserve full tax keys (e.g. tax:incomeTax, tax:incomeTax:us).
    // Non-tax metrics keep legacy flattening by base metric with country-qualified sources.
    var isTaxMetric = metric.indexOf('tax:') === 0;
    var baseMetric = metric;
    var countryCode = null;
    if (!isTaxMetric && metric.indexOf(':') > 0) {
      var sep = metric.indexOf(':');
      baseMetric = metric.substring(0, sep);
      countryCode = metric.substring(sep + 1);
    }

    if (!dataRow.attributions[baseMetric]) {
      dataRow.attributions[baseMetric] = {};
    }

    try {
      const breakdown = currentAttributions[metric].getBreakdown();
      for (const source in breakdown) {
        // Qualify non-tax sources with country code for display if present
        var displaySource = source;
        if (countryCode && !isTaxMetric) {
          displaySource = source + ' (' + countryCode.toUpperCase() + ')';
        }

        if (!dataRow.attributions[baseMetric][displaySource]) {
          dataRow.attributions[baseMetric][displaySource] = 0;
        }
        // Direct accumulation of full breakdown values
        dataRow.attributions[baseMetric][displaySource] += breakdown[source];
      }
    } catch (error) {
      console.error(`Error getting breakdown for ${metric}:`, error);
    }
  }

  // After processing standard taxes accumulation, accumulate dynamic taxTotals
  const totMap = revenue.taxTotals;
  if (!dataRow.taxByKey) dataRow.taxByKey = {};
  for (const tId in totMap) {
    if (!dataRow.taxByKey[tId]) dataRow.taxByKey[tId] = 0;
    dataRow.taxByKey[tId] += totMap[tId];
  }
}

var AttributionPopulator = AttributionPopulator || {};
AttributionPopulator.populateAttributionFields = populateAttributionFields;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AttributionPopulator;
}
