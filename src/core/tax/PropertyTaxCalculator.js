// src/core/tax/PropertyTaxCalculator.js

/**
 * Calculates Property Tax based on the provided configuration and state.
 */
class PropertyTaxCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.taxConfig = taxmanInstance.taxConfig; // Convenience reference
        this.propConfig = taxmanInstance.taxConfig.propertyTax || []; // Specific config
    }

    /**
     * Calculates property taxes for the period.
     * Updates taxman.calculated.propertyTax.
     */
    calculatePropertyTax() {
        // console.log("Computing Property Tax..."); // Commented out
        const rules = this.propConfig;
        this.taxman.calculated.propertyTax = {}; // Reset property tax object
        const ownedProperties = this.taxman.assets; // Assumes assets structure includes properties

        if (rules.length === 0 || !ownedProperties || Object.keys(ownedProperties).length === 0) {
             console.log("No property tax rules or owned properties found.");
             return;
        }

        // Iterate through each asset to find properties
        for (const propName in ownedProperties) {
            const property = ownedProperties[propName];
            // Basic check if it's likely real estate - needs refinement based on actual asset types
            const isRealEstate = typeof property === 'object' && property !== null && property.value !== undefined &&
                                 ['realEstate', 'residential', 'commercial', 'land', 'primaryResidence'].includes(property.type);

            if (!isRealEstate) continue; // Skip non-property assets

            console.log(`Calculating taxes for property: ${propName} (Type: ${property.type}, Value: ${property.value})`);

            // Apply all relevant rules to this property
            for (const rule of rules) {
                // Check if rule applies based on property type
                if (rule.appliesToPropertyType && !rule.appliesToPropertyType.includes('all') && !rule.appliesToPropertyType.includes(property.type)) {
                    continue; // Rule doesn't apply to this property type
                }
                // Add location check: Skip rule if property location doesn't match rule's scope (if specified)
                const propertyLocation = property.location; // e.g., 'CountyA', 'StateB', 'CityC'
                const ruleLocationScope = rule.locationScope; // e.g., 'CountyA', 'StateB'
                if (ruleLocationScope && propertyLocation && propertyLocation !== ruleLocationScope) {
                     // console.log(`Skipping rule '${rule.description || rule.level}': Property location '${propertyLocation}' does not match rule scope '${ruleLocationScope}'.`);
                     continue; // Rule doesn't apply to this property's location
                }

                console.log(`Applying rule: ${rule.description || rule.level}`);
                let taxForThisRule = 0;
                // Context specific to this property and rule evaluation
                const ruleContext = {
                    propertyType: property.type,
                    propertyValue: property.value,
                    assessedValue: property.assessedValue, // Simulator needs to provide these if used by rules
                    cadastralValue: property.cadastralValue
                };

                // Determine Tax Basis
                let basisValue = 0;
                const basisConfig = rule.taxBasis || {};
                switch(basisConfig.type) {
                    case 'assessedValue': basisValue = Number(ruleContext.assessedValue ?? ruleContext.propertyValue) || 0; break;
                    case 'marketValue': basisValue = Number(ruleContext.propertyValue) || 0; break;
                    case 'cadastralValue': basisValue = Number(ruleContext.cadastralValue ?? ruleContext.propertyValue) || 0; break;
                    case 'fixedAmountPerProperty': basisValue = 1; break; // Basis is 1, rate is the fixed amount
                    default: console.warn(`Unknown property tax basis type: ${basisConfig.type}`); continue; // Skip rule if basis unknown
                }
                // Apply assessment ratio if present (using CalculationRule)
                if (basisConfig.assessmentRatioRule) {
                    const ratioContext = { ...ruleContext, propertyValue: basisValue }; // Context for ratio calc
                    // console.log(`[DEBUG CALC] Calling evaluator.calculateValue for assessmentRatioRule:`, basisConfig.assessmentRatioRule); // REMOVE DEBUG LOG
                    const ratio = this.evaluator.calculateValue(basisConfig.assessmentRatioRule, ratioContext);
                    basisValue *= ratio;
                }
                console.log(`Rule Basis Value (Initial): ${basisValue}`);

                // Apply Exemptions (Value Reduction / Full Exemption)
                let basisAfterExemptions = basisValue;
                let fullyExempt = false;
                for (const exemption of rule.exemptions || []) {
                    if ((!exemption.conditions || exemption.conditions.every(cond => this.evaluator.evaluateCondition(cond, ruleContext)))) {
                        if (exemption.type === 'valueReduction' && exemption.amountRule) {
                            const reductionContext = { ...ruleContext, propertyValue: basisValue }; // Context for reduction calc
                            // console.log(`[DEBUG CALC] Calling evaluator.calculateValue for valueReduction exemption:`, exemption.amountRule); // REMOVE DEBUG LOG
                            const reduction = this.evaluator.calculateValue(exemption.amountRule, reductionContext);
                            basisAfterExemptions = Math.max(0, basisAfterExemptions - reduction);
                            console.log(`Applied exemption '${exemption.name}': Reduced basis by ${reduction}`);
                        } else if (exemption.type === 'fullExemption') {
                            basisAfterExemptions = 0; fullyExempt = true;
                            console.log(`Applied full exemption '${exemption.name}'.`); break;
                        }
                    }
                }
                basisAfterExemptions = Math.max(0, basisAfterExemptions);
                console.log(`Basis after Value/Full Exemptions: ${basisAfterExemptions}`);

                // Calculate Tax if not fully exempt and basis > 0
                if (!fullyExempt && basisAfterExemptions > 0) {
                    let rate = 0;
                    const rateConfig = rule.rateDefinition || {};
                    const rateRule = rateConfig.rateRule || { method: 'fixedAmount', value: 0 };
                    const rateContext = { ...ruleContext, assessedValue: basisAfterExemptions }; // Context for rate calc

                    // Calculate the base rate using the rule
                    // console.log(`[DEBUG CALC] Calling evaluator.calculateValue for rateRule:`, rateRule); // REMOVE DEBUG LOG
                    rate = this.evaluator.calculateValue(rateRule, rateContext);

                    // Adjust based on method (mill rate needs division)
                    switch(rateConfig.method) {
                        case 'millRate': rate = rate / 1000; break;
                        case 'percentage': /* Rate is already a percentage */ break;
                        case 'fixedAmount':
                            basisAfterExemptions = 1; // Ensure fixed amount is applied once
                            break; // Rate is the fixed amount
                        default: console.warn(`Unknown property tax rate method: ${rateConfig.method}`); rate = 0;
                    }

                    // Apply Rate Reduction Exemptions
                     for (const exemption of rule.exemptions || []) {
                         if (exemption.type === 'rateReduction' && exemption.amountRule && (!exemption.conditions || exemption.conditions.every(cond => this.evaluator.evaluateCondition(cond, ruleContext)))) {
                              const reductionContext = { ...ruleContext, currentRate: rate }; // Context for reduction calc
                              // console.log(`[DEBUG CALC] Calling evaluator.calculateValue for rateReduction exemption:`, exemption.amountRule); // REMOVE DEBUG LOG
                              const reduction = this.evaluator.calculateValue(exemption.amountRule, reductionContext);
                              rate = Math.max(0, rate - reduction);
                              console.log(`Applied exemption '${exemption.name}': Reduced rate by ${reduction}`);
                         }
                     }
                     rate = Math.max(0, rate);
                     console.log(`Final Rate for Rule: ${rate}`);

                    // Calculate Tax for this rule
                    taxForThisRule = basisAfterExemptions * rate;
                }

                // Add tax for this rule to the total for the corresponding key
                const ruleKey = rule.description || rule.level || `propertyTax_${rule.level || 'unknown'}`;
                this.taxman.calculated.propertyTax[ruleKey] = (this.taxman.calculated.propertyTax[ruleKey] || 0) + taxForThisRule;
                console.log(`Tax for Rule '${ruleKey}' on ${propName}: ${taxForThisRule}`);
            }
        }
        // console.log("Finished Property Tax calculation:", this.taxman.calculated.propertyTax); // Commented out
    }
}

// Export if needed
// export default PropertyTaxCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PropertyTaxCalculator;
}