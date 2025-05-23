// src/core/tax/CapitalGainsTaxCalculator.js

/**
 * Calculates Capital Gains Tax (CGT) based on the provided configuration and state.
 */
class CapitalGainsTaxCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) { // Add schemaEvaluator back as argument
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator; // Use the passed evaluator instance
        this.taxConfig = taxmanInstance.taxConfig; // Convenience reference
        this.cgtConfig = taxmanInstance.taxConfig?.capitalGainsTax; // Specific CGT config (safer access)
        this.declaredEntries = []; // Internal state for declared gains/losses this cycle
    }

    /**
     * Resets the internal state for a new calculation cycle.
     */
    reset() {
        this.declaredEntries = [];
        // console.log("CapitalGainsTaxCalculator reset."); // Optional logging
    }

    /**
     * Declares a single capital gain or loss event for the current calculation cycle.
     * @param {object} entry - Object containing details like type, gain, loss, costBasis, proceeds.
     */
    declareGainOrLoss(entry) {
        // Basic validation could be added here
        if (entry && typeof entry.amount === 'number') { // Check for 'amount' instead of 'gain'/'loss'
            // Normalize: ensure 'gain' or 'loss' exists, not both. Store amount directly.
            const amount = entry.amount ?? 0; // Use entry.amount directly
            // Determine holding period label (assuming basic logic for now)
            const holdingPeriodLabel = entry.holdingPeriodLabel || (entry.holdingPeriodYears >= 1 ? 'longTerm' : 'shortTerm'); // Example logic

            this.declaredEntries.push({
                type: entry.type || 'general', // Default type if not specified
                amount: amount, // Positive for gain, negative for loss
                holdingPeriodLabel: holdingPeriodLabel,
                costBasis: entry.costBasis,
                proceeds: entry.proceeds,
                // Add other relevant details from entry if needed
            });
            // console.log("Declared CGT Entry:", this.declaredEntries[this.declaredEntries.length - 1]); // Optional logging
        } else {
            console.warn("Invalid gain/loss entry declared:", entry);
        }
    }

    /**
     * Calculates CGT based on declared entries, configuration, and automatic rules like Unrealized Gains Tax.
     * Reads loss carryforward from taxman.currentState.cgtLossCarryforward.
     * @returns {object} An object containing the CGT calculation results:
     * {
     *   taxDue: number,              // Total CGT (from sales + unrealized gains tax)
     *   taxableGains: number,        // Taxable gains from actual sales (after exemptions/offsets)
     *   totalNetGains: number,       // Net gains from actual sales (before exemptions)
     *   totalGrossGains: number,     // Gross gains from actual sales
     *   totalLossesDeclared: number, // Losses from actual sales
     *   lossCarryforward: number,    // Remaining loss to carry forward
     *   unrealizedGainsTax: {        // Details specific to automatic unrealized gains tax
     *      taxAmount: number,
     *      taxableAmount: number,
     *      details: []              // Array of assets taxed and their details
     *   },
     *   costBasisUpdates: [],        // Array of { assetId: string, newCostBasis: number } for simulator
     *   details: {                   // Details related to actual sales processing
     *     totalNetGainsByType: object,
     *     exemptionUsed: number,
     *     lossesBroughtForward: number,
     *     lossesOffsetCurrentYear: number,
     *     lossOffsetAgainstIncome: number,
     *     lossCarryforwardByType: object
     *   }
     * }
     */
    calculateCapitalGainsTax() { // Renamed to match test expectations
        // Moved log below initialization
        const config = this.cgtConfig;
        const lossCarryforwardBroughtForward = this.taxman.currentState?.cgtLossCarryforward || {}; // Get from state
        // console.log(">>> Calculating Capital Gains Tax... Declared Entries:", JSON.stringify(this.declaredEntries), "Loss Carryforward Brought Forward:", JSON.stringify(lossCarryforwardBroughtForward));

        const result = {
            taxDue: 0,
            taxableGains: 0,
            totalNetGains: 0,
            totalGrossGains: 0,
            totalLossesDeclared: 0,
            lossCarryforward: 0,
            unrealizedGainsTax: { taxAmount: 0, taxableAmount: 0, details: [] }, // Initialize unrealized gains tax section
            costBasisUpdates: [], // Initialize cost basis updates array
            details: {
                totalNetGainsByType: {},
                exemptionUsed: 0,
                lossesBroughtForward: 0,
                lossesOffsetCurrentYear: 0,
                lossOffsetAgainstIncome: 0,
                lossCarryforwardByType: {}
            }
        };

        // Note: Even without declared entries, unrealized gains tax might apply.
        // The check for !config should remain, but the early return needs adjustment
        // if unrealized gains tax calculation should happen regardless of declared entries.
        // For now, assume config is required for *any* CGT calculation.
        if (!config) {
             // Handle carryforward if no config
            result.lossCarryforward = Object.values(lossCarryforwardBroughtForward).reduce((sum, val) => sum + (val || 0), 0);
            result.details.lossCarryforwardByType = { ...lossCarryforwardBroughtForward };
            result.details.lossesBroughtForward = result.lossCarryforward;
            return result;
        }

        // 1. Categorize gains/losses
        // 1. Categorize declared gains/losses by type and holding period
        const gainsByType = {}; // { shares: { shortTerm: 100, longTerm: 200 }, property: { ... } }
        const lossesByType = {}; // { shares: { shortTerm: 50, longTerm: 0 }, property: { ... } }
        result.totalGrossGains = 0;
        result.totalLossesDeclared = 0;

        this.declaredEntries.forEach(entry => {
            const type = entry.type;
            const period = entry.holdingPeriodLabel;
            const amount = entry.amount;

            if (!gainsByType[type]) gainsByType[type] = { shortTerm: 0, longTerm: 0 };
            if (!lossesByType[type]) lossesByType[type] = { shortTerm: 0, longTerm: 0 };

            if (amount > 0) {
                gainsByType[type][period] += amount;
                result.totalGrossGains += amount;
            } else {
                lossesByType[type][period] += -amount; // Store losses as positive numbers
                result.totalLossesDeclared += -amount;
            }
        });
        // console.log(">>> Initial Declared Gains By Type:", JSON.stringify(gainsByType));
        // console.log(">>> Initial Declared Losses By Type:", JSON.stringify(lossesByType));

        // Add carryforward losses to the lossesByType structure
        result.details.lossesBroughtForward = 0;
        const carryforwardConfig = config.lossTreatment?.carryforward || {};
        for (const type in lossCarryforwardBroughtForward) {
            if (!lossesByType[type]) lossesByType[type] = { shortTerm: 0, longTerm: 0 };
            const cfData = lossCarryforwardBroughtForward[type]; // Expects { shortTerm: x, longTerm: y } or just amount
            let stCf = 0;
            let ltCf = 0;
            if (typeof cfData === 'object' && cfData !== null) {
                stCf = cfData.shortTerm || 0;
                ltCf = cfData.longTerm || 0;
            } else if (typeof cfData === 'number') {
                // If only a number is provided, allocate based on carryforward type preference or default to LT
                if (carryforwardConfig.type === 'shortTerm') {
                    stCf = cfData;
                } else { // Default to longTerm if 'combined' or 'longTerm' or undefined
                    ltCf = cfData;
                }
            }
            lossesByType[type].shortTerm += stCf;
            lossesByType[type].longTerm += ltCf;
            result.details.lossesBroughtForward += (stCf + ltCf);
        }
        // console.log(">>> Losses By Type (incl. carryforward):", JSON.stringify(lossesByType));

        // 2. Apply Loss Offsetting Rules
        // 2. Apply Loss Offsetting Rules (within year, based on config)
        const lossConfig = config.lossTreatment || {}; // Get the whole lossTreatment object
        const allowSameType = lossConfig.allowWithinSameAssetType !== false; // Default true
        const allowAcrossTypes = lossConfig.allowAcrossAssetTypes === true; // Default false
        const periodRule = lossConfig.allowAgainstHoldingPeriod || 'any'; // 'sameOnly', 'shortAgainstLong', 'longAgainstShort', 'any'
        let totalLossesOffsetThisYear = 0;

        // Helper function for offsetting
        const applyOffset = (gainType, gainPeriod, lossType, lossPeriod) => {
            if (!gainsByType[gainType] || !lossesByType[lossType]) return 0; // Ensure structures exist
            let gain = gainsByType[gainType][gainPeriod] || 0;
            let loss = lossesByType[lossType][lossPeriod] || 0;
            let offset = Math.min(gain, loss);
            if (offset > 0) {
                gainsByType[gainType][gainPeriod] -= offset;
                lossesByType[lossType][lossPeriod] -= offset;
                totalLossesOffsetThisYear += offset;
                // console.log(`Offset: ${offset.toFixed(0)} from ${lossType}/${lossPeriod} loss against ${gainType}/${gainPeriod} gain`);
            }
            return offset;
        };

        // --- Step 2a: Offset losses against gains of the SAME type ---
        if (allowSameType) {
            for (const type in gainsByType) {
                if (!lossesByType[type]) continue; // No losses of this type

                // Same Period First
                applyOffset(type, 'shortTerm', type, 'shortTerm');
                applyOffset(type, 'longTerm', type, 'longTerm');

                // Cross Period (if allowed)
                if (periodRule === 'shortAgainstLong' || periodRule === 'any') {
                    applyOffset(type, 'longTerm', type, 'shortTerm'); // Offset LT Gain with ST Loss
                }
                if (periodRule === 'longAgainstShort' || periodRule === 'any') {
                    applyOffset(type, 'shortTerm', type, 'longTerm'); // Offset ST Gain with LT Loss
                }
            }
        }
        // console.log(">>> Gains/Losses By Type (after SAME type offset):", JSON.stringify(gainsByType), JSON.stringify(lossesByType));

        // --- Step 2b: Offset remaining losses against gains of OTHER types (if allowed) ---
        if (allowAcrossTypes) {
            const allTypes = Object.keys({ ...gainsByType, ...lossesByType });
            for (const lossType of allTypes) {
                if (!lossesByType[lossType]) continue;
                for (const gainType of allTypes) {
                    if (lossType === gainType || !gainsByType[gainType]) continue; // Skip same type or types with no gains

                    // Apply cross-type offsets, respecting period rules
                    // Offset ST Gain (other type) with ST Loss
                    applyOffset(gainType, 'shortTerm', lossType, 'shortTerm');
                    // Offset LT Gain (other type) with LT Loss
                    applyOffset(gainType, 'longTerm', lossType, 'longTerm');

                    // Cross Period (if allowed)
                    if (periodRule === 'shortAgainstLong' || periodRule === 'any') {
                         applyOffset(gainType, 'longTerm', lossType, 'shortTerm'); // Offset LT Gain (other) with ST Loss
                    }
                    if (periodRule === 'longAgainstShort' || periodRule === 'any') {
                         applyOffset(gainType, 'shortTerm', lossType, 'longTerm'); // Offset ST Gain (other) with LT Loss
                    }
                }
            }
        }
        // console.log(">>> Gains/Losses By Type (after ALL offsets):", JSON.stringify(gainsByType), JSON.stringify(lossesByType));

        result.details.lossesOffsetCurrentYear = totalLossesOffsetThisYear;
        // console.log("Gains By Type (after ALL offset):", JSON.stringify(gainsByType));
        // console.log("Remaining Losses By Type (potential carryforward):", JSON.stringify(lossesByType));

        // 3. Apply Annual Exemption
        // 3. Calculate Total Net Gains & Apply Annual Exemption
        let totalNetGainsBeforeExemption = 0;
        result.details.totalNetGainsByType = {}; // Store net gain per type after offset
        for (const type in gainsByType) {
            const netGainForType = (gainsByType[type]?.shortTerm || 0) + (gainsByType[type]?.longTerm || 0);
            result.details.totalNetGainsByType[type] = netGainForType;
            totalNetGainsBeforeExemption += netGainForType;
        }
        result.totalNetGains = totalNetGainsBeforeExemption; // Store pre-exemption total
        // console.log(`>>> Total Net Gains (Before Exemption): ${totalNetGainsBeforeExemption}`);

        // Calculate exemption amount using the rule
        const exemptionRule = config.annualExemption?.calculationRule || { method: 'fixedAmount', value: 0 };
        const exemptionContext = { ...this.taxman.currentState, ...this.taxman.calculated }; // Base context
        const exemptionAmount = this.evaluator.calculateValue(exemptionRule, exemptionContext);
        result.details.exemptionUsed = Math.min(totalNetGainsBeforeExemption, exemptionAmount);
        // Calculate and finalize taxableGains from sales *before* unrealized gains section
        result.taxableGains = Math.max(0, totalNetGainsBeforeExemption - result.details.exemptionUsed);

        // Exemption is applied to the total taxable gains.
        // Rate calculation below will use the appropriate rate for the gain type.
        // No need for proportional reduction here if using a flat rate or simple structure.
        // If tiered rates applied differently to different gain types/periods, this would need adjustment.
        // console.log(`Applied Exemption: ${result.details.exemptionUsed}. Taxable Gains (from sales): ${result.taxableGains}`);

        // 4. Determine Loss Carryforward & Potential Income Offset
        // 4. Determine Loss Carryforward & Potential Income Offset
        result.lossCarryforward = 0;
        result.details.lossCarryforwardByType = {}; // Use structure like { type: { shortTerm: x, longTerm: y } }

        const carryforwardType = carryforwardConfig.type || 'combined'; // 'shortTerm', 'longTerm', 'combined'

        for (const type in lossesByType) {
            const remainingStLoss = lossesByType[type].shortTerm || 0;
            const remainingLtLoss = lossesByType[type].longTerm || 0;
            let stCarryforward = 0;
            let ltCarryforward = 0;

            if (carryforwardType === 'shortTerm' && remainingStLoss > 0) {
                stCarryforward = remainingStLoss;
            } else if (carryforwardType === 'longTerm' && remainingLtLoss > 0) {
                ltCarryforward = remainingLtLoss;
            } else if (carryforwardType === 'combined') {
                stCarryforward = remainingStLoss;
                ltCarryforward = remainingLtLoss;
            }

            if (stCarryforward > 0 || ltCarryforward > 0) {
                 result.details.lossCarryforwardByType[type] = {
                     shortTerm: stCarryforward,
                     longTerm: ltCarryforward
                 };
                 result.lossCarryforward += (stCarryforward + ltCarryforward);
            }
        }

        // Check for offsetting against income (based on config)
        result.details.lossOffsetAgainstIncome = 0;
        const incomeOffsetConfig = lossConfig.offsetAgainstIncome; // Access offsetAgainstIncome from lossConfig
        if (incomeOffsetConfig?.enabled && result.lossCarryforward > 0) {
            const limitRule = incomeOffsetConfig.limitRule;
            let limitAmount = Infinity;
            if (limitRule) {
                // Use evaluator to calculate the limit based on the rule
                // Pass only rule and context object
                const limitContext = { ...this.taxman.currentState, ...this.taxman.calculated };
                limitAmount = this.evaluator.calculateValue(limitRule, limitContext);
            }
            let offsetAmount = Math.min(result.lossCarryforward, limitAmount);
            result.details.lossOffsetAgainstIncome = offsetAmount;

            if (offsetAmount > 0 && result.lossCarryforward > 0) {
                let remainingOffset = offsetAmount;
                // Reduce ST losses first
                for (const type in result.details.lossCarryforwardByType) {
                    if (remainingOffset <= 0) break;
                    const stLoss = result.details.lossCarryforwardByType[type].shortTerm || 0;
                    const reduction = Math.min(remainingOffset, stLoss);
                    if (reduction > 0) {
                        result.details.lossCarryforwardByType[type].shortTerm -= reduction;
                        remainingOffset -= reduction;
                    }
                }
                // Then reduce LT losses if offset still remains
                if (remainingOffset > 0) {
                    for (const type in result.details.lossCarryforwardByType) {
                         if (remainingOffset <= 0) break;
                         const ltLoss = result.details.lossCarryforwardByType[type].longTerm || 0;
                         const reduction = Math.min(remainingOffset, ltLoss);
                         if (reduction > 0) {
                             result.details.lossCarryforwardByType[type].longTerm -= reduction;
                             remainingOffset -= reduction;
                         }
                    }
                }
            }
            // console.log(`Potential loss offset against income: ${offsetAmount} (Limit: ${limitAmount})`);
            // console.warn("CGT loss offset against income calculated, but application depends on Taxman orchestration.");
        } // End of income offset block

        // --- Recalculate total lossCarryforward AFTER potential income offset ---
        // This ensures the total reflects reductions even if offsetAmount was 0 but losses existed.
        result.lossCarryforward = 0;
        for (const type in result.details.lossCarryforwardByType) {
             result.lossCarryforward += (result.details.lossCarryforwardByType[type].shortTerm || 0) + (result.details.lossCarryforwardByType[type].longTerm || 0);
        }
        // console.log("Final Loss Carryforward By Type:", JSON.stringify(result.details.lossCarryforwardByType));
        // console.log("Total Loss Carryforward:", result.lossCarryforward);

        // 5. Calculate Tax on remaining taxable gains, considering holding periods
        let taxOnSales = 0;
        if (result.taxableGains > 0) {
            // Determine net gains by period after offsets
            let totalNetShortTermGain = 0;
            let totalNetLongTermGain = 0;
            for (const type in gainsByType) {
                totalNetShortTermGain += gainsByType[type].shortTerm || 0;
                totalNetLongTermGain += gainsByType[type].longTerm || 0;
            }

            // Apply exemption - assume ST gains are reduced first
            const exemptionUsed = result.details.exemptionUsed;
            const taxableShortTermGain = Math.max(0, totalNetShortTermGain - exemptionUsed);
            const remainingExemption = Math.max(0, exemptionUsed - totalNetShortTermGain);
            const taxableLongTermGain = Math.max(0, totalNetLongTermGain - remainingExemption);

            // Sanity check (optional)
            // if (Math.abs((taxableShortTermGain + taxableLongTermGain) - result.taxableGains) > 0.01) {
            //     console.warn(`Taxable gain mismatch: ST(${taxableShortTermGain}) + LT(${taxableLongTermGain}) != Total(${result.taxableGains})`);
            // }

            // Calculate tax for each period
            let taxOnShortTerm = 0;
            if (taxableShortTermGain > 0) {
                // Get ST rate (assuming general for now, could be type-specific later)
                const stRateInfo = this._getRateInfoForCGT('shortTerm', 'general');
                if (stRateInfo.type === 'flat') {
                    taxOnShortTerm = taxableShortTermGain * stRateInfo.rate;
                } else if (stRateInfo.type === 'brackets') {
                    // Apply brackets to the taxable ST portion
                    taxOnShortTerm = this.evaluator.calculateBracketTax(stRateInfo.brackets, taxableShortTermGain);
                     console.warn("Applying separate CGT brackets to Short-Term gains.");
                } else {
                     console.warn(`Unhandled rate type '${stRateInfo.type}' for Short-Term CGT.`);
                }
            }

            let taxOnLongTerm = 0;
            if (taxableLongTermGain > 0) {
                 // Get LT rate (assuming general for now)
                const ltRateInfo = this._getRateInfoForCGT('longTerm', 'general');
                 if (ltRateInfo.type === 'flat') {
                    taxOnLongTerm = taxableLongTermGain * ltRateInfo.rate;
                } else if (ltRateInfo.type === 'brackets') {
                    // Apply brackets to the taxable LT portion
                    taxOnLongTerm = this.evaluator.calculateBracketTax(ltRateInfo.brackets, taxableLongTermGain);
                    console.warn("Applying separate CGT brackets to Long-Term gains.");
                } else {
                     console.warn(`Unhandled rate type '${ltRateInfo.type}' for Long-Term CGT.`);
                }
            }

            taxOnSales = taxOnShortTerm + taxOnLongTerm;
            // console.log(`>>> Calculating Tax on Sales: TaxableST=${taxableShortTermGain.toFixed(2)}, TaxST=${taxOnShortTerm.toFixed(2)}, TaxableLT=${taxableLongTermGain.toFixed(2)}, TaxLT=${taxOnLongTerm.toFixed(2)}, TotalTax=${taxOnSales.toFixed(2)}`);
        }
        result.taxDue = taxOnSales; // Initialize tax due with tax from sales
        // 6. Calculate Automatic Unrealized Gains Tax (if applicable)
        result.unrealizedGainsTax = { taxAmount: 0, taxableAmount: 0, details: [] }; // Re-initialize just in case
        // Rules are within ratesByAssetAndHolding
        if (config.ratesByAssetAndHolding && this.taxman.currentState?.assets) {
          const currentYear = this.taxman.currentState.year;
          this.taxman.currentState.assets.forEach(asset => {
            // Find the rule specific to this asset type
            const assetRule = config.ratesByAssetAndHolding.find(r => r.assetType === asset.type);
            const deemedDisposalRule = assetRule?.deemedDisposalRule;

            // Check if a deemed disposal rule applies and is active
            if (deemedDisposalRule && deemedDisposalRule.applies === true) {
              // Calculate holding years based on purchaseYear if available
              const purchaseYear = asset.purchaseYear; // Assuming asset might have purchaseYear
              if (purchaseYear === undefined || purchaseYear === null) {
                  // console.warn(`Asset ${asset.id} (${asset.type}) missing purchaseYear for deemed disposal check.`);
                  return; // Skip if purchase year is missing
              }
              const holdingYears = currentYear - purchaseYear;
              // Calculate period years using the rule
              const periodYearsRule = deemedDisposalRule.periodYearsRule || { method: 'fixedAmount', value: 0 };
              const periodContext = { ...this.taxman.currentState, asset }; // Context for period calculation
              const periodYears = this.evaluator.calculateValue(periodYearsRule, periodContext);
              // Check if the holding period triggers the rule
              // console.log(`--> Checking Period: Asset=${asset.id}, holdingYears=${holdingYears} (type: ${typeof holdingYears}), periodYears=${periodYears} (type: ${typeof periodYears}), Modulo=${holdingYears % periodYears}`); // Debug log with types
              if (periodYears > 0 && holdingYears > 0 && holdingYears % periodYears === 0) {
                  // console.log(` --> Triggered for asset ${asset.id}`); // Debug log
                  const currentValue = asset.value;
                  const costBasis = asset.costBasis;
                  const unrealizedGain = currentValue - costBasis;
                  console.log(`--> Checking Gain: Asset=${asset.id}, unrealizedGain=${unrealizedGain}`); // Debug log
                  if (unrealizedGain > 0) {
                      // Calculate the tax rate using the rule
                      const taxRateRule = deemedDisposalRule.taxRateRule || { method: 'fixedAmount', value: 0 };
                      const rateContext = { ...this.taxman.currentState, asset, unrealizedGain }; // Context for rate calculation
                      const taxRate = this.evaluator.calculateValue(taxRateRule, rateContext);
                      const taxAmount = unrealizedGain * taxRate;

                      result.unrealizedGainsTax.taxableAmount += unrealizedGain;
                      // console.log(` --> Accumulating unrealized taxable: ${unrealizedGain}. New total: ${result.unrealizedGainsTax.taxableAmount}`); // Debug log
                      result.unrealizedGainsTax.taxAmount += taxAmount;
                      result.taxDue += taxAmount; // Add to total tax due

                      // Store details
                      result.unrealizedGainsTax.details.push({
                          assetId: asset.id,
                          assetType: asset.type,
                          holdingYears: holdingYears,
                          unrealizedGain: unrealizedGain,
                          taxRate: taxRate,
                          taxAmount: taxAmount,
                          previousCostBasis: costBasis,
                          newValueForBasis: currentValue
                      });

                      // Signal cost basis update needed
                      result.costBasisUpdates.push({
                          assetId: asset.id,
                          assetType: asset.type, // Include assetType
                          newCostBasis: currentValue
                      });

                      // console.log(`Unrealized Gains Tax triggered for asset ${asset.id} (${asset.type}): Gain=${unrealizedGain.toFixed(2)}, Rate=${taxRate}, Tax=${taxAmount.toFixed(2)}`);
                  }
              }
            }
          });
        }
        // console.log(`>>> Finished CGT Calculation. Tax Due: ${result.taxDue.toFixed(2)}`);
        // console.log(">>> Final CGT Result Object:", JSON.stringify(result, null, 2));
        console.log(`>>> Returning taxableGains: ${result.taxableGains}`);
        return result;
    }

    // --- Helper Methods specific to CGT ---

    /**
     * Determines the applicable tax rate/method for a given holding period and asset type.
     * @param {string} holdingPeriodLabel - 'shortTerm' or 'longTerm'.
     * @param {string} assetType - The type of asset (e.g., 'general', 'realEstate').
     * @returns {object} Object containing rate type ('flat' or 'brackets') and rate value or brackets array.
     */
     _getRateInfoForCGT(holdingPeriodLabel, assetType = 'general') { // Re-written start
        const config = this.cgtConfig;
        if (!config) return { type: 'flat', rate: 0 };
        const taxMethodConfig = config.taxationMethod || {};
        const taxMethod = taxMethodConfig.method || 'flatRate';

        // Check for specific override rates first
        const specificRule = config.ratesByAssetAndHolding?.find(r =>
            r.holdingPeriodLabel === holdingPeriodLabel && r.assetType === assetType);
        const generalRule = config.ratesByAssetAndHolding?.find(r =>
            r.holdingPeriodLabel === holdingPeriodLabel && r.assetType === 'general');
        const ruleToUse = specificRule || generalRule;

        if (ruleToUse?.applicableRateRule) {
            // Calculate the rate using the rule
            const rateContext = { ...this.taxman.currentState, ...this.taxman.calculated, holdingPeriodLabel, assetType };
            const rate = this.evaluator.calculateValue(ruleToUse.applicableRateRule, rateContext);
            return { type: 'flat', rate: rate };
        }

        // Fallback to general taxation method
        switch(taxMethod) {
            case 'flatRate':
                const flatRateRule = taxMethodConfig.flatRateRule || { method: 'fixedAmount', value: 0 };
                const flatRateContext = { ...this.taxman.currentState, ...this.taxman.calculated, holdingPeriodLabel, assetType };
                const flatRate = this.evaluator.calculateValue(flatRateRule, flatRateContext);
                return { type: 'flat', rate: flatRate };
            case 'dualSystemRate':
                 const dualRateRule = taxMethodConfig.dualSystemRateRule || { method: 'fixedAmount', value: 0 };
                 const dualRateContext = { ...this.taxman.currentState, ...this.taxman.calculated, holdingPeriodLabel, assetType };
                 const dualRate = this.evaluator.calculateValue(dualRateRule, dualRateContext);
                 return { type: 'flat', rate: dualRate };
            case 'separateBrackets': return { type: 'brackets', brackets: taxMethodConfig.separateBrackets || [] };
            case 'integratedWithIncome':
                // Attempt to use integratedIncomeThresholds first
                const thresholds = taxMethodConfig.integratedIncomeThresholds;
                if (Array.isArray(thresholds) && thresholds.length > 0) {
                    // Determine the income bracket label based on taxable income
                    const incomeLevel = this.taxman.calculated.taxableIncome; // Or AGI if specified by schema?
                    const incomeBracketLabel = this.evaluator.getIncomeBracketLabel(incomeLevel, 'taxableIncome');

                    if (incomeBracketLabel) {
                        const thresholdRule = thresholds.find(t => t.incomeBracketLabel === incomeBracketLabel);
                        if (thresholdRule && thresholdRule.cgtRate !== undefined) {
                            // console.log(`CGT method 'integratedWithIncome': Found rate ${thresholdRule.cgtRate} for income bracket '${incomeBracketLabel}'`);
                            return { type: 'flat', rate: Number(thresholdRule.cgtRate) };
                        } else {
                             console.warn(`CGT method 'integratedWithIncome': No specific CGT rate found for income bracket '${incomeBracketLabel}'. Falling back.`);
                        }
                    } else {
                         console.warn(`CGT method 'integratedWithIncome': Could not determine income bracket label for income ${incomeLevel}. Falling back.`);
                    }
                }

                // Fallback: Use marginal income tax rate if thresholds are not defined or mapping fails
                const marginalRate = this.evaluator.getMarginalIncomeRate(this.taxman.calculated.taxableIncome);
                console.warn(`CGT method 'integratedWithIncome': Using marginal income tax rate (${marginalRate}) as CGT rate.`);
                return { type: 'flat', rate: marginalRate };
            default: return { type: 'flat', rate: 0 };
        }
    }
}

// Export if needed
// export default CapitalGainsTaxCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
   module.exports = CapitalGainsTaxCalculator;
}