/* Chart management functionality */

class ChartManager {

  constructor(webUI) {
    this.webUI = webUI; // Store reference to WebUI for accessing scenario parameters
    this.cachedRowData = {};
    this.reportingCurrency = null; // Selected currency for display (defaults to StartCountry currency)
    this.relocationTransitions = []; // Array of {age, fromCountry, toCountry} for visual markers
    this.countryInflationOverrides = {}; // MV event rate overrides: country -> inflation rate (decimal)
    this.originalValues = {}; // Cache of unconverted values for tooltip display
    this.currencyMode = 'unified'; // Charts always use unified mode (no mode selector in charts)
    this.presentValueMode = false; // Display monetary values in today's terms when enabled
    this.latestRelocationAnnotations = {};
    try {
      this.setupCharts();
    } catch (err) {
      console.log('ChartManager constructor setupCharts failed: ' + (err && err.message ? err.message : err));
      // Continue without charts rather than breaking the whole app
      this.chartsInitialized = false;
    }
  }

  setPresentValueMode(enabled) {
    try {
      const flag = !!enabled;
      if (this.presentValueMode === flag) return;
      this.presentValueMode = flag;
      // Guard: When PV mode changes, ensure we rebuild from cached nominal values
      // This ensures stability when toggling PV on/off multiple times
      if (this.cachedRowData && Object.keys(this.cachedRowData).length > 0) {
        this.refreshChartsWithCurrency(); // Recompute from cached nominal rows
      }
    } catch (_) {
      // no-op
    }
  }

  getPresentValueMode() {
    return !!this.presentValueMode;
  }

  // Update chart dataset labels for funds and shares based on ruleset-provided labels
  applyInvestmentLabels(fundsLabel, sharesLabel) {
    try {
      if (!this.chartsInitialized) return;
      // Cashflow chart: update dynamic income dataset labels by key
      if (this.cashflowChart && this.cashflowChart.data && this.cashflowChart.data.datasets) {
        const cds = this.cashflowChart.data.datasets;
        for (let i = 0; i < cds.length; i++) {
          const ds = cds[i];
          if (!ds) continue;
          if (ds._invKey === 'indexFunds' && fundsLabel) ds.label = fundsLabel;
          if (ds._invKey === 'shares' && sharesLabel) ds.label = sharesLabel;
        }
        // Keep dynamic income label mapping in sync with any label changes
        this.cashflowIncomeLabelByKey = this.cashflowIncomeLabelByKey || {};
        if (fundsLabel) this.cashflowIncomeLabelByKey['indexFunds'] = fundsLabel;
        if (sharesLabel) this.cashflowIncomeLabelByKey['shares'] = sharesLabel;
        this.cashflowChart.update();
      }

      // Assets chart: update dynamic capital dataset labels by key
      if (this.assetsChart && this.assetsChart.data && this.assetsChart.data.datasets) {
        const ads = this.assetsChart.data.datasets;
        for (let i = 0; i < ads.length; i++) {
          const ds = ads[i];
          if (!ds) continue;
          if (ds._invKey === 'indexFunds' && fundsLabel) ds.label = fundsLabel;
          if (ds._invKey === 'shares' && sharesLabel) ds.label = sharesLabel;
        }
        this.assetsChart.update();
      }
    } catch (_) {
      // Swallow errors silently to avoid breaking UI
    }
  }

  // Rebuild chart datasets to reflect configured investment types (dynamic N types)
  applyInvestmentTypes(types, opts) {
    try {
      if (!this.chartsInitialized) return;
      const invTypes = Array.isArray(types) ? types : [];
      const options = opts || {};

      // Capture previous dataset data for preservation
      const prev = {
        cashflow: { byLabel: {}, byKey: {} },
        assets: { byLabel: {}, byKey: {} }
      };
      if (this.cashflowChart && this.cashflowChart.data && Array.isArray(this.cashflowChart.data.datasets)) {
        const cds = this.cashflowChart.data.datasets;
        for (let i = 0; i < cds.length; i++) {
          const ds = cds[i]; if (!ds) continue;
          if (ds.label) prev.cashflow.byLabel[ds.label] = Array.isArray(ds.data) ? ds.data.slice() : [];
          if (ds._invKey) prev.cashflow.byKey[ds._invKey] = Array.isArray(ds.data) ? ds.data.slice() : [];
        }
      }
      if (this.assetsChart && this.assetsChart.data && Array.isArray(this.assetsChart.data.datasets)) {
        const ads = this.assetsChart.data.datasets;
        for (let i = 0; i < ads.length; i++) {
          const ds = ads[i]; if (!ds) continue;
          if (ds.label) prev.assets.byLabel[ds.label] = Array.isArray(ds.data) ? ds.data.slice() : [];
          if (ds._invKey) prev.assets.byKey[ds._invKey] = Array.isArray(ds.data) ? ds.data.slice() : [];
        }
      }

      // Helper to get colors for each investment type
      const getTypeColors = (key, index) => {
        // Preserve legacy colors for known keys
        if (key === 'indexFunds') return { border: '#9575CD', background: '#E1BEE7' };
        if (key === 'shares') return { border: '#81C784', background: '#C8E6C9' };
        // Otherwise pick from a palette
        const palette = [
          { border: '#26A69A', background: '#B2DFDB' },
          { border: '#EF5350', background: '#FFCDD2' },
          { border: '#AB47BC', background: '#E1BEE7' },
          { border: '#42A5F5', background: '#BBDEFB' },
          { border: '#8D6E63', background: '#D7CCC8' },
          { border: '#66BB6A', background: '#C8E6C9' },
          { border: '#FF7043', background: '#FFCCBC' },
          { border: '#78909C', background: '#CFD8DC' },
        ];
        const pick = palette[index % palette.length];
        return { border: pick.border, background: pick.background };
      };

      // ------------ Cashflow Chart (inflows/outflows + incomes stacked) ------------
      if (this.cashflowChart) {
        const baseDatasets = [
          { label: 'Inflows', borderColor: '#4CAF50', backgroundColor: '#4CAF50', fill: false, data: [], stack: 'nostack1', borderDash: [5, 5], pointRadius: 0, order: 0, _fieldKey: 'NetIncome' },
          { label: 'Outflows', borderColor: '#f44336', backgroundColor: '#f44336', fill: false, data: [], stack: 'nostack2', borderDash: [5, 5], pointRadius: 0, order: 1, _fieldKey: 'Expenses' },
          { label: 'Salaries', borderColor: '#90A4AE', backgroundColor: '#CFD8DC', fill: true, data: [], stack: 'main', pointRadius: 0, order: 2, _fieldKey: 'IncomeSalaries' },
          { label: 'Rental', borderColor: '#A1887F', backgroundColor: '#D7CCC8', fill: true, data: [], stack: 'main', pointRadius: 0, order: 3, _fieldKey: 'IncomeRentals' },
          { label: 'RSUs', borderColor: '#F06292', backgroundColor: '#F8BBD0', fill: true, data: [], stack: 'main', pointRadius: 0, order: 4, _fieldKey: 'IncomeRSUs' },
          { label: 'P.Pension', borderColor: '#4FC3F7', backgroundColor: '#B3E5FC', fill: true, data: [], stack: 'main', pointRadius: 0, order: 5, _fieldKey: 'IncomePrivatePension' },
          { label: 'S.Pension', borderColor: '#64B5F6', backgroundColor: '#BBDEFB', fill: true, data: [], stack: 'main', pointRadius: 0, order: 6, _fieldKey: 'IncomeStatePension' },
          { label: 'D.Benefit', borderColor: '#9575CD', backgroundColor: '#E1BEE7', fill: true, data: [], stack: 'main', pointRadius: 0, order: 7, _fieldKey: 'IncomeDefinedBenefit' },
          { label: 'Tax-Free', borderColor: '#26A69A', backgroundColor: '#B2DFDB', fill: true, data: [], stack: 'main', pointRadius: 0, order: 8, _fieldKey: 'IncomeTaxFree' },
        ];

        const dynamicIncomeDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], stack: 'main', pointRadius: 0, order: 9 + idx, _invKey: key, _fieldKey: 'Income__' + key };
        });

        const cashDataset = { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], stack: 'main', pointRadius: 0, order: 9 + dynamicIncomeDatasets.length + 1, _fieldKey: 'IncomeCash' };

        const newCashflowDatasets = [...baseDatasets, ...dynamicIncomeDatasets, cashDataset];
        if (options.preserveData) {
          for (let i = 0; i < newCashflowDatasets.length; i++) {
            const ds = newCashflowDatasets[i];
            const preserved = (ds._invKey && prev.cashflow.byKey[ds._invKey]) || prev.cashflow.byLabel[ds.label];
            if (preserved) ds.data = preserved.slice();
          }
        }
        // Apply transactional update if requested
        const prevAnimCF = (this.cashflowChart.options && this.cashflowChart.options.animation);
        if (options.transactional) { this.cashflowChart.options.animation = false; }
        this.cashflowChart.data.datasets = newCashflowDatasets;
        this.cashflowIncomeStartIndex = baseDatasets.length;
        this.cashflowIncomeKeys = invTypes.map(t => t.key);
        // Maintain mapping of dynamic income keys to their current labels
        this.cashflowIncomeLabelByKey = {};
        invTypes.forEach((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          this.cashflowIncomeLabelByKey[key] = label;
        });
        this.cashflowCashDatasetIndex = baseDatasets.length + dynamicIncomeDatasets.length;
        if (options.transactional) { this.cashflowChart.options.animation = prevAnimCF; }
      }

      // ------------ Assets Chart (stacked assets) ------------
      if (this.assetsChart) {
        // Fixed bottom part of the stack (datasetIndex ascending == bottom → top)
        const baseFixedWithoutCash = [
          { label: 'R.Estate', borderColor: '#90A4AE', backgroundColor: '#CFD8DC', fill: true, data: [], pointRadius: 0, order: 0, _fieldKey: 'RealEstateCapital' },
          { label: 'Pension', borderColor: '#64B5F6', backgroundColor: '#BBDEFB', fill: true, data: [], pointRadius: 0, order: 1, _fieldKey: 'PensionFund' },
        ];

        // Dynamic investment types come after Pension
        const dynamicCapitalDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], pointRadius: 0, order: 2 + idx, _invKey: key, _fieldKey: 'Capital__' + key };
        });

        // Cash should be the top-most dataset in the stack and last in the array
        const cashDataset = { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], pointRadius: 0, order: 2 + dynamicCapitalDatasets.length, _fieldKey: 'Cash' };

        const newAssetsDatasets = [...baseFixedWithoutCash, ...dynamicCapitalDatasets, cashDataset];
        if (options.preserveData) {
          for (let i = 0; i < newAssetsDatasets.length; i++) {
            const ds = newAssetsDatasets[i];
            const preserved = (ds._invKey && prev.assets.byKey[ds._invKey]) || prev.assets.byLabel[ds.label];
            if (preserved) ds.data = preserved.slice();
          }
        }
        const prevAnimAS = (this.assetsChart.options && this.assetsChart.options.animation);
        if (options.transactional) { this.assetsChart.options.animation = false; }
        this.assetsChart.data.datasets = newAssetsDatasets;
        this.assetsCapitalStartIndex = baseFixedWithoutCash.length;
        this.assetsCapitalKeys = invTypes.map(t => t.key);
        if (options.transactional) { this.assetsChart.options.animation = prevAnimAS; }
      }
      this.rebuildDatasetIndexMaps();
      if (!this._repopulateFromCache()) {
        if (this.cashflowChart) this.cashflowChart.update();
        if (this.assetsChart) this.assetsChart.update();
      }
    } catch (_) {
      // Swallow errors silently to avoid breaking UI
    }
  }

  // Apply income column visibility to cashflow chart datasets
  applyIncomeVisibility(incomeVisibility) {
    try {
      if (!this.chartsInitialized || !this.cashflowChart) return;
      if (!incomeVisibility || typeof incomeVisibility !== 'object') return;

      // Normalize visibility keys to lowercase for consistent lookups
      const vis = {};
      Object.keys(incomeVisibility || {}).forEach(k => vis[String(k).toLowerCase()] = !!incomeVisibility[k]);

      // Map table column keys to chart dataset info
      const incomeDatasetMap = {
        'incomesalaries': { label: 'Salaries', order: 2 },
        'incomerentals': { label: 'Rental', order: 3 },
        'incomersus': { label: 'RSUs', order: 4 },
        'incomeprivatepension': { label: 'P.Pension', order: 5 },
        'incomestatepension': { label: 'S.Pension', order: 6 },
        'incomedefinedbenefit': { label: 'D.Benefit', order: 7 },
        'incometaxfree': { label: 'Tax-Free', order: 8 },
        'incomecash': { label: 'Cash', order: 999 } // Always last
      };

      // Get current datasets and preserve non-income ones
      const currentDatasets = this.cashflowChart.data.datasets || [];
      const nonIncomeDatasets = currentDatasets.filter(ds =>
        ds.label === 'Inflows' || ds.label === 'Outflows'
      );

      // If dynamic income visibility requires datasets that are missing, rebuild structure once
      const wantsDynamic = (this.cashflowIncomeKeys || []).some(key => vis['income__' + String(key).toLowerCase()]);
      const hasDynamic = currentDatasets.some(ds => ds && ds._invKey);
      if (wantsDynamic && !hasDynamic) {
        const invTypes = (this.cashflowIncomeKeys || []).map((k, i) => ({ key: k, label: (this.cashflowIncomeLabelByKey && this.cashflowIncomeLabelByKey[k]) || k }));
        if (typeof this.applyInvestmentTypes === 'function') {
          this.applyInvestmentTypes(invTypes, { preserveData: true, transactional: true });
        }
      }
      // Refresh currentDatasets reference after potential rebuild
      const refreshedDatasets = this.cashflowChart.data.datasets || [];
      const baseNonIncome = refreshedDatasets.filter(ds => ds.label === 'Inflows' || ds.label === 'Outflows');

      // Build visible income datasets in stable order
      const visibleIncomeDatasets = [];
      let orderCounter = 2; // Start after Inflows(0) and Outflows(1)

      // Add pinned and visible income types in order
      Object.keys(incomeDatasetMap).forEach(key => {
        if (vis[key]) {
          const info = incomeDatasetMap[key];
          const existingDataset = refreshedDatasets.find(ds => ds && ds.label === info.label);
          if (existingDataset) {
            // Preserve existing dataset but update order
            visibleIncomeDatasets.push({
              ...existingDataset,
              order: info.order === 999 ? orderCounter + 100 : orderCounter++
            });
          } else {
            // Create placeholder dataset if the structure hasn't been built yet for this fixed income
            visibleIncomeDatasets.push({
              label: info.label,
              borderColor: '#90A4AE',
              backgroundColor: '#CFD8DC',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: info.order === 999 ? orderCounter + 100 : orderCounter++
            });
          }
        }
      });

      // Add dynamic investment income datasets if visible (prefer lookup by inv key to avoid label drift)
      const dynamicIncomeDatasets = [];
      if (this.cashflowIncomeKeys && Array.isArray(this.cashflowIncomeKeys)) {
        const labelByKey = this.cashflowIncomeLabelByKey || {};
        this.cashflowIncomeKeys.forEach((key) => {
          const visKey = 'income__' + String(key).toLowerCase();
          if (vis[visKey]) {
            const desiredLabel = labelByKey[key];
            let existingDataset = refreshedDatasets.find(ds => ds && ds._invKey === key);
            if (!existingDataset && desiredLabel) {
              existingDataset = refreshedDatasets.find(ds => ds && ds.label === desiredLabel);
            }
            if (existingDataset) {
              dynamicIncomeDatasets.push({
                ...existingDataset,
                order: orderCounter++
              });
            }
          }
        });
      }


      // Rebuild chart datasets with only visible income types
      this.cashflowChart.data.datasets = [
        ...baseNonIncome,
        ...visibleIncomeDatasets,
        ...dynamicIncomeDatasets
      ];

      // Rebuild index maps to reflect filtered datasets
      this.rebuildDatasetIndexMaps();
      if (!this._repopulateFromCache() && this.cashflowChart) {
        this.cashflowChart.update();
      }
    } catch (_) {
      // Swallow errors silently to avoid breaking UI
    }
  }

  setupCharts() {
    try {

      // Setup Cashflow Chart
      const cashflowCtx = document.getElementById('cashflowGraph');
      if (!cashflowCtx) {
        throw new Error("Missing cashflowGraph element");
      }

      // Make sure we can get a 2D context
      const cashflowCtx2D = cashflowCtx.getContext('2d');
      if (!cashflowCtx2D) {
        throw new Error("Failed to get 2D context for cashflowGraph");
      }

      this.commonScaleOptions = {
        y: {
          stacked: true,
          beginAtZero: true
        },
        x: {
          ticks: {
            callback: function (value, index, values) {
              return this.chart.data.labels[index];
            },
            maxRotation: 0,
            minRotation: 0
          }
        }
      };

      // NEW: Define legend label sizing based on screen width
      const isSmallScreen = (typeof window !== 'undefined') ? window.innerWidth <= 600 : false;
      this.legendLabelsConfig = {
        padding: 14,
        boxWidth: isSmallScreen ? 15 : 30,
        font: {
          size: isSmallScreen ? 12 : 13
        }
      };

      // Add common tooltip configuration
      this.commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        // Reduce event listeners to minimize non-passive warnings
        events: ['mousemove', 'mouseout', 'click'],
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          tooltip: {
            enabled: true,
            position: 'nearest',
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  // Check if original values exist for this data point
                  const chartManager = context.chart.chartManager || {};
                  const originalValues = chartManager.originalValues || {};
                  const rowIndex = context.dataIndex;
                  const fieldKey = context.dataset._fieldKey || context.dataset.label;
                  const original = originalValues[rowIndex] && originalValues[rowIndex][fieldKey];
                  if (original) {
                    // Format converted amount with reporting currency
                    const reportingCurrency = chartManager.reportingCurrency || 'EUR';
                    const toCountry = chartManager.getRepresentativeCountryForCurrency ? chartManager.getRepresentativeCountryForCurrency(reportingCurrency) : 'ie';
                    const cfg = Config.getInstance();
                    const rs = cfg.getCachedTaxRuleSet(toCountry);
                    const numberLocale = rs ? rs.getNumberLocale() : 'en-IE';
                    const currencyCode = rs ? rs.getCurrencyCode() : 'EUR';
                    const converted = context.parsed.y.toLocaleString(numberLocale, {
                      style: 'currency',
                      currency: currencyCode,
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    });
                    // Format original amount with original currency
                    const origCountry = chartManager.getCountryForAge ? chartManager.getCountryForAge(context.chart.data.labels[rowIndex]) : 'ie';
                    const origRs = cfg.getCachedTaxRuleSet(origCountry);
                    const origNumberLocale = origRs ? origRs.getNumberLocale() : 'en-IE';
                    const origCurrencyCode = original.currency || 'EUR';
                    const origFormatted = original.value.toLocaleString(origNumberLocale, {
                      style: 'currency',
                      currency: origCurrencyCode,
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    });
                    label += converted + ' (Original: ' + origFormatted + ')';
                  } else {
                    // Format with default currency if no original value
                    label += FormatUtils.formatCurrency(context.parsed.y);
                  }
                }
                return label;
              }
            }
          }
        },
        scales: this.commonScaleOptions
      };

      this.cashflowChart = new Chart(cashflowCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Inflows',
              borderColor: '#4CAF50',
              backgroundColor: '#4CAF50',
              fill: false,
              data: [],
              stack: 'nostack1',
              borderDash: [5, 5],
              pointRadius: 0,
              order: 0,
              _fieldKey: 'NetIncome'
            },
            {
              label: 'Outflows',
              borderColor: '#f44336',
              backgroundColor: '#f44336',
              fill: false,
              data: [],
              stack: 'nostack2',
              borderDash: [5, 5],
              pointRadius: 0,
              order: 1,
              _fieldKey: 'Expenses'
            },
            // Re-ordered stacked datasets so legend order aligns with visual stack (bottom → top)
            {
              label: 'Salaries',
              borderColor: '#90A4AE',
              backgroundColor: '#CFD8DC',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 2,
              _fieldKey: 'IncomeSalaries'
            },
            {
              label: 'Rental',
              borderColor: '#A1887F',
              backgroundColor: '#D7CCC8',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 3,
              _fieldKey: 'IncomeRentals'
            },
            {
              label: 'RSUs',
              borderColor: '#F06292',
              backgroundColor: '#F8BBD0',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 4,
              _fieldKey: 'IncomeRSUs'
            },
            {
              label: 'P.Pension',
              borderColor: '#4FC3F7',
              backgroundColor: '#B3E5FC',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 5,
              _fieldKey: 'IncomePrivatePension'
            },
            {
              label: 'S.Pension',
              borderColor: '#64B5F6',
              backgroundColor: '#BBDEFB',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 6,
              _fieldKey: 'IncomeStatePension'
            },
            {
              label: 'D.Benefit',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 7,
              _fieldKey: 'IncomeDefinedBenefit'
            },
            {
              label: 'Tax-Free',
              borderColor: '#26A69A',
              backgroundColor: '#B2DFDB',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 8,
              _fieldKey: 'IncomeTaxFree'
            },
            {
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 10,
              _fieldKey: 'IncomeCash'
            }
          ]
        },
        options: {
          ...this.commonOptions,
          plugins: {
            ...this.commonOptions.plugins,
            title: {
              display: false  // Disabled since we now use HTML titles with info icons
            },
            legend: {
              position: 'right',
              onClick: null,
              labels: {
                ...this.legendLabelsConfig,
                // Keep Inflows and Outflows at the top, then sort by dataset.order with stable tie-breaker
                sort: (a, b) => {
                  const fixed = ['Inflows', 'Outflows'];
                  const aFixed = fixed.includes(a.text);
                  const bFixed = fixed.includes(b.text);
                  if (aFixed && bFixed) {
                    return fixed.indexOf(a.text) - fixed.indexOf(b.text);
                  }
                  if (aFixed) return -1;
                  if (bFixed) return 1;
                  // Ensure S.Pension appears above P.Pension in the legend without changing dataset draw order
                  if (a.text === 'S.Pension' && b.text === 'P.Pension') return -1;
                  if (a.text === 'P.Pension' && b.text === 'S.Pension') return 1;
                  const ao = (a.dataset && typeof a.dataset.order === 'number') ? a.dataset.order : 0;
                  const bo = (b.dataset && typeof b.dataset.order === 'number') ? b.dataset.order : 0;
                  if (ao !== bo) return ao - bo;
                  return (a.text || '').localeCompare(b.text || '');
                }
              }
            }
          }
        }
      });
      this.cashflowChart.chartManager = this;
      // Default dynamic mapping: no investment-type incomes until ruleset applied
      this.cashflowIncomeStartIndex = 9; // After fixed incomes up to Tax-Free
      this.cashflowIncomeKeys = [];
      this.cashflowIncomeLabelByKey = {};
      this.cashflowCashDatasetIndex = 10;
      // Build initial index maps
      this.rebuildDatasetIndexMaps();

      // Setup Assets Chart
      const assetsCtx = document.getElementById('assetsGraph');
      if (!assetsCtx) {
        throw new Error("Missing assetsGraph element");
      }

      this.assetsChart = new Chart(assetsCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            // Assets Chart – datasets rearranged for correct legend order (bottom → top)
            {
              label: 'R.Estate',
              borderColor: '#90A4AE',
              backgroundColor: '#CFD8DC',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 0,
              _fieldKey: 'RealEstateCapital'
            },
            {
              label: 'Pension',
              borderColor: '#64B5F6',
              backgroundColor: '#BBDEFB',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 1,
              _fieldKey: 'PensionFund'
            },
            {
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 2,
              _fieldKey: 'Cash'
            }
          ]
        },
        options: {
          ...this.commonOptions,
          plugins: {
            ...this.commonOptions.plugins,
            title: {
              display: false  // Disabled since we now use HTML titles with info icons
            },
            legend: {
              position: 'right',
              onClick: null,
              labels: {
                ...this.legendLabelsConfig,
                // Sort assets legend by dataset.order with stable tie-breaker
                sort: (a, b) => {
                  const ao = a.datasetIndex ? a.datasetIndex : 0;
                  const bo = b.datasetIndex ? b.datasetIndex : 0;
                  if (ao !== bo) return bo - ao;
                  return (a.text || '').localeCompare(b.text || '');
                }
              }
            }
          }
        }
      });
      this.assetsChart.chartManager = this;
      // Investment types are injected via applyInvestmentTypes(); start empty to avoid legacy coupling.
      this.assetsCapitalStartIndex = 2;
      this.assetsCapitalKeys = [];

      // Set flag indicating that charts were initialized correctly
      this.chartsInitialized = true;
    } catch (error) {
      this.chartsInitialized = false;
      throw error;
    }
  }

  setupChartCurrencyControls(webUI) {
    const cfg = Config.getInstance();
    if (!cfg.isRelocationEnabled()) return;

    const graphContainers = Array.prototype.slice.call(document.querySelectorAll('.graph-container'));
    if (!graphContainers.length) return;

    const primaryContainer = graphContainers[0];
    let controlsDiv = primaryContainer.querySelector('.chart-controls');
    if (!controlsDiv) {
      controlsDiv = document.createElement('div');
      controlsDiv.className = 'chart-controls';
      primaryContainer.appendChild(controlsDiv);
    }
    RelocationUtils.createCurrencyControls(controlsDiv, this, webUI);

    // Ensure secondary graph containers don't keep stale duplicates (IDs must remain unique)
    for (var i = 1; i < graphContainers.length; i++) {
      var container = graphContainers[i];
      var duplicate = container.querySelector('.chart-controls');
      if (duplicate && duplicate !== controlsDiv) {
        duplicate.parentNode.removeChild(duplicate);
      }
    }

    RelocationUtils.extractRelocationTransitions(webUI, this);
    this.refreshChartsWithCurrency();
  }

  handleCurrencyModeChange(newMode) {
    if (this.currencyMode === newMode) return;
    this.currencyMode = newMode;
    this.updateCurrencyControlVisibility();
    this.refreshChartsWithCurrency();
  }

  updateCurrencyControlVisibility() {
    document.querySelectorAll('.chart-controls').forEach(controlsDiv => {
      const naturalToggle = controlsDiv.querySelector(`#currencyModeNatural_${this.constructor.name}`);
      const unifiedToggle = controlsDiv.querySelector(`#currencyModeUnified_${this.constructor.name}`);
      const dropdownContainer = controlsDiv.querySelector('.currency-dropdown-container');

      // Charts don't have mode toggles, so check currency count to determine visibility
      if (!naturalToggle && !unifiedToggle) {
        if (dropdownContainer) {
          dropdownContainer.style.display = 'block';
          const select = dropdownContainer.querySelector('select');
          if (select && select.options.length <= 1) {
            try { select.disabled = true; } catch (_) { }
          } else if (select) {
            try { select.disabled = false; } catch (_) { }
          }
        }
        return;
      }

      // Only update toggles if they exist (should not happen for charts, but safe fallback)
      if (this.currencyMode === 'natural') {
        if (naturalToggle) naturalToggle.classList.add('mode-toggle-active');
        if (unifiedToggle) unifiedToggle.classList.remove('mode-toggle-active');
        if (dropdownContainer) dropdownContainer.style.display = 'none';
      } else {
        if (unifiedToggle) unifiedToggle.classList.add('mode-toggle-active');
        if (naturalToggle) naturalToggle.classList.remove('mode-toggle-active');
        if (dropdownContainer) {
          const select = dropdownContainer.querySelector('select');
          const optionCount = select ? select.options.length : 0;
          dropdownContainer.style.display = optionCount > 1 ? 'block' : 'none';
        }
      }
    });
  }

  getCountryForAge(age) {
    return RelocationUtils.getCountryForAge(age, this.webUI);
  }

  getRepresentativeCountryForCurrency(code) {
    try {
      return RelocationUtils.getRepresentativeCountryForCurrency(code);
    } catch (err) {
      console.log('ChartManager.getRepresentativeCountryForCurrency error: ' + (err && err.message ? err.message : err));
      return code ? String(code).toLowerCase() : 'ie';
    }
  }

  // Build fast lookup maps for current dataset indices
  rebuildDatasetIndexMaps() {
    try {
      // Cashflow indices
      this.cashflowIndexByLabel = {};
      this.cashflowIncomeIndexByKey = {};
      if (this.cashflowChart && this.cashflowChart.data && Array.isArray(this.cashflowChart.data.datasets)) {
        const cds = this.cashflowChart.data.datasets;
        for (let idx = 0; idx < cds.length; idx++) {
          const ds = cds[idx];
          if (ds && ds.label) this.cashflowIndexByLabel[ds.label] = idx;
          if (ds && ds._invKey) this.cashflowIncomeIndexByKey[ds._invKey] = idx;
        }
      }
      // Assets indices
      this.assetsIndexByLabel = {};
      this.assetsCapitalIndexByKey = {};
      if (this.assetsChart && this.assetsChart.data && Array.isArray(this.assetsChart.data.datasets)) {
        const ads = this.assetsChart.data.datasets;
        for (let idx = 0; idx < ads.length; idx++) {
          const ds = ads[idx];
          if (ds && ds.label) this.assetsIndexByLabel[ds.label] = idx;
          if (ds && ds._invKey) this.assetsCapitalIndexByKey[ds._invKey] = idx;
        }
      }
    } catch (_) {
      // no-op
    }
  }

  updateChartsRow(rowIndex, data, options) {
    try {
      if (!this.chartsInitialized) {
        return;
      }
      const opts = options || {};
      // CRITICAL: Always store nominal values in cache before any transformations
      // This ensures cachedRowData preserves original nominal values regardless of PV mode
      if (!opts.skipCacheStore) {
        if (rowIndex === 1) {
          this.cachedRowData = {};
        }
        // Store a deep clone of nominal data (before PV transformation)
        this.cachedRowData[rowIndex] = Object.assign({}, data);
      }

      const i = rowIndex - 1;
      /*
       * Present-value handling for charts:
       * - When PV mode is enabled, charts simply consume the core PV fields that
       *   were computed in the simulator (`*PV` aggregates and dynamic maps),
       *   rather than recomputing any deflation in the UI.
       * - Cached nominal rows in `cachedRowData` remain untouched; toggling PV
       *   on/off just switches which fields are read for plotting.
       */
      if (this.presentValueMode) {
        try {
          // Fixed monetary fields – prefer core *PV fields when present
          const monetaryFields = [
            'NetIncome', 'Expenses', 'IncomeSalaries', 'IncomeRentals', 'IncomeRSUs', 'IncomePrivatePension',
            'IncomeStatePension', 'IncomeDefinedBenefit', 'IncomeTaxFree', 'IncomeCash', 'RealEstateCapital',
            'PensionFund', 'Cash'
          ];
          for (let mf = 0; mf < monetaryFields.length; mf++) {
            const field = monetaryFields[mf];
            if (data[field] === undefined) continue;
            const pvKey = field + 'PV';
            if (Object.prototype.hasOwnProperty.call(data, pvKey) &&
              typeof data[pvKey] === 'number' && isFinite(data[pvKey])) {
              data[field] = data[pvKey];
            }
          }

          // Dynamic investment fields (Income__*, Capital__*):
          // Prefer core PV mirrors (e.g. Income__indexFundsPV) when present.
          Object.keys(data).forEach(function (key) {
            if (typeof key === 'string' && (key.indexOf('Income__') === 0 || key.indexOf('Capital__') === 0)) {
              if (data[key] === undefined) return;
              var dynPvKey = key + 'PV';
              if (Object.prototype.hasOwnProperty.call(data, dynPvKey) &&
                typeof data[dynPvKey] === 'number' && isFinite(data[dynPvKey])) {
                data[key] = data[dynPvKey];
              }
            }
          });
        } catch (_) { /* keep nominal on any failure */ }
      }

      // Materialize per-type investment income into dynamic Income__* fields so
      // the chart datasets created by applyInvestmentTypes() get populated.
      try {
        const srcMap = (this.presentValueMode && data.investmentIncomeByKeyPV) ? data.investmentIncomeByKeyPV : data.investmentIncomeByKey;
        if (srcMap) {
          for (const key in srcMap) {
            data['Income__' + key] = srcMap[key];
          }
        }
      } catch (_) { /* no-op */ }

      // Currency conversion (unified mode): Uses evolved FX (inflation-driven) to convert
      // values to reporting currency, reflecting cumulative inflation differentials.
      // PPP mode is NOT used here (reserved for event suggestions only).
      // Add conversion logic before updating datasets
      const cfg = Config.getInstance();
      // Strengthen conversion guard: derive reportingCurrency if null
      if (cfg.isRelocationEnabled() && this.currencyMode === 'unified') {
        if (!this.reportingCurrency) {
          this.reportingCurrency = RelocationUtils.getDefaultReportingCurrency(this.webUI);
        }
      }
      if (cfg.isRelocationEnabled() && this.currencyMode === 'unified' && this.reportingCurrency) {
        if (typeof this.getRepresentativeCountryForCurrency !== 'function') {
          console.log('ChartManager.updateChartsRow missing getRepresentativeCountryForCurrency');
        }
        const age = data.Age;
        const sourceCountry = this.getCountryForAge(age);
        const sourceCurrency = cfg.getCachedTaxRuleSet(sourceCountry) ? cfg.getCachedTaxRuleSet(sourceCountry).getCurrencyCode() : 'EUR';
        const targetCurrency = this.reportingCurrency;
        // Derive calendar year for FX evolution:
        // - Use the explicit Year field from the data row when available.
        // - In PV mode, or when Year is missing, fall back to simulation-start-year FX.
        var simStartYear = cfg.getSimulationStartYear();
        var yearForFX = data.Year != null ? data.Year : simStartYear;
        if (this.presentValueMode) {
          yearForFX = simStartYear;
        }
        const economicData = cfg.getEconomicData();
        if (!economicData || !economicData.ready) {
          console.error('ChartManager.updateChartsRow: economicData unavailable at age ' + age + ', skipping currency conversion');
          return;
        }
        const toCountry = this.getRepresentativeCountryForCurrency(targetCurrency);
        const monetaryFields = ['NetIncome', 'Expenses', 'IncomeSalaries', 'IncomeRentals', 'IncomeRSUs', 'IncomePrivatePension', 'IncomeStatePension', 'IncomeDefinedBenefit', 'IncomeTaxFree', 'IncomeCash', 'RealEstateCapital', 'PensionFund', 'Cash'];
        var skippedCount = 0;
        monetaryFields.forEach(field => {
          if (data[field] !== undefined) {
            var originalVal = data[field];
            // State Pension PV is always in EUR (Ireland's currency), regardless of residence country
            // We need to use Ireland as the source country for conversion, not the residence country
            var actualSourceCountry = sourceCountry;
            var actualSourceCurrency = sourceCurrency;
            var isStatePension = (field === 'IncomeStatePension');
            if (isStatePension && this.presentValueMode) {
              // In PV mode, State Pension is in EUR (Ireland)
              actualSourceCountry = 'ie';
              actualSourceCurrency = 'EUR';
            }
            if (actualSourceCurrency !== targetCurrency) {
              // FX conversion using evolution mode (inflation-driven, default mode) - not PPP.
              // We always call EconomicData.convert with baseYear = simulation start; the
              // conversion engine derives year-specific cross-rates from inflation profiles.
              var fxOptions = { baseYear: simStartYear };
              const converted = economicData.convert(originalVal, actualSourceCountry, toCountry, yearForFX, fxOptions);
              // Conversion result safeguards
              if (converted === null || !Number.isFinite(converted)) {
                console.error('ChartManager: Conversion failed for ' + field + ' at age ' + age + ': null/NaN result, original=' + originalVal + '');
                skippedCount++;
                data[field] = originalVal; // Keep original
              } else {
                data[field] = converted;
              }
              this.originalValues[i] = this.originalValues[i] || {};
              this.originalValues[i][field] = { value: originalVal, currency: sourceCurrency };
            } else {
              this.originalValues[i] = this.originalValues[i] || {};
              this.originalValues[i][field] = { value: originalVal, currency: sourceCurrency };
            }
          }
        });
        // Handle dynamic fields
        Object.keys(data).forEach(key => {
          if (typeof key === 'string' && (key.indexOf('Income__') === 0 || key.indexOf('Capital__') === 0)) {
            const field = key;
            if (data[field] !== undefined) {
              var originalDynVal = data[field];
              if (sourceCurrency !== targetCurrency) {
                // FX conversion using evolved mode (inflation-driven) - not PPP
                const converted = economicData.convert(originalDynVal, sourceCountry, toCountry, yearForFX, { baseYear: simStartYear });
                // Conversion result safeguards for dynamic fields
                if (converted === null || !Number.isFinite(converted)) {
                  console.error('ChartManager: Conversion failed for ' + field + ' at age ' + age + ': null/NaN result, original=' + originalDynVal + '');
                  skippedCount++;
                  data[field] = originalDynVal; // Keep original
                } else {
                  data[field] = converted;
                }
                this.originalValues[i] = this.originalValues[i] || {};
                this.originalValues[i][field] = { value: originalDynVal, currency: sourceCurrency };
              } else {
                this.originalValues[i] = this.originalValues[i] || {};
                this.originalValues[i][field] = { value: originalDynVal, currency: sourceCurrency };
              }
            }
          }
        });
        // Only log if there were actual validation failures (not just FX fallbacks)
        if (skippedCount > 0) {
          var warnKey = 'skipped@age' + age;
          if (!this._warnedAges) this._warnedAges = {};
          if (!this._warnedAges[warnKey]) {
            console.warn('ChartManager.updateChartsRow: ' + skippedCount + ' conversions skipped due to validation failures at age ' + age + '');
            this._warnedAges[warnKey] = true;
          }
        }
      }

      // Update Cashflow Chart
      this.cashflowChart.data.labels[i] = data.Age;
      // Inflows / Outflows by label
      const cfL = this.cashflowIndexByLabel || {};
      if (cfL['Inflows'] !== undefined) this.cashflowChart.data.datasets[cfL['Inflows']].data[i] = data.NetIncome;
      if (cfL['Outflows'] !== undefined) this.cashflowChart.data.datasets[cfL['Outflows']].data[i] = data.Expenses;
      // Fixed incomes by label
      if (cfL['Salaries'] !== undefined) this.cashflowChart.data.datasets[cfL['Salaries']].data[i] = data.IncomeSalaries;
      if (cfL['Rental'] !== undefined) this.cashflowChart.data.datasets[cfL['Rental']].data[i] = data.IncomeRentals;
      if (cfL['RSUs'] !== undefined) this.cashflowChart.data.datasets[cfL['RSUs']].data[i] = data.IncomeRSUs;
      if (cfL['P.Pension'] !== undefined) this.cashflowChart.data.datasets[cfL['P.Pension']].data[i] = data.IncomePrivatePension;
      if (cfL['S.Pension'] !== undefined) this.cashflowChart.data.datasets[cfL['S.Pension']].data[i] = data.IncomeStatePension;
      if (cfL['D.Benefit'] !== undefined) this.cashflowChart.data.datasets[cfL['D.Benefit']].data[i] = data.IncomeDefinedBenefit;
      if (cfL['Tax-Free'] !== undefined) this.cashflowChart.data.datasets[cfL['Tax-Free']].data[i] = data.IncomeTaxFree;
      // Dynamic incomes by investment key
      const incomeIdxByKey = this.cashflowIncomeIndexByKey || {};
      const keys = this.cashflowIncomeKeys || [];
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const idx = incomeIdxByKey[key];
        if (idx !== undefined) {
          this.cashflowChart.data.datasets[idx].data[i] = (data['Income__' + key] !== undefined) ? data['Income__' + key] : 0;
        }
      }
      if (cfL['Cash'] !== undefined) this.cashflowChart.data.datasets[cfL['Cash']].data[i] = data.IncomeCash;

      if (!opts.skipCashflowUpdate && this.cashflowChart) {
        this.cashflowChart.update();
      }

      // Update Assets Chart – adjusted to new dataset indices
      this.assetsChart.data.labels[i] = data.Age;
      const asL = this.assetsIndexByLabel || {};
      if (asL['R.Estate'] !== undefined) this.assetsChart.data.datasets[asL['R.Estate']].data[i] = data.RealEstateCapital;
      if (asL['Cash'] !== undefined) this.assetsChart.data.datasets[asL['Cash']].data[i] = data.Cash;
      if (asL['Pension'] !== undefined) this.assetsChart.data.datasets[asL['Pension']].data[i] = data.PensionFund;
      // Dynamic capitals per investment type
      const capIdxByKey = this.assetsCapitalIndexByKey || {};
      const aKeys = this.assetsCapitalKeys || [];
      for (let k = 0; k < aKeys.length; k++) {
        const key = aKeys[k];
        const idx = capIdxByKey[key];
        if (idx !== undefined) {
          this.assetsChart.data.datasets[idx].data[i] = (data['Capital__' + key] !== undefined) ? data['Capital__' + key] : 0;
        }
      }
      if (!opts.skipAssetsUpdate && this.assetsChart) {
        this.assetsChart.update();
      }
    } catch (error) {
      console.log('ChartManager.updateChartsRow error: ' + (error && error.message ? error.message : error));
      // Silently fail as this is not critical
    }
  }

  drawRelocationMarkers() {
    if (!this.relocationTransitions.length) {
      this._clearRelocationAnnotations();
      return;
    }

    const annotations = {};
    const transitions = this.relocationTransitions || [];
    let foundMarker = false;
    for (let idx = 0; idx < transitions.length; idx++) {
      const trans = transitions[idx];
      let ageIndex = -1;
      if (this.cashflowChart && this.cashflowChart.data && Array.isArray(this.cashflowChart.data.labels)) {
        const labels = this.cashflowChart.data.labels;
        ageIndex = labels.indexOf(trans.age);
        if (ageIndex === -1 && labels.length > 0) {
          for (let li = 0; li < labels.length; li++) {
            if (labels[li] >= trans.age) {
              ageIndex = li;
              break;
            }
          }
          if (ageIndex === -1) {
            ageIndex = labels.length - 1;
          }
        }
      }
      if (ageIndex !== -1) {
        annotations['relocation' + idx] = {
          type: 'line',
          index: ageIndex,
          xMin: ageIndex,
          xMax: ageIndex,
          borderColor: '#ccc',
          borderWidth: 1,
          borderDash: [5, 5],
          label: {
            content: 'Relocated from ' + trans.fromCountry.toUpperCase() + ' to ' + trans.toCountry.toUpperCase(),
            enabled: true,
            position: 'top',
            opacity: 0.5
          }
        };
        foundMarker = true;
      }
    }

    this.latestRelocationAnnotations = foundMarker ? annotations : {};
    this._applyRelocationAnnotations(foundMarker ? annotations : {});
  }

  _clearRelocationAnnotations() {
    this.latestRelocationAnnotations = {};
    if (this.cashflowChart) {
      this.cashflowChart.$relocationAnnotations = null;
      if (typeof this.cashflowChart.update === 'function') this.cashflowChart.update();
    }
    if (this.assetsChart) {
      this.assetsChart.$relocationAnnotations = null;
      if (typeof this.assetsChart.update === 'function') this.assetsChart.update();
    }
  }

  _applyRelocationAnnotations(annotations) {
    const hasAnnotations = annotations && Object.keys(annotations).length > 0;
    this.latestRelocationAnnotations = hasAnnotations ? annotations : {};
    const applyToChart = (chart) => {
      if (!chart) return;
      chart.$relocationAnnotations = hasAnnotations ? annotations : null;
      if (typeof chart.update === 'function') chart.update();
    };

    applyToChart(this.cashflowChart);
    applyToChart(this.assetsChart);
  }


  refreshChartsWithCurrency() {
    this._repopulateFromCache();
    this.drawRelocationMarkers();
  }

  _repopulateFromCache() {
    if (!this.chartsInitialized) return false;
    const cached = this.cachedRowData || {};
    const keys = Object.keys(cached);
    if (keys.length === 0) return false;

    const numericKeys = keys.map(function (k) { return parseInt(k, 10); }).filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
    if (numericKeys.length === 0) return false;

    let prevAnimCF, prevAnimAS;
    prevAnimCF = (this.cashflowChart && this.cashflowChart.options) ? this.cashflowChart.options.animation : undefined;
    prevAnimAS = (this.assetsChart && this.assetsChart.options) ? this.assetsChart.options.animation : undefined;
    if (this.cashflowChart && this.cashflowChart.options) this.cashflowChart.options.animation = false;
    if (this.assetsChart && this.assetsChart.options) this.assetsChart.options.animation = false;

    for (let idx = 0; idx < numericKeys.length; idx++) {
      const rowIndex = numericKeys[idx];
      const rowData = cached[rowIndex];
      if (!rowData) continue;
      // CRITICAL: Always clone cached nominal data before applying transformations
      // cachedRowData contains nominal values; PV transformation is applied in updateChartsRow
      // when presentValueMode is enabled. This ensures toggling PV mode works correctly.
      const clone = Object.assign({}, rowData);
      this.updateChartsRow(rowIndex, clone, { skipCashflowUpdate: true, skipAssetsUpdate: true, skipCacheStore: true });
    }

    if (this.cashflowChart) this.cashflowChart.update();
    if (this.assetsChart) this.assetsChart.update();

    if (this.cashflowChart && this.cashflowChart.options) this.cashflowChart.options.animation = prevAnimCF;
    if (this.assetsChart && this.assetsChart.options) this.assetsChart.options.animation = prevAnimAS;
    return true;
  }

  clearExtraChartRows(maxAge) {
    try {
      if (!this.chartsInitialized) {
        return;
      }

      if (maxAge === 0) {
        if (this.cashflowChart) {
          this.cashflowChart.data.labels = [];
          this.cashflowChart.data.datasets.forEach(dataset => {
            dataset.data = [];
          });
          this.cashflowChart.update();
        }
        if (this.assetsChart) {
          this.assetsChart.data.labels = [];
          this.assetsChart.data.datasets.forEach(dataset => {
            dataset.data = [];
          });
          this.assetsChart.update();
        }
        this.cachedRowData = {};
        return;
      }

      if (this.cashflowChart) {
        const maxAgeIndex = this.cashflowChart.data.labels.findIndex(label => label === maxAge);
        if (maxAgeIndex !== -1) {
          this.cashflowChart.data.labels = this.cashflowChart.data.labels.slice(0, maxAgeIndex + 1);
          this.cashflowChart.data.datasets.forEach(dataset => {
            dataset.data = dataset.data.slice(0, maxAgeIndex + 1);
          });
          const cached = this.cachedRowData || {};
          Object.keys(cached).forEach(key => {
            const rowIdx = parseInt(key, 10);
            if (!isNaN(rowIdx) && (rowIdx - 1) > maxAgeIndex) {
              delete cached[key];
            }
          });
        };
        this.cashflowChart.update();
      }
      if (this.assetsChart) {
        const maxAgeIndex = this.assetsChart.data.labels.findIndex(label => label === maxAge);
        if (maxAgeIndex !== -1) {
          this.assetsChart.data.labels = this.assetsChart.data.labels.slice(0, maxAgeIndex + 1);
          this.assetsChart.data.datasets.forEach(dataset => {
            dataset.data = dataset.data.slice(0, maxAgeIndex + 1);
          });
        };
        this.assetsChart.update();
      }
    } catch (error) {
      // Silently fail as this is not critical
    }
  }
} 
