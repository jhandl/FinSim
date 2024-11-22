class Wizard {
  constructor() {
    this.driver = window.driver.js.driver;
    this.tour = null;
    this.config = null;
    this.lastFocusedElement = null;

    document.addEventListener('focusin', (e) => {
      if (!e.target.matches('#startWizard')) {
        this.lastFocusedElement = e.target;
      }
    });
  }

  async loadConfig() {
    try {
      const { tourConfig } = await import('./wizardConfig.js');
      this.config = tourConfig;
    } catch (error) {
      console.error('Failed to load wizard configuration:', error);
    }
  }

  async start() {
    if (!this.config) {
      await this.loadConfig();
    }

    let startingStepIndex = this.config.steps.findIndex(step => {
      const stepElement = document.querySelector(step.element);
      const found = stepElement === this.lastFocusedElement;
      return found;
    });

    if (startingStepIndex === -1) {
      startingStepIndex = 0;
    }

    this.tour = this.driver({
      showProgress: true,
      animate: true,
      steps: this.config.steps,
      onDestroyStarted: () => {
        document.removeEventListener('keydown', this.handleTabKey);
        this.tour.destroy();
      }
    });

    this.tour.drive(startingStepIndex);

    this.handleTabKey = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) {
          this.tour.movePrevious();
        } else {
          this.tour.moveNext();
        }
      }
    };

    document.addEventListener('keydown', this.handleTabKey);
  }
}
