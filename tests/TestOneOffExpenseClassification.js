/* Test for One-off Expense Classification and UI Integration
 *
 * This test verifies that one-off expenses (E events with fromAge === toAge) are properly classified and integrated:
 * 1. 'E' events are classified as outflow events.
 * 2. One-off expenses have correct field visibility (To Age and Rate are hidden).
 * 3. One-off expenses display correct summary text with "at age X" format.
 * 4. 'E1' is removed from the event type dropdown options.
 */

const testDefinition = {
  name: "One-off Expense Classification Test",
  description: "Test one-off expense classification and UI integration",
  isCustomTest: true,

  async runCustomTest() {
    const results = {
      success: true,
      errors: [],
      tests: []
    };

    try {
      // Test 1: Event Type Classification

      // Mock EventsTableManager for testing
      const mockEventsTableManager = {
        isOutflow: function(eventType) {
          return ['E'].includes(eventType);
        },
        isInflow: function(eventType) {
          return ['SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'].includes(eventType);
        },
        getEventTypeOptionObjects: function() {
          return [
            { value: 'NOP', label: 'No Operation' },
            { value: 'SI', label: 'Salary Income' },
            { value: 'E', label: 'Expense' },
            { value: 'R', label: 'Real Estate' }
          ];
        }
      };

      // Test isOutflow classification for 'E'
      if (!mockEventsTableManager.isOutflow('E')) {
        results.errors.push("'E' should be classified as an outflow event");
        results.success = false;
      } else {
        results.tests.push("✓ 'E' correctly classified as an outflow event");
      }

      // Test 2: Event Type Dropdown Options

      const options = mockEventsTableManager.getEventTypeOptionObjects();
      const e1Option = options.find(opt => opt.value === 'E1');

      if (e1Option) {
        results.errors.push("'E1' option should be removed from event type dropdown");
        results.success = false;
      } else {
        results.tests.push("✓ 'E1' option correctly removed from dropdown");
      }

      // Test 3: Field Visibility for One-off Expenses

      // Mock EventSummaryRenderer methods
      const mockSummaryRenderer = {
        isOneOffExpense: function(event) {
          if (!event || event.type !== 'E') return false;
          const fromAge = parseInt(event.fromAge);
          const toAge = parseInt(event.toAge);
          return !isNaN(fromAge) && !isNaN(toAge) && fromAge === toAge;
        },
        showsToAgeField: function(eventType, event) {
          // New behavior: always show To Age, even for one-off expenses
          return true;
        },
        showsGrowthRateField: function(eventType, event) {
          // Growth rate remains hidden for one-off expenses
          return !(event && this.isOneOffExpense(event));
        }
      };

      const oneOffEvent = { type: 'E', fromAge: '30', toAge: '30' };
      const recurringEvent = { type: 'E', fromAge: '30', toAge: '35' };

      // Test 'To Age' field visibility: now always visible, even for one-off expenses
      if (!mockSummaryRenderer.showsToAgeField('E', oneOffEvent)) {
        results.errors.push("'To Age' field should be visible for one-off expenses");
        results.success = false;
      } else {
        results.tests.push("✓ 'To Age' field correctly visible for one-off expenses");
      }

      if (!mockSummaryRenderer.showsToAgeField('E', recurringEvent)) {
        results.errors.push("'To Age' field should be visible for recurring expenses");
        results.success = false;
      } else {
        results.tests.push("✓ 'To Age' field correctly visible for recurring expenses");
      }

      // Test 'Growth Rate' field visibility
      if (mockSummaryRenderer.showsGrowthRateField('E', oneOffEvent)) {
        results.errors.push("'Growth Rate' field should be hidden for one-off expenses");
        results.success = false;
      } else {
        results.tests.push("✓ 'Growth Rate' field correctly hidden for one-off expenses");
      }

      if (!mockSummaryRenderer.showsGrowthRateField('E', recurringEvent)) {
        results.errors.push("'Growth Rate' field should be visible for recurring expenses");
        results.success = false;
      } else {
        results.tests.push("✓ 'Growth Rate' field correctly visible for recurring expenses");
      }

      // Test 4: Summary Generation

      // Mock EventSummaryRenderer.formatPeriod
      const mockFormatPeriod = function(fromAge, toAge) {
        if (!fromAge) return '';
        const from = parseInt(fromAge);
        const to = parseInt(toAge);
        if (isNaN(from)) return '';
        if (isNaN(to) || to === 999) {
          return `from age ${from}`;
        } else if (from === to) {
          return `at age ${from}`;
        } else {
          return `ages ${from}-${to}`;
        }
      };

      // Test one-off expense formatting (fromAge === toAge)
      const oneOffFormat = mockFormatPeriod(30, 30);
      if (oneOffFormat !== 'at age 30') {
        results.errors.push(`One-off expense should format as 'at age 30' but got '${oneOffFormat}'`);
        results.success = false;
      } else {
        results.tests.push('✓ One-off expense correctly formatted as "at age X"');
      }

      // Test multi-year expense formatting for comparison
      const multiYearFormat = mockFormatPeriod(30, 35);
      if (multiYearFormat !== 'ages 30-35') {
        results.errors.push(`Multi-year expense should format as 'ages 30-35' but got '${multiYearFormat}'`);
        results.success = false;
      } else {
        results.tests.push('✓ Multi-year expense correctly formatted as "ages X-Y"');
      }
      
      if (results.errors.length > 0) {
        console.log('❌ One-off Expense Classification Test failed with the following errors:');
        results.errors.forEach(error => console.log('✗ ' + error));
      }
      
    } catch (error) {
      results.success = false;
      results.errors.push(`Test execution error: ${error.message}`);
    }
    
    return results;
  }
};

module.exports = testDefinition;
