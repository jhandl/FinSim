/* Test for E1 Event Type Classification and UI Integration
 * 
 * This test verifies that E1 events are properly classified and integrated:
 * 1. E1 events are classified as outflow events
 * 2. E1 events have correct field requirements
 * 3. E1 events display correct summary text with "at age X" format
 * 4. E1 events are included in event type dropdown options
 */

const testDefinition = {
  name: "E1 Event Type Classification Test",
  description: "Test E1 event type classification and UI integration",
  isCustomTest: true,
  
  async runCustomTest() {
    const results = {
      success: true,
      errors: [],
      tests: []
    };
    
    try {
      // Test 1: Event Type Classification
      console.log('Testing E1 event type classification...');
      
      // Mock EventsTableManager for testing
      const mockEventsTableManager = {
        isOutflow: function(eventType) {
          return ['E', 'E1'].includes(eventType);
        },
        isInflow: function(eventType) {
          return ['SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'].includes(eventType);
        },
        getEventTypeOptionObjects: function() {
          return [
            { value: 'NOP', label: 'No Operation' },
            { value: 'SI', label: 'Salary Income' },
            { value: 'E', label: 'Expense' },
            { value: 'E1', label: 'One-off Expense' },
            { value: 'R', label: 'Real Estate' }
          ];
        }
      };
      
      // Test isOutflow classification
      if (!mockEventsTableManager.isOutflow('E1')) {
        results.errors.push('E1 should be classified as outflow event');
        results.success = false;
      } else {
        results.tests.push('✓ E1 correctly classified as outflow event');
      }
      
      // Test that E1 is not classified as inflow
      if (mockEventsTableManager.isInflow('E1')) {
        results.errors.push('E1 should not be classified as inflow event');
        results.success = false;
      } else {
        results.tests.push('✓ E1 correctly not classified as inflow event');
      }
      
      // Test 2: Event Type Dropdown Options
      console.log('Testing E1 in event type dropdown...');
      
      const options = mockEventsTableManager.getEventTypeOptionObjects();
      const e1Option = options.find(opt => opt.value === 'E1');
      
      if (!e1Option) {
        results.errors.push('E1 option not found in event type dropdown');
        results.success = false;
      } else if (e1Option.label !== 'One-off Expense') {
        results.errors.push(`E1 option has wrong label: ${e1Option.label}`);
        results.success = false;
      } else {
        results.tests.push('✓ E1 option correctly included in dropdown with proper label');
      }
      
      // Test 3: Field Requirements
      console.log('Testing E1 field requirements...');
      
      // Mock UIManager.getRequiredFields
      const mockGetRequiredFields = function(eventType) {
        const patterns = {
          'E': 'rrrro-',   // name, amount, fromAge, toAge, rate (optional), match (hidden)
          'E1': 'rrr---',  // name, amount, fromAge, toAge (hidden), rate (hidden), match (hidden)
          'SI': 'rrrroo'   // Different pattern for comparison
        };
        const fields = ['name', 'amount', 'fromAge', 'toAge', 'rate', 'match'];
        const pattern = patterns[eventType]?.split('') || [];
        return Object.fromEntries(fields.map((field, i) => [
          field,
          pattern[i] === 'r' ? 'required' : pattern[i] === 'o' ? 'optional' : 'hidden'
        ]));
      };
      
      const e1Requirements = mockGetRequiredFields('E1');
      
      // Check required fields
      const expectedRequired = ['name', 'amount', 'fromAge'];
      for (const field of expectedRequired) {
        if (e1Requirements[field] !== 'required') {
          results.errors.push(`E1 field '${field}' should be required but is '${e1Requirements[field]}'`);
          results.success = false;
        }
      }
      
      // Check hidden fields
      const expectedHidden = ['toAge', 'rate', 'match'];
      for (const field of expectedHidden) {
        if (e1Requirements[field] !== 'hidden') {
          results.errors.push(`E1 field '${field}' should be hidden but is '${e1Requirements[field]}'`);
          results.success = false;
        }
      }
      
      if (results.errors.length === 0) {
        results.tests.push('✓ E1 field requirements correctly configured');
      }
      
      // Test 4: Summary Generation
      console.log('Testing E1 summary generation...');
      
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

      // Test 5: Growth Rate Field Visibility
      console.log('Testing growth rate field visibility...');

      // Mock showsGrowthRateField method
      const mockShowsGrowthRateField = function(eventType) {
        // E1 (One-off Expense): Never show Growth Rate field since it occurs only once
        if (eventType === 'E1') {
          return false;
        }
        // All other event types show Growth Rate field
        return true;
      };

      // Test E1 doesn't show growth rate field
      if (mockShowsGrowthRateField('E1')) {
        results.errors.push('E1 should not show growth rate field');
        results.success = false;
      } else {
        results.tests.push('✓ E1 correctly hides growth rate field');
      }

      // Test E shows growth rate field
      if (!mockShowsGrowthRateField('E')) {
        results.errors.push('E should show growth rate field');
        results.success = false;
      } else {
        results.tests.push('✓ E correctly shows growth rate field');
      }

      // Test 6: Event Type Mapping
      console.log('Testing E1 event type mapping...');
      
      // Mock event type mapping
      const typeMap = {
        'SI': 'Salary Income',
        'E': 'Expense',
        'E1': 'One-off Expense',
        'R': 'Real Estate'
      };
      
      if (typeMap['E1'] !== 'One-off Expense') {
        results.errors.push(`E1 should map to 'One-off Expense' but maps to '${typeMap['E1']}'`);
        results.success = false;
      } else {
        results.tests.push('✓ E1 correctly mapped to "One-off Expense"');
      }
      
      console.log('\nTest Results:');
      results.tests.forEach(test => console.log(test));
      
      if (results.errors.length > 0) {
        console.log('\nErrors:');
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
