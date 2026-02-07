/* Drag and drop functionality */

class DragAndDrop {

  constructor(webUI) {
    this.webUI = webUI;
    this.dragSrcEl = null;
    this.priorityIcons = {
      cash: '💰',
      pension: '🏦'
    };
    this.setupPriorityDragAndDrop();
  }

  setupPriorityDragAndDrop() {
    const container = document.querySelector('.priorities-container');
    if (!container) return;

    const items = container.querySelectorAll('.priority-item');
    
    items.forEach(item => {
      // Make the item draggable
      item.setAttribute('draggable', 'true');
      
      item.addEventListener('dragstart', (e) => {
        this.dragSrcEl = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.updatePriorityValues();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = container.querySelector('.dragging');
        if (dragging && dragging !== item) {
          const rect = item.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          if (e.clientY < midpoint) {
            container.insertBefore(dragging, item);
          } else {
            container.insertBefore(dragging, item.nextSibling);
          }
        }
      });
    });
  }

  updatePriorityValues() {
    const items = document.querySelectorAll('.priority-item');
    items.forEach((item, index) => {
      const input = item.querySelector('input');
      if (input) {
        input.value = index + 1;
      }
    });
  }

  async renderPriorities() {
    const container = document.querySelector('.priorities-container');
    if (!container) return;

    const cfg = Config.getInstance();
    const scenarioCountries = this.webUI.getScenarioCountries();
    for (let i = 0; i < scenarioCountries.length; i++) {
      const code = scenarioCountries[i];
      if (!cfg.getCachedTaxRuleSet(code)) {
        await cfg.getTaxRuleSet(code);
      }
    }

    const priorities = this.getPriorityConfigs();
    const existingValues = {};
    const existingItems = container.querySelectorAll('.priority-item');
    existingItems.forEach(item => {
      const id = item.getAttribute('data-priority-id');
      const input = item.querySelector('input');
      const raw = input ? parseInt(input.value, 10) : NaN;
      if (id) {
        existingValues[id] = Number.isFinite(raw) && raw > 0 ? raw : null;
      }
    });

    container.innerHTML = '';

    priorities.forEach((priority, index) => {
      const type = priority.type;
      const fieldId = priority.fieldId;
      const item = document.createElement('div');
      item.className = 'priority-item';
      item.setAttribute('draggable', 'true');
      item.setAttribute('data-priority-id', fieldId);

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      item.appendChild(handle);

      const icon = document.createElement('div');
      icon.className = 'priority-icon';
      icon.textContent = this.priorityIcons[type] || '📊';
      item.appendChild(icon);

      const label = document.createElement('div');
      label.className = 'priority-label';
      label.textContent = priority.label || type;
      item.appendChild(label);

      const input = document.createElement('input');
      input.type = 'hidden';
      input.id = fieldId;
      input.value = existingValues[fieldId] || (index + 1);
      item.appendChild(input);

      container.appendChild(item);
    });

    Array.from(container.querySelectorAll('.priority-item'))
      .sort((a, b) => {
        const av = parseInt((a.querySelector('input') || {}).value, 10) || 0;
        const bv = parseInt((b.querySelector('input') || {}).value, 10) || 0;
        return av - bv;
      })
      .forEach(item => container.appendChild(item));

    this.updatePriorityValues();
    this.setupPriorityDragAndDrop();
  }

  getPriorityConfigs() {
    const cfg = Config.getInstance();
    const startCountry = cfg.getStartCountry();
    const startRuleset = cfg.getCachedTaxRuleSet(startCountry);
    const startTypes = startRuleset.getResolvedInvestmentTypes() || [];
    const scenarioCountries = this.webUI.getScenarioCountries();
    const showCountrySuffix = cfg.isRelocationEnabled() && scenarioCountries.length > 1;
    const baseTypes = new Set();
    const baseTypeCountries = {};
    baseTypes.add('cash');
    let includePension = false;

    const countriesForTypes = [];
    if (startCountry) countriesForTypes.push(startCountry);
    for (let i = 0; i < scenarioCountries.length; i++) {
      if (countriesForTypes.indexOf(scenarioCountries[i]) === -1) {
        countriesForTypes.push(scenarioCountries[i]);
      }
    }

    for (let i = 0; i < countriesForTypes.length; i++) {
      const country = countriesForTypes[i];
      const ruleset = cfg.getCachedTaxRuleSet(country);
      if (!ruleset) continue;
      if (ruleset && typeof ruleset.hasPrivatePensions === 'function' && ruleset.hasPrivatePensions()) {
        includePension = true;
      }
      const investmentTypes = ruleset.getResolvedInvestmentTypes() || [];
      for (let j = 0; j < investmentTypes.length; j++) {
        const type = investmentTypes[j];
        if (!type || !type.key || type.sellWhenReceived) continue;
        const baseType = String(type.key).split('_')[0];
        if (baseType) {
          baseTypes.add(baseType);
        }
        const keyParts = String(type.key).split('_');
        if (keyParts.length < 2) continue;
        const countrySuffix = keyParts[keyParts.length - 1].toLowerCase();
        if (!countrySuffix) continue;
        if (!cfg.getCachedTaxRuleSet(countrySuffix)) continue;
        if (!baseTypeCountries[baseType]) {
          baseTypeCountries[baseType] = countrySuffix;
        }
      }
    }
    if (includePension) baseTypes.add('pension');

    const sortedBaseTypes = Array.from(baseTypes).sort((a, b) => {
      if (a === b) return 0;
      if (a === 'cash') return -1;
      if (b === 'cash') return 1;
      if (a === 'pension') return -1;
      if (b === 'pension') return 1;
      return a.localeCompare(b);
    });

    return sortedBaseTypes.map(baseType => {
      let label = baseType.charAt(0).toUpperCase() + baseType.slice(1);
      if (baseType === 'cash') label = 'Cash';
      if (baseType === 'pension') label = 'Pension';
      if (baseType !== 'cash' && baseType !== 'pension') {
        const startType = startTypes.find(t => t && t.key && String(t.key).split('_')[0] === baseType);
        if (startType && startType.label) {
          label = startType.label;
        }
        if (showCountrySuffix && baseTypeCountries[baseType]) {
          const suffix = '(' + baseTypeCountries[baseType].toUpperCase() + ')';
          if (String(label).toUpperCase().indexOf(suffix) === -1) {
            label = label + ' ' + suffix;
          }
        }
      }
      return {
        type: baseType,
        fieldId: `Priority_${baseType}`,
        label: label
      };
    });
  }

}
