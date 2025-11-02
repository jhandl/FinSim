/* Events Wizard: facade that composes WizardManager with Events-specific renderer and hooks */

class EventsWizard {
  constructor(webUI) {
    this.webUI = webUI;
    this.renderer = new EventsRenderer(webUI);
    this.manager = new WizardManager(webUI, this.renderer, { overlayId: 'eventWizardOverlay', modalId: 'eventWizardModal', cssPrefix: 'event-wizard' });

    // Wire feature hooks
    this.manager.onCompleteAction = (eventData) => this.createEvent(eventData);

    // Load YAML config
    this.manager.loadConfig('/src/frontend/web/assets/events-wizard.yml');
  }

  // Delegated API
  startWizard(idOrConfig, initialData = {}, onComplete = null, onCancel = null) { return this.manager.startWizard(idOrConfig, initialData, onComplete, onCancel); }
  nextStep(origin = 'unknown') { return this.manager.nextStep(origin); }
  previousStep() { return this.manager.previousStep(); }
  cancelWizard() { return this.manager.cancelWizard(); }
  closeWizard() { return this.manager.closeWizard(); }
  validateWizardField(input, fieldName, fieldType) { return this.manager.validateWizardField(input, fieldName, fieldType); }
  clearWizardFieldValidation(input) { return this.manager.clearWizardFieldValidation(input); }

  // Event-specific methods (ported from EventWizardManager)
  createEvent(eventData) {
    if (!this.validateWizardData()) return;
    this.handleSpecialCases();
    const data = Object.assign({ eventType: this.manager.wizardState.eventType }, this.manager.wizardState.data);
    const onComplete = this.manager.wizardState.onComplete;
    if (onComplete) {
      onComplete(data);
      if (this.manager.wizardState.eventType === 'R' && this.manager.wizardState.data.financing === 'mortgage') {
        this.createMortgageEvent(data);
      }
    }
    this.manager.closeWizard();
  }

  createMortgageEvent(propertyEventData) {
    const data = this.manager.wizardState.data;
    const propertyValue = parseFloat(data.propertyValue) || 0;
    const downPayment = parseFloat(data.amount) || 0;
    const loanAmount = propertyValue - downPayment;
    const interestRate = parseFloat(data.mortgageRate) / 100 || 0.035;
    const termYears = parseInt(data.mortgageTerm) || 25;
    const monthlyRate = interestRate / 12;
    const numPayments = termYears * 12;
    const monthlyPayment = (loanAmount > 0 && monthlyRate > 0)
      ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
      : 0;
    const annualPayment = monthlyPayment * 12;
    const mortgageEventData = {
      eventType: 'M',
      name: data.name,
      amount: Math.round(annualPayment),
      fromAge: data.fromAge,
      toAge: parseInt(data.fromAge) + termYears,
      rate: interestRate * 100,
      match: 0
    };
    const onComplete = this.manager.wizardState.onComplete;
    if (onComplete) onComplete(mortgageEventData);
  }

  handleChoiceSpecialCases(stepId, choiceValue) {
    // Currently no special handling needed during choice selection – kept for parity
  }

  handleSpecialCases() {
    const data = this.manager.wizardState.data;
    if (this.manager.wizardState.eventType === 'E') {
      const freq = data.frequency || 'yearly';
      const parseAmount = (val) => { const num = parseFloat(String(val).replace(/[^0-9.]/g, '')); return isNaN(num) ? 0 : num; };
      let annualAmount = parseAmount(data.amount);
      if (freq === 'weekly') annualAmount *= 52; else if (freq === 'monthly') annualAmount *= 12;
      data.amount = Math.round(annualAmount);
      if (freq === 'oneoff') { data.toAge = data.fromAge; data.rate = ''; }
    }

    if (this.manager.wizardState.eventType === 'SI' && data.incomeType === 'salary') {
      const simulationMode = this.webUI.getValue('simulation_mode');
      const person = data.person || 'person1';
      const pensionContribution = data.pensionContribution || 'yes';
      if (simulationMode === 'single') {
        this.manager.wizardState.eventType = pensionContribution === 'yes' ? 'SI' : 'SInp';
      } else {
        if (person === 'person1') this.manager.wizardState.eventType = pensionContribution === 'yes' ? 'SI' : 'SInp';
        else this.manager.wizardState.eventType = pensionContribution === 'yes' ? 'SI2' : 'SI2np';
      }
    } else if (this.manager.wizardState.eventType === 'SI' && data.incomeType) {
      const nonSalaryMap = { rsu: 'UI', rental: 'RI', defined_benefit: 'DBI', tax_free: 'FI' };
      const mappedType = nonSalaryMap[data.incomeType];
      if (mappedType) this.manager.wizardState.eventType = mappedType;
    }
  }

  getCurrentAge() {
    try {
      if (window.webUI && window.webUI.simulator && window.webUI.simulator.currentAge) return parseInt(window.webUI.simulator.currentAge);
    } catch (_) {}
    return null;
  }

  validateWizardData() {
    const data = this.manager.wizardState.data || {};
    const nameValidation = ValidationUtils.validateRequired(data.name, 'Event name');
    if (!nameValidation.isValid) { alert(nameValidation.message); return false; }
    if (this.manager.wizardState.eventType !== 'SM' && this.manager.wizardState.eventType !== 'MV') {
      const amountValidation = ValidationUtils.validateRequired(data.amount, 'Amount');
      if (!amountValidation.isValid) { alert(amountValidation.message); return false; }
    }
    const fromAgeValidation = ValidationUtils.validateRequired(data.fromAge, 'Starting age/year');
    if (!fromAgeValidation.isValid) { alert(fromAgeValidation.message); return false; }
    if (this.manager.wizardState.eventType !== 'SM') {
      if (ValidationUtils.validateValue('money', data.amount) === null) { alert('Please enter a valid amount'); return false; }
    }
    if (ValidationUtils.validateValue('age', data.fromAge) === null) { alert('Please enter a valid starting age/year'); return false; }
    if (data.toAge && data.toAge.trim() !== '') {
      if (ValidationUtils.validateValue('age', data.toAge) === null) { alert('Please enter a valid ending age/year'); return false; }
      const relationship = ValidationUtils.validateAgeRelationship(data.fromAge, data.toAge);
      if (!relationship.isValid) { alert(relationship.message); return false; }
    }
    if (data.rate && data.rate.trim() !== '') {
      if (ValidationUtils.validateValue('percentage', data.rate) === null) { alert('Please enter a valid rate'); return false; }
    } else if (this.manager.wizardState.eventType === 'SM') {
      alert('Market growth value is required');
      return false;
    }
    if (data.match && data.match.trim() !== '') {
      if (ValidationUtils.validateValue('percentage', data.match) === null) { alert('Please enter a valid match percentage'); return false; }
    }
    return true;
  }
}

// Events-specific renderer composed over WizardRenderer
class EventsRenderer extends WizardRenderer {
  constructor(webUI) {
    super(webUI);
  }

  // Period content (fromAge/toAge selection)
  renderPeriodContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-period';

    const description = document.createElement('p');
    description.textContent = this.processTextVariables(step.content.text, wizardState);
    container.appendChild(description);

    const periodContainer = document.createElement('div');
    periodContainer.className = 'event-wizard-period-inputs';
    const labelPosition = step.labelPosition || 'top';
    periodContainer.classList.add(`label-position-${labelPosition}`);

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
    const currentFromValue = wizardState.data.fromAge;
    if (currentFromValue !== undefined) fromInput.value = currentFromValue;
    fromGroup.appendChild(fromLabel);
    fromGroup.appendChild(fromInput);

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
    const currentToValue = wizardState.data.toAge;
    if (currentToValue !== undefined) toInput.value = currentToValue;
    toGroup.appendChild(toLabel);
    toGroup.appendChild(toInput);

    periodContainer.appendChild(fromGroup);
    periodContainer.appendChild(toGroup);
    container.appendChild(periodContainer);

    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.processTextVariables(step.content.help, wizardState);
      container.appendChild(help);
    }

    fromInput.addEventListener('input', () => {
      wizardState.data.fromAge = fromInput.value;
      const wizardManager = this.manager;
      if (wizardManager) {
        wizardManager.clearWizardFieldValidation(fromInput);
      }
      try {
        const f = fromInput.value.trim();
        const t = toInput.value.trim();
        if (f !== '' && t !== '' && parseInt(f) === parseInt(t)) {
          wizardState.data.rate = '';
          const rateEl = document.getElementById('wizard-rate');
          if (rateEl) {
            rateEl.value = '';
            if (wizardManager) wizardManager.clearWizardFieldValidation(rateEl);
          }
        }
      } catch (_) {}
    });

    toInput.addEventListener('input', () => {
      wizardState.data.toAge = toInput.value;
      const wizardManager = this.manager;
      if (wizardManager) {
        wizardManager.clearWizardFieldValidation(toInput);
      }
      try {
        const f = fromInput.value.trim();
        const t = toInput.value.trim();
        if (f !== '' && t !== '' && parseInt(f) === parseInt(t)) {
          wizardState.data.rate = '';
          const rateEl = document.getElementById('wizard-rate');
          if (rateEl) {
            rateEl.value = '';
            if (wizardManager) wizardManager.clearWizardFieldValidation(rateEl);
          }
        }
      } catch (_) {}
    });

    fromInput.addEventListener('blur', () => {
      const wizardManager = this.manager;
      if (!wizardManager) return;
      if (fromInput.value.trim() !== '') wizardManager.validateWizardField(fromInput, 'fromAge', 'age');
    });
    toInput.addEventListener('blur', () => {
      const wizardManager = this.manager;
      if (!wizardManager) return;
      if (toInput.value.trim() !== '') wizardManager.validateWizardField(toInput, 'toAge', 'age');
    });

    const handleEnterKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target === fromInput) { toInput.focus(); return; }
        fromInput.blur();
        toInput.blur();
        const wizardManager = this.manager;
        if (wizardManager && wizardManager.isActive) wizardManager.nextStep();
      }
    };
    fromInput.addEventListener('keydown', handleEnterKey);
    toInput.addEventListener('keydown', handleEnterKey);

    return container;
  }

  // Summary content
  renderSummaryContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-summary';
    if (step.content && step.content.text) {
      const description = document.createElement('p');
      description.textContent = this.processTextVariables(step.content.text, wizardState);
      container.appendChild(description);
    }
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'event-wizard-summary-details';
    let summaryText = this.generateSummaryText(step, wizardState);
    summaryText = summaryText.replace(/\\n/g, '\n').replace(/\/n/g, '\n');
    const lines = summaryText.split('\n');
    if (lines.length === 1) {
      const single = document.createElement('div');
      single.className = 'event-wizard-summary-text';
      single.innerHTML = lines[0];
      summaryContainer.appendChild(single);
    } else {
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

  // Mortgage content
  renderMortgageContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-mortgage';
    const description = document.createElement('p');
    description.textContent = this.processTextVariables(step.content.text, wizardState);
    container.appendChild(description);
    const mortgageContainer = document.createElement('div');
    mortgageContainer.className = 'event-wizard-mortgage-details';
    const propertyValue = parseFloat(wizardState.data.propertyValue) || 0;
    const downPayment = parseFloat(wizardState.data.amount) || 0;
    const loanAmount = propertyValue - downPayment;
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

    const labelPosition = step.labelPosition || 'left';
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
    rateInput.inputMode = 'numeric';
    rateInput.pattern = '[0-9]*';
    const currentRate = wizardState.data.mortgageRate;
    if (currentRate !== undefined) rateInput.value = currentRate;
    rateGroup.appendChild(rateLabel);
    rateGroup.appendChild(rateInput);
    mortgageContainer.appendChild(rateGroup);

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
    const currentTerm = wizardState.data.mortgageTerm;
    if (currentTerm !== undefined) termInput.value = currentTerm;
    termGroup.appendChild(termLabel);
    termGroup.appendChild(termInput);
    mortgageContainer.appendChild(termGroup);
    container.appendChild(mortgageContainer);

    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.processTextVariables(step.content.help, wizardState);
      container.appendChild(help);
    }

    rateInput.addEventListener('input', () => {
      wizardState.data.mortgageRate = rateInput.value;
      this.updateMortgageCalculation(wizardState, calculationSummary);
    });
    termInput.addEventListener('input', () => {
      wizardState.data.mortgageTerm = termInput.value;
      this.updateMortgageCalculation(wizardState, calculationSummary);
    });

    const handleEnterKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const wizardManager = this.manager;
        if (wizardManager && wizardManager.isActive) wizardManager.nextStep();
      }
    };
    rateInput.addEventListener('keydown', handleEnterKey);
    termInput.addEventListener('keydown', handleEnterKey);

    return container;
  }

  // Text variable processing
  processTextVariables(text, wizardState) {
    if (!text) return text;
    const data = wizardState.data || {};
    const variables = { ...data, ...this.computeDerivedVariables(data) };
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      const val = variables[key];
      return (val !== undefined && val !== null && val !== '') ? val : '';
    });
  }

  generateSummaryText(step, wizardState) {
    const template = this.getSummaryTemplate(step, wizardState) || 'Event details will be shown here.';
    const growthRequested = this.stepRequestsGrowth(step, wizardState);
    return this.processTextVariablesWithGrowth(template, wizardState, growthRequested);
  }

  stepRequestsGrowth(step, wizardState) {
    try {
      const wizard = this.manager?.currentWizard;
      if (!wizard || !Array.isArray(wizard.steps)) return false;
      for (const s of wizard.steps) {
        if (!s) continue;
        if (s.field === 'rate') {
          const cond = s.condition;
          if (!cond) return true;
          try {
            const ctx = { ...wizardState.data, ...wizardState };
            return this.evaluateCondition(cond, ctx);
          } catch (_) { return false; }
        }
      }
    } catch (_) {}
    return false;
  }

  processTextVariablesWithGrowth(text, wizardState, growthRequested) {
    if (!text) return text;
    const data = wizardState.data || {};
    const isProperty = (wizardState && wizardState.eventType) ? ['R','M'].includes(wizardState.eventType) : false;
    const derived = this.computeDerivedVariables(data, growthRequested, isProperty);
    const variables = { ...data, ...derived };
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      const val = variables[key];
      return (val !== undefined && val !== null && val !== '') ? val : '';
    });
  }

  getSummaryTemplate(step, wizardState) {
    const dataCtx = { ...wizardState, ...wizardState.data };
    const tplArr = step.content?.templates;
    if (Array.isArray(tplArr)) {
      for (const entry of tplArr) {
        if (!entry) continue;
        const condition = entry.condition;
        if (!condition || this.evaluateCondition(condition, dataCtx)) return entry.template;
      }
    }
    return step.content?.template;
  }

  evaluateCondition(condition, context) {
    if (!condition) return true;
    try {
      let expr = String(condition);
      const dataCtx = context || {};
      Object.keys(dataCtx).forEach((key) => {
        const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${esc}\\b`, 'g');
        const val = (dataCtx[key] === undefined) ? 'undefined' : JSON.stringify(dataCtx[key]);
        expr = expr.replace(re, val);
      });
      expr = expr.replace(/'/g, '"');
      const withoutStrings = expr.replace(/"[^"\\]*"/g, '');
      if (!/^[\s0-9.\-+*/%<>=!&|()?:,]*$/.test(withoutStrings)) return false;
      // eslint-disable-next-line no-new-func
      return !!(new Function('return (' + expr + ');'))();
    } catch (err) {
      try { console.warn('Failed to evaluate condition:', condition, err); } catch (_) {}
      return false;
    }
  }

  computeDerivedVariables(data, growthRequested = false, isProperty = false) {
    const derived = {};
    derived.name = `<strong>${data.name || 'Unnamed Event'}</strong>`;
    const toNumber = (v) => { const num = parseFloat(v); return isNaN(num) ? 0 : num; };
    if (data.amount !== undefined) derived.amount = this.formatCurrency(toNumber(data.amount));
    if (data.propertyValue !== undefined) derived.propertyValue = this.formatCurrency(toNumber(data.propertyValue));
    if (data.frequency) {
      const freqMap = { oneoff: 'one-off', weekly: 'weekly', monthly: 'monthly', yearly: 'annual' };
      derived.frequencyText = freqMap[data.frequency] || data.frequency;
      const factor = { weekly: 52, monthly: 12, yearly: 1 }[data.frequency];
      if (factor && data.amount !== undefined) derived.annualAmount = this.formatCurrency(toNumber(data.amount) * factor);
    }
    if (growthRequested) {
      if (data.rate === undefined || data.rate === '' || data.rate === 'inflation') {
        const verb = isProperty ? 'appreciating' : 'growing';
        derived.rate = 'inflation';
        derived.growthPart = `, ${verb} at the inflation rate`;
      } else {
        const n = parseFloat(data.rate);
        if (!isNaN(n)) {
          let verb; if (isProperty) verb = (n < 0) ? 'depreciating' : 'appreciating'; else verb = (n < 0) ? 'shrinking' : 'growing';
          derived.rate = `${Math.abs(n)}%`;
          derived.rateAbs = Math.abs(n);
          derived.growthPart = `, ${verb} at ${Math.abs(n)}% per year`;
          derived.direction = n < 0 ? 'crash' : 'boom';
        } else {
          derived.growthPart = '';
        }
      }
    } else {
      derived.growthPart = '';
    }
    try {
      const hasDest = (data && (data.destCountryCode || (typeof data.eventType === 'string' && data.eventType.indexOf('MV-') === 0)));
      if (hasDest) {
        const code = (data.destCountryCode || data.eventType.substring(3) || '').toLowerCase();
        try {
          const cfg = (typeof Config !== 'undefined' && typeof Config.getInstance === 'function') ? Config.getInstance() : null;
          const rs = cfg && typeof cfg.getCachedTaxRuleSet === 'function' ? cfg.getCachedTaxRuleSet(code) : null;
          if (rs) {
            if (typeof rs.getCurrencyCode === 'function') derived.destCurrency = rs.getCurrencyCode() || code.toUpperCase();
          }
        } catch (_) {}
        try {
          const cfg = (typeof Config !== 'undefined' && typeof Config.getInstance === 'function') ? Config.getInstance() : null;
          const econ = cfg && typeof cfg.getEconomicData === 'function' ? cfg.getEconomicData() : null;
          if (!derived.destInflation && econ && typeof econ.getInflation === 'function') {
            var inflationGuess = econ.getInflation(code);
            if (inflationGuess != null && isFinite(inflationGuess)) {
              derived.destInflation = `${Number(inflationGuess).toFixed(1)}%`;
            }
          }
          if (!derived.destInflation) {
            const rs = cfg && typeof cfg.getCachedTaxRuleSet === 'function' ? cfg.getCachedTaxRuleSet(code) : null;
            if (rs && typeof rs.getInflationRate === 'function') {
              const infRate = rs.getInflationRate();
              if (typeof infRate === 'number') {
                derived.destInflation = `${(infRate * 100).toFixed(1)}%`;
              }
            }
          }
          let start = null;
          try { if (this.context && typeof this.context.getValue === 'function') start = this.context.getValue('StartCountry'); } catch (_) {}
          if (!start) {
            try { const cfg2 = (typeof Config !== 'undefined' && typeof Config.getInstance === 'function') ? Config.getInstance() : null; start = cfg2 && typeof cfg2.getDefaultCountry === 'function' ? cfg2.getDefaultCountry() : null; } catch (_) {}
          }
          if (start && econ && typeof econ.getPPP === 'function') {
            const from = String(start).toLowerCase();
            const to = code;
            const pppCross = econ.getPPP(from, to);
            const fxCross = (typeof econ.getFX === 'function') ? econ.getFX(from, to) : null;
            let colRatio = null;
            if (typeof pppCross === 'number' && isFinite(pppCross) && pppCross > 0 && typeof fxCross === 'number' && isFinite(fxCross) && fxCross > 0) {
              colRatio = pppCross / fxCross;
              derived.destCoL = `${colRatio.toFixed(2)}x`;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    if (data.mortgageRate !== undefined) derived.mortgageRate = `${data.mortgageRate}%`;
    if (data.mortgageAnnualPayment !== undefined) derived.mortgageAnnualPayment = this.formatCurrency(toNumber(data.mortgageAnnualPayment));
    if (data.mortgageMonthlyPayment !== undefined) derived.mortgageMonthlyPayment = this.formatCurrency(toNumber(data.mortgageMonthlyPayment));
    if (data.match !== undefined && data.match !== '') { derived.match = `${data.match}%`; derived.matchPart = `, employer matches up to ${data.match}%`; } else { derived.matchPart = ''; }
    if (data.mortgageTerm !== undefined) derived.mortgageTerm = data.mortgageTerm;
    if (data.propertyValue !== undefined && data.amount !== undefined) {
      const pv = toNumber(data.propertyValue); const dp = toNumber(data.amount);
      if (pv > 0 && dp >= 0) { const pct = Math.round((dp / pv) * 100); derived.downPaymentPct = `${pct}%`; } else { derived.downPaymentPct = ''; }
    } else { derived.downPaymentPct = ''; }
    if (data.incomeType) derived.incomeType = String(data.incomeType).replace('_',' ');
    if (data.fromAge !== undefined && data.fromAge !== null && data.fromAge !== '') {
      const from = parseInt(data.fromAge); const to = parseInt(data.toAge);
      const mode = this.context?.eventsTableManager?.ageYearMode || 'age';
      const unit = mode === 'age' ? 'age' : 'year';
      if (!isNaN(from)) {
        if (isNaN(to) || to === 999) derived.periodPhrase = `from ${unit} ${from}`;
        else if (from === to) derived.periodPhrase = `at ${unit} ${from}`;
        else derived.periodPhrase = `from ${unit} ${from} to ${unit} ${to}`;
      } else { derived.periodPhrase = ''; }
    } else { derived.periodPhrase = ''; }
    return derived;
  }

  updateMortgageCalculation(wizardState, calculationElement) {
    const propertyValue = parseFloat(wizardState.data.propertyValue) || 0;
    const downPayment = parseFloat(wizardState.data.amount) || 0;
    const loanAmount = propertyValue - downPayment;
    const rateRaw = wizardState.data.mortgageRate;
    const termRaw = wizardState.data.mortgageTerm;
    const rate = parseFloat(rateRaw);
    const term = parseFloat(termRaw);
    let monthlyPayment = 0;
    if (!isNaN(rate) && !isNaN(term) && rate > 0 && term > 0 && loanAmount > 0) {
      const monthlyRate = rate / 100 / 12;
      const numPayments = term * 12;
      monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    }
    const annualPayment = monthlyPayment * 12;
    const paymentRows = monthlyPayment > 0 ? `
      <div class="calculation-row calculation-payment-monthly">
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
    if (monthlyPayment > 0) {
      wizardState.data.mortgageAnnualPayment = annualPayment;
      wizardState.data.mortgageMonthlyPayment = monthlyPayment;
    } else {
      delete wizardState.data.mortgageAnnualPayment;
      delete wizardState.data.mortgageMonthlyPayment;
    }
  }

  getAgeYearLabel(prefix) {
    const mode = this.context?.eventsTableManager?.ageYearMode || 'age';
    return mode === 'age' ? `${prefix} Age` : `${prefix} Year`;
  }

  getAgeYearPlaceholder(type) {
    const mode = this.context?.eventsTableManager?.ageYearMode || 'age';
    if (mode === 'age') return type === 'from' ? '25' : '65';
    const currentYear = new Date().getFullYear();
    return type === 'from' ? currentYear.toString() : (currentYear + 40).toString();
  }

  formatCurrency(value) {
    try { return FormatUtils.formatCurrency(value); } catch (err) { const num = parseFloat(value) || 0; return num.toString(); }
  }
}

