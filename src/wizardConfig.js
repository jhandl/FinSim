export const tourConfig = {
  steps: [
    {
      element: '#StartingAge',
      popover: {
        title: 'Current Age',
        description: 'Enter your current age here.',
        position: 'bottom'
      }
    },
    {
      element: '#InitialSavings',
      popover: {
        title: 'Current Savings',
        description: 'Enter your current savings amount.',
        position: 'bottom'
      }
    },
    {
      element: '#InitialPension',
      popover: {
        title: 'Pension Fund',
        description: 'Enter the amount in your pension fund.',
        position: 'bottom'
      }
    },
    {
      element: '#runSimulation',
      popover: {
        title: 'Run Simulation',
        description: 'Click here to run the simulation with the entered data.',
        position: 'bottom'
      }
    },
    {
      element: '#cashflowGraph',
      popover: {
        title: 'Cashflow Graph',
        description: 'This graph shows your projected cashflow over time.',
        position: 'top'
      }
    },
    {
      element: '#assetsGraph',
      popover: {
        title: 'Assets Graph',
        description: 'This graph displays the growth of your assets.',
        position: 'top'
      }
    }
  ]
}; 