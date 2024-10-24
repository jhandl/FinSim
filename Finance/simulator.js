const fs = require('fs');
const path = require('path');

// Step 2: Define Investment Instruments
const financialParameters = {
  "indexFunds": { "expectedReturn": 0.07, "volatility": 0.1 },
  "etfs": { "expectedReturn": 0.08, "volatility": 0.15 },
  "investmentTrusts": { "expectedReturn": 0.06, "volatility": 0.12 },
  "individualShares": { "expectedReturn": 0.1, "volatility": 0.25 },
  "bonds": { "expectedReturn": 0.04, "volatility": 0.05 },
  "pension": { "expectedReturn": 0.05, "volatility": 0.02 },
  "inflation": { "rate": 0.02, "volatility": 0.005 } // Inflation parameters
};

// Step 3: Define Tax System Class
class TaxSystem {
  constructor(financialParameters) {
    this.taxRules = {};
    this.financialParameters = financialParameters;
  }

  async loadCountryRules(country) {
    if (!this.taxRules[country]) {
      try {
        const response = await fetch(`taxRules/${country}.json`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.taxRules[country] = await response.json();
      } catch (error) {
        console.error(`Error loading tax rules for ${country}:`, error);
        return false;
      }
    }
    return true;
  }

  calculateIncomeTaxes(income, country) {
    if (!this.loadCountryRules(country)) return [];

    const incomeTaxes = this.taxRules[country].incomeTaxes;
    if (!incomeTaxes) return [];

    return incomeTaxes.map(tax => {
      let amount = 0;
      if (tax.type === "flatRate") {
        amount = income > tax.threshold ? (income - tax.threshold) * tax.rate : 0;
      } else if (tax.type === "bracket") {
        for (const bracket of tax.brackets) {
          if (income > bracket.from) {
            const taxableAmount = bracket.to ? Math.min(income, bracket.to) - bracket.from : income - bracket.from;
            amount += taxableAmount * bracket.rate;
          }
        }
      }
      return { name: tax.name, amount };
    });
  }

  calculateWealthTax(wealth, country) {
    if (!this.loadCountryRules(country)) return 0;

    const wealthTaxRule = this.taxRules[country].personalAssetsTax || this.taxRules[country].wealthTax;
    if (!wealthTaxRule) return 0;

    if (wealthTaxRule.type === 'bracket') {
      let tax = 0;
      for (const bracket of wealthTaxRule.brackets) {
        if (wealth > bracket.from) {
          const taxableAmount = Math.min(wealth - bracket.from, (bracket.to || Infinity) - bracket.from);
          tax += taxableAmount * bracket.rate;
        }
        if (bracket.to && wealth <= bracket.to) break;
      }
      return tax;
    } else {
      // Existing flat rate calculation
      return wealth > wealthTaxRule.threshold ? (wealth - wealthTaxRule.threshold) * wealthTaxRule.rate : 0;
    }
  }

  calculatePensionContribution(income, country, age) {
    if (!this.loadCountryRules(country)) return 0;

    const pensionRule = this.taxRules[country].pensionContribution;
    
    switch (pensionRule.type) {
      case "fixedRate":
        return income * (pensionRule.employeeRate + pensionRule.employerRate);
      
      case "ageBasedPercentage":
        const applicableRate = pensionRule.rates.find(r => age <= r.maxAge).rate;
        const uncappedContribution = income * applicableRate;
        return Math.min(uncappedContribution, pensionRule.annualCap);
      
      // Add more cases for other types of pension rules
      
      default:
        console.warn(`Unknown pension rule type for ${country}`);
        return 0;
    }
  }

  calculateCapitalGainsTax(investments, country) {
    if (!this.loadCountryRules(country)) return 0;

    const capitalGainsRule = this.taxRules[country].capitalGainsTax;
    let totalCapitalGainsTax = 0;

    investments.forEach(investment => {
      const { type, gains } = investment;
      const taxRate = capitalGainsRule[type] || 0;
      totalCapitalGainsTax += gains * taxRate;
    });

    return totalCapitalGainsTax;
  }

  calculateInvestmentReturns(investments) {
    investments.forEach(investment => {
      const { type, amount } = investment;
      const { expectedReturn, volatility } = this.financialParameters[type];
      const randomFactor = (Math.random() * 2 - 1) * volatility; // Simulating random volatility
      const nominalReturn = expectedReturn + randomFactor;
      investment.gains = amount * nominalReturn;
    });
  }

  calculatePensionReturns(pensionPot) {
    const { expectedReturn, volatility } = this.FinancialParameters.pension;
    const randomFactor = (Math.random() * 2 - 1) * volatility; // Simulating random volatility
    const nominalReturn = expectedReturn + randomFactor;
    return pensionPot * nominalReturn;
  }

  calculateExpenses(expenses) {
    const { rate, volatility } = this.FinancialParameters.inflation;
    const randomFactor = (Math.random() * 2 - 1) * volatility; // Simulating inflation volatility
    const adjustedInflationRate = rate + randomFactor;
    return expenses * (1 + adjustedInflationRate);
  }

  calculatePensionIncome(pensionPot, rate) {
    return pensionPot * rate;
  }

  async simulateScenario(profile) {
    const results = [];
    let remainingWealth = profile.initialWealth;
    let investments = profile.initialInvestments.map(inv => ({ ...inv }));
    let pensionPot = profile.initialPensionPot;
    const pensionWithdrawalRate = 0.04; // Withdrawal rate after retirement
    let isRetired = false;
    let previousIncome = profile.lifeEvents[0] ? profile.lifeEvents[0].income : 0;
    let previousExpenses = profile.lifeEvents[0] ? profile.lifeEvents[0].expenses : 0;
    let country = profile.initialCountry;
    let birthYear = profile.birthYear;

    for (let year = new Date().getFullYear(); year <= profile.targetYear; year++) {
      const lifeEvent = profile.lifeEvents.find(event => event.year === year);
      let income = lifeEvent && lifeEvent.income !== undefined ? lifeEvent.income : previousIncome;
      previousIncome = income;
      const expenses = lifeEvent && lifeEvent.expenses !== undefined ? lifeEvent.expenses : this.calculateExpenses(previousExpenses);
      previousExpenses = expenses;

      // Check for life events
      if (lifeEvent) {
        if (lifeEvent.event === 'retire') {
          isRetired = true;
        }

        if (lifeEvent.event === 'move') {
          country = lifeEvent.newCountry;
        }
      }

      // Ensure country rules are loaded before calculations
      if (!(await this.loadCountryRules(country))) {
        console.error(`Failed to load tax rules for ${country}. Skipping year ${year}.`);
        continue;
      }

      // Calculate yearly investment returns
      this.calculateInvestmentReturns(investments);

      // Update pension pot with returns
      pensionPot += this.calculatePensionReturns(pensionPot);
      const pensionContribution = this.calculatePensionContribution(income, country, year - birthYear);
      pensionPot += pensionContribution;

      let pensionIncome = 0;
      if (isRetired) {
        pensionIncome = this.calculatePensionIncome(pensionPot, pensionWithdrawalRate);
      }

      const incomeTaxes = this.calculateIncomeTaxes(income + pensionIncome, country);
      const wealthTax = this.calculateWealthTax(remainingWealth, country);
      const capitalGainsTax = this.calculateCapitalGainsTax(investments, country);
      
      const totalTax = incomeTaxes.reduce((sum, tax) => sum + tax.amount, 0) + 
                       wealthTax + 
                       capitalGainsTax;

      const totalIncome = income + pensionIncome + investments.reduce((acc, inv) => acc + inv.gains, 0);
      const netIncome = totalIncome - totalTax;

      // Calculate remaining wealth after covering expenses
      if (netIncome < expenses) {
        const deficit = expenses - netIncome;
        remainingWealth -= deficit;
      } else {
        const surplus = netIncome - expenses;
        remainingWealth += surplus;
        investments.forEach(investment => {
          investment.amount += surplus * (investment.amount / remainingWealth);
        });
      }

      results.push({
        year,
        country,
        incomeTaxes,
        wealthTax,
        pensionIncome,
        capitalGainsTax,
        totalTax,
        netIncome,
        expenses,
        remainingWealth
      });
    }

    return results;
  }
}

// Step 4: Define User Profile for Simulation
const userProfile = {
  birthYear: 1985,
  initialWealth: 1200000,
  initialPensionPot: 100000,
  initialInvestments: [
    { type: 'indexFunds', amount: 50000 },
    { type: 'individualShares', amount: 30000 }
  ],
  initialCountry: 'Germany',
  targetYear: 2050,
  lifeEvents: [
    {
      year: 2025,
      income: 80000,
      expenses: 42000,
      event: 'move',
      newCountry: 'USA'
    },
    {
      year: 2030,
      event: 'retire'
    }
  ]
};

// Step 5: Run the Simulation
const taxSystem = new TaxSystem(financialParameters);
const results = taxSystem.simulateScenario(userProfile);
console.log(results);

// Output the simulation results
results.forEach(result => {
  console.log(`Year: ${result.year}, Country: ${result.country}`);
  result.incomeTaxes.forEach(tax => {
    console.log(`  ${tax.name}: €${tax.amount.toFixed(2)}`);
  });
  console.log(`  Wealth Tax: €${result.wealthTax.toFixed(2)}`);
  console.log(`  Pension Income: €${result.pensionIncome.toFixed(2)}`);
  console.log(`  Capital Gains Tax: €${result.capitalGainsTax.toFixed(2)}`);
  console.log(`  Total Tax: €${result.totalTax.toFixed(2)}`);
  console.log(`  Net Income: €${result.netIncome.toFixed(2)}`);
  console.log(`  Expenses: €${result.expenses.toFixed(2)}`);
  console.log(`  Remaining Wealth: €${result.remainingWealth.toFixed(2)}`);
});

document.getElementById('simulationForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const userProfile = {
        birthYear: parseInt(document.getElementById('birthYear').value),
        initialWealth: parseFloat(document.getElementById('initialWealth').value),
        initialPensionPot: parseFloat(document.getElementById('initialPensionPot').value),
        initialInvestments: [
            { type: 'indexFunds', amount: 50000 },
            { type: 'individualShares', amount: 30000 }
        ],
        initialCountry: document.getElementById('initialCountry').value,
        targetYear: parseInt(document.getElementById('targetYear').value),
        lifeEvents: [
            {
                year: 2025,
                income: 80000,
                expenses: 42000,
                event: 'move',
                newCountry: 'USA'
            },
            {
                year: 2030,
                event: 'retire'
            }
        ]
    };

    const taxSystem = new TaxSystem(financialParameters);
    const results = await taxSystem.simulateScenario(userProfile);

    displayResults(results);
});

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<h2>Simulation Results</h2>';

    results.forEach(result => {
        resultsDiv.innerHTML += `
            <h3>Year: ${result.year}, Country: ${result.country}</h3>
            <ul>
                ${result.incomeTaxes.map(tax => `<li>${tax.name}: €${tax.amount.toFixed(2)}</li>`).join('')}
                <li>Wealth Tax: €${result.wealthTax.toFixed(2)}</li>
                <li>Pension Income: €${result.pensionIncome.toFixed(2)}</li>
                <li>Capital Gains Tax: €${result.capitalGainsTax.toFixed(2)}</li>
                <li>Total Tax: €${result.totalTax.toFixed(2)}</li>
                <li>Net Income: €${result.netIncome.toFixed(2)}</li>
                <li>Expenses: €${result.expenses.toFixed(2)}</li>
                <li>Remaining Wealth: €${result.remainingWealth.toFixed(2)}</li>
            </ul>
        `;
    });
}
