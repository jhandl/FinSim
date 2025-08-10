// Custom test for TaxRuleSet basic functionality

module.exports = {
  name: 'TaxRuleSet',
  description: 'Validates parsing and getters for Irish tax ruleset v2.0',
  isCustomTest: true,
  runCustomTest: async function() {
    const fs = require('fs');
    const path = require('path');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    const testResults = { success: true, errors: [] };

    try {
      // Support both schema-named and current filename
      const filePath = path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-ie.json');
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const ruleset = new TaxRuleSet(raw);

      // Country code
      if (ruleset.getCountryCode() !== 'IE') {
        testResults.success = false; testResults.errors.push('Country code mismatch');
      }

      // Income tax brackets
      const single = ruleset.getIncomeTaxBracketsFor('single', false);
      if (!(single['0'] === 0.2 && single['44000'] === 0.4)) {
        testResults.success = false; testResults.errors.push('Single brackets incorrect');
      }

      const singleDep = ruleset.getIncomeTaxBracketsFor('single', true);
      if (!(singleDep['0'] === 0.2 && singleDep['48000'] === 0.4)) {
        testResults.success = false; testResults.errors.push('Single with dependents brackets incorrect');
      }

      const married = ruleset.getIncomeTaxBracketsFor('married', false);
      if (!(married['0'] === 0.2 && married['53000'] === 0.4)) {
        testResults.success = false; testResults.errors.push('Married brackets incorrect');
      }

      // Credits and age exemptions
      if (ruleset.getIncomeTaxEmployeeCredit() !== 2000) {
        testResults.success = false; testResults.errors.push('Employee credit incorrect');
      }
      if (ruleset.getIncomeTaxAgeCredit() !== 245) {
        testResults.success = false; testResults.errors.push('Age credit incorrect');
      }
      if (ruleset.getIncomeTaxAgeExemptionAge() !== 65) {
        testResults.success = false; testResults.errors.push('Age exemption age incorrect');
      }
      if (ruleset.getIncomeTaxAgeExemptionLimit() !== 18000) {
        testResults.success = false; testResults.errors.push('Age exemption limit incorrect');
      }

      // Pension lump sum bands
      const bands = ruleset.getPensionLumpSumTaxBands();
      if (!(bands['0'] === 0 && bands['200000'] === 0.2 && bands['500000'] === 0.4)) {
        testResults.success = false; testResults.errors.push('Pension lump sum tax bands incorrect');
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};


