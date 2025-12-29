function populateAttributionFields(dataRow, indexFunds, shares, attributionManager, revenue) {
  // Record portfolio statistics for tooltip attribution
  const indexFundsStats = indexFunds.getPortfolioStats();
  const indexFundsNet = indexFundsStats.yearlyBought - indexFundsStats.yearlySold;
  if (indexFundsNet > 0) {
    attributionManager.record('indexfundscapital', 'Bought', indexFundsNet);
  } else if (indexFundsNet < 0) {
    attributionManager.record('indexfundscapital', 'Sold', -indexFundsNet);
  }
  attributionManager.record('indexfundscapital', 'Principal', indexFundsStats.principal);
  attributionManager.record('indexfundscapital', 'P/L', indexFundsStats.totalGain);

  const sharesStats = shares.getPortfolioStats();
  const sharesNet = sharesStats.yearlyBought - sharesStats.yearlySold;
  if (sharesNet > 0) {
    attributionManager.record('sharescapital', 'Bought', sharesNet);
  } else if (sharesNet < 0) {
    attributionManager.record('sharescapital', 'Sold', -sharesNet);
  }
  attributionManager.record('sharescapital', 'Principal', sharesStats.principal);
  attributionManager.record('sharescapital', 'P/L', sharesStats.totalGain);

  const currentAttributions = attributionManager.getAllAttributions();
  for (const metric in currentAttributions) {
    // Extract base metric name (remove country suffix if present)
    var baseMetric = metric;
    var countryCode = null;
    if (metric.indexOf(':') > 0) {
      var parts = metric.split(':');
      baseMetric = parts[0];
      countryCode = parts[1];
    }

    if (!dataRow.attributions[baseMetric]) {
      dataRow.attributions[baseMetric] = {};
    }

    try {
      const breakdown = currentAttributions[metric].getBreakdown();
      for (const source in breakdown) {
        // Qualify source with country code for display if present
        var displaySource = source;
        if (countryCode) {
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