/* Generic Wizard Renderer (non-module, browser global) */

class WizardRenderer {

  constructor(context) {
    this.context = context; // typically webUI
    this.manager = null; // may be set by manager
  }

  render(step, wizardState) {
    const content = document.createElement('div');
    content.className = `event-wizard-content event-wizard-content-${step.contentType}`;
    switch (step.contentType) {
      case 'intro':
        content.appendChild(this.renderIntroContent(step, wizardState));
        break;
      case 'input':
        content.appendChild(this.renderInputContent(step, wizardState));
        break;
      case 'choice':
        content.appendChild(this.renderChoiceContent(step, wizardState));
        break;
      case 'period':
        if (typeof this.renderPeriodContent === 'function') content.appendChild(this.renderPeriodContent(step, wizardState));
        break;
      case 'summary':
        if (typeof this.renderSummaryContent === 'function') content.appendChild(this.renderSummaryContent(step, wizardState));
        break;
      case 'mortgage':
        if (typeof this.renderMortgageContent === 'function') content.appendChild(this.renderMortgageContent(step, wizardState));
        break;
      default:
        content.appendChild(this.renderTextContent(step));
    }
    return content;
  }

  renderIntroContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-intro';
    const text = document.createElement('p');
    try {
      text.textContent = this.processTextVariables(step.content.text, wizardState);
    } catch (_) {
      text.textContent = step.content.text;
    }
    container.appendChild(text);
    return container;
  }

  renderInputContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-input';

    const inputGroup = document.createElement('div');
    inputGroup.className = 'event-wizard-input-group';
    const labelPosition = step.labelPosition || 'left';
    inputGroup.classList.add(`label-position-${labelPosition}`);

    const label = document.createElement('label');
    const idSuffix = step.field === 'name' ? 'alias' : step.field;
    label.htmlFor = `wizard-${idSuffix}`;
    label.textContent = this.processTextVariables(step.content.text, wizardState);

    const inputType = step.content.inputType;
    const isCountryInput = inputType === 'country';
    const input = document.createElement(isCountryInput ? 'select' : 'input');
    input.id = `wizard-${idSuffix}`;
    input.name = idSuffix;
    if (isCountryInput) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = step.content.placeholder || 'Select country';
      input.appendChild(placeholder);

      const countries = Config.getInstance().getAvailableCountries();
      countries.forEach((country) => {
        const option = document.createElement('option');
        option.value = country.code || '';
        option.textContent = country.name || country.code || '';
        input.appendChild(option);
      });
    } else {
      input.type = 'text';
      input.placeholder = step.content.placeholder || '';
      const numericInputTypes = ['currency', 'percentage', 'age', 'number'];
      if (numericInputTypes.includes(inputType)) {
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
      }

      if (inputType === 'currency') input.className = 'currency-input';
      else if (inputType === 'percentage') input.className = 'percentage-input';
      else if (inputType === 'age') input.className = 'age-input';
    }

    const currentValue = (wizardState.data[step.field] !== undefined)
      ? wizardState.data[step.field]
      : (step.field === 'destCountryCode' ? wizardState.data.name : undefined);
    if (currentValue !== undefined) input.value = currentValue;

    inputGroup.appendChild(label);
    inputGroup.appendChild(input);
    container.appendChild(inputGroup);

    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.processTextVariables(step.content.help, wizardState);
      container.appendChild(help);
    }

    const syncInputValue = () => {
      wizardState.data[step.field] = input.value;
      const mgr = this.manager || this.context?.eventsWizard?.manager;
      if (mgr && typeof mgr.clearWizardFieldValidation === 'function') mgr.clearWizardFieldValidation(input);
    };
    input.addEventListener('input', syncInputValue);
    if (isCountryInput) input.addEventListener('change', syncInputValue);

    input.addEventListener('blur', () => {
      const mgr = this.manager || this.context?.eventsWizard?.manager;
      if (mgr && typeof mgr.validateWizardField === 'function') mgr.validateWizardField(input, step.field, step.content.inputType);
      const validationRules = (step.content && step.content.validation) || '';
      if (!mgr || !validationRules) return;
      const rules = validationRules.split('|').map(r => r.trim());
      rules.forEach((r) => {
        const m = r.match(/^(lt|lte|gt|gte):(.+)$/);
        if (!m) return;
        const comparator = m[1];
        const otherField = m[2];
        const otherValRaw = wizardState.data[otherField];
        const thisValNum = parseFloat(input.value.replace(/[^0-9.-]/g, ''));
        const otherValNum = parseFloat((otherValRaw || '').toString().replace(/[^0-9.-]/g, ''));
        if (isNaN(thisValNum) || isNaN(otherValNum)) return;
        let valid = true;
        switch (comparator) {
          case 'lt': valid = thisValNum < otherValNum; break;
          case 'lte': valid = thisValNum <= otherValNum; break;
          case 'gt': valid = thisValNum > otherValNum; break;
          case 'gte': valid = thisValNum >= otherValNum; break;
        }
        if (!valid) {
          const comparatorTextMap = { lt: 'less than', lte: 'less than or equal to', gt: 'greater than', gte: 'greater than or equal to' };
          const comparatorText = comparatorTextMap[comparator] || comparator;
          const message = `Value must be ${comparatorText} ${otherField.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
          if (typeof mgr.showWizardFieldValidation === 'function') mgr.showWizardFieldValidation(input, message);
        }
      });
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
        const mgr = this.manager || this.context?.eventsWizard?.manager;
        if (!mgr || !mgr.isActive) return;
        if (mgr._pendingNextTimeouts && mgr._pendingNextTimeouts.length) {
          mgr._pendingNextTimeouts.forEach(t => clearTimeout(t));
          mgr._pendingNextTimeouts = [];
        }
        const timeoutId = setTimeout(() => {
          mgr.nextStep('input');
          mgr._pendingNextTimeouts = (mgr._pendingNextTimeouts || []).filter(id => id !== timeoutId);
        }, 60);
        mgr._pendingNextTimeouts.push(timeoutId);
      }
    });

    return container;
  }

  renderChoiceContent(step, wizardState) {
    const container = document.createElement('div');
    container.className = 'event-wizard-choice';

    const description = document.createElement('p');
    description.textContent = step.content.text;
    container.appendChild(description);

    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'event-wizard-choices';

    step.content.choices.forEach((choice, index) => {
      const choiceElement = document.createElement('div');
      choiceElement.className = 'event-wizard-choice-option';
      choiceElement.dataset.value = choice.value;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'wizardChoice';
      radio.value = choice.value;
      radio.id = `choice-${index}`;

      const currentValue = wizardState.data[step.stepId];
      if (currentValue === choice.value) {
        radio.checked = true;
        choiceElement.classList.add('selected');
      }

      const label = document.createElement('label');
      label.htmlFor = `choice-${index}`;
      const title = document.createElement('div');
      title.className = 'event-wizard-choice-title';
      title.textContent = choice.title;
      const desc = document.createElement('div');
      desc.className = 'event-wizard-choice-description';
      desc.textContent = choice.description;
      label.appendChild(title);
      label.appendChild(desc);

      choiceElement.appendChild(radio);
      choiceElement.appendChild(label);

      choiceElement.addEventListener('click', () => {
        const alreadySelected = choiceElement.classList.contains('selected');
        if (!alreadySelected) {
          choicesContainer.querySelectorAll('.event-wizard-choice-option').forEach(opt => {
            opt.classList.remove('selected');
            const inp = opt.querySelector('input');
            if (inp) inp.checked = false;
          });
          choiceElement.classList.add('selected');
          radio.checked = true;
          wizardState.data[step.stepId] = choice.value;
          const mgr = this.manager || this.context?.eventsWizard?.manager;
          if (mgr && typeof mgr.handleChoiceSpecialCases === 'function') mgr.handleChoiceSpecialCases(step.stepId, choice.value);
        }
        const mgr = this.manager || this.context?.eventsWizard?.manager;
        if (mgr) mgr.nextStep('choice');
      });

      choicesContainer.appendChild(choiceElement);
    });

    container.appendChild(choicesContainer);
    return container;
  }

  renderTextContent(step) {
    const container = document.createElement('div');
    container.innerHTML = `<p>${step.content.text || 'Content not available'}</p>`;
    return container;
  }

  // Utilities
  getRelocationResidenceCountryForAge(wizardState) {
    const cfg = Config.getInstance();
    const startRaw = (this.context && typeof this.context.getValue === 'function')
      ? this.context.getValue('StartCountry')
      : '';
    let residenceCountry = String(startRaw || cfg.getDefaultCountry()).trim().toLowerCase();
    const rawAge = wizardState && wizardState.data ? wizardState.data.fromAge : null;
    const relocationAge = parseFloat(rawAge);
    if (isNaN(relocationAge)) return residenceCountry;
    if (!(this.context && typeof this.context.readEvents === 'function')) return residenceCountry;

    const events = this.context.readEvents(false) || [];
    const relocations = [];
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!evt || evt.type !== 'MV') continue;
      const age = parseFloat(evt.fromAge);
      if (isNaN(age) || age >= relocationAge) continue;
      const countryCode = String(getRelocationCountryCode(evt) || '').trim().toLowerCase();
      if (!countryCode) continue;
      relocations.push({ age, countryCode, index: i });
    }
    relocations.sort((a, b) => (a.age === b.age ? a.index - b.index : a.age - b.age));
    for (let i = 0; i < relocations.length; i++) {
      residenceCountry = relocations[i].countryCode;
    }
    return residenceCountry;
  }

  getCurrencyLabelForCountry(countryCode) {
    const code = String(countryCode || '').trim().toLowerCase();
    if (!code) return '';
    const ruleset = Config.getInstance().getCachedTaxRuleSet(code);
    const currencyCode = (ruleset && typeof ruleset.getCurrencyCode === 'function')
      ? (ruleset.getCurrencyCode() || code.toUpperCase())
      : code.toUpperCase();
    const currencySymbol = (ruleset && typeof ruleset.getCurrencySymbol === 'function')
      ? (ruleset.getCurrencySymbol() || '')
      : '';
    return currencySymbol ? `${currencyCode} (${currencySymbol})` : currencyCode;
  }

  processTextVariables(text, wizardState) {
    if (!text) return text;
    const data = (wizardState && wizardState.data) ? wizardState.data : {};
    const derived = {};
    const destinationCode = String(data.destCountryCode || data.name || '').trim().toLowerCase();
    if (destinationCode) {
      const currencyLabel = this.getCurrencyLabelForCountry(destinationCode);
      const currencyCodeMatch = currencyLabel.match(/^[A-Z]+/);
      derived.destCurrencyLabel = currencyLabel;
      derived.destCurrency = currencyCodeMatch ? currencyCodeMatch[0] : destinationCode.toUpperCase();
    }
    if (wizardState && wizardState.eventType === 'MV') {
      const preMoveCountry = this.getRelocationResidenceCountryForAge(wizardState);
      const preMoveCurrency = this.getCurrencyLabelForCountry(preMoveCountry);
      if (preMoveCurrency) {
        derived.relocationCostCurrencyLabel = preMoveCurrency;
      }
    }
    const variables = Object.assign({}, data, derived);
    return text.replace(/\{([^}]+)\}/g, (m, key) => {
      const val = variables[key];
      return (val !== undefined && val !== null && val !== '') ? val : '';
    });
  }
}
