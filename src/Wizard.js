class Wizard {
  constructor() {
    this.driver = window.driver.js.driver;
    this.tour = null;
    this.config = null;
    this.lastFocusedField = null;
    this.lastFocusedWasInput = false;
    this.lastStepIndex = 0;
    this.followFocus = this.followFocus.bind(this);
    this.handleTabKey = this.handleTabKey.bind(this);
    document.addEventListener('focusin', this.followFocus);
  }

  processMarkdownLinks(text) {
    if (!text) return text;
    return text.replace(
      /\[([^\]]+)\]\(([^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  async loadConfig() {
    try {
      const response = await fetch('./wizardConfig.yml');
      const yamlText = await response.text();
      this.config = jsyaml.load(yamlText);
      this.config.steps = this.config.steps.map(step => {
        step.popover.description = this.processMarkdownLinks(step.popover.description);
        return step;
      });
    } catch (error) {
      console.error('Failed to load wizard configuration:', error);
    }
  }

  async start() {
    if (!this.config) {
      await this.loadConfig();
    }

    let startingStepIndex = this.lastFocusedWasInput ? (this.getLastFocusedFieldIndex() || this.lastStepIndex) : this.lastStepIndex;
    document.querySelector(this.config.steps[startingStepIndex].element).focus();

    this.tour = this.driver({
      showProgress: true,
      animate: true,
      allowKeyboardControl: false,
      steps: this.config.steps,
      onNextClick: (element) => {
        const nextIndex = this.tour.getActiveIndex() + 1;
        if (nextIndex < this.config.steps.length) {
          const nextElement = document.querySelector(this.config.steps[nextIndex].element);
          nextElement.focus();
        }
        this.tour.moveNext();
      },
      onPreviousClick: (element) => {
        const prevIndex = this.tour.getActiveIndex() - 1;
        if (prevIndex >= 0) {
          const prevElement = document.querySelector(this.config.steps[prevIndex].element);
          prevElement.focus();
        }
        this.tour.movePrevious();
      },
      onDestroyStarted: () => this.finishTour()
    });

    document.addEventListener('keydown', this.handleTabKey);
    
    this.tour.drive(startingStepIndex);
  }

  getLastFocusedFieldIndex() {
    const index = this.config.steps.findIndex(step => {
      const stepElement = document.querySelector(step.element);
      return stepElement === this.lastFocusedField;
    });
    return index >= 0 ? index : null;
  }

  followFocus(event) {
    if (!event.target.matches('#startWizard')) {
      if (event.target.matches('input, textarea, select')) {
        this.lastFocusedField = event.target;
        this.lastFocusedWasInput = true;
      } else {
        this.lastFocusedWasInput = false;
      }
    }
  }

  finishTour() {
    document.removeEventListener('keydown', this.handleTabKey);
    this.lastStepIndex = this.tour.getActiveIndex()
    this.tour.destroy();
  }

  handleTabKey(event) {
    if (event.key === 'Escape') {
      this.finishTour();
      return;
    }
    
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) {
        if (this.tour.hasPreviousStep()) {
          this.tour.movePrevious();
        }
      } else {
        if (this.tour.hasNextStep()) {
          this.tour.moveNext();
        }
      }
      const currentIndex = this.tour.getActiveIndex();
      const currentElement = document.querySelector(this.config.steps[currentIndex].element);
      currentElement.focus();
    }
  }

}
