/* Chart management functionality */

class ChartManager {

  constructor() {
    try {
      this.setupCharts();
    } catch (error) {
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
          { label: 'Inflows', borderColor: '#4CAF50', backgroundColor: '#4CAF50', fill: false, data: [], stack: 'nostack1', borderDash: [5,5], pointRadius: 0, order: 0 },
          { label: 'Outflows', borderColor: '#f44336', backgroundColor: '#f44336', fill: false, data: [], stack: 'nostack2', borderDash: [5,5], pointRadius: 0, order: 1 },
          { label: 'Salaries', borderColor: '#90A4AE', backgroundColor: '#CFD8DC', fill: true, data: [], stack: 'main', pointRadius: 0, order: 2 },
          { label: 'Rental', borderColor: '#A1887F', backgroundColor: '#D7CCC8', fill: true, data: [], stack: 'main', pointRadius: 0, order: 3 },
          { label: 'RSUs', borderColor: '#F06292', backgroundColor: '#F8BBD0', fill: true, data: [], stack: 'main', pointRadius: 0, order: 4 },
          { label: 'P.Pension', borderColor: '#4FC3F7', backgroundColor: '#B3E5FC', fill: true, data: [], stack: 'main', pointRadius: 0, order: 5 },
          { label: 'S.Pension', borderColor: '#64B5F6', backgroundColor: '#BBDEFB', fill: true, data: [], stack: 'main', pointRadius: 0, order: 6 },
          { label: 'D.Benefit', borderColor: '#9575CD', backgroundColor: '#E1BEE7', fill: true, data: [], stack: 'main', pointRadius: 0, order: 7 },
          { label: 'Tax-Free', borderColor: '#26A69A', backgroundColor: '#B2DFDB', fill: true, data: [], stack: 'main', pointRadius: 0, order: 8 },
        ];

        const dynamicIncomeDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], stack: 'main', pointRadius: 0, order: 9 + idx, _invKey: key };
        });

        const cashDataset = { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], stack: 'main', pointRadius: 0, order: 9 + dynamicIncomeDatasets.length + 1 };

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
        if (options.transactional) { try { this.cashflowChart.options.animation = false; } catch (_) {} }
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
        this.rebuildDatasetIndexMaps();
        this.cashflowChart.update();
        if (options.transactional) { try { this.cashflowChart.options.animation = prevAnimCF; } catch (_) {} }
      }

      // ------------ Assets Chart (stacked assets) ------------
      if (this.assetsChart) {
        // Fixed bottom part of the stack (datasetIndex ascending == bottom → top)
        const baseFixedWithoutCash = [
          { label: 'R.Estate', borderColor: '#90A4AE', backgroundColor: '#CFD8DC', fill: true, data: [], pointRadius: 0, order: 0 },
          { label: 'Pension', borderColor: '#64B5F6', backgroundColor: '#BBDEFB', fill: true, data: [], pointRadius: 0, order: 1 },
        ];

        // Dynamic investment types come after Pension
        const dynamicCapitalDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], pointRadius: 0, order: 2 + idx, _invKey: key };
        });

        // Cash should be the top-most dataset in the stack and last in the array
        const cashDataset = { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], pointRadius: 0, order: 2 + dynamicCapitalDatasets.length };

        const newAssetsDatasets = [...baseFixedWithoutCash, ...dynamicCapitalDatasets, cashDataset];
        if (options.preserveData) {
          for (let i = 0; i < newAssetsDatasets.length; i++) {
            const ds = newAssetsDatasets[i];
            const preserved = (ds._invKey && prev.assets.byKey[ds._invKey]) || prev.assets.byLabel[ds.label];
            if (preserved) ds.data = preserved.slice();
          }
        }
        const prevAnimAS = (this.assetsChart.options && this.assetsChart.options.animation);
        if (options.transactional) { try { this.assetsChart.options.animation = false; } catch (_) {} }
        this.assetsChart.data.datasets = newAssetsDatasets;
        this.assetsCapitalStartIndex = baseFixedWithoutCash.length;
        this.assetsCapitalKeys = invTypes.map(t => t.key);
        this.rebuildDatasetIndexMaps();
        this.assetsChart.update();
        if (options.transactional) { try { this.assetsChart.options.animation = prevAnimAS; } catch (_) {} }
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
        try {
          const invTypes = (this.cashflowIncomeKeys || []).map((k, i) => ({ key: k, label: (this.cashflowIncomeLabelByKey && this.cashflowIncomeLabelByKey[k]) || k }));
          if (typeof this.applyInvestmentTypes === 'function') {
            this.applyInvestmentTypes(invTypes, { preserveData: true, transactional: true });
          }
        } catch (_) {}
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

      // Update chart
      this.cashflowChart.update();
      // Rebuild index maps to reflect filtered datasets
      this.rebuildDatasetIndexMaps();
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
      try {
        const cashflowCtx2D = cashflowCtx.getContext('2d');
        if (!cashflowCtx2D) {
          throw new Error("Failed to get 2D context for cashflowGraph");
        }
      } catch (ctxError) {
        throw ctxError;
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
                  label += FormatUtils.formatCurrency(context.parsed.y);
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
              order: 0
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
              order: 1
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
              order: 2
            },
            {
              label: 'Rental',
              borderColor: '#A1887F',
              backgroundColor: '#D7CCC8',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 3
            },
            {
              label: 'RSUs',
              borderColor: '#F06292',
              backgroundColor: '#F8BBD0',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 4
            },
            {
              label: 'P.Pension',
              borderColor: '#4FC3F7',
              backgroundColor: '#B3E5FC',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 5
            },
            {
              label: 'S.Pension',
              borderColor: '#64B5F6',
              backgroundColor: '#BBDEFB',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 6
            },
            {
              label: 'D.Benefit',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 7
            },
            {
              label: 'Tax-Free',
              borderColor: '#26A69A',
              backgroundColor: '#B2DFDB',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 8
            },
            {
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 10
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
              order: 0
            },
            {
              label: 'Pension',
              borderColor: '#64B5F6',
              backgroundColor: '#BBDEFB',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 1
            },
            {
              label: 'Shares',
              borderColor: '#81C784',
              backgroundColor: '#C8E6C9',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 2
            },
            {
              label: 'Index Funds',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 3
            },
            {
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 4
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

  updateChartsRow(rowIndex, data) {
    try {
      if (!this.chartsInitialized) {
        return;
      }
      
      const i = rowIndex-1;
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

      this.cashflowChart.update();

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
      this.assetsChart.update();
    } catch (error) {
      // Silently fail as this is not critical
    }
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

