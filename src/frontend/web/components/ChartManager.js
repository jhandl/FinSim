/* Chart management functionality */

class ChartManager {

  constructor() {
      this.setupCharts();
  }

  setupCharts() {
    // Setup Cashflow Chart
    const cashflowCtx = document.getElementById('cashflowGraph').getContext('2d');
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

    // Add common tooltip configuration
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
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
      scales: commonScaleOptions
    };

    this.cashflowChart = new Chart(cashflowCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Net Income',
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
            label: 'Expenses',
            borderColor: '#f44336',
            backgroundColor: '#f44336',
            fill: false,
            data: [],
            stack: 'nostack2',
            borderDash: [5, 5],
            pointRadius: 0,
            order: 1
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
          },
          {
            label: 'Trusts',
            borderColor: '#81C784',
            backgroundColor: '#C8E6C9',
            fill: true,
            data: [],
            stack: 'main',
            pointRadius: 0,
            order: 8
          },
          {
            label: 'ETFs',
            borderColor: '#9575CD',
            backgroundColor: '#E1BEE7',
            fill: true,
            data: [],
            stack: 'main',
            pointRadius: 0,
            order: 7
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
            label: 'Salaries',
            borderColor: '#90A4AE',
            backgroundColor: '#CFD8DC',
            fill: true,
            data: [],
            stack: 'main',
            pointRadius: 0,
            order: 2
          }
        ]
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          title: {
            display: true,
            text: 'Cashflow',
            font: {
              size: 20
            }
          },
          legend: {
            position: 'right'
          }
        }
      }
    });

    // Setup Assets Chart
    const assetsCtx = document.getElementById('assetsGraph').getContext('2d');
    this.assetsChart = new Chart(assetsCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'ETFs',
            borderColor: '#9575CD',
            backgroundColor: '#E1BEE7',
            fill: true,
            data: [],
            pointRadius: 0,
            order: 4
          },
          {
            label: 'Trusts',
            borderColor: '#81C784',
            backgroundColor: '#C8E6C9',
            fill: true,
            data: [],
            pointRadius: 0,
            order: 3
          },
          {
            label: 'Pension fund',
            borderColor: '#64B5F6',
            backgroundColor: '#BBDEFB',
            fill: true,
            data: [],
            pointRadius: 0,
            order: 2
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
            label: 'R.Estate',
            borderColor: '#90A4AE',
            backgroundColor: '#CFD8DC',
            fill: true,
            data: [],
            pointRadius: 0,
            order: 0
          }
        ]
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          title: {
            display: true,
            text: 'Assets',
            font: {
              size: 20
            }
          },
          legend: {
            position: 'right'
          }
        }
      }
    });
  }

  updateChartsRow(rowIndex, data) {
    const i = rowIndex-1;
    // Update Cashflow Chart
    this.cashflowChart.data.labels[i] = data.Age;
    this.cashflowChart.data.datasets[0].data[i] = data.NetIncome;
    this.cashflowChart.data.datasets[1].data[i] = data.Expenses;
    this.cashflowChart.data.datasets[2].data[i] = data.IncomeCash;
    this.cashflowChart.data.datasets[3].data[i] = data.IncomeTrustRent;
    this.cashflowChart.data.datasets[4].data[i] = data.IncomeEtfRent;
    this.cashflowChart.data.datasets[5].data[i] = data.IncomeStatePension;
    this.cashflowChart.data.datasets[6].data[i] = data.IncomePrivatePension;
    this.cashflowChart.data.datasets[7].data[i] = data.IncomeRSUs;
    this.cashflowChart.data.datasets[8].data[i] = data.IncomeRentals;
    this.cashflowChart.data.datasets[9].data[i] = data.IncomeSalaries;

    this.cashflowChart.update();

    // Update Assets Chart
    this.assetsChart.data.labels[i] = data.Age;
    this.assetsChart.data.datasets[0].data[i] = data.EtfCapital;
    this.assetsChart.data.datasets[1].data[i] = data.TrustCapital;
    this.assetsChart.data.datasets[2].data[i] = data.PensionFund;
    this.assetsChart.data.datasets[3].data[i] = data.Cash;
    this.assetsChart.data.datasets[4].data[i] = data.RealEstateCapital;
    this.assetsChart.update();
  }

  clearExtraChartRows(maxAge) {
    if (this.cashflowChart) {
      this.cashflowChart.data.labels = this.cashflowChart.data.labels.filter((label, index) => {
        return label <= maxAge;
      });
      this.cashflowChart.data.datasets.forEach(dataset => {
        dataset.data = dataset.data.filter((_, index) => {
          return this.cashflowChart.data.labels[index] !== undefined;
        });
      });
      this.cashflowChart.update();
    }
    if (this.assetsChart) {
      this.assetsChart.data.labels = this.assetsChart.data.labels.filter((label, index) => {
        return label <= maxAge;
      });
      this.assetsChart.data.datasets.forEach(dataset => {
        dataset.data = dataset.data.filter((_, index) => {
          return this.assetsChart.data.labels[index] !== undefined;
        });
      });
      this.assetsChart.update();
    }
  }

} 