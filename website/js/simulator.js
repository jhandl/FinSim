/* No need to import from other files as everything is loaded together in the html file */


class SimulatorInterface {
    
    constructor() {
        try {
            this.ui = new WebUI();
            this.setupEventListeners();
            this.setupCharts();
        } catch (error) {
            console.error('Error in constructor:', error);
        }
    }

    setupEventListeners() {
        // Run simulation button
        const runButton = document.getElementById('runSimulation');
        if (runButton) {
            runButton.addEventListener('click', () => {
                try {
                    // Call the global run() function from Simulator.js
                    run();
                    
                    // Update charts with new data after simulation
                } catch (error) {
                    console.error('Simulation failed:', error);
                    this.ui.setStatus('Simulation failed: ' + error.message, this.ui.STATUS_COLORS.ERROR);
                }
            });
        }

        // Add event row button
        const addEventButton = document.getElementById('addEventRow');
        if (addEventButton) {
            addEventButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.addEventRow();
            });
        }

        // Event delegation for delete buttons
        const eventsTable = document.getElementById('Events');
        if (eventsTable) {
            eventsTable.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-event')) {
                    const row = e.target.closest('tr');
                    if (row) {
                        const tbody = row.parentElement;
                        row.remove();
                    }
                }
            });
        }

        // Setup edit callbacks for all inputs
        this.ui.onEdit(this.handleEdit.bind(this));

        // Save button
        const saveButton = document.getElementById('saveSimulation');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.ui.saveToFile());
        }

        // Load button
        const loadButton = document.getElementById('loadSimulationBtn');
        const fileInput = document.getElementById('loadSimulation');
        if (loadButton && fileInput) {
            loadButton.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.ui.loadFromFile(e.target.files[0]));
        }

        // Setup drag and drop for priorities
        this.setupPriorityDragAndDrop();
    }

    setupPriorityDragAndDrop() {
        const container = document.querySelector('.priorities-container');
        if (!container) return;

        const items = container.querySelectorAll('.priority-item');

        items.forEach(item => {
            item.addEventListener('dragstart', e => {
                item.classList.add('dragging');
                e.dataTransfer.setData('text/plain', item.dataset.priorityId);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', e => {
                e.preventDefault();
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    if (e.clientY < midpoint) {
                        container.insertBefore(dragging, item);
                    } else {
                        container.insertBefore(dragging, item.nextSibling);
                    }
                    this.updatePriorityValues();
                }
            });

            item.addEventListener('dragenter', e => {
                e.preventDefault();
                item.classList.add('drag-over');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', e => {
                e.preventDefault();
                item.classList.remove('drag-over');
            });
        });
    }

    updatePriorityValues() {
        const items = document.querySelectorAll('.priority-item');
        items.forEach((item, index) => {
            const input = item.querySelector('input');
            if (input) {
                input.value = index + 1;
                // Add animation class
                item.classList.add('inserted');
                setTimeout(() => item.classList.remove('inserted'), 300);
            }
        });
    }

    addEventRow() {
        const tbody = document.querySelector('#Events tbody');
        
        if (!tbody) return;

        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>
                <select class="event-type">
                    ${this.ui.getEventTypeOptions()}
                </select>
            </td>
            <td><input type="text" class="event-name"></td>
            <td><input type="number" class="event-amount currency" inputmode="numeric" pattern="[0-9]*" step="1000"></td>
            <td><input type="number" class="event-from-age" min="0" max="100"></td>
            <td><input type="number" class="event-to-age" min="0" max="100"></td>
            <td><div class="percentage-container"><input type="number" class="event-rate percentage" inputmode="numeric" pattern="[0-9]*"></div></td>
            <td><input type="number" class="event-extra" step="0.01"></td>
            <td>
                <button class="delete-event" title="Delete event">×</button>
            </td>
        `;

        tbody.appendChild(row);
        
        // Setup currency formatting for the new row
        this.ui.setupCurrencyInputs();
        this.ui.setupPercentageInputs();
    }

    setupCharts() {
        // Setup Cashflow Chart
        const cashflowCtx = document.getElementById('cashflowGraph').getContext('2d');
        const commonScaleOptions = {
            y: {
                stacked: true
            },
            x: {
                ticks: {
                    callback: function(value, index, values) {
                        return this.chart.data.labels[index];
                    }
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
                                label += new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0
                                }).format(context.parsed.y);
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
            options: commonOptions
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
            options: commonOptions
        });
    }

    handleEdit(event) {
        // Handle input changes here
    }

    updateChartsRow(rowIndex, data) {
        const i = rowIndex-1;
        // Update Cashflow Chart
        this.cashflowChart.data.labels[i] = data.Year;
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
        this.assetsChart.data.labels[i] = data.Year;
        this.assetsChart.data.datasets[0].data[i] = data.EtfCapital;
        this.assetsChart.data.datasets[1].data[i] = data.TrustCapital;
        this.assetsChart.data.datasets[2].data[i] = data.PensionFund;
        this.assetsChart.data.datasets[3].data[i] = data.Cash;
        this.assetsChart.data.datasets[4].data[i] = data.RealEstateCapital;
        this.assetsChart.update();
    }
}

// Initialize the simulator interface when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.simulatorInterface = new SimulatorInterface();
}); 