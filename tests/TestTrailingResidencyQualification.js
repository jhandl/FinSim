const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

function hasPositiveTaxAtAge(results, age, taxKey, errors, label) {
  const row = results.dataSheet.find(r => r && r.age === age);
  if (!row) {
    errors.push(`${label}: row for age ${age} not found`);
    return false;
  }
  const taxByKey = row.taxByKey || {};
  return (taxByKey[taxKey] || 0) > 0;
}

async function runTrailingScenario(moveAge, aaResidencyRules) {
  const framework = new TestFramework();
  const scenarioDef = {
    name: `TrailingResidencyQualification_${moveAge}`,
    scenario: {
      parameters: microParams({
        startingAge: 30,
        targetAge: 35,
        StartCountry: 'aa',
        relocationEnabled: true
      }),
      events: [
        { type: 'MV', id: `mv-${moveAge}`, name: 'bb', fromAge: moveAge, toAge: moveAge },
        { type: 'SI', id: `salary-bb-${moveAge}`, amount: 40000, fromAge: moveAge, toAge: 35, currency: 'BBB', linkedCountry: 'bb' }
      ]
    },
    assertions: []
  };

  framework.loadScenario(scenarioDef);

  const aaRules = deepClone(TOY_AA);
  const bbRules = deepClone(TOY_BB);
  aaRules.residencyRules = Object.assign({}, aaRules.residencyRules || {}, aaResidencyRules || {});
  bbRules.residencyRules = { postEmigrationTaxYears: 0, taxesForeignIncome: false };
  installTestTaxRules(framework, { aa: aaRules, bb: bbRules });

  return framework.runSimulation();
}

module.exports = {
  name: 'TrailingResidencyQualification',
  description: 'Requires minimum prior residency years before post-emigration trailing tax activates.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const shortStay = await runTrailingScenario(32, {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true,
      minResidencyYearsBeforePostEmigrationTax: 3
    });
    if (!shortStay || !shortStay.success) {
      errors.push('Short-stay scenario failed');
    } else if (hasPositiveTaxAtAge(shortStay, 32, 'incomeTax:aa', errors, 'Short-stay')) {
      errors.push('Short-stay scenario should not trigger trailing incomeTax:aa before minimum residency threshold');
    }

    const qualifiedStay = await runTrailingScenario(33, {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true,
      minResidencyYearsBeforePostEmigrationTax: 3
    });
    if (!qualifiedStay || !qualifiedStay.success) {
      errors.push('Qualified-stay scenario failed');
    } else if (!hasPositiveTaxAtAge(qualifiedStay, 33, 'incomeTax:aa', errors, 'Qualified-stay')) {
      errors.push('Qualified-stay scenario should trigger trailing incomeTax:aa after meeting minimum residency threshold');
    }

    const backwardCompatible = await runTrailingScenario(32, {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true
    });
    if (!backwardCompatible || !backwardCompatible.success) {
      errors.push('Backward-compatibility scenario failed');
    } else if (!hasPositiveTaxAtAge(backwardCompatible, 32, 'incomeTax:aa', errors, 'Backward-compatibility')) {
      errors.push('Trailing taxation should remain active when minimum residency threshold is not configured');
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
