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
    if (!dataRow.attributions[metric]) {
      dataRow.attributions[metric] = {};
    }
    try {
      const breakdown = currentAttributions[metric].getBreakdown();
      for (const source in breakdown) {
        if (!dataRow.attributions[metric][source]) {
          dataRow.attributions[metric][source] = 0;
        }
        // Direct accumulation of full breakdown values
        dataRow.attributions[metric][source] += breakdown[source];
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