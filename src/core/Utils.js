/* This file has to work on both the website and Google Sheets */

// This function assumes fixed rate. If the rate varies each year, the adjustment needs to take into account
// the history of variation, or it needs to take the previous value (not the start value) and apply the latest 
// rate once. Either case would require a rewrite of several parts of the simulator. 
// Since it's used mainly to adjust for inflation, inflation has to remain fixed for now.
function adjust(value, rate = null, n = periods) {
  if ((rate === null) || (rate === undefined) || (rate === "")) {
    rate = params.inflation;
  }
  return value * Math.pow(1 + rate, n);
}

/**
 * Deflate a nominal future value back to present-value terms by reversing inflation.
 *
 * This is the inverse of adjust(), dividing by the compound growth factor instead
 * of multiplying. It is used by the present-value display system to express
 * simulated future amounts in today's money.
 *
 * @param {number} value - Nominal future value to convert to present-value.
 * @param {number|null} rate - Inflation rate to use (e.g., 0.02 for 2%). If null/undefined/empty,
 *                             defaults to params.inflation.
 * @param {number} n - Number of periods (years) to deflate. Defaults to global periods.
 * @returns {number} Present-value amount in today's terms.
 *
 * @example
 * // A value of 110 in one year at 10% inflation deflates to 100 today
 * // deflate(110, 0.10, 1) -> 100
 */
function deflate(value, rate = null, n = periods) {
  if ((rate === null) || (rate === undefined) || (rate === "")) {
    rate = params.inflation;
  }
  var base = 1 + rate;
  if (base <= 0) {
    return value;
  }
  return value / Math.pow(base, n);
}

/**
 * Compute a multiplicative deflation factor for a given simulation age/year.
 *
 * This helper returns the factor that converts nominal values at a specific
 * simulation point back to present-value. It derives the number of periods (n)
 * since the start of the simulation and returns deflate(1, inflationRate, n).
 *
 * Period calculation:
 * - Preferred: use age - params.startingAge when both are available.
 * - Fallback:  use (year - startYear) when age represents a calendar year.
 *   If startYear is not provided, attempts Config.getInstance().getSimulationStartYear().
 *
 * @param {number} age - Simulation age (preferred) or calendar year for the row.
 * @param {number|null} startYear - Simulation start year (calendar), e.g., Config.getSimulationStartYear().
 * @param {number|null} inflationRate - Inflation rate to use; if null/undefined/empty, defaults to params.inflation.
 * @returns {number} The deflation factor (multiply a nominal value by this to get present-value).
 *
 * @example
 * // With params.startingAge = 30, age 35 and inflation 2%, n = 5
 * // getDeflationFactor(35, null, 0.02) ~ 1 / (1.02^5)
 */
function getDeflationFactor(age, startYear, inflationRate) {
  var n = 0;

  var ageNum = (age === null || age === undefined || age === "") ? null : parseFloat(age);
  var startingAge = (typeof params !== 'undefined' && params && params.startingAge !== undefined && params.startingAge !== null && params.startingAge !== "")
    ? parseFloat(params.startingAge)
    : null;

  if (ageNum !== null && !isNaN(ageNum) && startingAge !== null && !isNaN(startingAge)) {
    n = ageNum - startingAge;
  } else {
    var sy = (startYear === null || startYear === undefined || startYear === "") ? null : parseInt(startYear, 10);
    if ((sy === null || isNaN(sy)) && typeof Config !== 'undefined' && Config && typeof Config.getInstance === 'function') {
      try {
        sy = parseInt(Config.getInstance().getSimulationStartYear(), 10);
      } catch (_e) {}
    }
    if (ageNum !== null && !isNaN(ageNum) && sy !== null && !isNaN(sy)) {
      n = ageNum - sy;
    } else {
      n = 0;
    }
  }

  if (n < 0) { n = 0; }

  if ((inflationRate === null) || (inflationRate === undefined) || (inflationRate === "")) {
    inflationRate = params.inflation;
  }

  return deflate(1, inflationRate, n);
}

function gaussian(mean, stdev, withOverride = true) {
  let u1 = 1 - Math.random();
  let u2 = 1 - Math.random();
  let val = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  if (withOverride && (stockGrowthOverride !== undefined)) {
    mean = stockGrowthOverride;
  }
  return mean + stdev * val;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function between(a, b, p) {
  return Math.round(a + (b - a) * p);
}

function isBetween(num, min, max) {
  return ((num >= min) && (num <= max));
}

function serializeSimulation(ui) {
    // Collect all parameters
    const parameters = {
        StartingAge: ui.getValue('StartingAge'),
        TargetAge: ui.getValue('TargetAge'),
        InitialSavings: ui.getValue('InitialSavings'),
        InitialPension: ui.getValue('InitialPension'),
        InitialFunds: ui.getValue('InitialFunds'),
        InitialShares: ui.getValue('InitialShares'),
        RetirementAge: ui.getValue('RetirementAge'),
        EmergencyStash: ui.getValue('EmergencyStash'),
        FundsAllocation: ui.getValue('FundsAllocation'),
        SharesAllocation: ui.getValue('SharesAllocation'),
        PensionContributionPercentage: ui.getValue('PensionContributionPercentage'),
        PensionContributionCapped: ui.getValue('PensionContributionCapped'),
        PensionGrowthRate: ui.getValue('PensionGrowthRate'),
        PensionGrowthStdDev: ui.getValue('PensionGrowthStdDev'),
        FundsGrowthRate: ui.getValue('FundsGrowthRate'),
        FundsGrowthStdDev: ui.getValue('FundsGrowthStdDev'),
        SharesGrowthRate: ui.getValue('SharesGrowthRate'),
        SharesGrowthStdDev: ui.getValue('SharesGrowthStdDev'),
        Inflation: ui.getValue('Inflation'),
        MarriageYear: ui.getValue('MarriageYear'),
        YoungestChildBorn: ui.getValue('YoungestChildBorn'),
        OldestChildBorn: ui.getValue('OldestChildBorn'),
        PersonalTaxCredit: ui.getValue('PersonalTaxCredit'),
        StatePensionWeekly: ui.getValue('StatePensionWeekly'),
        PriorityCash: ui.getValue('PriorityCash'),
        PriorityPension: ui.getValue('PriorityPension'),
        PriorityFunds: ui.getValue('PriorityFunds'),
        PriorityShares: ui.getValue('PriorityShares'),
        // Person 2 Parameters
        P2StartingAge: ui.getValue('P2StartingAge'),
        P2RetirementAge: ui.getValue('P2RetirementAge'),
        P2StatePensionWeekly: ui.getValue('P2StatePensionWeekly'),
        InitialPensionP2: ui.getValue('InitialPensionP2'),
        PensionContributionPercentageP2: ui.getValue('PensionContributionPercentageP2'),
        // Simulation Mode
        simulation_mode: ui.getValue('simulation_mode'),
        // Economy Mode
        economy_mode: ui.getValue('economy_mode')
    };

    // Conditionally add StartCountry if relocation is enabled
    const config = Config.getInstance();
    if (config.isRelocationEnabled()) {
      parameters.StartCountry = ui.getValue('StartCountry');
    }

    // Format special values (percentages and booleans)
    for (const [key, value] of Object.entries(parameters)) {
        // Skip formatting if value is undefined or null
        if (value === undefined || value === null) {
            continue;
        }
        if (ui.isPercentage(key)) {
            parameters[key] = FormatUtils.formatPercentage(Math.round(value * 10000) / 10000);
        } else if (ui.isBoolean(key)) {
            parameters[key] = FormatUtils.formatBoolean(value);
        }
    }

    // Get events data, including hidden event types (like SI2 in single mode)
    const events = ui.getTableData('Events', 6, true);

    // Collect Meta per-row from DOM when running in web UI (GAS-safe guard)
    var metaByRow = [];
    var metaDetails = [];
    try {
        // Build a parallel list of event table rows in the same order as getTableData (skip resolution rows)
        var table = (typeof document !== 'undefined') ? document.getElementById('Events') : null;
        if (table) {
            var allRows = Array.prototype.slice.call(table.getElementsByTagName('tr'));
            for (var ri = 0; ri < allRows.length; ri++) {
                var rowEl = allRows[ri];
                try { if (rowEl.classList && rowEl.classList.contains('resolution-panel-row')) continue; } catch (_e) {}
                var cells = rowEl && rowEl.getElementsByTagName ? rowEl.getElementsByTagName('td') : [];
                if (!cells || cells.length === 0) continue; // skip header
                // When includeHiddenEventTypes is true, hidden rows are still included by getTableData
                // so we do not filter by display here.
                // Extract hidden inputs
                var metaPairs = [];
                var metaInfo = {};
                try {
                    var cur = rowEl.querySelector ? rowEl.querySelector('.event-currency') : null;
                    if (cur && cur.value) {
                        metaPairs.push('cur=' + encodeURIComponent(cur.value));
                        metaInfo.cur = cur.value;
                    }
                } catch (_e1) {}
                try {
                    var lc = rowEl.querySelector ? rowEl.querySelector('.event-linked-country') : null;
                    if (lc && lc.value) {
                        metaPairs.push('lc=' + encodeURIComponent(lc.value));
                        metaInfo.lc = lc.value;
                    }
                } catch (_e2) {}
                try {
                    var lei = rowEl.querySelector ? rowEl.querySelector('.event-linked-event-id') : null;
                    if (lei && lei.value) {
                        metaPairs.push('lei=' + encodeURIComponent(lei.value));
                        metaInfo.lei = lei.value;
                    }
                } catch (_e3) {}
                try {
                    var ro = rowEl.querySelector ? rowEl.querySelector('.event-resolution-override') : null;
                    if (ro && ro.value) {
                        metaPairs.push('ro=' + encodeURIComponent(ro.value));
                        metaInfo.ro = ro.value;
                    }
                } catch (_e4) {}
                metaByRow.push(metaPairs.join(';'));
                metaDetails.push(metaInfo);
            }
        }
    } catch (_err) {
        // Non-web environments (e.g., GAS) won't have a DOM; leave meta arrays empty
        metaByRow = [];
        metaDetails = [];
    }

    // Create CSV content (always save with FinSim header for forward compatibility)
    let csvContent = "# FinSim v" + ui.getVersion() + " Save File\n";
    csvContent += "# Parameters\n";
    for (const [key, value] of Object.entries(parameters)) {
        // Convert undefined values to empty strings to avoid "undefined" in CSV
        const csvValue = (value === undefined || value === null) ? '' : value;
        csvContent += `${key},${csvValue}\n`;
    }

    csvContent += "\n";

    var isRelocationEnabled = config && typeof config.isRelocationEnabled === 'function' && config.isRelocationEnabled();

    try {
        if (isRelocationEnabled) {
            var scenarioCountrySet = {};
            var scenarioCountryOrder = [];
            var addCountry = function(code) {
                if (!code && code !== 0) return;
                var normalized = String(code).trim().toLowerCase();
                if (!normalized) return;
                if (scenarioCountrySet[normalized]) return;
                scenarioCountrySet[normalized] = true;
                scenarioCountryOrder.push(normalized);
            };

            var startCountryCode = parameters.StartCountry || (typeof config.getDefaultCountry === 'function' ? config.getDefaultCountry() : null);
            addCountry(startCountryCode);

            for (var md = 0; md < metaDetails.length; md++) {
                var metaInfo = metaDetails[md] || {};
                if (metaInfo.lc) {
                    addCountry(metaInfo.lc);
                }
            }

            var relocations = [];
            for (var ei = 0; ei < events.length; ei++) {
                var eventRow = events[ei] || [];
                var typeName = eventRow[0] || '';
                var colonIdx = typeName.indexOf(':');
                var typeOnly = colonIdx >= 0 ? typeName.substring(0, colonIdx) : typeName;
                if (typeOnly && typeOnly.indexOf('MV-') === 0 && typeOnly.length > 3) {
                    var relocationCode = typeOnly.substring(3);
                    addCountry(relocationCode);
                    var fromAge = '';
                    if (eventRow.length > 2 && eventRow[2] !== undefined && eventRow[2] !== null) {
                        fromAge = String(eventRow[2]);
                    }
                    var parsedAge = parseFloat(fromAge);
                    var sortAge = isNaN(parsedAge) ? Number.MAX_VALUE : parsedAge;
                    relocations.push({
                        code: relocationCode,
                        ageText: fromAge,
                        sortAge: sortAge
                    });
                }
            }

            var cachedRuleSets = {};
            if (config && typeof config.listCachedRuleSets === 'function') {
                cachedRuleSets = config.listCachedRuleSets() || {};
            }

            var commentLines = [];
            commentLines.push("# Multi-Currency Context");
            for (var ci = 0; ci < scenarioCountryOrder.length; ci++) {
                var countryCode = scenarioCountryOrder[ci];
                var displayCode = (countryCode || '').toString().trim().toUpperCase();
                var displayName = (typeof config.getCountryNameByCode === 'function') ? config.getCountryNameByCode(countryCode) : displayCode;
                var ruleset = cachedRuleSets[countryCode] || (typeof config.getCachedTaxRuleSet === 'function' ? config.getCachedTaxRuleSet(countryCode) : null);
                var currencyCode = '';
                var currencySymbol = '';
                if (ruleset) {
                    try {
                        var cc = ruleset.getCurrencyCode ? ruleset.getCurrencyCode() : null;
                        if (cc) currencyCode = String(cc).trim().toUpperCase();
                    } catch (_cce) {}
                    try {
                        var cs = ruleset.getCurrencySymbol ? ruleset.getCurrencySymbol() : null;
                        if (cs) currencySymbol = String(cs);
                    } catch (_cse) {}
                }
                if (!currencyCode) {
                    currencyCode = "UNKNOWN";
                }
                var symbolText = '';
                if (currencySymbol && currencySymbol !== '') {
                    symbolText = " (" + currencySymbol + ")";
                }
                commentLines.push("# Country: " + displayName + " (" + displayCode + ") - Currency: " + currencyCode + symbolText);
            }

            if (relocations.length > 0) {
                relocations.sort(function(a, b) {
                    if (a.sortAge === b.sortAge) return 0;
                    return a.sortAge < b.sortAge ? -1 : 1;
                });
                for (var ri = 0; ri < relocations.length; ri++) {
                    var relocation = relocations[ri];
                    var relCode = (relocation.code || '').toString().trim().toLowerCase();
                    var relDisplayCode = relCode ? relCode.toUpperCase() : '';
                    var relName = (typeof config.getCountryNameByCode === 'function') ? config.getCountryNameByCode(relCode) : relDisplayCode;
                    var ageText = relocation.ageText;
                    if (ageText === undefined || ageText === null || ageText === '') {
                        ageText = '?';
                    }
                    commentLines.push("# Relocations: Age " + ageText + " -> " + relName + " (" + relDisplayCode + ")");
                }
            }

            commentLines.push("#");
            commentLines.push("# Meta Column Format: cur=currency;lc=linkedCountry;lei=linkedEventId;ro=resolutionOverride");
            commentLines.push("# - cur: Currency code - event amount is in this currency");
            commentLines.push("# - lc: Linked country code - for location-tied inflation");
            commentLines.push("# - lei: Linked event ID - for split events that share a common origin");
            commentLines.push("# - ro: Resolution override flag - user has manually reviewed this event");

            csvContent += commentLines.join("\n") + "\n\n";
        }
    } catch (_commentErr) {
        // Comments are optional; proceed without them on failure
    }

    csvContent += "# Events\n";
    // Use conditional header based on relocation enabled state
    if (isRelocationEnabled) {
        csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta\n";
    } else {
        csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra\n";
    }

    var metaIndex = 0;
    events.forEach(event => {
        // Split the first field (which contains "type:name") into separate type and name
        const [type, ...nameParts] = event[0].split(':');
        const name = nameParts.join(':'); // Rejoin in case name contained colons
        
        // URL-encode commas in the name to prevent breaking CSV format
        const encodedName = name.replace(/,/g, "%2C");
        
        // Convert undefined values in event fields to empty strings
        const otherFields = event.slice(1).map(field => 
            (field === undefined || field === null) ? '' : field
        );
        // Append Meta value only if relocation is enabled
        if (isRelocationEnabled) {
            var metaVal = '';
            if (metaByRow && metaIndex < metaByRow.length) {
                metaVal = metaByRow[metaIndex] || '';
            }
            metaIndex++;
            csvContent += `${type},${encodedName},${otherFields.join(',')},${metaVal}\n`;
        } else {
            csvContent += `${type},${encodedName},${otherFields.join(',')}\n`;
        }
    });

    return csvContent;
}

function deserializeSimulation(content, ui) {
    const lines = content.split('\n').map(line => line.trim());

    // Verify file format and extract version (accept legacy and new headers)
    let fileVersion = null;
    const headerLine = lines[0] || '';
    const finSimMatch = headerLine.match(/FinSim\s+v(\d+\.\d+)/);
    const irelandMatch = headerLine.match(/Ireland\s+Financial\s+Simulator\s+v(\d+\.\d+)/);
    if (finSimMatch) {
        fileVersion = parseFloat(finSimMatch[1]);
    } else if (irelandMatch) {
        fileVersion = parseFloat(irelandMatch[1]);
    } else {
        // Not a recognized simulator file or very old format without 'vX.Y'
        throw new Error('Invalid or unrecognized scenario file format.');
    }
    if (fileVersion === null || isNaN(fileVersion)) {
        throw new Error('Could not determine scenario file version.');
    }

    let section = '';
    let p2StartingAgeExists = false;
    let simulationModeExists = false;
    let economyModeExists = false;
    let hasVolatilityInFile = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#')) {
            section = line;
            continue;
        }
        if (line === '') continue;

        if (section.includes('Parameters')) {
            const [key, value] = line.split(',');
            
            // Map legacy field names to current field names for backward compatibility
            const legacyFieldMap = {
                'InitialETFs': 'InitialFunds',
                'InitialTrusts': 'InitialShares',
                'EtfAllocation': 'FundsAllocation',
                'TrustAllocation': 'SharesAllocation',
                'EtfGrowthRate': 'FundsGrowthRate',
                'EtfGrowthStdDev': 'FundsGrowthStdDev',
                'TrustGrowthRate': 'SharesGrowthRate',
                'TrustGrowthStdDev': 'SharesGrowthStdDev',
                'PriorityETF': 'PriorityFunds',
                'PriorityTrust': 'PriorityShares'
            };
            
            const actualKey = legacyFieldMap[key] || key;
            
            try {
                ui.setValue(actualKey, value);
                if (actualKey === 'P2StartingAge' && value && value.trim() !== '') {
                    p2StartingAgeExists = true;
                }
                if (actualKey === 'simulation_mode') {
                    simulationModeExists = true;
                }
                if (actualKey === 'economy_mode') {
                    economyModeExists = true;
                }
                // Track if file has volatility values
                if ((actualKey === 'PensionGrowthStdDev' || actualKey === 'FundsGrowthStdDev' || actualKey === 'SharesGrowthStdDev') 
                    && value && parseFloat(value) > 0) {
                    hasVolatilityInFile = true;
                }
            } catch (e) {
                // Skip if parameter doesn't exist
            }
        }
    }

    // Set simulation_mode based on P2StartingAge for older files if simulation_mode is not present
    if (!simulationModeExists) {
        if (p2StartingAgeExists) {
            ui.setValue('simulation_mode', 'couple');
        } else {
            ui.setValue('simulation_mode', 'single');
        }
    }

    // Set economy_mode based on volatility values for older files if economy_mode is not present
    if (!economyModeExists) {
        if (hasVolatilityInFile) {
            ui.setValue('economy_mode', 'montecarlo');
        } else {
            ui.setValue('economy_mode', 'deterministic');
        }
    }

    // Clear Person 2 fields if they weren't present in the loaded scenario
    // This prevents old single-person scenarios from retaining Person 2 data from previously loaded joint scenarios
    if (!p2StartingAgeExists) {
        try {
            ui.setValue('P2StartingAge', '');
            ui.setValue('P2RetirementAge', '');
            ui.setValue('P2StatePensionWeekly', '');
            ui.setValue('InitialPensionP2', '');
            ui.setValue('PensionContributionPercentageP2', '');
        } catch (e) {
            // Skip if parameters don't exist in the UI
        }
    }

    // Load events
    let eventData = [];
    let inEvents = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('# Events')) {
            inEvents = true;
            continue;
        }
        if (inEvents && line && !line.startsWith('Type,')) {
            const parts = line.split(',');
            if (parts.length > 1) {
                parts[1] = parts[1].replace(/%2C/g, ",");
            }
            eventData.push(parts);
        }
    }

    return eventData;
}

function getRateForKey(key, rateBands) {
  if (!rateBands || typeof rateBands !== 'object' || Object.keys(rateBands).length === 0) {
    // Return 1.0 (100%) as default when no bands are defined
    return 1.0;
  }
  const bandKeys = Object.keys(rateBands).map(Number);
  for (let i = bandKeys.length - 1; i >= 0; i--) {
    const bandKey = bandKeys[i];
    if (key >= bandKey) {
        return rateBands[bandKey];
    }
  }
  var defaultRate = rateBands[bandKeys[0]];
  // Ensure we return a valid number, default to 1.0 if undefined
  return (typeof defaultRate === 'number' && !isNaN(defaultRate)) ? defaultRate : 1.0;
}
