/* Field Labels Management */

class FieldLabelsManager {
  
  constructor() {
    this.labels = null;
    this.loadPromise = null;
  }

  /**
   * Load field labels configuration from YAML file
   */
  async loadLabels() {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._loadLabelsFromFile();
    return this.loadPromise;
  }

  async _loadLabelsFromFile() {
    try {
      const response = await fetch('/src/frontend/web/assets/field-labels.yml');
      if (!response.ok) {
        throw new Error(`Failed to load field labels: ${response.status}`);
      }
      
      const yamlText = await response.text();
      this.labels = jsyaml.load(yamlText);
      
      return this.labels;
    } catch (error) {
      console.error('Error loading field labels:', error);
      // Fallback to hardcoded defaults
      this.labels = this._getHardcodedDefaults();
      return this.labels;
    }
  }

  /**
   * Get field label for a specific event type and field
   */
  getFieldLabel(eventType, fieldName) {
    if (!this.labels) {
      // Return hardcoded fallback if labels not loaded
      return this._getHardcodedLabel(eventType, fieldName);
    }

    let label;

    // Check for event-specific override
    const eventConfig = this.labels.eventTypes?.[eventType];
    if (eventConfig && eventConfig[fieldName]) {
      label = eventConfig[fieldName];
    } else {
      // Fall back to default
      label = this.labels.defaults?.[fieldName] || this._getHardcodedLabel(eventType, fieldName);
    }

    // Process variable substitution using FormatUtils
    if (typeof FormatUtils !== 'undefined' && FormatUtils.processVariables) {
      label = FormatUtils.processVariables(label);
    }

    return label;
  }

  /**
   * Get placeholder for a specific event type and field
   */
  getFieldPlaceholder(eventType, fieldName) {
    if (!this.labels) {
      return this._getHardcodedPlaceholder(eventType, fieldName);
    }

    // Check for event-specific placeholder
    const eventConfig = this.labels.eventTypes?.[eventType];
    if (eventConfig?.placeholders?.[fieldName] !== undefined) {
      return eventConfig.placeholders[fieldName];
    }

    // Fall back to default placeholder
    return this.labels.defaults?.placeholders?.[fieldName] || this._getHardcodedPlaceholder(eventType, fieldName);
  }

  /**
   * Hardcoded fallback labels (same as current implementation)
   */
  _getHardcodedLabel(eventType, fieldName) {
    if (fieldName === 'rate') {
      if (eventType === 'R') return 'Appreciation Rate';
      if (eventType === 'SM') return 'Market Growth';
      if (eventType === 'M') return 'Interest Rate';
      return 'Growth Rate';
    }

    const defaults = {
      eventType: 'Event Type',
      name: 'Name',
      amount: 'Amount',
      fromAge: 'From Age',
      toAge: 'To Age',
      rate: 'Growth Rate',
      match: 'Employer Match'
    };

    return defaults[fieldName] || fieldName;
  }

  /**
   * Hardcoded fallback placeholders
   */
  _getHardcodedPlaceholder(eventType, fieldName) {
    if (fieldName === 'rate') {
      if (eventType === 'SM' || eventType === 'M') return '';
      return 'inflation';
    }
    return '';
  }

  /**
   * Hardcoded defaults for fallback
   */
  _getHardcodedDefaults() {
    return {
      defaults: {
        eventType: "Event Type",
        name: "Name",
        amount: "Amount",
        fromAge: "From Age",
        toAge: "To Age",
        rate: "Growth Rate",
        match: "Employer Match",
        placeholders: {
          rate: "inflation",
          match: ""
        }
      },
      eventTypes: {
        R: {
          rate: "Appreciation Rate",
          placeholders: { rate: "inflation" }
        },
        SM: {
          rate: "Market Growth",
          placeholders: { rate: "" }
        },
        M: {
          rate: "Interest Rate",
          placeholders: { rate: "" }
        }
      }
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!FieldLabelsManager._instance) {
      FieldLabelsManager._instance = new FieldLabelsManager();
    }
    return FieldLabelsManager._instance;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.FieldLabelsManager = FieldLabelsManager;
}
