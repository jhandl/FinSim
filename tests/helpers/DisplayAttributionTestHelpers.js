function getDisplayBucket(row, columnKey) {
  if (!row || !row.displayAttributions || !columnKey) return null;
  var bucket = row.displayAttributions[columnKey];
  return bucket && typeof bucket === 'object' ? bucket : null;
}

function getDisplayItems(row, columnKey) {
  var bucket = getDisplayBucket(row, columnKey);
  if (!bucket) return [];
  return Object.keys(bucket).map(function (itemId) {
    return bucket[itemId];
  }).filter(function (item) {
    return item && typeof item === 'object';
  });
}

function getDisplayAmountByLabel(row, columnKey, label) {
  var items = getDisplayItems(row, columnKey);
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].label === label && typeof items[i].amount === 'number') {
      total += items[i].amount;
    }
  }
  return total;
}

function getDisplayAmountByLabelAndCountry(row, columnKey, label, countryKey, countryCode) {
  var items = getDisplayItems(row, columnKey);
  var expected = countryCode ? String(countryCode).toLowerCase() : null;
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || item.label !== label || typeof item.amount !== 'number') continue;
    var actual = item[countryKey] ? String(item[countryKey]).toLowerCase() : null;
    if (actual === expected) total += item.amount;
  }
  return total;
}

function getDisplayAmountByMeta(row, columnKey, predicate) {
  var items = getDisplayItems(row, columnKey);
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || typeof item.amount !== 'number') continue;
    if (predicate(item)) total += item.amount;
  }
  return total;
}

module.exports = {
  getDisplayBucket: getDisplayBucket,
  getDisplayItems: getDisplayItems,
  getDisplayAmountByLabel: getDisplayAmountByLabel,
  getDisplayAmountByLabelAndCountry: getDisplayAmountByLabelAndCountry,
  getDisplayAmountByMeta: getDisplayAmountByMeta
};
