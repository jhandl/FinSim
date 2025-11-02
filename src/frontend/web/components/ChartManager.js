/* Chart management functionality */

class ChartManager {

  constructor() {
    this.cachedRowData = {};
    this.reportingCurrency = null; // Selected currency for display (defaults to StartCountry currency)
    this.relocationTransitions = []; // Array of {age, fromCountry, toCountry} for visual markers
    this.originalValues = {}; // Cache of unconverted values for tooltip display
    this.countryTimeline = []; // Array tracking which country is active at each age
    this.currencyMode = 'unified'; // Charts always use unified mode (no mode selector in charts)
    try {
      this.setupCharts();
    } catch (err) {
      console.log('[DBG] ChartManager constructor setupCharts failed: ' + (err && err.message ? err.message : err));
      // Continue without charts rather than breaking the whole app
      this.chartsInitialized = false;
    }
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
        assets:   { byLabel: {}, byKey: {} }
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
          { label: 'Inflows', borderColor: '#4CAF50', backgroundColor: '#4CAF50', fill: false, data: [], stack: 'nostack1', borderDash: [5,5], pointRadius: 0, order: 0, _fieldKey: 'NetIncome' },
          { label: 'Outflows', borderColor: '#f44336', backgroundColor: '#f44336', fill: false, data: [], stack: 'nostack2', borderDash: [5,5], pointRadius: 0, order: 1, _fieldKey: 'Expenses' },
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
            callback: function(value, index, values) {
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
              label: function(context) {
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
              label: 'Shares',
              borderColor: '#81C784',
              backgroundColor: '#C8E6C9',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 2,
              _fieldKey: 'SharesCapital'
            },
            {
              label: 'Index Funds',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 3,
              _fieldKey: 'FundsCapital'
            },
            {
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 4,
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
      // Default dynamic mapping for legacy two-types (shares then index funds)
      this.assetsCapitalStartIndex = 3;
      this.assetsCapitalKeys = ['shares', 'indexFunds'];
      
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

    const graphContainers = document.querySelectorAll('.graph-container');
    graphContainers.forEach(container => {
        const controlsDiv = container.querySelector('.chart-controls') || document.createElement('div');
        if (!controlsDiv.classList.contains('chart-controls')) {
            controlsDiv.className = 'chart-controls';
            container.appendChild(controlsDiv);
        }
        RelocationUtils.createCurrencyControls(controlsDiv, this, webUI);
    });

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
                const select = dropdownContainer.querySelector('select');
                const optionCount = select ? select.options.length : 0;
                dropdownContainer.style.display = optionCount > 1 ? 'block' : 'none';
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
    return RelocationUtils.getCountryForAge(age, this);
  }

  getRepresentativeCountryForCurrency(code) {
    try {
      return RelocationUtils.getRepresentativeCountryForCurrency(code);
    } catch (err) {
      console.log('[DBG] ChartManager.getRepresentativeCountryForCurrency error: ' + (err && err.message ? err.message : err));
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
      if (!opts.skipCacheStore) {
        if (rowIndex === 1) {
          this.cachedRowData = {};
        }
        this.cachedRowData[rowIndex] = Object.assign({}, data);
      }
      
      const i = rowIndex-1;
      // Add conversion logic before updating datasets
      const cfg = Config.getInstance();
      if (cfg.isRelocationEnabled() && this.currencyMode === 'unified' && this.reportingCurrency) {
        if (typeof this.getRepresentativeCountryForCurrency !== 'function') {
          console.log('[DBG] ChartManager.updateChartsRow missing getRepresentativeCountryForCurrency');
        }
        const age = data.Age;
        const sourceCountry = this.getCountryForAge(age);
        const sourceCurrency = cfg.getCachedTaxRuleSet(sourceCountry) ? cfg.getCachedTaxRuleSet(sourceCountry).getCurrencyCode() : 'EUR';
        const targetCurrency = this.reportingCurrency;
        const year = cfg.getSimulationStartYear() + age;
        const economicData = cfg.getEconomicData();
        if (!economicData || !economicData.ready) {
          console.log('[DBG] ChartManager.updateChartsRow economicData unavailable');
        }
        const toCountry = this.getRepresentativeCountryForCurrency(targetCurrency);
        const monetaryFields = ['NetIncome', 'Expenses', 'IncomeSalaries', 'IncomeRentals', 'IncomeRSUs', 'IncomePrivatePension', 'IncomeStatePension', 'IncomeDefinedBenefit', 'IncomeTaxFree', 'IncomeCash', 'RealEstateCapital', 'PensionFund', 'Cash', 'FundsCapital', 'SharesCapital'];
        monetaryFields.forEach(field => {
          if (data[field] !== undefined) {
            if (sourceCurrency !== targetCurrency) {
              const converted = economicData.convert(data[field], sourceCountry, toCountry, year, { fxMode: 'ppp', baseYear: cfg.getSimulationStartYear() });
              this.originalValues[i] = this.originalValues[i] || {};
              this.originalValues[i][field] = { value: data[field], currency: sourceCurrency };
              data[field] = converted !== null ? converted : data[field];
            } else {
              this.originalValues[i] = this.originalValues[i] || {};
              this.originalValues[i][field] = { value: data[field], currency: sourceCurrency };
            }
          }
        });
        // Handle dynamic fields
        Object.keys(data).forEach(key => {
          if (key.startsWith('Income__') || key.startsWith('Capital__')) {
            const field = key;
            if (data[field] !== undefined) {
              if (sourceCurrency !== targetCurrency) {
                const converted = economicData.convert(data[field], sourceCountry, toCountry, year, { fxMode: 'ppp', baseYear: cfg.getSimulationStartYear() });
                this.originalValues[i] = this.originalValues[i] || {};
                this.originalValues[i][field] = { value: data[field], currency: sourceCurrency };
                data[field] = converted !== null ? converted : data[field];
              } else {
                this.originalValues[i] = this.originalValues[i] || {};
                this.originalValues[i][field] = { value: data[field], currency: sourceCurrency };
              }
            }
          }
        });
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
      const keys = this.cashflowIncomeKeys || ['indexFunds', 'shares'];
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const idx = incomeIdxByKey[key];
        if (idx !== undefined) {
          const val = (data['Income__' + key] !== undefined) ? data['Income__' + key]
                      : (key === 'indexFunds' ? data.IncomeFundsRent : key === 'shares' ? data.IncomeSharesRent : 0);
          this.cashflowChart.data.datasets[idx].data[i] = val;
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
      // Dynamic capitals per investment type (fallback to legacy fields if dynamic missing)
      const capIdxByKey = this.assetsCapitalIndexByKey || {};
      const aKeys = this.assetsCapitalKeys || ['shares', 'indexFunds'];
      for (let k = 0; k < aKeys.length; k++) {
        const key = aKeys[k];
        const idx = capIdxByKey[key];
        if (idx !== undefined) {
          const val = (data['Capital__' + key] !== undefined) ? data['Capital__' + key]
                      : (key === 'shares' ? data.SharesCapital : key === 'indexFunds' ? data.FundsCapital : 0);
          this.assetsChart.data.datasets[idx].data[i] = val;
        }
      }
      if (!opts.skipAssetsUpdate && this.assetsChart) {
        this.assetsChart.update();
      }
    } catch (error) {
      console.log('[DBG] ChartManager.updateChartsRow error: ' + (error && error.message ? error.message : error));
      // Silently fail as this is not critical
    }
  }

  drawRelocationMarkers() {
    if (!this.relocationTransitions.length) return;
    // Use Chart.js annotation plugin if available
    if (typeof Chart !== 'undefined' && Chart.plugins && Chart.plugins.get('annotation')) {
      const annotations = {};
      this.relocationTransitions.forEach((trans, idx) => {
        const ageIndex = this.cashflowChart.data.labels.indexOf(trans.age);
        if (ageIndex !== -1) {
          annotations[`relocation${idx}`] = {
            type: 'line',
            xMin: ageIndex,
            xMax: ageIndex,
            borderColor: '#ccc',
            borderWidth: 1,
            borderDash: [5, 5],
            label: {
              content: `Relocated from ${trans.fromCountry.toUpperCase()} to ${trans.toCountry.toUpperCase()}`,
              enabled: true,
              position: 'top',
              opacity: 0.5
            }
          };
        }
      });
      if (this.cashflowChart.options.plugins) {
        this.cashflowChart.options.plugins.annotation = { annotations };
        this.cashflowChart.update();
      }
      if (this.assetsChart.options.plugins) {
        this.assetsChart.options.plugins.annotation = { annotations };
        this.assetsChart.update();
      }
    }
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

    const numericKeys = keys.map(function(k) { return parseInt(k, 10); }).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });
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
      this.updateChartsRow(rowIndex, rowData, { skipCashflowUpdate: true, skipAssetsUpdate: true, skipCacheStore: true });
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
