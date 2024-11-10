/* import { WebUI } from '/src/WebUI.js';

// Make WebUI available globally for Simulator.js
window.WebUI = WebUI;
*/

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
            saveButton.addEventListener('click', () => this.saveToFile());
        }

        // Load button
        const loadButton = document.getElementById('loadSimulationBtn');
        const fileInput = document.getElementById('loadSimulation');
        if (loadButton && fileInput) {
            loadButton.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.loadFromFile(e.target.files[0]));
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
        
        const eventTypes = [
            'NOP:No Operation',
            'RI:Rental Income',
            'SI:Salary Income',
            'SInp:Salary (No Pension)',
            'UI:RSU Income',
            'DBI:Defined Benefit Income',
            'FI:Tax-free Income',
            'E:Expense',
            'R:Real Estate',
            'M:Mortgage',
            'SM:Stock Market'
        ];

        row.innerHTML = `
            <td>
                <select class="event-type">
                    ${eventTypes.map(type => {
                        const [value, label] = type.split(':');
                        return `<option value="${value}">${label}</option>`;
                    }).join('')}
                </select>
            </td>
            <td><input type="text" class="event-name" placeholder="Event name"></td>
            <td><input type="number" class="event-amount" step="1000"></td>
            <td><input type="number" class="event-from-age" min="0" max="100"></td>
            <td><input type="number" class="event-to-age" min="0" max="100"></td>
            <td><input type="number" class="event-rate" step="0.001"></td>
            <td><input type="number" class="event-extra" step="0.01"></td>
            <td>
                <button class="delete-event" title="Delete event">×</button>
            </td>
        `;

        tbody.appendChild(row);
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

    async saveToFile() {
        try {
            // Collect all parameters
            const parameters = {
                StartingAge: this.ui.getValue('StartingAge'),
                TargetAge: this.ui.getValue('TargetAge'),
                InitialSavings: this.ui.getValue('InitialSavings'),
                InitialPension: this.ui.getValue('InitialPension'),
                InitialETFs: this.ui.getValue('InitialETFs'),
                InitialTrusts: this.ui.getValue('InitialTrusts'),
                RetirementAge: this.ui.getValue('RetirementAge'),
                EmergencyStash: this.ui.getValue('EmergencyStash'),
                EtfAllocation: this.ui.getValue('EtfAllocation'),
                TrustAllocation: this.ui.getValue('TrustAllocation'),
                PensionContributionPercentage: this.ui.getValue('PensionContributionPercentage'),
                PensionContributionCapped: this.ui.getValue('PensionContributionCapped'),
                PensionGrowthRate: this.ui.getValue('PensionGrowthRate'),
                PensionGrowthStdDev: this.ui.getValue('PensionGrowthStdDev'),
                EtfGrowthRate: this.ui.getValue('EtfGrowthRate'),
                EtfGrowthStdDev: this.ui.getValue('EtfGrowthStdDev'),
                TrustGrowthRate: this.ui.getValue('TrustGrowthRate'),
                TrustGrowthStdDev: this.ui.getValue('TrustGrowthStdDev'),
                Inflation: this.ui.getValue('Inflation'),
                MarriageYear: this.ui.getValue('MarriageYear'),
                YoungestChildBorn: this.ui.getValue('YoungestChildBorn'),
                OldestChildBorn: this.ui.getValue('OldestChildBorn'),
                PersonalTaxCredit: this.ui.getValue('PersonalTaxCredit'),
                StatePensionWeekly: this.ui.getValue('StatePensionWeekly')
            };

            // Collect events table data
            const events = [];
            const tbody = document.querySelector('#Events tbody');
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(row => {
                    events.push({
                        type: row.querySelector('.event-type').value,
                        name: row.querySelector('.event-name').value,
                        amount: row.querySelector('.event-amount').value,
                        fromAge: row.querySelector('.event-from-age').value,
                        toAge: row.querySelector('.event-to-age').value,
                        rate: row.querySelector('.event-rate').value,
                        extra: row.querySelector('.event-extra').value
                    });
                });
            }

            // Create CSV content
            let csvContent = "# Ireland Financial Simulator v1.26 Save File\n";
            csvContent += "# Parameters\n";
            for (const [key, value] of Object.entries(parameters)) {
                csvContent += `${key},${value}\n`;
            }
            
            csvContent += "\n# Events\n";
            csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra\n";
            events.forEach(event => {
                csvContent += `${event.type},${event.name},${event.amount},${event.fromAge},${event.toAge},${event.rate},${event.extra}\n`;
            });

            // Create file handle using the File System Access API
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'simulation.csv',
                    types: [{
                        description: 'CSV Files',
                        accept: {
                            'text/csv': ['.csv'],
                        },
                    }],
                });
                
                // Create a FileSystemWritableFileStream to write to
                const writable = await handle.createWritable();
                
                // Write the contents
                await writable.write(csvContent);
                
                // Close the file and write the contents to disk
                await writable.close();
            } catch (err) {
                // User cancelled or browser doesn't support File System Access API
                // Fall back to the old method
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'simulation.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            alert('Error saving file: ' + error.message);
        }
    }

    async loadFromFile(file) {
        if (!file) return;

        try {
            const content = await file.text();
            const lines = content.split('\n').map(line => line.trim());

            // Verify file format
            if (!lines[0].includes('Ireland Financial Simulator')) {
                throw new Error('Invalid file format');
            }

            let section = '';
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('#')) {
                    section = line;
                    continue;
                }
                if (line === '') continue;

                if (section.includes('Parameters')) {
                    const [key, value] = line.split(',');
                    try {
                        // Special handling for PensionContributionCapped which is a select
                        if (key === 'PensionContributionCapped') {
                            const select = document.getElementById(key);
                            if (select) {
                                select.value = value;
                            }
                        } else {
                            this.ui.setValue(key, value);
                        }
                    } catch (e) {
                        // Skip if parameter doesn't exist
                    }
                } else if (section.includes('Events')) {
                    if (line.startsWith('Type,')) continue; // Skip header
                    const [type, name, amount, fromAge, toAge, rate, extra] = line.split(',');
                    if (type && amount) {
                        const tbody = document.querySelector('#Events tbody');
                        if (tbody) {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>
                                    <select class="event-type">
                                        ${this.getEventTypeOptions(type)}
                                    </select>
                                </td>
                                <td><input type="text" class="event-name" value="${name}"></td>
                                <td><input type="number" class="event-amount" step="1000" value="${amount}"></td>
                                <td><input type="number" class="event-from-age" min="0" max="100" value="${fromAge}"></td>
                                <td><input type="number" class="event-to-age" min="0" max="100" value="${toAge}"></td>
                                <td><input type="number" class="event-rate" step="0.001" value="${rate}"></td>
                                <td><input type="number" class="event-extra" step="0.01" value="${extra}"></td>
                                <td>
                                    <button class="delete-event" title="Delete event">×</button>
                                </td>
                            `;
                            tbody.appendChild(row);
                        }
                    }
                }
            }
        } catch (error) {
            alert('Error loading file: Please make sure this is a valid simulation save file.');
            return;
        }
    }

    getEventTypeOptions(selectedType = '') {
        const eventTypes = [
            'NOP:No Operation',
            'RI:Rental Income',
            'SI:Salary Income',
            'SInp:Salary (No Pension)',
            'UI:RSU Income',
            'DBI:Defined Benefit Income',
            'FI:Tax-free Income',
            'E:Expense',
            'R:Real Estate',
            'M:Mortgage',
            'SM:Stock Market'
        ];

        return eventTypes.map(type => {
            const [value, label] = type.split(':');
            return `<option value="${value}" ${value === selectedType ? 'selected' : ''}>${label}</option>`;
        }).join('');
    }
}

// Initialize the simulator interface when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.simulatorInterface = new SimulatorInterface();
}); 