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
      // Cashflow chart: datasets[7] = Index Funds, datasets[8] = Shares
      if (this.cashflowChart && this.cashflowChart.data && this.cashflowChart.data.datasets) {
        if (this.cashflowChart.data.datasets[7]) {
          this.cashflowChart.data.datasets[7].label = fundsLabel || this.cashflowChart.data.datasets[7].label;
        }
        if (this.cashflowChart.data.datasets[8]) {
          this.cashflowChart.data.datasets[8].label = sharesLabel || this.cashflowChart.data.datasets[8].label;
        }
        this.cashflowChart.update();
      }

      // Assets chart: datasets[4] = Index Funds, datasets[3] = Shares
      if (this.assetsChart && this.assetsChart.data && this.assetsChart.data.datasets) {
        if (this.assetsChart.data.datasets[4]) {
          this.assetsChart.data.datasets[4].label = fundsLabel || this.assetsChart.data.datasets[4].label;
        }
        if (this.assetsChart.data.datasets[3]) {
          this.assetsChart.data.datasets[3].label = sharesLabel || this.assetsChart.data.datasets[3].label;
        }
        this.assetsChart.update();
      }
    } catch (_) {
      // Swallow errors silently to avoid breaking UI
    }
  }

  // Rebuild chart datasets to reflect configured investment types (dynamic N types)
  applyInvestmentTypes(types) {
    try {
      if (!this.chartsInitialized) return;
      const invTypes = Array.isArray(types) ? types : [];

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
        ];

        const dynamicIncomeDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], stack: 'main', pointRadius: 0, order: 7 + idx };
        });

        const cashDataset = { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], stack: 'main', pointRadius: 0, order: 7 + dynamicIncomeDatasets.length + 1 };

        this.cashflowChart.data.datasets = [...baseDatasets, ...dynamicIncomeDatasets, cashDataset];
        this.cashflowIncomeStartIndex = baseDatasets.length;
        this.cashflowIncomeKeys = invTypes.map(t => t.key);
        this.cashflowCashDatasetIndex = baseDatasets.length + dynamicIncomeDatasets.length;
        this.cashflowChart.update();
      }

      // ------------ Assets Chart (stacked assets) ------------
      if (this.assetsChart) {
        const baseDatasets = [
          { label: 'R.Estate', borderColor: '#90A4AE', backgroundColor: '#CFD8DC', fill: true, data: [], pointRadius: 0, order: 0 },
          { label: 'Cash', borderColor: '#FFB74D', backgroundColor: '#FFE0B2', fill: true, data: [], pointRadius: 0, order: 1 },
          { label: 'Pension', borderColor: '#64B5F6', backgroundColor: '#BBDEFB', fill: true, data: [], pointRadius: 0, order: 2 },
        ];

        const dynamicCapitalDatasets = invTypes.map((t, idx) => {
          const key = t && t.key ? t.key : `asset${idx}`;
          const label = t && t.label ? t.label : key;
          const { border, background } = getTypeColors(key, idx);
          return { label, borderColor: border, backgroundColor: background, fill: true, data: [], pointRadius: 0, order: 3 + idx };
        });

        this.assetsChart.data.datasets = [...baseDatasets, ...dynamicCapitalDatasets];
        this.assetsCapitalStartIndex = baseDatasets.length;
        this.assetsCapitalKeys = invTypes.map(t => t.key);
        this.assetsChart.update();
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
              label: 'Index Funds',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
              fill: true,
              data: [],
              stack: 'main',
              pointRadius: 0,
              order: 7
            },
            {
              label: 'Shares',
              borderColor: '#81C784',
              backgroundColor: '#C8E6C9',
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
              order: 9
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
                // Keep Inflows and Outflows at the top, reverse the rest
                sort: (a, b) => {
                  const fixed = ['Inflows', 'Outflows'];
                  const aFixed = fixed.includes(a.text);
                  const bFixed = fixed.includes(b.text);
                  if (aFixed && bFixed) {
                    return fixed.indexOf(a.text) - fixed.indexOf(b.text);
                  }
                  if (aFixed) return -1;
                  if (bFixed) return 1;
                  // Reverse remaining items based on dataset order
                  return b.datasetIndex - a.datasetIndex;
                }
              }
            }
          }
        }
      });
      // Default dynamic mapping for legacy two-types (index funds, shares, then cash)
      this.cashflowIncomeStartIndex = 7;
      this.cashflowIncomeKeys = ['indexFunds', 'shares'];
      this.cashflowCashDatasetIndex = 9;
      
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
              label: 'Cash',
              borderColor: '#FFB74D',
              backgroundColor: '#FFE0B2',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 1
            },
            {
              label: 'Pension',
              borderColor: '#64B5F6',
              backgroundColor: '#BBDEFB',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 2
            },
            {
              label: 'Shares',
              borderColor: '#81C784',
              backgroundColor: '#C8E6C9',
              fill: true,
              data: [],
              pointRadius: 0,
              order: 3
            },
            {
              label: 'Index Funds',
              borderColor: '#9575CD',
              backgroundColor: '#E1BEE7',
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
                // Reverse legend for assets chart so it matches visual stacking
                sort: (a, b) => b.datasetIndex - a.datasetIndex
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

  updateChartsRow(rowIndex, data) {
    try {
      if (!this.chartsInitialized) {
        return;
      }
      
      const i = rowIndex-1;
      // Update Cashflow Chart
      this.cashflowChart.data.labels[i] = data.Age;
      this.cashflowChart.data.datasets[0].data[i] = data.NetIncome;
      this.cashflowChart.data.datasets[1].data[i] = data.Expenses;
      // Fixed incomes
      this.cashflowChart.data.datasets[2].data[i] = data.IncomeSalaries;
      this.cashflowChart.data.datasets[3].data[i] = data.IncomeRentals;
      this.cashflowChart.data.datasets[4].data[i] = data.IncomeRSUs;
      this.cashflowChart.data.datasets[5].data[i] = data.IncomePrivatePension;
      this.cashflowChart.data.datasets[6].data[i] = data.IncomeStatePension;
      // Dynamic incomes per investment type (fallback to legacy fields if dynamic missing)
      const start = this.cashflowIncomeStartIndex || 7;
      const keys = this.cashflowIncomeKeys || ['indexFunds', 'shares'];
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const val = (data['Income__' + key] !== undefined) ? data['Income__' + key]
                    : (key === 'indexFunds' ? data.IncomeFundsRent : key === 'shares' ? data.IncomeSharesRent : 0);
        if (this.cashflowChart.data.datasets[start + k]) {
          this.cashflowChart.data.datasets[start + k].data[i] = val;
        }
      }
      const cashIdx = (this.cashflowCashDatasetIndex !== undefined) ? this.cashflowCashDatasetIndex : (start + keys.length);
      if (this.cashflowChart.data.datasets[cashIdx]) {
        this.cashflowChart.data.datasets[cashIdx].data[i] = data.IncomeCash;
      }

      this.cashflowChart.update();

      // Update Assets Chart – adjusted to new dataset indices
      this.assetsChart.data.labels[i] = data.Age;
      this.assetsChart.data.datasets[0].data[i] = data.RealEstateCapital;
      this.assetsChart.data.datasets[1].data[i] = data.Cash;
      this.assetsChart.data.datasets[2].data[i] = data.PensionFund;
      // Dynamic capitals per investment type (fallback to legacy fields if dynamic missing)
      const aStart = this.assetsCapitalStartIndex || 3;
      const aKeys = this.assetsCapitalKeys || ['shares', 'indexFunds'];
      for (let k = 0; k < aKeys.length; k++) {
        const key = aKeys[k];
        const val = (data['Capital__' + key] !== undefined) ? data['Capital__' + key]
                    : (key === 'shares' ? data.SharesCapital : key === 'indexFunds' ? data.FundsCapital : 0);
        if (this.assetsChart.data.datasets[aStart + k]) {
          this.assetsChart.data.datasets[aStart + k].data[i] = val;
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
