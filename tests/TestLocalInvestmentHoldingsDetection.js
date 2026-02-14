const assert = require('assert');
require('../src/core/Utils.js');

/**
 * Tests for local investment holdings detection during relocation.
 * Validates that the RelocationImpactDetector identifies local holdings
 * (residenceScope='local' + assetCountry=origin) when processing MV events.
 */

module.exports = {
  name: 'LocalInvestmentHoldingsDetection',
  description: 'Validates detection of local investment holdings on relocation',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Shim minimal Config expected by the detector.
    const configStub = {
      relocationEnabled: true,
      availableCountries: {
        ar: 'Argentina',
        ie: 'Ireland',
        us: 'United States'
      },
      isRelocationEnabled() { return this.relocationEnabled; },
      getCountryNameByCode(code) {
        const normalized = (code || '').toString().toLowerCase();
        return this.availableCountries[normalized] || normalized.toUpperCase();
      },
      getDefaultCountry() { return 'ar'; },
      getAvailableCountries() {
        return [
          { code: 'ar', name: 'Argentina' },
          { code: 'ie', name: 'Ireland' },
          { code: 'us', name: 'United States' }
        ];
      },
      getCachedTaxRuleSet(code) {
        const normalized = (code || '').toString().toLowerCase();
        const currencyMap = { ar: 'ARS', ie: 'EUR', us: 'USD' };
        return {
          getPensionSystemType() { return 'mixed'; },
          getCurrencyCode() { return currencyMap[normalized] || 'USD'; },
          getInflationRate() { return 0.025; }
        };
      },
      getEconomicData() { return null; }
    };
    global.Config = { getInstance: () => configStub };

    const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');

    function makeEvent(overrides) {
      return Object.assign({
        id: overrides && overrides.id || Math.random().toString(36).slice(2),
        type: 'SI',
        amount: 1000,
        fromAge: 30,
        toAge: 40,
        currency: null,
        linkedEventId: null,
        linkedCountry: null
      }, overrides || {});
    }

    function makeInvestmentContext(investmentAssets, capsByKey) {
      return { investmentAssets, capsByKey };
    }

    function runDetector(events, startCountry, investmentContext) {
      // Deep clone events to avoid cross-test contamination
      const cloned = events.map(evt => JSON.parse(JSON.stringify(evt)));
      RelocationImpactDetector.analyzeEvents(cloned, startCountry || 'ar', investmentContext);
      return cloned;
    }

    try {
      // Test 1: Positive case - AR→IE relocation with local AR fund
      (function () {
        const mv = makeEvent({ id: 'mv1', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }
          ],
          { localArFund: 50000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv1');
        assert(mvResult.relocationImpact, 'Expected local_holdings impact on MV event');
        assert.strictEqual(mvResult.relocationImpact.category, 'local_holdings');
        assert(mvResult.relocationImpact.message.indexOf('Argentina Equity Fund') !== -1, 'Message should mention the fund');
        assert(mvResult.relocationImpact.message.indexOf('Ireland') !== -1, 'Message should mention destination country');
      })();

      // Test 2: Negative case - global fund should NOT trigger impact
      (function () {
        const mv = makeEvent({ id: 'mv2', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'globalEtf', label: 'MSCI World ETF', baseCurrency: 'USD', assetCountry: 'us', residenceScope: 'global' }
          ],
          { globalEtf: 100000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv2');
        // Should not have local_holdings impact (may have other impacts like missing_ruleset, etc.)
        assert(!mvResult.relocationImpact || mvResult.relocationImpact.category !== 'local_holdings', 'Global fund should not trigger local_holdings impact');
      })();

      // Test 3: Negative case - local fund but zero capital
      (function () {
        const mv = makeEvent({ id: 'mv3', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }
          ],
          { localArFund: 0 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv3');
        assert(!mvResult.relocationImpact || mvResult.relocationImpact.category !== 'local_holdings', 'Zero capital should not trigger local_holdings impact');
      })();

      // Test 4: Multiple local holdings - single impact listing all
      (function () {
        const mv = makeEvent({ id: 'mv4', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' },
            { key: 'localArBonds', label: 'Argentina Bonds', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }
          ],
          { localArFund: 30000, localArBonds: 20000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv4');
        assert(mvResult.relocationImpact, 'Expected local_holdings impact for multiple holdings');
        assert.strictEqual(mvResult.relocationImpact.category, 'local_holdings');
        // Message should mention both funds
        assert(mvResult.relocationImpact.message.indexOf('local investments') !== -1, 'Message should use plural phrasing');
      })();

      // Test 5: Resolution detection - resolutionOverride clears impact
      (function () {
        const mv = makeEvent({ id: 'mv5', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [{ key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }],
          { localArFund: 50000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv5');
        assert(mvResult.relocationImpact, 'Impact should exist before resolution');

        // Set resolutionOverride and check clearance
        mvResult.resolutionOverride = 'reviewed';
        RelocationImpactDetector.clearResolvedImpacts(mvResult);
        assert(!mvResult.relocationImpact, 'resolutionOverride should clear local_holdings impact');
      })();

      // Test 6: No investment context - no crash, no investment impacts
      (function () {
        const mv = makeEvent({ id: 'mv6', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const result = runDetector([mv], 'ar', null);
        const mvResult = result.find(e => e.id === 'mv6');
        // Should not crash and should not have local_holdings impact
        assert(!mvResult.relocationImpact || mvResult.relocationImpact.category !== 'local_holdings', 'No investment context should not add local_holdings impact');
      })();

      // Test 7: Mixed portfolio - only local holdings flagged
      (function () {
        const mv = makeEvent({ id: 'mv7', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'globalEtf', label: 'MSCI World ETF', baseCurrency: 'USD', assetCountry: 'us', residenceScope: 'global' },
            { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }
          ],
          { globalEtf: 100000, localArFund: 50000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv7');
        assert(mvResult.relocationImpact, 'Expected local_holdings impact for mixed portfolio');
        assert.strictEqual(mvResult.relocationImpact.category, 'local_holdings');
        // Message should only mention local fund, not global
        assert(mvResult.relocationImpact.message.indexOf('Argentina Equity Fund') !== -1, 'Should mention local fund');
        assert(mvResult.relocationImpact.message.indexOf('MSCI World') === -1, 'Should not mention global fund');
      })();

      // Test 8: Multi-hop relocation - local holdings at each stage
      (function () {
        const mv1 = makeEvent({ id: 'mv8a', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const mv2 = makeEvent({ id: 'mv8b', type: 'MV', name: 'US', fromAge: 45, toAge: 45 });
        const investmentContext = makeInvestmentContext(
          [
            { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' },
            { key: 'localIeFund', label: 'Ireland ISEQ Fund', baseCurrency: 'EUR', assetCountry: 'ie', residenceScope: 'local' }
          ],
          { localArFund: 50000, localIeFund: 30000 }
        );
        const result = runDetector([mv1, mv2], 'ar', investmentContext);

        // First relocation (AR→IE) should flag AR local fund
        const mv1Result = result.find(e => e.id === 'mv8a');
        assert(mv1Result.relocationImpact, 'Expected impact on first MV');
        assert(mv1Result.relocationImpact.message.indexOf('Argentina') !== -1, 'First MV should flag AR fund');

        // Second relocation (IE→US) should flag IE local fund
        const mv2Result = result.find(e => e.id === 'mv8b');
        assert(mv2Result.relocationImpact, 'Expected impact on second MV');
        assert.strictEqual(mv2Result.relocationImpact.category, 'local_holdings');
        assert(mv2Result.relocationImpact.message.indexOf('ISEQ') !== -1, 'Second MV should flag IE fund');
      })();

      // Test 9: Local fund from different country (not origin) - not flagged
      (function () {
        const mv = makeEvent({ id: 'mv9', type: 'MV', name: 'IE', fromAge: 35, toAge: 35 });
        const investmentContext = makeInvestmentContext(
          [
            // Local US fund while starting in AR - should not be flagged
            { key: 'localUsFund', label: 'US Small Cap Fund', baseCurrency: 'USD', assetCountry: 'us', residenceScope: 'local' }
          ],
          { localUsFund: 50000 }
        );
        const result = runDetector([mv], 'ar', investmentContext);
        const mvResult = result.find(e => e.id === 'mv9');
        assert(!mvResult.relocationImpact || mvResult.relocationImpact.category !== 'local_holdings',
          'Local fund from non-origin country should not trigger impact');
      })();

    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
