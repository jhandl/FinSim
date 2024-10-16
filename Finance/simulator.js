// Expanded Tax System Simulation in JavaScript

// Step 1: Define comprehensive tax rules for multiple countries
const taxRules = {
  "Germany": {
    "incomeTaxes": [
      {
        name: "Income Tax",
        type: "bracket",
        brackets: [
          {"rate": 0.14, "from": 0, "to": 10000},
          {"rate": 0.3, "from": 10001, "to": 50000},
          {"rate": 0.42, "from": 50001, "to": 200000},
          {"rate": 0.45, "from": 200001, "to": null}
        ]
      }
    ],
    "wealthTax": {"rate": 0.01, "threshold": 1000000},
    "capitalGainsTax": {
      "indexFunds": 0.25,
      "etfs": 0.25,
      "investmentTrusts": 0.28,
      "individualShares": 0.3,
      "bonds": 0.15
    },
    "pensionContribution": {
      type: "fixedRate",
      employeeRate: 0.09,
      employerRate: 0.09
    }
  },
  "USA": {
    "incomeTaxes": [
      {
        name: "Federal Income Tax",
        type: "bracket",
        brackets: [
          {"rate": 0.1, "from": 0, "to": 9950},
          {"rate": 0.12, "from": 9951, "to": 40525},
          {"rate": 0.22, "from": 40526, "to": 86375},
          {"rate": 0.24, "from": 86376, "to": 164925},
          {"rate": 0.32, "from": 164926, "to": 209425},
          {"rate": 0.35, "from": 209426, "to": 523600},
          {"rate": 0.37, "from": 523601, "to": null}
        ]
      },
      {
        name: "Social Security Tax",
        type: "flatRate",
        rate: 0.062,
        threshold: 0
      },
      {
        name: "Medicare Tax",
        type: "flatRate",
        rate: 0.0145,
        threshold: 0
      }
    ],
    "capitalGainsTax": {
      "indexFunds": 0.2,
      "etfs": 0.2,
      "investmentTrusts": 0.22,
      "individualShares": 0.25,
      "bonds": 0.15
    },
    "pensionContribution": {
      type: "fixedRate",
      employeeRate: 0.062,
      employerRate: 0.062
    }
  },
  "France": {
    "incomeTaxes": [
      {
        name: "Income Tax",
        type: "bracket",
        brackets: [
          {"rate": 0, "from": 0, "to": 10225},
          {"rate": 0.11, "from": 10226, "to": 26070},
          {"rate": 0.3, "from": 26071, "to": 74545},
          {"rate": 0.41, "from": 74546, "to": 160336},
          {"rate": 0.45, "from": 160337, "to": null}
        ]
      },
      {
        name: "General Social Contribution",
        type: "flatRate",
        rate: 0.092,
        threshold: 0
      }
    ],
    "wealthTax": {"rate": 0.015, "threshold": 1300000},
    "capitalGainsTax": {
      "indexFunds": 0.3,
      "etfs": 0.3,
      "investmentTrusts": 0.32,
      "individualShares": 0.35,
      "bonds": 0.2
    },
    "pensionContribution": {
      type: "fixedRate",
      employeeRate: 0.082,
      employerRate: 0.172
    }
  },
  "Ireland": {
    "incomeTaxes": [
      {
        "name": "Income Tax",
        "type": "bracket",
        "brackets": [
          {"rate": 0.20, "from": 0, "to": 36800},
          {"rate": 0.40, "from": 36801, "to": null}
        ]
      },
      {
        "name": "Universal Social Charge",
        "type": "bracket",
        "brackets": [
          {"rate": 0.005, "from": 0, "to": 12012},
          {"rate": 0.02, "from": 12013, "to": 21295},
          {"rate": 0.045, "from": 21296, "to": 70044},
          {"rate": 0.08, "from": 70045, "to": null}
        ]
      },
      {
        "name": "Pay Related Social Insurance",
        "type": "flatRate",
        "rate": 0.04,
        "threshold": 18304
      }
    ],
    "capitalGainsTax": {
      "indexFunds": 0.33,
      "etfs": 0.33,
      "investmentTrusts": 0.33,
      "individualShares": 0.33,
      "bonds": 0.33
    },
    "pensionContribution": {
      type: "ageBasedPercentage",
      rates: [
        { maxAge: 29, rate: 0.15 },
        { maxAge: 39, rate: 0.20 },
        { maxAge: 49, rate: 0.25 },
        { maxAge: 59, rate: 0.30 },
        { maxAge: Infinity, rate: 0.35 }
      ],
      annualCap: 115000
    }
  }
};

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
  constructor(taxRules, financialParameters) {
    this.taxRules = taxRules;
    this.financialParameters = financialParameters;
  }

  calculateIncomeTaxes(income, country) {
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
    const wealthTaxRule = this.taxRules[country].wealthTax;
    if (wealthTaxRule && wealth > wealthTaxRule.threshold) {
      return wealth * wealthTaxRule.rate;
    }
    return 0;
  }

  calculatePensionContribution(income, country, age) {
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

  simulateScenario(profile) {
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
const taxSystem = new TaxSystem(taxRules, financialParameters);
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
