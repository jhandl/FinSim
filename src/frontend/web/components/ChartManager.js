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
      
      const commonScaleOptions = {
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
      const legendLabelsConfig = {
        padding: 14,
        boxWidth: isSmallScreen ? 15 : 30,
        font: {
          size: isSmallScreen ? 12 : 13
        }
      };
      
      // Add common tooltip configuration
      const commonOptions = {
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
                  // Check if FormatUtils is available
                  if (typeof FormatUtils !== 'undefined' && FormatUtils.formatCurrency) {
                    label += FormatUtils.formatCurrency(context.parsed.y);
                  } else {
                    // Fallback if FormatUtils isn't available
                    label += new Intl.NumberFormat('en-IE', {
                      style: 'currency',
                      currency: 'EUR'
                    }).format(context.parsed.y);
                  }
                }
                return label;
              }
            }
          }
        },
        scales: commonScaleOptions
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
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: {
              display: false  // Disabled since we now use HTML titles with info icons
            },
            legend: {
              position: 'right',
              onClick: null,
              labels: {
                ...legendLabelsConfig,
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
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: {
              display: false  // Disabled since we now use HTML titles with info icons
            },
            legend: {
              position: 'right',
              onClick: null,
              labels: {
                ...legendLabelsConfig,
                // Reverse legend for assets chart so it matches visual stacking
                sort: (a, b) => b.datasetIndex - a.datasetIndex
              }
            }
          }
        }
      });
      
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
      // Updated mapping to match re-ordered datasets
      this.cashflowChart.data.datasets[2].data[i] = data.IncomeSalaries;
      this.cashflowChart.data.datasets[3].data[i] = data.IncomeRentals;
      this.cashflowChart.data.datasets[4].data[i] = data.IncomeRSUs;
      this.cashflowChart.data.datasets[5].data[i] = data.IncomePrivatePension;
      this.cashflowChart.data.datasets[6].data[i] = data.IncomeStatePension;
      this.cashflowChart.data.datasets[7].data[i] = data.IncomeFundsRent;
      this.cashflowChart.data.datasets[8].data[i] = data.IncomeSharesRent;
      this.cashflowChart.data.datasets[9].data[i] = data.IncomeCash;

      this.cashflowChart.update();

      // Update Assets Chart – adjusted to new dataset indices
      this.assetsChart.data.labels[i] = data.Age;
      this.assetsChart.data.datasets[0].data[i] = data.RealEstateCapital;
      this.assetsChart.data.datasets[1].data[i] = data.Cash;
      this.assetsChart.data.datasets[2].data[i] = data.PensionFund;
      this.assetsChart.data.datasets[3].data[i] = data.SharesCapital;
      this.assetsChart.data.datasets[4].data[i] = data.FundsCapital;
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