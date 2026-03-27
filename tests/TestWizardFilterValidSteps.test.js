const path = require('path');
const fs = require('fs');
const vm = require('vm');

// --- Setup minimal global mocks required by Wizard ---

global.window = global.window || {};
// Provide a default driver.js stub; individual tests may replace this
global.window.driver = { js: { driver: jest.fn() } };

// Basic document stub to satisfy event listener registration before we set detailed DOM mocks
global.document = global.document || {};
if (!global.document.addEventListener) global.document.addEventListener = () => {};
if (!global.document.removeEventListener) global.document.removeEventListener = () => {};
if (!global.document.querySelector) global.document.querySelector = () => null;
if (!global.document.querySelectorAll) global.document.querySelectorAll = () => [];

// Stub optional global dependencies that Wizard might reference during construction
global.ContentRenderer = global.ContentRenderer || {
  render: jest.fn((type, content) => content)
};

global.FormatUtils = global.FormatUtils || {
  processVariablesInObject: obj => obj,
  processMarkdownLinks: str => str,
  replaceAgeYearPlaceholders: str => str
};

global.WebUI = global.WebUI || { getInstance: () => null };

global.fetch = global.fetch || jest.fn(() => Promise.resolve({ text: () => '', ok: true }));

global.jsyaml = global.jsyaml || { load: jest.fn(() => ({})) };

// --- Load Wizard.js and extract the Wizard class ---
const wizardSource = fs.readFileSync(path.resolve(__dirname, '../src/frontend/web/components/Wizard.js'), 'utf8');
// Execute the source in the current context and capture the class
const scriptContent = `var globalObj = globalThis;\nif (!globalObj.window) { globalObj.window = {}; }\nvar window = globalObj.window;\nvar document = globalObj.document || {};
if (!document.addEventListener) document.addEventListener = function(){};
if (!document.removeEventListener) document.removeEventListener = function(){};
if (!document.querySelector) document.querySelector = function(){ return { tagName: 'DIV', style: {} }; };
if (!document.querySelectorAll) document.querySelectorAll = function(){ return [{ tagName: 'DIV', style: {} }]; };\n// Ensure driver.js stub exists to satisfy Wizard constructor\nif (!window.driver) { window.driver = { js: { driver: function(){} } }; }\nelse if (!window.driver.js) { window.driver.js = { driver: function(){} }; }\n${wizardSource}\n; global.__WizardClass = Wizard; global.__WizardClass;`;
const script = new vm.Script(scriptContent);
const Wizard = script.runInThisContext();

describe('Wizard.filterValidSteps – accordion mode', () => {
  let wizard;
  const originalQuerySelector = document.querySelector;
  const originalQuerySelectorAll = document.querySelectorAll;

  // Helper that stubs document query selector functions so that every selector looks present
  function stubDom() {
    jest.spyOn(document, 'querySelector').mockImplementation((sel) => {
      // Return null only for clearly invalid selectors we want to test against.
      if (!sel) return null;
      return { tagName: 'DIV', style: {} }; // minimal element stub
    });

    jest.spyOn(document, 'querySelectorAll').mockImplementation((sel) => {
      return [{ tagName: 'DIV', style: {} }];
    });
  }

  afterEach(() => {
    // Restore DOM stubs
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // Create singleton with stubbed dependencies
    global.window.driver = { js: { driver: jest.fn() } };
    wizard = new Wizard();
    // Fake current view mode
    wizard.getCurrentEventsMode = () => 'accordion';
    // Stub visibility check to true
    wizard.isElementVisible = () => true;
    // Ensure filterValidSteps uses the test-defined tableState
    wizard.getEventTableState = () => wizard.tableState;
    // Baseline DOM selectors to avoid errors in tests without stubDom
    if (typeof document.querySelector !== 'function') {
      document.querySelector = () => null;
    }
    if (typeof document.querySelectorAll !== 'function') {
      document.querySelectorAll = () => [];
    }
  });

  test('Keeps only event-specific step when both generic and specific exist', () => {
    stubDom();

    wizard.tableState = {
      rowIsEmpty: false,
      eventType: 'SALARY',
      rowId: 'row_1'
    };

    const steps = [
      {
        element: '#AccordionEventTypeToggle_row_1',
        eventTypes: ['SALARY'],
      },
      {
        element: '.accordion-edit-name',
        'accordion-element': '.accordion-edit-name',
        // generic – no eventTypes
      },
      {
        element: '.accordion-edit-name',
        'accordion-element': '.accordion-edit-name',
        eventTypes: ['SALARY'],
      }
    ];

    const filtered = wizard.filterValidSteps(steps);
    // Expect exactly two steps: toggle + event-specific name; the generic name must be removed
    expect(filtered.length).toBe(2);

    const nameStep = filtered.find(s => s.element.includes('.accordion-edit-name'));
    expect(nameStep).toBeDefined();
    expect(nameStep.eventTypes).toEqual(['SALARY']);
    // Selector should be scoped to accordion-item-0 (row_1)
    expect(nameStep.element.startsWith('.events-accordion-item[data-accordion-id="accordion-item-0"]')).toBe(true);
  });

  test('Falls back to generic step when no matching event-specific step exists', () => {
    stubDom();

    wizard.tableState = {
      rowIsEmpty: false,
      eventType: 'BONUS',
      rowId: 'row_1'
    };

    const steps = [
      {
        element: '.accordion-edit-amount',
        'accordion-element': '.accordion-edit-amount',
        // generic
      },
      {
        element: '.accordion-edit-amount',
        'accordion-element': '.accordion-edit-amount',
        eventTypes: ['SALARY']
      }
    ];

    const filtered = wizard.filterValidSteps(steps);
    // Only generic should remain because eventTypes do not match
    expect(filtered.length).toBe(1);
    const amtStep = filtered[0];
    expect(amtStep.eventTypes).toBeUndefined();
    expect(amtStep.element.startsWith('.events-accordion-item[data-accordion-id="accordion-item-0"]')).toBe(true);
  });

  test('Keeps generic steps for empty rows', () => {
    stubDom();

    wizard.tableState = {
      rowIsEmpty: true,
      rows: 1,
      eventType: 'NOP',
      rowId: 'row_1'
    };

    const steps = [
      {
        element: '.accordion-edit-toage',
        'accordion-element': '.accordion-edit-toage'
      }
    ];

    const filtered = wizard.filterValidSteps(steps);
    expect(filtered.length).toBe(1);
    const toAge = filtered[0];
    // Scoped to row_2 -> accordion-index 1
    expect(toAge.element.startsWith('.events-accordion-item[data-accordion-id="accordion-item-0"]')).toBe(true);
  });

  test('Omits generic step when empty NOP row exists alongside other events', () => {
    stubDom();

    wizard.tableState = {
      rowIsEmpty: true,
      rows: 3,
      eventType: 'NOP',
      rowId: 'row_2'
    };

    const steps = [
      {
        element: '.accordion-edit-rate',
        'accordion-element': '.accordion-edit-rate'
      }
    ];

    const filtered = wizard.filterValidSteps(steps);
    expect(filtered.length).toBe(0);
  });

  test('Selectors and content match when running tours on different rows consecutively', () => {
    stubDom();

    const baseSteps = [
      {
        element: '.accordion-edit-name',
        'accordion-element': '.accordion-edit-name',
        eventTypes: ['SALARY']
      },
      {
        element: '.accordion-edit-name',
        'accordion-element': '.accordion-edit-name',
        eventTypes: ['MORTGAGE']
      }
    ];

    // First run – SALARY on row_2 (accordion-item-1)
    wizard.tableState = { rowIsEmpty: false, eventType: 'SALARY', rowId: 'row_2' };
    let filtered = wizard.filterValidSteps(baseSteps);
    expect(filtered.length).toBe(1);
    expect(filtered[0].eventTypes).toEqual(['SALARY']);
    expect(filtered[0].element).toContain('accordion-item-1');

    // Second run – MORTGAGE on row_6 (accordion-item-5)
    wizard.tableState = { rowIsEmpty: false, eventType: 'MORTGAGE', rowId: 'row_6' };
    filtered = wizard.filterValidSteps(baseSteps);
    expect(filtered.length).toBe(1);
    expect(filtered[0].eventTypes).toEqual(['MORTGAGE']);
    expect(filtered[0].element).toContain('accordion-item-5');
  });

  // ----- Tour filtering tests -----
  describe('Tour filtering behaviour', () => {
    const stepsByTour = [
      { element: '.events-section', tours: ['full'] },
      { element: '.graphs-section', tours: ['quick'] },
      { element: '.data-section', tours: ['mini'] },
      { element: '.parameters-section', tours: ['full', 'quick'] },
      { element: '.header' } // untagged – visible everywhere
    ];

    beforeEach(() => {
      stubDom();
      wizard.tableState = { rowIsEmpty: false, eventType: 'SALARY', rowId: 'row_1' };
    });

    test('Full tour keeps only full and untagged steps', () => {
      wizard.currentTourId = 'full';
      const filtered = wizard.filterValidSteps(stepsByTour);
      const sel = filtered.map(s => s.element);
      expect(sel).toEqual(expect.arrayContaining(['.events-section', '.parameters-section', '.header']));
      expect(sel).not.toEqual(expect.arrayContaining(['.graphs-section', '.data-section']));
    });

    test('Quick tour keeps quick, shared full/quick and untagged steps', () => {
      wizard.currentTourId = 'quick';
      const filtered = wizard.filterValidSteps(stepsByTour);
      const sel = filtered.map(s => s.element);
      expect(sel).toEqual(expect.arrayContaining(['.graphs-section', '.parameters-section', '.header']));
      expect(sel).not.toEqual(expect.arrayContaining(['.events-section', '.data-section']));
    });

    test('Mini tour keeps mini and untagged steps', () => {
      wizard.currentTourId = 'mini';
      const filtered = wizard.filterValidSteps(stepsByTour);
      const sel = filtered.map(s => s.element);
      expect(sel).toEqual(expect.arrayContaining(['.data-section', '.header']));
      expect(sel).not.toEqual(expect.arrayContaining(['.events-section', '.graphs-section', '.parameters-section']));
    });
  });

});

describe('Wizard.filterValidSteps – table mode mortgage name selectors', () => {
  let wizard;

  function stubDom() {
    jest.spyOn(document, 'querySelector').mockImplementation((sel) => {
      if (!sel) return null;
      return { tagName: 'DIV', style: {}, contains: () => false };
    });

    jest.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      return [{ tagName: 'DIV', style: {}, contains: () => false }];
    });
  }

  beforeEach(() => {
    global.window.driver = { js: { driver: jest.fn() } };
    wizard = new Wizard();
    wizard.getCurrentEventsMode = () => 'table';
    wizard.isElementVisible = () => true;
    wizard.getEventTableState = () => wizard.tableState;
    stubDom();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('maps EventAlias step to mortgage selector for mortgage-linked event types', () => {
    wizard.tableState = {
      isEmpty: false,
      rowIsEmpty: false,
      eventType: 'MP',
      rowId: 'row_3'
    };

    const steps = [
      { element: '#EventAlias', eventTypes: ['MP'], popover: { description: 'payoff name' } },
      { element: '#EventAlias', eventTypes: ['SI'], popover: { description: 'salary name' } }
    ];

    const filtered = wizard.filterValidSteps(steps);
    expect(filtered.length).toBe(1);
    expect(filtered[0].element).toBe('#EventMortgageToggle_row_3');
    expect(filtered[0].eventTypes).toEqual(['MP']);
  });

  test('keeps EventAlias step on text input for non-mortgage events', () => {
    wizard.tableState = {
      isEmpty: false,
      rowIsEmpty: false,
      eventType: 'SI',
      rowId: 'row_2'
    };

    const steps = [
      { element: '#EventAlias', eventTypes: ['SI'], popover: { description: 'salary name' } }
    ];

    const filtered = wizard.filterValidSteps(steps);
    expect(filtered.length).toBe(1);
    expect(filtered[0].element).toBe('#EventAlias_row_2');
  });

  test('maps EventAlias step to relocation country selector for MV events', () => {
    wizard.tableState = {
      isEmpty: false,
      rowIsEmpty: false,
      eventType: 'MV',
      rowId: 'row_4'
    };

    const steps = [
      { element: '#EventAlias', eventTypes: ['MV'], popover: { description: 'relocation name' } }
    ];

    const filtered = wizard.filterValidSteps(steps);
    expect(filtered.length).toBe(1);
    expect(filtered[0].element).toBe('#EventCountryToggle_row_4');
  });

  test('normalizes name-column selector variants to a visible target per event type', () => {
    expect(wizard._resolveTableEventStepSelector('EventCountryToggle', 'row_5', 'SI')).toBe('#EventAlias_row_5');
    expect(wizard._resolveTableEventStepSelector('EventCountryToggle', 'row_5', 'M')).toBe('#EventMortgageToggle_row_5');
    expect(wizard._resolveTableEventStepSelector('EventMortgageToggle', 'row_5', 'MV')).toBe('#EventCountryToggle_row_5');
  });

  test('uses EventAlias help content when selector is EventMortgageToggle', () => {
    wizard.tableState = {
      isEmpty: false,
      rowIsEmpty: false,
      eventType: 'MP',
      rowId: 'row_1'
    };
    wizard.originalConfig = {
      steps: [
        { element: '#EventAlias', eventTypes: ['MP'], popover: { description: 'Mortgage payoff name help' } }
      ]
    };
    wizard.processAgeYearInContent = (value) => value;

    const step = { popover: { description: 'placeholder' } };
    wizard.updateStepContentForEventType(step, 'EventMortgageToggle');

    expect(step.popover.description).toBe('Mortgage payoff name help');
  });

  test('uses EventAlias help content when selector is EventCountryToggle after crossing rows', () => {
    wizard.tableState = {
      isEmpty: false,
      rowIsEmpty: false,
      eventType: 'MP',
      rowId: 'row_2'
    };
    wizard.originalConfig = {
      steps: [
        { element: '#EventAlias', eventTypes: ['MV'], popover: { description: 'Relocation selector help' } },
        { element: '#EventAlias', eventTypes: ['MP'], popover: { description: 'Mortgage payoff selector help' } },
        { element: '#EventCountryToggle', eventTypes: ['MV'], popover: { description: 'Relocation country legacy help' } }
      ]
    };
    wizard.processAgeYearInContent = (value) => value;

    const step = { popover: { description: 'Relocation selector help' } };
    wizard.updateStepContentForEventType(step, 'EventCountryToggle');

    expect(step.popover.description).toBe('Mortgage payoff selector help');
  });
});
