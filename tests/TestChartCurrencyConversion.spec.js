import { test, expect } from '@playwright/test';
import {
  loadSimulator,
  seedEvents
} from './helpers/PlaywrightFinsim.js';

test.use({ actionTimeout: 20000 });

test('chart currency selector converts datasets and shows original tooltip details', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(frame, [
    { type: 'MV-AR', alias: 'MoveAR', fromAge: 40, toAge: 40 },
    { type: 'SI', alias: 'IE Salary', amount: '50000', fromAge: 25, toAge: 39 },
    { type: 'SI', alias: 'US Salary', amount: '75000', fromAge: 40, toAge: 65 }
  ]);

  await frame.locator('body').evaluate(() => {
    const webUI = window.WebUI.getInstance();
    const chart = webUI.chartManager;

    chart.setupChartCurrencyControls(webUI);
    chart.rebuildDatasetIndexMaps();

    const sampleRows = [
      { Age: 30, NetIncome: 52000, Expenses: 21000, IncomeSalaries: 52000, Cash: 12000, RealEstateCapital: 85000, PensionFund: 18000 },
      { Age: 41, NetIncome: 66000, Expenses: 28000, IncomeSalaries: 66000, Cash: 15000, RealEstateCapital: 125000, PensionFund: 26000 }
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
    const expected = original
      ? econ.convert(
          original.value,
          cm.getCountryForAge(30),
          cm.getRepresentativeCountryForCurrency(cm.reportingCurrency),
          startYear + 30,
          { fxMode: 'ppp', baseYear: startYear }
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
      tooltipLabel,
      transitions: cm.relocationTransitions.length,
      annotationCount: Object.keys(rawAnnotations).length
    };
  });

  if (analysis.expected != null) {
    expect(analysis.converted).toBeCloseTo(analysis.expected, 2);
  }
  expect(analysis.tooltipLabel).toMatch(/Original:/);
  expect(analysis.transitions).toBeGreaterThan(0);
  expect(analysis.annotationCount).toBeGreaterThan(0);
});
