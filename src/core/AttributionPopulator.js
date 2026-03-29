function normalizeDisplayCountry(countryCode) {
  return countryCode ? String(countryCode).toLowerCase() : null;
}

function applyDisplayMeta(item, meta) {
  if (!meta || typeof meta !== 'object') return;
  var sourceCountry = meta.sourceCountry;
  var taxCountry = meta.taxCountry;
  var investmentKey = meta.investmentKey;
  if (sourceCountry !== undefined && sourceCountry !== null && sourceCountry !== '') item.sourceCountry = sourceCountry;
  if (taxCountry !== undefined && taxCountry !== null && taxCountry !== '') item.taxCountry = taxCountry;
  if (investmentKey !== undefined && investmentKey !== null && investmentKey !== '') item.investmentKey = investmentKey;
}

function buildDisplayItemId(item) {
  return (item.kind || '') + '|' +
    (item.label || '') + '|' +
    (item.sourceCountry || '') + '|' +
    (item.taxCountry || '') + '|' +
    (item.investmentKey || '');
}

function ensureDisplayBucket(dataRow, columnKey) {
  if (!dataRow.displayAttributions) dataRow.displayAttributions = {};
  if (!dataRow.displayAttributions[columnKey]) dataRow.displayAttributions[columnKey] = {};
  return dataRow.displayAttributions[columnKey];
}

function addDisplayItem(dataRow, columnKey, item) {
  if (!item || typeof item.amount !== 'number' || item.amount === 0) return;
  var bucket = ensureDisplayBucket(dataRow, columnKey);
  var itemId = item.itemId || buildDisplayItemId(item);
  if (!bucket[itemId]) {
    var created = {
      label: item.label || '',
      amount: 0,
      kind: item.kind || 'other'
    };
    applyDisplayMeta(created, item);
    bucket[itemId] = created;
  }
  bucket[itemId].amount += item.amount;
}

function addAttributionMetricToDisplay(dataRow, currentAttributions, metricKey, columnKey, kind, defaultMeta) {
  var attribution = currentAttributions[metricKey];
  if (!attribution || typeof attribution.getBreakdown !== 'function') return;
  var breakdown = attribution.getBreakdown();
  var sourceKeys = Object.keys(breakdown || {});
  for (var i = 0; i < sourceKeys.length; i++) {
    var source = sourceKeys[i];
    var amount = breakdown[source];
    if (typeof amount !== 'number' || amount === 0) continue;
    var item = {
      label: source,
      amount: amount,
      kind: kind || 'other'
    };
    applyDisplayMeta(item, defaultMeta);
    if (typeof attribution.getSourceMeta === 'function') {
      applyDisplayMeta(item, attribution.getSourceMeta(source));
    }
    addDisplayItem(dataRow, columnKey, item);
  }
}

function addExpenseDisplays(dataRow, currentAttributions) {
  addAttributionMetricToDisplay(dataRow, currentAttributions, 'expenses', 'Expenses', 'expense');
}

var taxDisplayColumnCache = {};

function resolveTaxDisplayColumn(metricKey, residenceCountry, residenceRuleSet) {
  var cacheKey = normalizeDisplayCountry(residenceCountry) + '|' + String(metricKey || '');
  if (Object.prototype.hasOwnProperty.call(taxDisplayColumnCache, cacheKey)) {
    return taxDisplayColumnCache[cacheKey];
  }
  var match = /^tax:([^:]+)(?::([a-z]{2,}))?$/i.exec(String(metricKey || ''));
  if (!match) {
    taxDisplayColumnCache[cacheKey] = null;
    return null;
  }
  var taxId = String(match[1] || '');
  var taxCountry = normalizeDisplayCountry(match[2] || null);
  if (!taxId) {
    taxDisplayColumnCache[cacheKey] = null;
    return null;
  }
  var resolved = null;
  if (!taxCountry) {
    resolved = {
      columnKey: 'Tax__' + taxId,
      taxCountry: normalizeDisplayCountry(residenceCountry)
    };
    taxDisplayColumnCache[cacheKey] = resolved;
    return resolved;
  }
  if (taxCountry === normalizeDisplayCountry(residenceCountry)) {
    resolved = {
      columnKey: 'Tax__' + taxId,
      taxCountry: taxCountry
    };
    taxDisplayColumnCache[cacheKey] = resolved;
    return resolved;
  }
  var sourceRuleSet = null;
  try {
    sourceRuleSet = Config.getInstance().getCachedTaxRuleSet(taxCountry);
  } catch (_) { }
  var mappedTaxId = null;
  if (sourceRuleSet && residenceRuleSet && typeof sourceRuleSet.getEquivalentTaxIdIn === 'function') {
    mappedTaxId = sourceRuleSet.getEquivalentTaxIdIn(residenceRuleSet, taxId);
  }
  if (mappedTaxId) {
    resolved = {
      columnKey: 'Tax__' + mappedTaxId,
      taxCountry: taxCountry
    };
    taxDisplayColumnCache[cacheKey] = resolved;
    return resolved;
  }
  resolved = {
    columnKey: 'Tax__' + taxId + ':' + taxCountry,
    taxCountry: taxCountry
  };
  taxDisplayColumnCache[cacheKey] = resolved;
  return resolved;
}

function addStandardMetricDisplays(dataRow, currentAttributions) {
  var metricMap = {
    incomesalaries: { columnKey: 'IncomeSalaries', kind: 'income' },
    incomersus: { columnKey: 'IncomeRSUs', kind: 'income' },
    incomerentals: { columnKey: 'IncomeRentals', kind: 'income' },
    incomesale: { columnKey: 'IncomeSale', kind: 'income' },
    incomeprivatepension: { columnKey: 'IncomePrivatePension', kind: 'income' },
    incomestatepension: { columnKey: 'IncomeStatePension', kind: 'income' },
    incomecash: { columnKey: 'IncomeCash', kind: 'income' },
    incomedefinedbenefit: { columnKey: 'IncomeDefinedBenefit', kind: 'income' },
    incometaxfree: { columnKey: 'IncomeTaxFree', kind: 'income' },
    realestatecapital: { columnKey: 'RealEstateCapital', kind: 'capital' },
    pensioncontribution: { columnKey: 'PensionContribution', kind: 'deduction' }
  };
  var metricKeys = Object.keys(currentAttributions || {});
  for (var i = 0; i < metricKeys.length; i++) {
    var metricKey = metricKeys[i];
    if (!metricKey) continue;
    if (metricKey.indexOf('tax:') === 0) continue;
    if (metricKey.indexOf('investmentincome:') === 0) continue;
    var baseMetric = metricKey;
    var sourceCountry = null;
    if (metricKey.indexOf(':') > 0) {
      var sep = metricKey.indexOf(':');
      baseMetric = metricKey.substring(0, sep);
      sourceCountry = normalizeDisplayCountry(metricKey.substring(sep + 1));
    }
    var mapping = metricMap[baseMetric];
    if (!mapping) continue;
    addAttributionMetricToDisplay(dataRow, currentAttributions, metricKey, mapping.columnKey, mapping.kind, {
      sourceCountry: sourceCountry
    });
  }
}

function addDynamicInvestmentIncomeDisplays(dataRow, investmentIncomeByKey, currentAttributions, investmentAssets) {
  if (!investmentIncomeByKey) return;
  var assetMetaByKey = {};
  if (investmentAssets && Array.isArray(investmentAssets)) {
    for (var i = 0; i < investmentAssets.length; i++) {
      var entry = investmentAssets[i];
      if (!entry || !entry.key) continue;
      assetMetaByKey[entry.key] = {
        label: entry.label || entry.key,
        sourceCountry: normalizeDisplayCountry(entry.assetCountry || (entry.asset && entry.asset.assetCountry) || null)
      };
    }
  }

  var keys = Object.keys(investmentIncomeByKey || {});
  for (var k = 0; k < keys.length; k++) {
    var investmentKey = keys[k];
    var amount = investmentIncomeByKey[investmentKey];
    if (typeof amount !== 'number' || amount === 0) continue;
    var attrKey = 'investmentincome:' + investmentKey;
    if (currentAttributions[attrKey]) {
      addAttributionMetricToDisplay(dataRow, currentAttributions, attrKey, 'Income__' + investmentKey, 'income', {
        investmentKey: investmentKey,
        sourceCountry: assetMetaByKey[investmentKey] ? assetMetaByKey[investmentKey].sourceCountry : null
      });
      continue;
    }
    var fallbackMeta = assetMetaByKey[investmentKey] || { label: investmentKey, sourceCountry: null };
    addDisplayItem(dataRow, 'Income__' + investmentKey, {
      label: fallbackMeta.label,
      amount: amount,
      kind: 'income',
      investmentKey: investmentKey,
      sourceCountry: fallbackMeta.sourceCountry
    });
  }
}

function addDynamicInvestmentCapitalDisplays(dataRow, investmentAssets) {
  if (!investmentAssets || !Array.isArray(investmentAssets)) return;
  for (var i = 0; i < investmentAssets.length; i++) {
    var entry = investmentAssets[i];
    if (!entry || !entry.asset || typeof entry.asset.getPortfolioStats !== 'function') continue;
    var stats = entry.asset.getPortfolioStats();
    var columnKey = 'Capital__' + entry.key;
    var sourceCountry = normalizeDisplayCountry(entry.assetCountry || entry.asset.assetCountry || null);
    var bucket = null;
    var investmentKey = entry.key;
    var addCapitalItem = function (label, amount, kind) {
      if (typeof amount !== 'number' || amount === 0) return;
      if (!bucket) bucket = ensureDisplayBucket(dataRow, columnKey);
      var itemId = kind + '|' + label + '|' + (sourceCountry || '') + '||' + investmentKey;
      if (!bucket[itemId]) {
        bucket[itemId] = {
          label: label,
          amount: 0,
          kind: kind,
          investmentKey: investmentKey
        };
        if (sourceCountry) bucket[itemId].sourceCountry = sourceCountry;
      }
      bucket[itemId].amount += amount;
    };
    addCapitalItem('Bought', stats.yearlyBought, 'bought');
    addCapitalItem('Sold', stats.yearlySold, 'sold');
    addCapitalItem('Principal', stats.principal, 'principal');
    addCapitalItem('P/L', stats.totalGain, 'profitLoss');
  }
}

function addTaxDisplays(dataRow, currentAttributions, residenceCountry) {
  var residenceRuleSet = null;
  try {
    residenceRuleSet = Config.getInstance().getCachedTaxRuleSet(residenceCountry);
  } catch (_) { }

  var metricKeys = Object.keys(currentAttributions || {});
  for (var i = 0; i < metricKeys.length; i++) {
    var metricKey = metricKeys[i];
    if (metricKey.indexOf('tax:') !== 0) continue;
    if (metricKey === 'tax:capitalGains' || metricKey === 'tax:capitalGainsPreRelief') continue;
    var resolved = resolveTaxDisplayColumn(metricKey, residenceCountry, residenceRuleSet);
    if (!resolved || !resolved.columnKey) continue;
    addAttributionMetricToDisplay(dataRow, currentAttributions, metricKey, resolved.columnKey, 'tax', {
      taxCountry: resolved.taxCountry
    });
  }
}

function toCapitalGainsBaseLabel(source) {
  return String(source || '').trim().replace(/\s+(sale|sim)$/i, '');
}

function addCapitalGainsDisplay(dataRow, currentAttributions, residenceCountry) {
  var gainsAttr = currentAttributions['capitalgains'];
  var preReliefAttr = currentAttributions['tax:capitalGainsPreRelief'];
  var taxAttr = currentAttributions['tax:capitalGains'];
  if (!gainsAttr && !preReliefAttr && !taxAttr) return;

  var orderedSources = [];
  var seen = {};
  var appendSource = function (source) {
    if (!source || seen[source]) return;
    seen[source] = true;
    orderedSources.push(source);
  };

  var gainsBreakdown = gainsAttr && gainsAttr.getBreakdown ? gainsAttr.getBreakdown() : {};
  var preReliefBreakdown = preReliefAttr && preReliefAttr.getBreakdown ? preReliefAttr.getBreakdown() : {};
  var taxBreakdown = taxAttr && taxAttr.getBreakdown ? taxAttr.getBreakdown() : {};

  var gainSources = Object.keys(gainsBreakdown || {});
  for (var i = 0; i < gainSources.length; i++) appendSource(gainSources[i]);
  var taxSources = Object.keys(preReliefBreakdown || {});
  for (var j = 0; j < taxSources.length; j++) appendSource(taxSources[j]);

  for (var s = 0; s < orderedSources.length; s++) {
    var source = orderedSources[s];
    var baseLabel = toCapitalGainsBaseLabel(source);
    var gainAmount = gainsBreakdown[source] || 0;
    if (gainAmount !== 0) {
      addDisplayItem(dataRow, 'Tax__capitalGains', {
        label: /gain(s)?$/i.test(baseLabel) ? baseLabel : (baseLabel + ' Gains'),
        amount: gainAmount,
        kind: 'capitalGains',
        sourceCountry: gainsAttr && typeof gainsAttr.getSourceMeta === 'function' && gainsAttr.getSourceMeta(source)
          ? gainsAttr.getSourceMeta(source).sourceCountry
          : normalizeDisplayCountry(residenceCountry)
      });
    }
    var taxAmount = preReliefBreakdown[source] || 0;
    if (taxAmount !== 0) {
      addDisplayItem(dataRow, 'Tax__capitalGains', {
        label: /tax$/i.test(baseLabel) ? baseLabel : (baseLabel + ' Tax'),
        amount: taxAmount,
        kind: 'tax',
        sourceCountry: preReliefAttr && typeof preReliefAttr.getSourceMeta === 'function' && preReliefAttr.getSourceMeta(source)
          ? preReliefAttr.getSourceMeta(source).sourceCountry
          : normalizeDisplayCountry(residenceCountry)
      });
    }
  }

  var taxKeys = Object.keys(taxBreakdown || {});
  for (var tk = 0; tk < taxKeys.length; tk++) {
    var taxSource = taxKeys[tk];
    var total = taxBreakdown[taxSource];
    if (typeof total !== 'number' || total === 0) continue;
    if (taxSource === 'CGT Relief') {
      addDisplayItem(dataRow, 'Tax__capitalGains', {
        label: 'CGT Relief',
        amount: total,
        kind: 'relief',
        taxCountry: normalizeDisplayCountry(residenceCountry)
      });
      continue;
    }
    if (String(taxSource).indexOf('Foreign Tax Credit') === 0) {
      var match = /Foreign Tax Credit\s*\(([^)]+)\)/i.exec(String(taxSource));
      addDisplayItem(dataRow, 'Tax__capitalGains', {
        label: 'Foreign Tax Credit',
        amount: total,
        kind: 'taxCredit',
        taxCountry: normalizeDisplayCountry(match && match[1] ? match[1] : null)
      });
    }
  }
}

function populateDisplayAttributionFields(dataRow, investmentAssets, investmentIncomeByKey, attributionManager, revenue, residenceCountry) {
  var currentAttributions = attributionManager.getAllAttributions();
  addExpenseDisplays(dataRow, currentAttributions);
  addStandardMetricDisplays(dataRow, currentAttributions);
  addDynamicInvestmentIncomeDisplays(dataRow, investmentIncomeByKey, currentAttributions, investmentAssets);
  addDynamicInvestmentCapitalDisplays(dataRow, investmentAssets);
  addTaxDisplays(dataRow, currentAttributions, residenceCountry);
  addCapitalGainsDisplay(dataRow, currentAttributions, residenceCountry);

  // After processing display attributions, accumulate dynamic taxTotals
  var totMap = revenue.taxTotals;
  if (!dataRow.taxByKey) dataRow.taxByKey = {};
  for (var tId in totMap) {
    if (!Object.prototype.hasOwnProperty.call(totMap, tId)) continue;
    if (!dataRow.taxByKey[tId]) dataRow.taxByKey[tId] = 0;
    dataRow.taxByKey[tId] += totMap[tId];
  }
}

var DisplayAttributionBuilder = DisplayAttributionBuilder || {};
DisplayAttributionBuilder.addDisplayItem = addDisplayItem;
DisplayAttributionBuilder.buildDisplayItemId = buildDisplayItemId;
DisplayAttributionBuilder.populateDisplayAttributionFields = populateDisplayAttributionFields;

var AttributionPopulator = AttributionPopulator || {};
AttributionPopulator.addDisplayItem = addDisplayItem;
AttributionPopulator.buildDisplayItemId = buildDisplayItemId;
AttributionPopulator.populateDisplayAttributionFields = populateDisplayAttributionFields;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DisplayAttributionBuilder;
}
