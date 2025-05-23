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

function formatPercentage(value) {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return value;

  // If value is decimal (< 1), multiply by 100
  const displayValue = numValue <= 1 ? (numValue * 100) : numValue;
  // Format with at most 1 decimal place, and remove .0 if present
  return `${parseFloat(displayValue.toFixed(1)).toString()}%`;
}

function formatBoolean(value) {
  if (typeof value === 'string') {
    value = value.toLowerCase();
    return (value === 'true' || value === 'yes') ? 'Yes' : 'No';
  }
  return value ? 'Yes' : 'No';
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
        PriorityShares: ui.getValue('PriorityShares')
    };

    // Format special values (percentages and booleans)
    for (const [key, value] of Object.entries(parameters)) {
        if (ui.isPercentage(key)) {
            parameters[key] = formatPercentage(Math.round(value * 10000) / 10000); // Use local function
        } else if (ui.isBoolean(key)) {
            parameters[key] = formatBoolean(value); // Use local function
        }
    }

    // Get events data
    const events = ui.getTableData('Events', 6);

    // Create CSV content
    let csvContent = "# Ireland Financial Simulator v1.26 Save File\n";
    csvContent += "# Parameters\n";
    for (const [key, value] of Object.entries(parameters)) {
        csvContent += `${key},${value}\n`;
    }

    csvContent += "\n# Events\n";
    csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra\n";
    events.forEach(event => {
        // Split the first field (which contains "type:name") into separate type and name
        const [type, ...nameParts] = event[0].split(':');
        const name = nameParts.join(':'); // Rejoin in case name contained colons

        // URL-encode commas in the name to prevent breaking CSV format
        const encodedName = name.replace(/,/g, "%2C");

        const otherFields = event.slice(1);
        csvContent += `${type},${encodedName},${otherFields.join(',')}\n`;
    });

    return csvContent;
}

function deserializeSimulation(content, ui) {
    const lines = content.split('\n').map(line => line.trim());

    // Verify file format
    if (!lines[0].includes('Ireland Financial Simulator')) {
        throw new Error('Invalid file format');
    }

    let section = '';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#')) {
            section = line;
            continue;
        }
        if (line === '') continue;

        if (section.includes('Parameters')) {
            const [key, value] = line.split(',');
            try {
                ui.setValue(key, value);
            } catch (e) {
                // Skip if parameter doesn't exist
            }
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
  const bandKeys = Object.keys(rateBands).map(Number);
  for (let i = bandKeys.length - 1; i >= 0; i--) {
    const bandKey = bandKeys[i];
    if (key >= bandKey) {
        return rateBands[bandKey];
    }
  }
  return rateBands[bandKeys[0]];
}

// Node.js compatibility: Export functions needed for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        evaluateFormula
        // Add other functions here if they need testing later
        // adjust, gaussian, rgbToHex, between, isBetween, formatPercentage, formatBoolean, serializeSimulation, deserializeSimulation, getRateForKey
    };
}

/**
 * Evaluates a mathematical formula string within a given context.
 * Uses the Function constructor for basic evaluation. Be cautious with complex/untrusted formulas.
 * @param {string} formula - The formula string to evaluate.
 * @param {object} contextData - An object containing variables accessible to the formula.
 * @returns {number|NaN} The result of the formula or NaN if evaluation fails.
 */
function evaluateFormula(formula, contextData) {
    // console.log(`Utils.evaluateFormula called: ${formula}`, contextData); // Temporarily commented out for testing
    try {
        const safeContext = contextData || {};
        // Using Function constructor. Ensure formula and context are trusted.
        // 'use strict'; // Consider adding 'use strict' for safety
        return new Function('context', `with(context) { try { return ${formula}; } catch(e) { /* console.warn('Formula eval error within Function:', e); */ return NaN; } }`)(safeContext);
    } catch (e) {
        // console.warn(`Formula evaluation setup failed for "${formula}": ${e}`);
        return NaN;
    }
}
