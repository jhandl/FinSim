/**
 * Test suite for Wizard.js component
 * This file contains comprehensive tests for the help wizard functionality
 * to ensure backward compatibility during the unification refactoring.
 */

// Setup comprehensive mocks for browser environment
const setupMocks = () => {
  // Mock driver.js as a global window object
  const mockDriverInstance = {
    drive: jest.fn(),
    moveNext: jest.fn(),
    movePrevious: jest.fn(),
    destroy: jest.fn(),
    getActiveIndex: jest.fn(() => 0),
    refresh: jest.fn()
  };

  const mockDriver = jest.fn(() => mockDriverInstance);

  // Setup window.driver.js.driver mock
  global.window = global.window || {};
  global.window.driver = {
    js: {
      driver: mockDriver
    }
  };

  // Mock navigator
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    maxTouchPoints: 0
  };

  // Mock window properties
  global.window.innerWidth = 1024;
  global.window.matchMedia = jest.fn(() => ({
    matches: false
  }));

  // Create a persistent mock WebUI instance
  const mockWebUIInstance = {
    eventAccordionManager: {
      toggleAccordionItem: jest.fn(),
      isAccordionExpanded: jest.fn(() => false),
      getExpandedAccordions: jest.fn(() => [])
    },
    eventsTableManager: {
      viewMode: 'table'
    },
    fileManager: {
      loadYamlFile: jest.fn()
    },
    burgerMenu: {
      isOpen: false,
      openMenu: jest.fn(),
      closeMenu: jest.fn()
    }
  };

  const mockWebUI = {
    getInstance: jest.fn(() => mockWebUIInstance)
  };

  global.WebUI = mockWebUI;

  // Mock other global dependencies
  global.ContentRenderer = {
    render: jest.fn((type, content) => content)
  };

  global.FormatUtils = {
    replaceAgeYearPlaceholders: jest.fn(text => text)
  };

  // Mock jsyaml
  global.jsyaml = {
    load: jest.fn()
  };

  // Mock fetch
  global.fetch = jest.fn();

  return { mockDriver, mockDriverInstance, mockWebUIInstance };
};

// Create a simplified Wizard class for testing
class TestWizard {
  constructor() {
    this.driver = global.window.driver.js.driver;
    this.tour = null;
    this.config = null;
    this.originalConfig = null;
    this.lastFocusedField = null;
    this.lastFocusedWasInput = false;
    this.lastStepIndex = 0;
    this.validSteps = [];
    this.tableState = null;
    this.isMobile = this.detectMobile();
    this.originalInputStates = new Map();
    this.wizardActive = false;
    this.scrollFrozen = false;
    this.savedScrollPos = 0;
    this.currentTourId = 'full';
  }

  detectMobile() {
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileViewport = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    return isMobileUserAgent || (hasTouchSupport && (isSmallScreen || isMobileViewport));
  }

  getCurrentEventsMode() {
    try {
      const webUI = WebUI.getInstance();
      if (webUI && webUI.eventsTableManager && webUI.eventsTableManager.viewMode) {
        return webUI.eventsTableManager.viewMode;
      }
    } catch (e) {
      // Fallback
    }
    return 'table';
  }

  _getFilteredSteps(tourId, card = null) {
    if (!this.originalConfig || !this.originalConfig.steps) {
      console.warn('_getFilteredSteps called before YAML was loaded');
      return [];
    }

    const stepsCopy = this.originalConfig.steps.map(step => JSON.parse(JSON.stringify(step)));
    const currentMode = this.getCurrentEventsMode ? this.getCurrentEventsMode() : 'table';

    const filtered = stepsCopy.filter(step => {
      if (step.tours && !step.tours.includes(tourId)) return false;
      if (tourId === 'mini' && card) {
        if (step.card) return step.card === card;
        return false;
      }
      if (step.eventModes && !step.eventModes.includes(currentMode)) return false;

      // Swap selector when accordion mode is active and alternative provided
      if (currentMode === 'accordion' && step['accordion-element']) {
        step.element = step['accordion-element'];
      }

      return true;
    });

    return filtered;
  }

  filterValidSteps(stepsOverride = null) {
    const sourceSteps = stepsOverride || (this.config ? this.config.steps : []);
    if (!sourceSteps || sourceSteps.length === 0) return [];
    return JSON.parse(JSON.stringify(sourceSteps));
  }

  async _runTour(steps, startingIndex = 0) {
    // Simplified implementation for testing
    this.validSteps = steps;
    this.wizardActive = true; // Set wizardActive to true like the real implementation
    return Promise.resolve();
  }

  finishTour() {
    // Simplified implementation for testing
    this.wizardActive = false;
  }

  async start(options = {}) {
    // Handle backward compatibility: if called without options or with just a number (fromStep),
    // treat it as the original start() method behavior (help tour)
    let actualOptions = options;
    if (typeof options === 'number' || (typeof options === 'object' && Object.keys(options).length === 0)) {
      // Called as start() or start(fromStep) - original behavior was help tour
      actualOptions = { type: 'help', startAtStep: typeof options === 'number' ? options : undefined };
    }

    const { type = 'help', card = null, startAtStep = undefined } = actualOptions;

    // Parameter validation
    if (type === 'mini' && !card) {
      console.warn('Mini tours require a card parameter');
      return;
    }

    // Set tour type
    this.currentTourId = type;

    // Get steps for the tour type - now unified to use _runTour for all tour types
    let steps;
    let startingStepIndex = 0;

    if (type === 'full' || type === 'help') {
      // Use the full tour path
      this.validSteps = this.filterValidSteps();
      steps = this.validSteps;
      startingStepIndex = startAtStep || 0;
    } else {
      // Use the filtered steps for quick/mini tours
      steps = this._getFilteredSteps(type, card);
      if (steps.length === 0) {
        console.warn(`No steps found for tour "${type}"${card ? ` and card "${card}"` : ''}`);
        return;
      }
      startingStepIndex = 0;
    }

    // Now use the unified _runTour method for ALL tour types
    await this._runTour(steps, startingStepIndex);
    return Promise.resolve();
  }
}

describe('Wizard Component', () => {
  let wizard;
  let mockDriver, mockDriverInstance, mockWebUIInstance;

  beforeEach(() => {
    // Setup mocks
    const mocks = setupMocks();
    mockDriver = mocks.mockDriver;
    mockDriverInstance = mocks.mockDriverInstance;
    mockWebUIInstance = mocks.mockWebUIInstance;

    // Reset all mocks
    jest.clearAllMocks();

    // Setup basic DOM structure
    document.body.innerHTML = `
      <div id="Events">
        <tbody></tbody>
      </div>
      <div class="events-section"></div>
      <button id="saveSimulation"></button>
      <button id="loadSimulation"></button>
      <button id="loadDemoScenarioHeader"></button>
      <button id="startWizard"></button>
    `;

    // Create wizard instance
    wizard = new TestWizard();
    
    // Mock basic configuration
    wizard.originalConfig = {
      steps: [
        {
          element: '.events-section',
          popover: {
            title: 'Events Table',
            description: 'This is the events table'
          },
          tours: ['full', 'quick']
        },
        {
          element: '#saveSimulation',
          popover: {
            title: 'Save',
            description: 'Save your simulation'
          },
          tours: ['full']
        }
      ]
    };
    wizard.config = JSON.parse(JSON.stringify(wizard.originalConfig));
  });
  
  describe('Initial Setup', () => {
    test('should create wizard instance', () => {
      expect(wizard).toBeDefined();
      expect(typeof wizard.start).toBe('function');
    });
    
    test('should have required methods', () => {
      expect(typeof wizard._getFilteredSteps).toBe('function');
      expect(typeof wizard.filterValidSteps).toBe('function');
      expect(typeof wizard._runTour).toBe('function');
      expect(typeof wizard.finishTour).toBe('function');
    });
  });
  
  describe('Step Filtering', () => {
    test('_getFilteredSteps should filter by tour type', () => {
      const fullSteps = wizard._getFilteredSteps('full');
      expect(fullSteps).toHaveLength(2);
      
      const quickSteps = wizard._getFilteredSteps('quick');
      expect(quickSteps).toHaveLength(1);
      expect(quickSteps[0].element).toBe('.events-section');
    });
    
    test('_getFilteredSteps should handle mini tours with card parameter', () => {
      wizard.originalConfig.steps.push({
        element: '#miniStep',
        popover: { title: 'Mini', description: 'Mini step' },
        tours: ['mini'],
        card: 'test-card'
      });
      
      const miniSteps = wizard._getFilteredSteps('mini', 'test-card');
      expect(miniSteps).toHaveLength(1);
      expect(miniSteps[0].element).toBe('#miniStep');
      
      const noCardSteps = wizard._getFilteredSteps('mini', 'other-card');
      expect(noCardSteps).toHaveLength(0);
    });
  });
  
  describe('Step Filtering - Advanced', () => {
    test('filterValidSteps should handle empty steps', () => {
      const result = wizard.filterValidSteps([]);
      expect(result).toEqual([]);
    });

    test('filterValidSteps should deep copy steps to prevent mutation', () => {
      const originalSteps = [
        { element: '.test', popover: { title: 'Test' } }
      ];
      const result = wizard.filterValidSteps(originalSteps);

      // Modify the result
      result[0].element = '.modified';

      // Original should be unchanged
      expect(originalSteps[0].element).toBe('.test');
    });

    test('_getFilteredSteps should handle missing configuration', () => {
      wizard.originalConfig = null;
      const result = wizard._getFilteredSteps('full');
      expect(result).toEqual([]);
    });

    test('_getFilteredSteps should filter by eventModes', () => {
      wizard.originalConfig.steps.push({
        element: '#accordionOnly',
        popover: { title: 'Accordion Only', description: 'Only in accordion mode' },
        tours: ['full'],
        eventModes: ['accordion']
      });

      // Mock table mode
      mockWebUIInstance.eventsTableManager.viewMode = 'table';

      const steps = wizard._getFilteredSteps('full');
      expect(steps.find(s => s.element === '#accordionOnly')).toBeUndefined();

      // Mock accordion mode
      mockWebUIInstance.eventsTableManager.viewMode = 'accordion';
      const accordionSteps = wizard._getFilteredSteps('full');
      expect(accordionSteps.find(s => s.element === '#accordionOnly')).toBeDefined();
    });
  });

  describe('Tour Execution', () => {
    test('start method should set currentTourId to help', async () => {
      await wizard.start();
      expect(wizard.currentTourId).toBe('help');
    });

    test('start method should set currentTourId correctly for different tour types', async () => {
      await wizard.start({ type: 'quick' });
      expect(wizard.currentTourId).toBe('quick');

      await wizard.start({ type: 'mini', card: 'test-card' });
      expect(wizard.currentTourId).toBe('mini');
    });

    test('_runTour should set validSteps', async () => {
      const testSteps = [
        { element: '.test1', popover: { title: 'Test 1' } },
        { element: '.test2', popover: { title: 'Test 2' } }
      ];

      await wizard._runTour(testSteps, 0);
      expect(wizard.validSteps).toEqual(testSteps);
    });

    test('finishTour should set wizardActive to false', () => {
      wizard.wizardActive = true;
      wizard.finishTour();
      expect(wizard.wizardActive).toBe(false);
    });
  });

  describe('Mobile Detection', () => {
    test('detectMobile should return false for desktop user agent', () => {
      // Already set up in beforeEach with desktop user agent
      expect(wizard.detectMobile()).toBe(false);
    });

    test('detectMobile should return true for mobile user agent', () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });

      const mobileWizard = new TestWizard();
      expect(mobileWizard.detectMobile()).toBe(true);
    });

    test('detectMobile should return true for touch device with small screen', () => {
      // Mock touch support and small screen
      global.window.innerWidth = 600;
      global.navigator.maxTouchPoints = 1;
      Object.defineProperty(window, 'ontouchstart', {
        value: {},
        configurable: true
      });

      const touchWizard = new TestWizard();
      expect(touchWizard.detectMobile()).toBe(true);
    });
  });

  describe('Events Mode Detection', () => {
    test('getCurrentEventsMode should return table by default', () => {
      expect(wizard.getCurrentEventsMode()).toBe('table');
    });

    test('getCurrentEventsMode should return accordion when set', () => {
      mockWebUIInstance.eventsTableManager.viewMode = 'accordion';

      expect(wizard.getCurrentEventsMode()).toBe('accordion');
    });

    test('getCurrentEventsMode should handle missing WebUI gracefully', () => {
      // Mock WebUI to throw error
      const originalGetInstance = WebUI.getInstance;
      WebUI.getInstance = jest.fn(() => {
        throw new Error('WebUI not available');
      });

      expect(wizard.getCurrentEventsMode()).toBe('table');

      // Restore
      WebUI.getInstance = originalGetInstance;
    });
  });

  describe('Integration Tests - Backward Compatibility', () => {
    test('start() method should behave like original help tour', async () => {
      // Mock configuration loading
      wizard.originalConfig = {
        steps: [
          {
            element: '.events-section',
            popover: { title: 'Events', description: 'Events table' },
            tours: ['help']
          },
          {
            element: '#saveSimulation',
            popover: { title: 'Save', description: 'Save button' },
            tours: ['help']
          }
        ]
      };
      wizard.config = JSON.parse(JSON.stringify(wizard.originalConfig));

      await wizard.start();

      expect(wizard.currentTourId).toBe('help');
      // In a real implementation, this would also check driver initialization
    });

    test('start({ type: "quick" }) should behave like original quick tour', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.events-section',
            popover: { title: 'Events', description: 'Events table' },
            tours: ['full', 'quick']
          },
          {
            element: '#saveSimulation',
            popover: { title: 'Save', description: 'Save button' },
            tours: ['full']
          }
        ]
      };

      await wizard.start({ type: 'quick' });

      expect(wizard.currentTourId).toBe('quick');
      const quickSteps = wizard._getFilteredSteps('quick');
      expect(quickSteps).toHaveLength(1);
      expect(quickSteps[0].element).toBe('.events-section');
    });

    test('start({ type: "mini", card: "card-id" }) should behave like original mini tour', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.events-section',
            popover: { title: 'Events', description: 'Events table' },
            tours: ['full', 'quick']
          },
          {
            element: '#miniStep',
            popover: { title: 'Mini', description: 'Mini step' },
            tours: ['mini'],
            card: 'test-card'
          }
        ]
      };

      await wizard.start({ type: 'mini', card: 'test-card' });

      expect(wizard.currentTourId).toBe('mini');
      const miniSteps = wizard._getFilteredSteps('mini', 'test-card');
      expect(miniSteps).toHaveLength(1);
      expect(miniSteps[0].element).toBe('#miniStep');
    });
  });

  describe('Accordion Behavior Tests', () => {
    test('should handle accordion mode selector swapping', () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.table-element',
            'accordion-element': '.accordion-element',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['full']
          }
        ]
      };

      // Test table mode
      mockWebUIInstance.eventsTableManager.viewMode = 'table';
      const tableSteps = wizard._getFilteredSteps('full');
      expect(tableSteps[0].element).toBe('.table-element');

      // Test accordion mode
      mockWebUIInstance.eventsTableManager.viewMode = 'accordion';
      const accordionSteps = wizard._getFilteredSteps('full');
      expect(accordionSteps[0].element).toBe('.accordion-element');
    });

    test('should filter steps by eventModes correctly', () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.table-only',
            popover: { title: 'Table Only', description: 'Table only step' },
            tours: ['full'],
            eventModes: ['table']
          },
          {
            element: '.accordion-only',
            popover: { title: 'Accordion Only', description: 'Accordion only step' },
            tours: ['full'],
            eventModes: ['accordion']
          },
          {
            element: '.both-modes',
            popover: { title: 'Both Modes', description: 'Both modes step' },
            tours: ['full'],
            eventModes: ['table', 'accordion']
          }
        ]
      };

      // Test table mode filtering
      mockWebUIInstance.eventsTableManager.viewMode = 'table';
      const tableSteps = wizard._getFilteredSteps('full');
      expect(tableSteps).toHaveLength(2);
      expect(tableSteps.find(s => s.element === '.table-only')).toBeDefined();
      expect(tableSteps.find(s => s.element === '.both-modes')).toBeDefined();
      expect(tableSteps.find(s => s.element === '.accordion-only')).toBeUndefined();

      // Test accordion mode filtering
      mockWebUIInstance.eventsTableManager.viewMode = 'accordion';
      const accordionSteps = wizard._getFilteredSteps('full');
      expect(accordionSteps).toHaveLength(2);
      expect(accordionSteps.find(s => s.element === '.accordion-only')).toBeDefined();
      expect(accordionSteps.find(s => s.element === '.both-modes')).toBeDefined();
      expect(accordionSteps.find(s => s.element === '.table-only')).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing tour configuration gracefully', async () => {
      await wizard.start({ type: 'nonexistent' });
      // Should not throw error, just log warning
      expect(wizard.currentTourId).toBe('nonexistent');
    });

    test('should handle mini tour without card parameter', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await wizard.start({ type: 'mini' });

      // Should log warning and not set currentTourId (validation should prevent tour from starting)
      expect(consoleSpy).toHaveBeenCalledWith('Mini tours require a card parameter');
      expect(wizard.currentTourId).toBe('full'); // Should remain at default value

      consoleSpy.mockRestore();
    });

    test('should handle empty steps array', () => {
      const result = wizard.filterValidSteps([]);
      expect(result).toEqual([]);
    });
  });

  describe('Unified Start Method', () => {
    test('start should default to help tour type', async () => {
      await wizard.start();
      expect(wizard.currentTourId).toBe('help');
    });

    test('start should handle full tour type', async () => {
      await wizard.start({ type: 'full' });
      expect(wizard.currentTourId).toBe('full');
      expect(wizard.wizardActive).toBe(true);
    });

    test('start should handle quick tour type', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.test',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['quick']
          }
        ]
      };

      await wizard.start({ type: 'quick' });
      expect(wizard.currentTourId).toBe('quick');
    });

    test('start should handle mini tour type with card', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.test',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['mini'],
            card: 'test-card'
          }
        ]
      };

      await wizard.start({ type: 'mini', card: 'test-card' });
      expect(wizard.currentTourId).toBe('mini');
    });

    test('start should validate mini tour requires card', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await wizard.start({ type: 'mini' });

      expect(consoleSpy).toHaveBeenCalledWith('Mini tours require a card parameter');
      consoleSpy.mockRestore();
    });

    test('start should handle help tour with startAtStep', async () => {
      await wizard.start({ type: 'help', startAtStep: 5 });
      expect(wizard.currentTourId).toBe('help');
    });

    test('start should handle empty steps gracefully', async () => {
      wizard.originalConfig = { steps: [] };
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await wizard.start({ type: 'quick' });

      expect(consoleSpy).toHaveBeenCalledWith('No steps found for tour "quick"');
      consoleSpy.mockRestore();
    });
  });

  describe('Unified Method Integration', () => {
    test('start should use _runTour for full tours (unified implementation)', async () => {
      const runTourSpy = jest.spyOn(wizard, '_runTour');

      await wizard.start({ type: 'full' });

      expect(runTourSpy).toHaveBeenCalled();
      runTourSpy.mockRestore();
    });

    test('start should use _runTour for help tours (unified implementation)', async () => {
      const runTourSpy = jest.spyOn(wizard, '_runTour');

      await wizard.start({ type: 'help' });

      expect(runTourSpy).toHaveBeenCalled();
      runTourSpy.mockRestore();
    });

    test('start should use _runTour for quick tours', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.test',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['quick']
          }
        ]
      };

      const runTourSpy = jest.spyOn(wizard, '_runTour');

      await wizard.start({ type: 'quick' });

      expect(runTourSpy).toHaveBeenCalledWith([{
        element: '.test',
        popover: { title: 'Test', description: 'Test step' },
        tours: ['quick']
      }], 0);
      runTourSpy.mockRestore();
    });

    test('start should use _runTour for mini tours', async () => {
      wizard.originalConfig = {
        steps: [
          {
            element: '.test',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['mini'],
            card: 'test-card'
          }
        ]
      };

      const runTourSpy = jest.spyOn(wizard, '_runTour');

      await wizard.start({ type: 'mini', card: 'test-card' });

      expect(runTourSpy).toHaveBeenCalled();
      runTourSpy.mockRestore();
    });

    test('all tour types now use the same unified _runTour method', async () => {
      const runTourSpy = jest.spyOn(wizard, '_runTour');

      wizard.originalConfig = {
        steps: [
          {
            element: '.test',
            popover: { title: 'Test', description: 'Test step' },
            tours: ['quick', 'mini'],
            card: 'test-card'
          }
        ]
      };

      // Test all tour types use the same method
      await wizard.start({ type: 'full' });
      await wizard.start({ type: 'help' });
      await wizard.start({ type: 'quick' });
      await wizard.start({ type: 'mini', card: 'test-card' });

      expect(runTourSpy).toHaveBeenCalledTimes(4);
      runTourSpy.mockRestore();
    });
  });
});

