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
                    this.updateCharts(dataSheet);
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
            <td><input type="text" class="event-name" placeholder="Event name"></td>
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
        this.cashflowChart = new Chart(cashflowCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Net Income',
                        borderColor: '#4CAF50',
                        data: []
                    },
                    {
                        label: 'Expenses',
                        borderColor: '#f44336',
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                title: {
                    display: true,
                    text: 'Cashflow Over Time'
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
                        label: 'Pension Fund',
                        borderColor: '#2196F3',
                        fill: true,
                        data: []
                    },
                    {
                        label: 'ETF Investments',
                        borderColor: '#9C27B0',
                        fill: true,
                        data: []
                    },
                    {
                        label: 'Trust Investments',
                        borderColor: '#FF9800',
                        fill: true,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                title: {
                    display: true,
                    text: 'Assets Over Time'
                }
            }
        });
    }

    handleEdit(event) {
        // Handle input changes here
    }

    updateCharts(data) {
        // Update charts with new simulation data
        const years = data.map(d => d.year);
        
        // Update Cashflow Chart
        this.cashflowChart.data.labels = years;
        this.cashflowChart.data.datasets[0].data = data.map(d => d.netIncome);
        this.cashflowChart.data.datasets[1].data = data.map(d => d.expenses);
        this.cashflowChart.update();

        // Update Assets Chart
        this.assetsChart.data.labels = years;
        this.assetsChart.data.datasets[0].data = data.map(d => d.pensionFund);
        this.assetsChart.data.datasets[1].data = data.map(d => d.etfCapital);
        this.assetsChart.data.datasets[2].data = data.map(d => d.trustCapital);
        this.assetsChart.update();
    }
}

// Initialize the simulator interface when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.simulatorInterface = new SimulatorInterface();
}); 