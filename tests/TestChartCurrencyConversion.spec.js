import { test, expect } from '@playwright/test';
import {
  loadSimulator,
  seedEvents
} from './helpers/PlaywrightFinsim.js';

test.use({ actionTimeout: 20000 });

test('chart currency selector converts datasets and shows original tooltip details', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(frame, [
    { type: 'MV', alias: 'AR', fromAge: 40, toAge: 40 },
    { type: 'SI', alias: 'IE Salary', amount: '50000', fromAge: 25, toAge: 39 },
    { type: 'SI', alias: 'US Salary', amount: '75000', fromAge: 40, toAge: 65 }
  ]);

  await frame.locator('body').evaluate(() => {
    const webUI = window.WebUI.getInstance();
    const chart = webUI.chartManager;

    chart.setupChartCurrencyControls(webUI);
    chart.rebuildDatasetIndexMaps();

    // Ensure dynamic investment datasets exist for testing dynamic fields
    chart.applyInvestmentTypes([
      { key: 'indexFunds', label: 'Index Funds' },
      { key: 'shares', label: 'Shares' }
    ], { preserveData: false, transactional: true });

    const cfg = window.Config.getInstance();
    const simStartYear = cfg.getSimulationStartYear();
    const sampleRows = [
      { Age: 30, Year: simStartYear, NetIncome: 52000, Expenses: 21000, IncomeSalaries: 52000, Cash: 12000, RealEstateCapital: 85000, PensionFund: 18000, Income__indexFunds: 1400, Capital__shares: 25000 },
      { Age: 41, Year: simStartYear + 11, NetIncome: 66000, Expenses: 28000, IncomeSalaries: 66000, Cash: 15000, RealEstateCapital: 125000, PensionFund: 26000, Income__indexFunds: 1800, Capital__shares: 50000 }
    ];

    sampleRows.forEach((row, idx) => {
      const clone = Object.assign({}, row);
      chart.updateChartsRow(idx + 1, clone);
    });
  });

  const dropdown = frame.locator('.chart-controls select#reportingCurrencySelect_ChartManager');
  await dropdown.waitFor({ state: 'visible' });
  const optionValues = await dropdown.evaluate((select) => Array.from(select.options).map(opt => opt.value));
  expect(optionValues).toContain('EUR');
  expect(optionValues).toContain('ARS');

  const baseline = await frame.locator('body').evaluate(() => {
    const cm = window.WebUI.getInstance().chartManager;
    const idx = cm.cashflowIndexByLabel['Inflows'];
    return {
      value: cm.cashflowChart.data.datasets[idx].data[0],
      originalCurrency: cm.originalValues[0]?.NetIncome?.currency || null
    };
  });
  expect(baseline.originalCurrency).toBe('EUR');

  // Same-currency identity: explicitly select EUR and confirm dataset equals original
  await dropdown.selectOption('EUR');
  await page.waitForTimeout(150);
  const identityCheck = await frame.locator('body').evaluate(() => {
    const cm = window.WebUI.getInstance().chartManager;
    const inflowsIdx = cm.cashflowIndexByLabel['Inflows'];
    return cm.cashflowChart.data.datasets[inflowsIdx].data[0];
  });
  expect(identityCheck).toBeCloseTo(baseline.value, 6);

  await dropdown.selectOption('ARS');
  await page.waitForTimeout(200);

    const analysis = await frame.locator('body').evaluate(() => {
    const webUI = window.WebUI.getInstance();
    const cm = webUI.chartManager;
    const cfg = window.Config.getInstance();
    const econ = cfg.getEconomicData();
    const inflowsIdx = cm.cashflowIndexByLabel['Inflows'];
    const converted = cm.cashflowChart.data.datasets[inflowsIdx].data[0];
    const original = cm.originalValues[0]?.NetIncome;
    const startYear = cfg.getSimulationStartYear();
    const yearForFX = cm.cachedRowData && cm.cachedRowData[1] && cm.cachedRowData[1].Year != null
      ? cm.cachedRowData[1].Year
      : startYear;
    const expected = original
      ? econ.convert(
          original.value,
          cm.getCountryForAge(30),
          cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
          yearForFX,
          { baseYear: startYear }
        )
      : null;
    // Dynamic income (indexFunds) conversion check
    const dynIncomeIdx = cm.cashflowIncomeIndexByKey['indexFunds'];
    const dynIncomeConverted = dynIncomeIdx != null ? cm.cashflowChart.data.datasets[dynIncomeIdx].data[0] : null;
    const dynIncomeOrig = cm.originalValues[0]?.['Income__indexFunds'];
    const dynIncomeExpected = dynIncomeOrig
      ? econ.convert(
          dynIncomeOrig.value,
          cm.getCountryForAge(30),
          cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
          yearForFX,
          { baseYear: startYear }
        )
      : null;
    // Dynamic capital (shares) conversion check on assets chart
    const dynCapIdx = cm.assetsCapitalIndexByKey['shares'];
    const dynCapConverted = dynCapIdx != null ? cm.assetsChart.data.datasets[dynCapIdx].data[0] : null;
    const dynCapOrig = cm.originalValues[0]?.['Capital__shares'];
    const dynCapExpected = dynCapOrig
      ? econ.convert(
          dynCapOrig.value,
          cm.getCountryForAge(30),
          cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
          yearForFX,
          { baseYear: startYear }
        )
      : null;
    const tooltipLabel = cm.cashflowChart.options.plugins.tooltip.callbacks.label({
      dataset: cm.cashflowChart.data.datasets[inflowsIdx],
      parsed: { y: converted },
      dataIndex: 0,
      chart: cm.cashflowChart
    });
    const rawAnnotations = (cm.cashflowChart.options.plugins && cm.cashflowChart.options.plugins.relocationMarkers && cm.cashflowChart.options.plugins.relocationMarkers.annotations)
      || cm.latestRelocationAnnotations
      || {};
    return {
      converted,
      expected,
      dynIncomeConverted,
      dynIncomeExpected,
      dynCapConverted,
      dynCapExpected,
      tooltipLabel,
      transitions: cm.relocationTransitions.length,
      annotationCount: Object.keys(rawAnnotations).length
    };
  });

  if (analysis.expected != null) {
    expect(analysis.converted).toBeCloseTo(analysis.expected, 2);
  }
  if (analysis.dynIncomeExpected != null && analysis.dynIncomeConverted != null) {
    expect(analysis.dynIncomeConverted).toBeCloseTo(analysis.dynIncomeExpected, 2);
  }
  if (analysis.dynCapExpected != null && analysis.dynCapConverted != null) {
    expect(analysis.dynCapConverted).toBeCloseTo(analysis.dynCapExpected, 2);
  }
  expect(analysis.tooltipLabel).toMatch(/Original:/);
  expect(analysis.transitions).toBeGreaterThan(0);
  expect(analysis.annotationCount).toBeGreaterThan(0);

  // Toggle back to EUR (programmatic) and verify values revert to original
  await frame.locator('body').evaluate(() => {
    const cm = window.WebUI.getInstance().chartManager;
    cm.reportingCurrency = 'EUR';
    cm.refreshChartsWithCurrency();
  });
  await page.waitForTimeout(300);
  const reverted = await frame.locator('body').evaluate(() => {
    const cm = window.WebUI.getInstance().chartManager;
    const inflowsIdx = cm.cashflowIndexByLabel['Inflows'];
    const inflowsVal = cm.cashflowChart.data.datasets[inflowsIdx].data[0];
    const dynIncomeIdx = cm.cashflowIncomeIndexByKey['indexFunds'];
    const dynIncomeVal = dynIncomeIdx != null ? cm.cashflowChart.data.datasets[dynIncomeIdx].data[0] : null;
    const dynIncomeOrig = cm.originalValues[0]?.['Income__indexFunds']?.value;
    const dynCapIdx = cm.assetsCapitalIndexByKey['shares'];
    const dynCapVal = dynCapIdx != null ? cm.assetsChart.data.datasets[dynCapIdx].data[0] : null;
    const dynCapOrig = cm.originalValues[0]?.['Capital__shares']?.value;
    return { inflowsVal, dynIncomeVal, dynIncomeOrig, dynCapVal, dynCapOrig };
  });
  expect(reverted.inflowsVal).toBeCloseTo(baseline.value, 6);
  if (reverted.dynIncomeVal != null && reverted.dynIncomeOrig != null) {
    expect(reverted.dynIncomeVal).toBeCloseTo(reverted.dynIncomeOrig, 6);
  }
  if (reverted.dynCapVal != null && reverted.dynCapOrig != null) {
    expect(reverted.dynCapVal).toBeCloseTo(reverted.dynCapOrig, 6);
  }

  // Switch to ARS again and confirm re-conversion matches series-based expectation
  await dropdown.selectOption('ARS');
  await page.waitForTimeout(350);
  const reconvertCheck = await frame.locator('body').evaluate(() => {
    const cm = window.WebUI.getInstance().chartManager;
    const cfg = window.Config.getInstance();
    const econ = cfg.getEconomicData();
    const inflowsIdx = cm.cashflowIndexByLabel['Inflows'];
    const converted = cm.cashflowChart.data.datasets[inflowsIdx].data[0];
    const original = cm.originalValues[0]?.NetIncome;
    const startYear = cfg.getSimulationStartYear();
    const yearForFX = cm.cachedRowData && cm.cachedRowData[1] && cm.cachedRowData[1].Year != null
      ? cm.cachedRowData[1].Year
      : startYear;
    const expected = original ? econ.convert(
      original.value,
      cm.getCountryForAge(30),
      cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
      yearForFX,
      { baseYear: startYear }
    ) : null;
    // Dynamic checks on reconversion after cache repopulation
    const dynIncomeIdx = cm.cashflowIncomeIndexByKey['indexFunds'];
    const dynIncomeConverted = dynIncomeIdx != null ? cm.cashflowChart.data.datasets[dynIncomeIdx].data[0] : null;
    const dynIncomeOrig = cm.originalValues[0]?.['Income__indexFunds'];
    const dynIncomeExpected = dynIncomeOrig ? econ.convert(
      dynIncomeOrig.value,
      cm.getCountryForAge(30),
      cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
      yearForFX,
      { baseYear: startYear }
    ) : null;
    const dynCapIdx = cm.assetsCapitalIndexByKey['shares'];
    const dynCapConverted = dynCapIdx != null ? cm.assetsChart.data.datasets[dynCapIdx].data[0] : null;
    const dynCapOrig = cm.originalValues[0]?.['Capital__shares'];
    const dynCapExpected = dynCapOrig ? econ.convert(
      dynCapOrig.value,
      cm.getCountryForAge(30),
      cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
      yearForFX,
      { baseYear: startYear }
    ) : null;
    return { converted, expected, dynIncomeConverted, dynIncomeExpected, dynCapConverted, dynCapExpected };
  });
  if (reconvertCheck.expected != null) {
    expect(reconvertCheck.converted).toBeCloseTo(reconvertCheck.expected, 2);
  }
  if (reconvertCheck.dynIncomeExpected != null && reconvertCheck.dynIncomeConverted != null) {
    expect(reconvertCheck.dynIncomeConverted).toBeCloseTo(reconvertCheck.dynIncomeExpected, 2);
  }
  if (reconvertCheck.dynCapExpected != null && reconvertCheck.dynCapConverted != null) {
    expect(reconvertCheck.dynCapConverted).toBeCloseTo(reconvertCheck.dynCapExpected, 2);
  }
});
