/* This file has to work on both the website and Google Sheets */

var uiManager, params, events, config, dataSheet, row, errors;
var age, year, phase, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride, taxman;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit, cgtLossCarryforward;
var incomeStatePension, incomePrivatePension, incomeFundsRent, incomeSharesRent, withdrawalRate;
var cash, indexFunds, shares, pension;

const Phases = {
  growth: 'growth',
  retired: 'retired'
}


function run() {
  if (!initializeSimulator()) return;
  montecarlo = (params.growthDevPension > 0 || params.growthDevFunds > 0 || params.growthDevShares > 0);
  let runs = (montecarlo ? config.simulationRuns : 1);
  let successes = 0;
  uiManager.updateProgress("Running");
  for (let run = 0; run < runs; run++) {
    successes += runSimulation(); 
  }
  uiManager.updateDataSheet(runs);
  uiManager.updateStatusCell(successes, runs);
}

// Stubs for Taxman simContext removed (evaluateFormula moved to Utils.js, executeCustomRule handled internally by Taxman)

function initializeUI() {
  if (typeof SpreadsheetApp !== 'undefined') {
    uiManager = new UIManager(GasUI.getInstance());
  } else {
    uiManager = new UIManager(WebUI.getInstance());
  }
}

function readScenario(validate) {
  errors = false;
  uiManager.clearWarnings();
  params = uiManager.readParameters(validate); // 6918 ms
  events = uiManager.readEvents(validate); // 534 ms
  if (errors) {
    uiManager.setStatus("Check errors", STATUS_COLORS.WARNING);
  }
  return !errors;
}

function initializeSimulator() {
  initializeUI();
  uiManager.setStatus("Initializing", STATUS_COLORS.INFO);
  // Config.getInstance now loads both main and taxman configs
  config = Config.getInstance(uiManager.ui);
  revenue = new Revenue(); // Keep existing
  taxman = null; // Initialize taxman to null

  try {
      // Step 1.3: Use Taxman config loaded by Config class
      if (!config.taxmanConfig) {
          // Config class should have already shown an alert if loading failed
          throw new Error("Taxman configuration is missing or was not loaded successfully by Config class.");
      }

      // Taxman now gets evaluateFormula from Utils.js and handles executeCustomRule internally.
      // Pass an empty context object for now, in case other context needs arise later.
      const simContext = {};

      // Taxman constructor performs its own schemaName check. Config class does basic validation.
      taxman = new Taxman(config.taxmanConfig, simContext);

  } catch (e) {
      // Catch errors during Taxman instantiation specifically
      console.error("Failed to instantiate Taxman:", e);
      uiManager.setStatus("Taxman Init Error", STATUS_COLORS.ERROR);
      taxman = null; // Ensure taxman is null if init fails
  }
  dataSheet = [];
  return readScenario(validate = true);
}

function saveToFile() {
  uiManager.setStatus("Preparing to save", STATUS_COLORS.INFO);
  if (readScenario(validate = false)) {
    uiManager.saveToFile();
  }
  uiManager.setStatus("", STATUS_COLORS.INFO);
}

function loadFromFile(file) {
  uiManager.loadFromFile(file);
}

function initializeSimulationVariables() {
  // revenue.reset();
  pension = new Pension(params.growthRatePension, params.growthDevPension);
  indexFunds = new IndexFunds(params.growthRateFunds, params.growthDevFunds);
  shares = new Shares(params.growthRateShares, params.growthDevShares);
  if (params.initialPension > 0) pension.buy(params.initialPension);
  if (params.initialFunds > 0) indexFunds.buy(params.initialFunds);
  if (params.initialShares > 0) shares.buy(params.initialShares);

  periods = 0;
  success = true;
  stockGrowthOverride = undefined;

  initializeRealEstate();

  age = params.startingAge - 1;
  year = new Date().getFullYear() - 1;
  phase = Phases.growth;
  cash = params.initialSavings;
  failedAt = 0;
  row = 0;
  cgtLossCarryforward = 0; // Initialize CGT loss carryforward
}

function resetYearlyVariables() {
  // Reset yearly variables here
  incomeSalaries = 0;
  incomeShares = 0;
  incomeRentals = 0;
  incomePrivatePension = 0;
  incomeStatePension = 0;
  incomeDefinedBenefit = 0;
  incomeFundsRent = 0;
  incomeSharesRent = 0;
  incomeTaxFree = 0;
  pensionContribution = 0;
  withdrawalRate = 0;
  cashDeficit = 0;
  cashWithdraw = 0;
  savings = 0;

  revenue.reset();
  taxman.reset();
  indexFunds.addYear();
  shares.addYear();
  pension.addYear();
  realEstate.addYear();
}

function runSimulation() {
  initializeSimulationVariables();

  while (age < params.targetAge) {

    row++;
    year++;
    age++;
    periods = row - 1;

    // console.log("  ======== Age: "+age+" ========");

    resetYearlyVariables();
    calculatePensionIncome();
    processEvents();

    // Step 2.5: Assemble currentState for Taxman (Complete population)

    // --- Calculate Asset Details ---
    const calculateEquityCostBasis = (equityInstance) => equityInstance.portfolio.reduce((sum, holding) => sum + holding.amount, 0);
    const indexFundsValue = indexFunds.capital();
    const indexFundsCostBasis = calculateEquityCostBasis(indexFunds);
    const sharesValue = shares.capital();
    const sharesCostBasis = calculateEquityCostBasis(shares);
    const pensionValue = pension.capital();
    const pensionCostBasis = calculateEquityCostBasis(pension);

    let realEstateValue = 0;
    let realEstateCostBasis = 0;
    let totalMortgageLiability = 0;
    const realEstateAssets = [];
    for (const id in realEstate.properties) {
        const prop = realEstate.properties[id];
        const propValue = prop.getValue();
        realEstateValue += propValue;
        realEstateCostBasis += prop.paid; // Using downpayment as cost basis for now
        totalMortgageLiability += prop.borrowed * (1 - prop.fractionRepaid); // Estimate outstanding balance
        realEstateAssets.push({
             id: id, // Keep track of individual properties if needed later
             type: 'realEstateProperty',
             value: propValue,
             costBasis: prop.paid + prop.borrowed, // Corrected: Downpayment + Mortgage
             details: {
                 initialBorrowed: prop.borrowed,
                 fractionRepaid: prop.fractionRepaid,
                 appreciationRate: prop.appreciation,
                 periodsHeld: prop.periods
             }
        });
    }

    const assets = [
        { type: 'cash', value: cash, costBasis: cash, details: {} }, // Cost basis of cash is its value
        { type: 'indexFund', value: indexFundsValue, costBasis: indexFundsCostBasis, details: {} },
        { type: 'shares', value: sharesValue, costBasis: sharesCostBasis, details: {} },
        { type: 'pension', value: pensionValue, costBasis: pensionCostBasis, details: {} },
        ...realEstateAssets // Add individual properties
    ];

    const totalAssetsValue = assets.reduce((sum, asset) => sum + asset.value, 0);
    const liabilities = {
        mortgageTotal: totalMortgageLiability
        // Add other liabilities here if tracked (e.g., loans)
    };
    const totalLiabilities = Object.values(liabilities).reduce((sum, liab) => sum + liab, 0);
    const netWorth = totalAssetsValue - totalLiabilities;

    const currentState = {
        year: year,
        age: age,
        filingStatus: 'single', // Placeholder - Needs mapping
        dependents: 0,          // Placeholder - Needs mapping
        expenses: { total: expenses }, // Keep simple for now
        assets: assets,
        netWorth: netWorth,
        liabilities: liabilities,
        cgtLossCarryforward: cgtLossCarryforward, // Use the stored value from the previous year
        pensionPlanType: null,  // Placeholder - Needs mapping
        residencyStatus: 'resident' // Placeholder - Needs mapping
    };
    // Verification log for Step 2.5
    // console.log(`Year ${year}, Age ${age} - Current State for Taxman (Full):`, JSON.stringify(currentState, null, 2)); // Pretty print

    // Step 2.3: Initial Taxman.computeTaxes Call (Parallel)
    let taxmanResult = null;
    if (taxman) {
        try {
            taxmanResult = taxman.computeTaxes(currentState);
            // Log the full result for detailed inspection during parallel run
            // console.log(`Taxman Result (Year ${year}, Age ${age}):`, JSON.stringify(taxmanResult, null, 2)); // Commented out for focused CGT comparison
        } catch (e) {
            console.error(`Taxman.computeTaxes failed (Year ${year}, Age ${age}):`, e);
            // Optionally set status or handle error further if needed
        }
        // Step 3.4: Store the new loss carryforward for the next year
        cgtLossCarryforward = taxmanResult?.newLossCarryforward ?? 0;

        // Step 4.2: Handle Cost Basis Updates signaled by Taxman (e.g., after unrealized gains tax)
        if (taxmanResult?.costBasisUpdates?.length > 0) {
            taxmanResult.costBasisUpdates.forEach(update => {
                console.log(`%cSimulator: Received cost basis update signal from Taxman:`, 'color: blue;', update);
                switch (update.assetType) {
                    // Assuming 'index_fund' is the type used in Taxman/Schema for IndexFunds
                    case 'index_fund':
                        if (indexFunds && typeof indexFunds.applyUnrealizedGainsTax === 'function') {
                            // Call the new method to apply the basis update logic internally
                            indexFunds.applyUnrealizedGainsTax(update.assetType, update.newCostBasis, update.details);
                        } else {
                            console.error(`Cannot apply cost basis update: IndexFunds instance or applyUnrealizedGainsTax method not found.`);
                        }
                        break;
                    // case 'shares': // Add cases for other asset types if they can trigger unrealized gains tax
                    //     if (shares && typeof shares.applyUnrealizedGainsTax === 'function') {
                    //         shares.applyUnrealizedGainsTax(update.assetType, update.newCostBasis, update.details);
                    //     } else {
                    //          console.error(`Cannot apply cost basis update: Shares instance or applyUnrealizedGainsTax method not found.`);
                    //     }
                    //     break;
                    default:
                        console.warn(`Received cost basis update for unhandled asset type: '${update.assetType}'`);
                }
            });
        }
    }
    // Note: Core logic in handleInvestments still uses Revenue for now.

    handleInvestments();

    // <<< Add specific CGT comparison log >>>
    if (taxmanResult && revenue) { // Only log if both modules ran
        const revenueCGT = revenue.cgt || 0; // Get legacy CGT, default to 0 if undefined/null
        const taxmanCGT = taxmanResult.capitalGainsTax?.totalLiability ?? 0; // Get taxman CGT liability, default to 0
        // Only log if there's a potential value to compare
        if (revenueCGT !== 0 || taxmanCGT !== 0) {
             console.log(`%cCGT Comparison (Year ${year}, Age ${age}): Revenue=${revenueCGT.toFixed(2)}, Taxman=${taxmanCGT.toFixed(2)}`, 'color: orange; font-weight: bold;');
        }
    }
    // <<< End comparison log >>>

    // <<< Add detailed comparison log >>>
    if (taxmanResult && revenue) {
        // Calculate Taxman Net Income (Gross Income - Total Tax)
        // Define Gross Income consistently for comparison (sum of declared incomes)
        const grossIncomeDeclared = (incomeSalaries || 0) + (incomeShares || 0) + (incomeRentals || 0) + (incomePrivatePension || 0) + (incomeStatePension || 0) + (incomeDefinedBenefit || 0) + (incomeFundsRent || 0) + (incomeSharesRent || 0);
        const taxmanTotalTax = taxmanResult.totalTaxLiability || 0;
        const taxmanNetIncome = grossIncomeDeclared - taxmanTotalTax + (incomeTaxFree || 0); // Add tax-free income back

        // Extract individual tax components (adjust paths based on actual taxmanResult structure)
        const taxmanIT = taxmanResult.incomeTax?.totalLiability ?? 0;
        const taxmanPRSI = taxmanResult.socialContributions?.contributions?.find(c => c.name === 'PRSI')?.amount ?? 0;
        const taxmanUSC = taxmanResult.socialContributions?.contributions?.find(c => c.name === 'USC')?.amount ?? 0;
        const taxmanCGT = taxmanResult.capitalGainsTax?.totalLiability ?? 0; // Define taxmanCGT here

        const revenueTotalTax = (revenue.it || 0) + (revenue.prsi || 0) + (revenue.usc || 0) + (revenue.cgt || 0);
        const revenueNetIncome = revenue.netIncome() + (incomeTaxFree || 0); // Use existing method + tax-free

        console.log(`%c--- Tax Comparison (Year ${year}, Age ${age}) ---`, 'color: blue; font-weight: bold;');
        console.log(`  Gross Income (Declared): ${grossIncomeDeclared.toFixed(2)}`);
        console.log(`  IT:      Revenue=${(revenue.it || 0).toFixed(2)}, Taxman=${taxmanIT.toFixed(2)}`);
        console.log(`  PRSI:    Revenue=${(revenue.prsi || 0).toFixed(2)}, Taxman=${taxmanPRSI.toFixed(2)}`);
        console.log(`  USC:     Revenue=${(revenue.usc || 0).toFixed(2)}, Taxman=${taxmanUSC.toFixed(2)}`);
        console.log(`  CGT:     Revenue=${(revenue.cgt || 0).toFixed(2)}, Taxman=${taxmanCGT.toFixed(2)}`);
        console.log(`  TOTAL TAX: Revenue=${revenueTotalTax.toFixed(2)}, Taxman=${taxmanTotalTax.toFixed(2)}`);
        console.log(`  NET INCOME: Revenue=${revenueNetIncome.toFixed(2)}, Taxman=${taxmanNetIncome.toFixed(2)}`);
        console.log(`%c------------------------------------`, 'color: blue; font-weight: bold;');
    }
    // <<< End detailed comparison log >>>

    updateYearlyData();
  }
  return success;
}

function calculatePensionIncome() {
  // Private Pension
  if (age === params.retirementAge) {
    cash += pension.getLumpsum();
    phase = Phases.retired;
  }
  if (phase === Phases.retired) {
    incomePrivatePension += pension.drawdown();
  }
  // State Pension
  if (age >= config.statePensionQualifyingAge) {
    incomeStatePension = 52 * adjust(params.statePensionWeekly);
    if (age >= config.statePensionIncreaseAge) {
      incomeStatePension += 52 * adjust(config.statePensionIncreaseAmount);
    }
  }
  revenue.declareStatePensionIncome(incomeStatePension);
  taxman.declareIncome('state_pension', incomeStatePension); // Pass args separately
}

function processEvents() {
  expenses = 0;
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    let amount = adjust(event.amount, event.rate);
    // Default toAge to 999 if not required for this event type
    let inScope = (age >= event.fromAge && age <= (event.toAge || 999));

    switch (event.type) {

      case "NOP": // No Operation
        break;

      case 'RI': // Rental income
        if (inScope) {
          incomeRentals += amount;
          revenue.declareOtherIncome(amount);
          taxman.declareIncome('rental', amount); // Pass args separately
        }
        break;

      case 'SI': // Salary income (with private pension contribution if so defined)
        if (inScope) {
          incomeSalaries += amount;
          let contribRate = params.pensionPercentage * getRateForKey(age, config.pensionContributionRateBands);
          if (params.pensionCapped && (amount > adjust(config.pensionContribEarningLimit))) {
            contribRate = contribRate * adjust(config.pensionContribEarningLimit) / amount;
          }
          let companyMatch = Math.min(event.match || 0, contribRate);
          let personalContrib = contribRate * amount;
          let companyContrib = companyMatch * amount;
          let totalContrib = personalContrib + companyContrib;
          pensionContribution += totalContrib;
          pension.buy(totalContrib);
          revenue.declareSalaryIncome(amount, contribRate);
          taxman.declareIncome('employment', amount, { pensionContribRate: contribRate }); // Pass args separately
        }
        break;

      case 'SInp': // Salary income (with no private pension contribution even if pension contribution is > 0)
        if (inScope) {
          incomeSalaries += amount;
          revenue.declareSalaryIncome(amount, 0);
          taxman.declareIncome('employment', amount, { pensionContribRate: 0 }); // Pass args separately
        }
        break;

      case 'UI': // RSU income
        if (inScope) {
          incomeShares += amount;
          revenue.declareNonEuSharesIncome(amount);
          // RSU income often treated as employment income for social charges. Re-categorize for Taxman.
          taxman.declareIncome('employment', amount, { source: 'RSU', pensionContribRate: 0 }); // Pass args separately
        }
        break;

      case 'DBI': // Defined Benefit Pension Income
        if (inScope) {
          incomeDefinedBenefit += amount;
          revenue.declareSalaryIncome(amount, 0);
          taxman.declareIncome('employment', amount, { source: 'DefinedBenefitPension', pensionContribRate: 0 }); // Pass args separately
        }
        break;

      case 'FI': // Tax-free income
        if (inScope) {
          incomeTaxFree += amount;
        }
        break;

      case 'E': // Expenses
        if (inScope) {
          expenses += amount;
        }
        break;

      case 'M': // Mortgage
        if (age == event.fromAge) {
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount);
          //            console.log("Borrowed "+Math.round(realEstate.properties[event.id].borrowed)+" on a "+(event.toAge - event.fromAge)+"-year "+(event.rate*100)+"% mortgage for property ["+event.id+"] paying "+Math.round(amount)+"/year");
        }
        if (inScope) {
          expenses += realEstate.getPayment(event.id); // not adjusted once mortgage starts, assuming fixed rate
          //            console.log("Mortgage payment "+realEstate.getPayment(event.id)+" for property ["+event.id+"] ("+(realEstate.properties[event.id].paymentsMade)+" of "+realEstate.properties[event.id].terms+")");
        }
        break;

      case 'R': // Real estate
        // purchase
        if (age === event.fromAge) {
          realEstate.buy(event.id, amount, event.rate);
          expenses += amount;
          //            console.log("Buy property ["+event.id+"] with "+Math.round(amount)+"  downpayment (valued "+Math.round(realEstate.getValue(event.id))+")");            
        }
        // sale - only if toAge is specified
        if (event.toAge && age === event.toAge) {
          //            console.log("Sell property ["+event.id+"] for "+Math.round(realEstate.getValue(event.id)));            
          cash += realEstate.sell(event.id);
        }
        break;

      case 'SM': // Stock Market Growth override to simulate bull or bear markets
        if (age == event.fromAge) {
          stockGrowthOverride = Math.pow(1 + event.rate, 1 / (event.toAge - event.fromAge + 1)) - 1;
        }
        if (age === event.toAge + 1) {
          stockGrowthOverride = undefined;
        }
        break;

      default:
        break;

      // Step 4.2: Handle Transfer Tax Events
      case 'Gift':
      case 'Inheritance':
        if (inScope && taxman) {
            // Assuming 'event.details' contains necessary info like relationship, assetType, etc.
            // The schema defines what 'details' are needed for TransferTaxCalculator.
            const transferDetails = {
                value: amount,
                assetType: event.assetType || 'cash', // Default to cash if not specified
                relationshipToDonor: event.relationship || 'other', // Default if not specified
                // Add other relevant details from the event object based on schema needs
            };
            taxman.declareTransfer(event.type.toLowerCase(), transferDetails); // 'gift' or 'inheritance'
            console.log(`Taxman declared transfer: type=${event.type}, details=`, transferDetails);
        }
        break;

      // Step 4.2: Handle Pension Withdrawal Event
      case 'PensionWithdrawal':
         if (inScope && taxman) {
             // Assuming 'event.details' contains necessary info like withdrawalType ('normal', 'early', 'lumpSum')
             const withdrawalDetails = {
                 amount: amount,
                 withdrawalType: event.withdrawalType || 'normal', // Default if not specified
                 planType: event.planType || 'genericPension' // Default or map from event
                 // Add other relevant details from the event object based on schema needs
             };
             taxman.declarePensionWithdrawal(withdrawalDetails);
             console.log(`Taxman declared pension withdrawal: details=`, withdrawalDetails);
             // Note: The actual income declaration might still happen in calculatePensionIncome or here,
             // depending on whether the withdrawal itself constitutes taxable income immediately
             // vs. just triggering a specific tax calculation via the calculator.
             // For now, assume the calculator handles the tax implications based on the declaration.
         }
         break;

    }
  }
}


function handleInvestments() {
  netIncome = revenue.netIncome() + incomeTaxFree;

  if (netIncome > expenses) {
    savings = netIncome - expenses;
    cash += savings;
  }
  targetCash = adjust(params.emergencyStash);
  
  if (cash < targetCash) {
    cashDeficit = targetCash - cash;
  }

  let capitalPreWithdrawal = indexFunds.capital() + shares.capital();
    
  // If deficit, drawdown from where needed
  if (expenses > netIncome) {
    switch (phase) {
      case Phases.growth:
        console.log("Withdrawing from cash (), funds, and shares");
        withdraw(params.priorityCash, 0, params.priorityFunds, params.priorityShares);  // taken from user configuration, but without ability to withdraw from pension
        break;
      case Phases.retired:
        withdraw(params.priorityCash, params.priorityPension, params.priorityFunds, params.priorityShares);  // taken from user configuration
        break;
    }
  }

  if (capitalPreWithdrawal > 0) {
    withdrawalRate = (incomeFundsRent + incomeSharesRent) / capitalPreWithdrawal;
  } else {
    withdrawalRate = 0;
  }

  // If extra cash, invest
  let invested = 0;
  if (cash > targetCash + 0.001) {
    let surplus = cash - targetCash;
    indexFunds.buy(surplus * params.FundsAllocation);
    shares.buy(surplus * params.SharesAllocation);
    invested = surplus * (params.FundsAllocation + params.SharesAllocation);
    cash -= invested;
  }
  // Any remaining income should be used to top-up the emergency stash
  if ((netIncome > expenses + invested) && (targetCash - cash > 0.001)) {
    let addToStash = netIncome - (expenses + invested);
    cash += addToStash;
    expenses += addToStash;
  }

  if ((netIncome < expenses - 100) && success) {
    success = false;
    failedAt = age;
  }
}


// Get more money from: cash, pension, Index Funds, Shares, 
// in the specified order of priority:
// - fromX = 0 (don't use X)
// - fromX = 1 (use X first)
// - fromX = 2 (use X if first option not enough)
// - fromX = 3 (use X if first and second options not enough)
//
function withdraw(cashPriority, pensionPriority, FundsPriority, SharesPriority) {
  cashWithdraw = 0;
  let totalWithdraw = 0;
  let startNetIncome = revenue.netIncome();

  for (let priority = 1; priority <= 4; priority++) {
    while (expenses + cashDeficit - netIncome > 0.75) {
      let keepTrying = false;
      let needed = expenses + cashDeficit - netIncome;
      let indexFundsCapital = indexFunds.capital();
      let sharesCapital = shares.capital();
      let pensionCapital = pension.capital();
      //      if (option === 1) console.log("Need "+Math.round(needed)+" (netIncome="+Math.round(netIncome)+" < Expenses="+Math.round(expenses)+"). Funds: cash="+Math.round(cash)+" (deficit="+Math.round(cashDeficit)+") Funds="+Math.round(FundsCapital)+" Shares="+Math.round(SharesCapital)+" pension="+Math.round(pensionCapital));
      switch (priority) {
        case cashPriority:
          if (cash > 0) {
            cashWithdraw = Math.min(cash, needed);
            totalWithdraw += cashWithdraw;
            cash -= cashWithdraw;
            //            console.log("... Withdrawing "+Math.round(cashWithdraw)+" from cash savings");
          };
          break;
        case pensionPriority:
          if (pensionCapital > 0) {
            let withdraw = Math.min(pensionCapital, needed);
            totalWithdraw += withdraw;
            incomePrivatePension += pension.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from pension");
            keepTrying = true;
          }
          break;
        case FundsPriority:
          if (indexFundsCapital > 0) {
            let withdraw = Math.min(indexFundsCapital, needed);
            totalWithdraw += withdraw;
            incomeFundsRent += indexFunds.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from index funds");
            keepTrying = true;
          }
          break;
        case SharesPriority:
          if (sharesCapital > 0) {
            let withdraw = Math.min(sharesCapital, needed);
            totalWithdraw += withdraw;
            incomeSharesRent += shares.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from Shares");
            keepTrying = true;
          }
          break;
        default:
      }
      netIncome = cashWithdraw + revenue.netIncome();
      // console.log("netIncome: "+netIncome+"  delta: "+(netIncome-startNetIncome)+"  Withdraw: "+totalWithdraw);
      if (keepTrying == false) {
        break;
      }
    }
  }
}


function initializeRealEstate() {
  realEstate = new RealEstate();
  // buy properties that were bought before the startingAge
  let props = new Map();
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    switch (event.type) {
      case 'R':
        if (event.fromAge < params.startingAge) {
          props.set(event.id,
            {
              "fromAge": event.fromAge,
              "property": realEstate.buy(event.id, event.amount, event.rate)
            });
        }
        break;
      case 'M':
        if (event.fromAge < params.startingAge) {
          props.set(event.id,
            {
              "fromAge": event.fromAge,
              "property": realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount)
            });
        }
        break;
      default:
        break;
    }
  }
  // let years go by, repaying mortgage, until the starting age
  for (let [id, data] of props) {
    for (let y = data.fromAge; y < params.startingAge; y++) {
      data.property.addYear();
    }
  }
}


function updateYearlyData() {
  // This is used below to hide the deemed disposal tax payments, otherwise they're shown as income.
  let FundsTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.cgt * incomeFundsRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;
  let SharesTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.cgt * incomeSharesRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;

  if (!(row in dataSheet)) {
    dataSheet[row] = { "age": 0, "year": 0, "incomeSalaries": 0, "incomeRSUs": 0, "incomeRentals": 0, "incomePrivatePension": 0, "incomeStatePension": 0, "incomeFundsRent": 0, "incomeSharesRent": 0, "incomeCash": 0, "realEstateCapital": 0, "netIncome": 0, "expenses": 0, "savings": 0, "pensionFund": 0, "cash": 0, "indexFundsCapital": 0, "sharesCapital": 0, "pensionContribution": 0, "withdrawalRate": 0, "it": 0, "prsi": 0, "usc": 0, "cgt": 0, "worth": 0 };
  }
  dataSheet[row].age += age;
  dataSheet[row].year += year;
  dataSheet[row].incomeSalaries += incomeSalaries;
  dataSheet[row].incomeRSUs += incomeShares;
  dataSheet[row].incomeRentals += incomeRentals;
  dataSheet[row].incomePrivatePension += incomePrivatePension + incomeDefinedBenefit;
  dataSheet[row].incomeStatePension += incomeStatePension;
  dataSheet[row].incomeFundsRent += Math.max(incomeFundsRent - FundsTax, 0);
  dataSheet[row].incomeSharesRent += Math.max(incomeSharesRent - SharesTax, 0);
  dataSheet[row].incomeCash += Math.max(cashWithdraw, 0) + incomeTaxFree;
  dataSheet[row].realEstateCapital += realEstate.getTotalValue();
  dataSheet[row].netIncome += netIncome;
  dataSheet[row].expenses += expenses;
  dataSheet[row].savings += savings;
  dataSheet[row].pensionFund += pension.capital();
  dataSheet[row].cash += cash;
  dataSheet[row].indexFundsCapital += indexFunds.capital();
  dataSheet[row].sharesCapital += shares.capital();
  dataSheet[row].pensionContribution += pensionContribution;
  dataSheet[row].withdrawalRate += withdrawalRate;
  dataSheet[row].it += revenue.it;
  dataSheet[row].prsi += revenue.prsi;
  dataSheet[row].usc += revenue.usc;
  dataSheet[row].cgt += revenue.cgt;
  dataSheet[row].worth += realEstate.getTotalValue() + pension.capital() + indexFunds.capital() + shares.capital() + cash;

  if (!montecarlo) {
    uiManager.updateDataRow(row, (age-params.startingAge) / (100-params.startingAge));
  }
}

