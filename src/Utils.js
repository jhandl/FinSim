/* This file has to work on both the website and Google Sheets */

STATUS_COLORS = {
  ERROR: "#ff8080",
  WARNING: "#ffe066",
  SUCCESS: "#9fdf9f",
  INFO: "#E0E0E0",
  WHITE: "#FFFFFF"
};

// This function assumes fixed rate. If the rate varies each year, the adjustment needs to take into account
// the history of variation, or it needs to take the previous value (not the start value) and apply the latest 
// rate once. Either case would require a rewrite of several parts of the simulator. 
// Since it's used mainly to adjust for inflation, inflation has to remain fixed for now.
function adjust(value, rate = null, n = periods) {
  if ((rate === null) || (rate === undefined) || (rate === "")) {
    rate = params.inflation;
  }
  return value * (1 + rate) ** n;
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
        InitialETFs: ui.getValue('InitialETFs'),
        InitialTrusts: ui.getValue('InitialTrusts'),
        RetirementAge: ui.getValue('RetirementAge'),
        EmergencyStash: ui.getValue('EmergencyStash'),
        EtfAllocation: ui.getValue('EtfAllocation'),
        TrustAllocation: ui.getValue('TrustAllocation'),
        PensionContributionPercentage: ui.getValue('PensionContributionPercentage'),
        PensionContributionCapped: ui.getValue('PensionContributionCapped'),
        PensionGrowthRate: ui.getValue('PensionGrowthRate'),
        PensionGrowthStdDev: ui.getValue('PensionGrowthStdDev'),
        EtfGrowthRate: ui.getValue('EtfGrowthRate'),
        EtfGrowthStdDev: ui.getValue('EtfGrowthStdDev'),
        TrustGrowthRate: ui.getValue('TrustGrowthRate'),
        TrustGrowthStdDev: ui.getValue('TrustGrowthStdDev'),
        Inflation: ui.getValue('Inflation'),
        MarriageYear: ui.getValue('MarriageYear'),
        YoungestChildBorn: ui.getValue('YoungestChildBorn'),
        OldestChildBorn: ui.getValue('OldestChildBorn'),
        PersonalTaxCredit: ui.getValue('PersonalTaxCredit'),
        StatePensionWeekly: ui.getValue('StatePensionWeekly'),
        PriorityCash: ui.getValue('PriorityCash'),
        PriorityPension: ui.getValue('PriorityPension'),
        PriorityETF: ui.getValue('PriorityETF'),
        PriorityTrust: ui.getValue('PriorityTrust')
    };

    // Format special values (percentages and booleans)
    for (const [key, value] of Object.entries(parameters)) {
        if (ui.isPercentage(key)) {
            // Round to 4 decimal places before converting to percentage string
            const roundedValue = Math.round(value * 10000) / 100;
            parameters[key] = roundedValue + '%';
        } else if (ui.isBoolean(key)) {
            parameters[key] = value ? 'Yes' : 'No';
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
        const otherFields = event.slice(1);
        csvContent += `${type},${name},${otherFields.join(',')}\n`;
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

    // Clear existing events
    ui.clearContent('Events');

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
            eventData.push(line.split(','));
        }
    }

    return eventData;
}