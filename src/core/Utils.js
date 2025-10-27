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

    // Create CSV content (always save with FinSim header for forward compatibility)
    let csvContent = "# FinSim v" + ui.getVersion() + " Save File\n";
    csvContent += "# Parameters\n";
    for (const [key, value] of Object.entries(parameters)) {
        // Convert undefined values to empty strings to avoid "undefined" in CSV
        const csvValue = (value === undefined || value === null) ? '' : value;
        csvContent += `${key},${csvValue}\n`;
    }
   
    csvContent += "\n# Events\n";
    csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra\n";
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
        csvContent += `${type},${encodedName},${otherFields.join(',')}\n`;
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
  const bandKeys = Object.keys(rateBands).map(Number);
  for (let i = bandKeys.length - 1; i >= 0; i--) {
    const bandKey = bandKeys[i];
    if (key >= bandKey) {
        return rateBands[bandKey];
    }
  }
  return rateBands[bandKeys[0]];
}
