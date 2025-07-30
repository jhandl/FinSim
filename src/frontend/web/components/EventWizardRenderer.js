/* Event Wizard Rendering functionality */

class EventWizardRenderer {

  constructor(webUI) {
    this.webUI = webUI;
  }

  /**
   * Render period content (fromAge/toAge selection)
   * @param {Object} step - The step configuration
   * @param {Object} wizardState - Current wizard state
   * @returns {HTMLElement} The rendered content
   */
  renderPeriodContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-period';

    // Description text
    const description = document.createElement('p');
    description.textContent = this.processTextVariables(step.content.text, wizardState);
    container.appendChild(description);

    // Period inputs container
    const periodContainer = document.createElement('div');
    periodContainer.className = 'event-wizard-period-inputs';

    // Apply label positioning class if specified
    const labelPosition = step.labelPosition || 'top'; // default to top for period inputs
    periodContainer.classList.add(`label-position-${labelPosition}`);

    // From Age/Year input
    const fromGroup = document.createElement('div');
    fromGroup.className = 'event-wizard-input-group event-wizard-period-from';
    fromGroup.classList.add(`label-position-${labelPosition}`);

    const fromLabel = document.createElement('label');
    fromLabel.textContent = this.getAgeYearLabel('From');
    fromLabel.htmlFor = 'wizard-fromAge';

    const fromInput = document.createElement('input');
    fromInput.type = 'text';
    fromInput.id = 'wizard-fromAge';
    fromInput.name = 'fromAge';
    fromInput.placeholder = '';
    fromInput.inputMode = 'numeric';
    fromInput.pattern = '[0-9]*';

    // Set current value if exists
    const currentFromValue = wizardState.data.fromAge;
    if (currentFromValue !== undefined) {
      fromInput.value = currentFromValue;
    }

    fromGroup.appendChild(fromLabel);
    fromGroup.appendChild(fromInput);

    // To Age/Year input
    const toGroup = document.createElement('div');
    toGroup.className = 'event-wizard-input-group event-wizard-period-to';
    toGroup.classList.add(`label-position-${labelPosition}`);

    const toLabel = document.createElement('label');
    toLabel.textContent = this.getAgeYearLabel('To');
    toLabel.htmlFor = 'wizard-toAge';

    const toInput = document.createElement('input');
    toInput.type = 'text';
    toInput.id = 'wizard-toAge';
    toInput.name = 'toAge';
    toInput.placeholder = '';
    toInput.inputMode = 'numeric';
    toInput.pattern = '[0-9]*';

    // Set current value if exists
    const currentToValue = wizardState.data.toAge;
    if (currentToValue !== undefined) {
      toInput.value = currentToValue;
    }

    toGroup.appendChild(toLabel);
    toGroup.appendChild(toInput);

    periodContainer.appendChild(fromGroup);
    periodContainer.appendChild(toGroup);
    container.appendChild(periodContainer);

    // Help text
    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.processTextVariables(step.content.help, wizardState);
      container.appendChild(help);
    }

    // Add input event listeners to save values
    // When the user is typing, keep the wizardState updated **and** clear any
    // previous validation error/warning so the field can be re-validated on blur.
    fromInput.addEventListener('input', () => {
      wizardState.data.fromAge = fromInput.value;
      const wizardManager = this.webUI?.eventWizardManager;
      if (wizardManager) {
        wizardManager.clearWizardFieldValidation(fromInput);
      }
    });

    toInput.addEventListener('input', () => {
      wizardState.data.toAge = toInput.value;
      const wizardManager = this.webUI?.eventWizardManager;
      if (wizardManager) {
        wizardManager.clearWizardFieldValidation(toInput);
      }
    });

    const validationRules = (step.content && step.content.validation) || '';
    const requiresFrom = validationRules.includes('required') || validationRules.includes('fromAgeRequired');
    const requiresTo = validationRules.includes('required');

    fromInput.addEventListener('blur', () => {
      const wizardManager = this.webUI?.eventWizardManager;
      if (!wizardManager) return;

      // Only perform validation if a value is present; required check is deferred
      if (fromInput.value.trim() !== '') {
        wizardManager.validateWizardField(fromInput, 'fromAge', 'age');
      }
    });

    toInput.addEventListener('blur', () => {
      const wizardManager = this.webUI?.eventWizardManager;
      if (!wizardManager) return;

      // Only perform validation if a value is present; required check is deferred
      if (toInput.value.trim() !== '') {
        wizardManager.validateWizardField(toInput, 'toAge', 'age');
      }
    });

    // Add Enter key listeners to advance to next step
    const handleEnterKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        if (e.target === fromInput) {
          toInput.focus();
          return;
        }

        // Trigger blur so validations run before attempting to advance
        fromInput.blur();
        toInput.blur();

        // Get the wizard manager instance and advance to next step
        const wizardManager = this.webUI.eventWizardManager;
        if (wizardManager && wizardManager.isActive) {
          wizardManager.nextStep();
        }
      }
    };

    fromInput.addEventListener('keydown', handleEnterKey);
    toInput.addEventListener('keydown', handleEnterKey);

    return container;
  }

  /**
   * Render summary content (review before creation)
   * @param {Object} step - The step configuration
   * @param {Object} wizardState - Current wizard state
   * @returns {HTMLElement} The rendered content
   */
  renderSummaryContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-summary';

    // Optional description text
    if (step.content && step.content.text) {
      const description = document.createElement('p');
      description.textContent = this.processTextVariables(step.content.text, wizardState);
      container.appendChild(description);
    }

    // Summary details
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'event-wizard-summary-details';

    // Generate the raw summary string from YAML template
    let summaryText = this.generateSummaryText(step, wizardState);

    // Allow YAML authors to insert explicit line-break markers.  We support:
    //  1) Actual newline characters  (multi-line YAML string or "|" block)
    //  2) Escaped "\n" sequences  (useful inside double-quoted YAML scalars)
    //  3) Forward-slash marker "/n"  (easier to read in some editors)
    // We normalise all these to "\n" then split and render each row separately.

    // Convert escaped markers to real newlines first
    summaryText = summaryText.replace(/\\n/g, '\n').replace(/\/n/g, '\n');

    const lines = summaryText.split('\n');

    // If we only have one line and no explicit markers, fall back to legacy behaviour
    if (lines.length === 1) {
      const single = document.createElement('div');
      single.className = 'event-wizard-summary-text';
      single.innerHTML = lines[0];
      summaryContainer.appendChild(single);
    } else {
      // Render each line in its own row for a clearer multi-row layout
      lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'event-wizard-summary-line';
        row.innerHTML = line.trim();
        summaryContainer.appendChild(row);
      });
    }

    container.appendChild(summaryContainer);
    return container;
  }

  /**
   * Render mortgage content (special mortgage configuration)
   * @param {Object} step - The step configuration
   * @param {Object} wizardState - Current wizard state
   * @returns {HTMLElement} The rendered content
   */
  renderMortgageContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-mortgage';

    // Description text
    const description = document.createElement('p');
    description.textContent = this.processTextVariables(step.content.text, wizardState);
    container.appendChild(description);

    // Mortgage details container
    const mortgageContainer = document.createElement('div');
    mortgageContainer.className = 'event-wizard-mortgage-details';

    // Calculate mortgage details from property data
    const propertyValue = parseFloat(wizardState.data.propertyValue) || 0;
    const downPayment = parseFloat(wizardState.data.amount) || 0;
    const loanAmount = propertyValue - downPayment;

    // Display calculated values
    const calculationSummary = document.createElement('div');
    calculationSummary.className = 'event-wizard-mortgage-calculation';
    calculationSummary.innerHTML = `
      <div class="calculation-row">
        <span>Property Value:</span>
        <span>${this.formatCurrency(propertyValue)}</span>
      </div>
      <div class="calculation-row">
        <span>Down Payment:</span>
        <span>${this.formatCurrency(downPayment)}</span>
      </div>
      <div class="calculation-row calculation-total">
        <span>Loan Amount:</span>
        <span>${this.formatCurrency(loanAmount)}</span>
      </div>
    `;

    mortgageContainer.appendChild(calculationSummary);

    // Apply label positioning class if specified
    const labelPosition = step.labelPosition || 'left'; // default to left for mortgage inputs

    // Mortgage rate input
    const rateGroup = document.createElement('div');
    rateGroup.className = 'event-wizard-input-group';
    rateGroup.classList.add(`label-position-${labelPosition}`);

    const rateLabel = document.createElement('label');
    rateLabel.textContent = 'Interest Rate (%)';
    rateLabel.htmlFor = 'wizard-mortgageRate';

    const rateInput = document.createElement('input');
    rateInput.type = 'text';
    rateInput.id = 'wizard-mortgageRate';
    rateInput.name = 'mortgageRate';
    rateInput.placeholder = '';
    rateInput.className = 'percentage-input';

    // Trigger numeric keypad on mobile devices, consistent with other numeric fields
    rateInput.inputMode = 'numeric';
    rateInput.pattern = '[0-9]*';

    // Set current value if exists
    const currentRate = wizardState.data.mortgageRate;
    if (currentRate !== undefined) {
      rateInput.value = currentRate;
    }

    rateGroup.appendChild(rateLabel);
    rateGroup.appendChild(rateInput);
    mortgageContainer.appendChild(rateGroup);

    // Mortgage term input
    const termGroup = document.createElement('div');
    termGroup.className = 'event-wizard-input-group';
    termGroup.classList.add(`label-position-${labelPosition}`);

    const termLabel = document.createElement('label');
    termLabel.textContent = 'Term (years)';
    termLabel.htmlFor = 'wizard-mortgageTerm';

    const termInput = document.createElement('input');
    termInput.type = 'text';
    termInput.id = 'wizard-mortgageTerm';
    termInput.name = 'mortgageTerm';
    termInput.placeholder = '';
    termInput.className = 'percentage-input';
    termInput.inputMode = 'numeric';
    termInput.pattern = '[0-9]*';

    // Set current value if exists
    const currentTerm = wizardState.data.mortgageTerm;
    if (currentTerm !== undefined) {
      termInput.value = currentTerm;
    }

    termGroup.appendChild(termLabel);
    termGroup.appendChild(termInput);
    mortgageContainer.appendChild(termGroup);

    container.appendChild(mortgageContainer);

    // Help text
    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.processTextVariables(step.content.help, wizardState);
      container.appendChild(help);
    }

    // Add input event listeners to save values and recalculate
    rateInput.addEventListener('input', () => {
      wizardState.data.mortgageRate = rateInput.value;
      this.updateMortgageCalculation(wizardState, calculationSummary);
    });

    termInput.addEventListener('input', () => {
      wizardState.data.mortgageTerm = termInput.value;
      this.updateMortgageCalculation(wizardState, calculationSummary);
    });

    // Add Enter key listeners to advance to next step
    const handleEnterKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Get the wizard manager instance and advance to next step
        const wizardManager = this.webUI.eventWizardManager;
        if (wizardManager && wizardManager.isActive) {
          wizardManager.nextStep();
        }
      }
    };

    rateInput.addEventListener('keydown', handleEnterKey);
    termInput.addEventListener('keydown', handleEnterKey);

    return container;
  }

  /**
   * Process variables in text content
   * @param {string} text - The text content with variables
   * @param {Object} wizardState - Current wizard state
   * @returns {string} Text with variables replaced
   */
  processTextVariables(text, wizardState) {
    if (!text) return text;

    let processedText = text;
    const data = wizardState.data;

    // Replace common placeholders
    processedText = processedText.replace(/{name}/g, data.name || 'Unnamed Event');
    processedText = processedText.replace(/{amount}/g, this.formatCurrency(data.amount));
    processedText = processedText.replace(/{fromAge}/g, data.fromAge || '?');
    processedText = processedText.replace(/{toAge}/g, data.toAge || '?');
    processedText = processedText.replace(/{rate}/g, data.rate ? `${data.rate}%` : 'inflation rate');
    processedText = processedText.replace(/{propertyValue}/g, this.formatCurrency(data.propertyValue));

    // Replace frequency with human-readable text
    if (data.frequency) {
      const frequencyMap = {
        'oneoff': 'one-time',
        'weekly': 'weekly',
        'monthly': 'monthly',
        'yearly': 'annual'
      };
      const frequencyText = frequencyMap[data.frequency] || data.frequency;
      processedText = processedText.replace(/{frequency}/g, frequencyText);
    }

    return processedText;
  }

  /**
   * Generate summary text from template and wizard data
   * @param {Object} step - The step configuration
   * @param {Object} wizardState - Current wizard state
   * @returns {string} Formatted summary text
   */
  generateSummaryText(step, wizardState) {
    // Support an array of conditional templates in the YAML to keep logic in
    // configuration instead of hard-coding in JS.

    const template = this.getSummaryTemplate(step, wizardState) || 'Event details will be shown here.';

    return this.processTextVariables(template, wizardState);
  }

  /**
   * Determine which template to use for the summary step.  Allows the YAML to
   * specify `templates: [ { condition, template }, ... ]` so that wording can
   * adapt to the wizard path (e.g. cash vs mortgage).
   */
  getSummaryTemplate(step, wizardState) {
    const dataCtx = { ...wizardState, ...wizardState.data };

    // New YAML structure: content.templates = [ { condition?, template } ]
    const tplArr = step.content?.templates;
    if (Array.isArray(tplArr)) {
      for (const entry of tplArr) {
        if (!entry) continue;
        const condition = entry.condition;
        if (!condition || this.evaluateCondition(condition, dataCtx)) {
          return entry.template;
        }
      }
    }

    // Fallback to legacy single template field
    return step.content?.template;
  }

  /**
   * Evaluate a simple boolean condition string (same syntax used elsewhere in
   * wizard config).  The condition has access to all wizard data keys as
   * identifiers.
   */
  evaluateCondition(condition, context) {
    if (!condition) return true;
    try {
      // Build a function with the context keys as params to avoid using `with`.
      const argNames = Object.keys(context);
      const argValues = Object.values(context);
      // eslint-disable-next-line no-new-func
      const fn = new Function(...argNames, `return (${condition});`);
      return !!fn(...argValues);
    } catch (err) {
      console.warn('Failed to evaluate condition:', condition, err);
      return false;
    }
  }

  /**
   * Compute derived / formatted variables that can be referenced in templates.
   * Keeps display logic centralised and generic.
   */
  computeDerivedVariables(data) {
    const derived = {};

    // Bold name for visual emphasis
    derived.name = `<strong>${data.name || 'Unnamed Event'}</strong>`;

    // Currency formatting helpers
    const toNumber = (v) => {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    };

    // Amount / property value
    if (data.amount !== undefined) derived.amount = this.formatCurrency(toNumber(data.amount));
    if (data.propertyValue !== undefined) derived.propertyValue = this.formatCurrency(toNumber(data.propertyValue));

    // Frequency-related helpers (used by expenses)
    if (data.frequency) {
      const freqMap = { oneoff: 'one-off', weekly: 'weekly', monthly: 'monthly', yearly: 'annual' };
      derived.frequencyText = freqMap[data.frequency] || data.frequency;

      // Annualised amount when frequency is less than yearly
      const factor = { weekly: 52, monthly: 12, yearly: 1 }[data.frequency];
      if (factor && data.amount !== undefined) {
        derived.annualAmount = this.formatCurrency(toNumber(data.amount) * factor);
      }
    }

    // Growth / rate helpers
    if ('rate' in data) {
      if (data.rate === undefined || data.rate === '' || data.rate === 'inflation') {
        derived.rate = 'inflation';
        derived.growthPart = ', growing with inflation';
      } else {
        const n = parseFloat(data.rate);
        if (!isNaN(n)) {
          derived.rate = `${Math.abs(n)}%`;
          derived.rateAbs = Math.abs(n);
          derived.growthPart = `, growing at ${Math.abs(n)}% per year`;
          derived.direction = n < 0 ? 'crash' : 'boom';
        } else {
          derived.growthPart = '';
        }
      }
    } else {
      derived.growthPart = '';
    }

    // Mortgage derived values
    if (data.mortgageRate !== undefined) {
      derived.mortgageRate = `${data.mortgageRate}%`;
    }
    if (data.mortgageAnnualPayment !== undefined) {
      derived.mortgageAnnualPayment = this.formatCurrency(toNumber(data.mortgageAnnualPayment));
    }
    if (data.mortgageMonthlyPayment !== undefined) {
      derived.mortgageMonthlyPayment = this.formatCurrency(toNumber(data.mortgageMonthlyPayment));
    }

    // Employer pension match (salary income)
    if (data.match !== undefined && data.match !== '') {
      derived.match = `${data.match}%`;
      derived.matchPart = `, employer matches up to ${data.match}%`;
    } else {
      derived.matchPart = '';
    }

    if (data.mortgageTerm !== undefined) {
      derived.mortgageTerm = data.mortgageTerm;
    }

    // Typing helpers
    if (data.incomeType) derived.incomeType = data.incomeType.replace('_', ' ');

    return derived;
  }

  /**
   * Replace placeholders in a template with data-driven values.  Unknown or
   * missing placeholders are removed to avoid showing raw `?` markers.
   */
  processTextVariables(text, wizardState) {
    if (!text) return text;

    const data = wizardState.data || {};
    const variables = { ...data, ...this.computeDerivedVariables(data) };

    // Replace placeholders of the form {key}
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      const val = variables[key];
      return (val !== undefined && val !== null && val !== '') ? val : '';
    });
  }

  /**
   * Update mortgage calculation display
   * @param {Object} wizardState - Current wizard state
   * @param {HTMLElement} calculationElement - Element to update
   */
  updateMortgageCalculation(wizardState, calculationElement) {
    const propertyValue = parseFloat(wizardState.data.propertyValue) || 0;
    const downPayment = parseFloat(wizardState.data.amount) || 0;
    const loanAmount = propertyValue - downPayment;
    const rateRaw = wizardState.data.mortgageRate;
    const termRaw = wizardState.data.mortgageTerm;

    const rate = parseFloat(rateRaw);
    const term = parseFloat(termRaw);

    // Calculate monthly payment (simplified amortization)
    let monthlyPayment = 0;
    if (!isNaN(rate) && !isNaN(term) && rate > 0 && term > 0 && loanAmount > 0) {
      const monthlyRate = rate / 100 / 12;
      const numPayments = term * 12;
      monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                      (Math.pow(1 + monthlyRate, numPayments) - 1);
    }

    const annualPayment = monthlyPayment * 12;

    // Update the calculation display
    const paymentRows = monthlyPayment > 0 ? `
      <div class="calculation-row calculation-payment">
        <span>Monthly Payment:</span>
        <span>${this.formatCurrency(monthlyPayment)}</span>
      </div>
      <div class="calculation-row calculation-payment">
        <span>Annual Payment:</span>
        <span>${this.formatCurrency(annualPayment)}</span>
      </div>
    ` : '';

    calculationElement.innerHTML = `
      <div class="calculation-row">
        <span>Property Value:</span>
        <span>${this.formatCurrency(propertyValue)}</span>
      </div>
      <div class="calculation-row">
        <span>Down Payment:</span>
        <span>${this.formatCurrency(downPayment)}</span>
      </div>
      <div class="calculation-row calculation-total">
        <span>Loan Amount:</span>
        <span>${this.formatCurrency(loanAmount)}</span>
      </div>
      ${paymentRows}
    `;

    // Store / clear calculated payments for summary templates
    if (monthlyPayment > 0) {
      wizardState.data.mortgageAnnualPayment = annualPayment;
      wizardState.data.mortgageMonthlyPayment = monthlyPayment;
    } else {
      delete wizardState.data.mortgageAnnualPayment;
      delete wizardState.data.mortgageMonthlyPayment;
    }
  }

  /**
   * Get age or year label based on current mode
   * @param {string} prefix - 'From' or 'To'
   * @returns {string} The appropriate label
   */
  getAgeYearLabel(prefix) {
    const mode = this.webUI.eventsTableManager?.ageYearMode || 'age';
    return mode === 'age' ? `${prefix} Age` : `${prefix} Year`;
  }

  /**
   * Get age or year placeholder based on current mode
   * @param {string} type - 'from' or 'to'
   * @returns {string} The appropriate placeholder
   */
  getAgeYearPlaceholder(type) {
    const mode = this.webUI.eventsTableManager?.ageYearMode || 'age';
    if (mode === 'age') {
      return type === 'from' ? '25' : '65';
    } else {
      const currentYear = new Date().getFullYear();
      return type === 'from' ? currentYear.toString() : (currentYear + 40).toString();
    }
  }

  /**
   * Format currency value for display
   * @param {number|string} value - The value to format
   * @returns {string} Formatted currency string
   */
  formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  }
}
