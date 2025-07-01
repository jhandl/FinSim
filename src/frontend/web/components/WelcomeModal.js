class WelcomeModal {
  constructor() {
    this.modal = null;
    this.contentData = null;
    this.onTourStartCallback = null;
    this.onSkipCallback = null;
  }

  async loadContent() {
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/src/frontend/web/assets/help.yml?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const yamlText = await response.text();
      const raw = jsyaml.load(yamlText);

      // Expand ${} variables first
      const processed = FormatUtils.processVariablesInObject(raw);

      // Extract WelcomeTabs (fallback to legacy tabs if needed)
      const tabsArray = (processed && processed.WelcomeTabs) ? processed.WelcomeTabs : (processed.tabs || []);

      // Convert markdown links inside tab content
      tabsArray.forEach(tab => {
        if (tab.content) {
          tab.content = FormatUtils.processMarkdownLinks(tab.content);
        }
      });

      // Store in the existing structure expected by createTabs()/createTabContent()
      this.contentData = { tabs: tabsArray };
    } catch (error) {
      console.error('Failed to load welcome content:', error);
      // Fallback content
      this.contentData = {
        tabs: [
          {
            id: 'getting-started',
            title: 'Getting Started',
            content: '<p>Welcome to the Ireland Financial Simulator!</p><p>This tool helps you understand how different decisions affect your financial future.</p>'
          }
        ]
      };
    }
  }

  async show(onTourStart, onSkip) {
    this.onTourStartCallback = onTourStart;
    this.onSkipCallback = onSkip;

    if (!this.contentData) {
      await this.loadContent();
    }

    this.createModal();
    this.setupEventListeners();

    // Show modal with animation
    document.body.classList.add('modal-open');
    this.modal.style.display = 'flex';
    setTimeout(() => {
      this.modal.classList.add('visible');
      // Focus the modal so Esc key works immediately
      this.modal.focus();
    }, 10);
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'welcome-modal';
    this.modal.setAttribute('tabindex', '-1'); // Make modal focusable

    // Start completely invisible for measurement
    this.modal.style.visibility = 'hidden';
    this.modal.style.opacity = '0';
    this.modal.style.display = 'flex'; // But still rendered for measurement

    this.modal.innerHTML = `
      <div class="welcome-modal-content">
        <div class="welcome-modal-header">
          <h2 class="welcome-modal-title">Welcome to Ireland Financial Simulator</h2>
          <button class="welcome-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="welcome-modal-body">
          <div class="welcome-tabs">
            ${this.createTabs()}
          </div>
          ${this.createTabContent()}
        </div>
        <div class="welcome-modal-footer">
          <button class="welcome-tour-btn welcome-modal-button primary">Quick Tour</button>
          <button class="welcome-skip-btn welcome-modal-button secondary">Full Tour</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    // Measure and apply dynamic height while invisible
    this.applyDynamicHeight();

    // Now make it ready for the show animation
    this.modal.style.visibility = '';  // Clear the visibility override
    this.modal.style.opacity = '';     // Clear the opacity override to let CSS handle it
    this.modal.style.display = 'none'; // Reset for show() method
  }

  createTabs() {
    if (!this.contentData.tabs) return '';
    
    return this.contentData.tabs.map((tab, index) => `
      <button class="welcome-tab ${index === 0 ? 'active' : ''}" 
              data-tab="${tab.id}"
              aria-selected="${index === 0 ? 'true' : 'false'}">
        ${tab.title}
      </button>
    `).join('');
  }

  createTabContent() {
    if (!this.contentData.tabs) return '';

    return this.contentData.tabs.map((tab, index) => `
      <div class="welcome-tab-content ${index === 0 ? 'active' : ''}"
           data-tab="${tab.id}"
           role="tabpanel">
        ${tab.content}
      </div>
    `).join('');
  }

  setupEventListeners() {
    // Close modal events
    const closeBtn = this.modal.querySelector('.welcome-modal-close');
    const skipBtn = this.modal.querySelector('.welcome-skip-btn');
    const tourBtn = this.modal.querySelector('.welcome-tour-btn');

    closeBtn.addEventListener('click', () => this.hide());

    // Close modal when clicking outside content
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      if (this.onSkipCallback) this.onSkipCallback();
    });
    tourBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      if (this.onTourStartCallback) this.onTourStartCallback();
    });
    
    // Tab switching
    const tabs = this.modal.querySelectorAll('.welcome-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });
    
    // Keyboard navigation
    this.keydownHandler = this.handleKeydown.bind(this);
    document.addEventListener('keydown', this.keydownHandler);
  }

  switchTab(tabId) {
    // Update active tab
    const tabs = this.modal.querySelectorAll('.welcome-tab');
    const panels = this.modal.querySelectorAll('.welcome-tab-content');

    tabs.forEach(tab => {
      const isActive = tab.getAttribute('data-tab') === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach(panel => {
      const isActive = panel.getAttribute('data-tab') === tabId;
      panel.classList.toggle('active', isActive);
    });
  }

  handleKeydown(event) {
    if (!this.modal || !this.modal.classList.contains('visible')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  }

  hide() {
    if (!this.modal) return;

    this.modal.classList.remove('visible');
    setTimeout(() => {
      this.modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      if (this.keydownHandler) {
        document.removeEventListener('keydown', this.keydownHandler);
        this.keydownHandler = null;
      }
    }, 300);
  }

  measureAllTabHeights() {
    if (!this.contentData.tabs) return [];

    const heights = [];

    // Get the actual modal content width to match the real tab content area
    const modalContent = this.modal.querySelector('.welcome-modal-content');
    const actualWidth = modalContent ? modalContent.offsetWidth : 600;

    this.contentData.tabs.forEach(tab => {
      // Create a test container that mimics the modal structure
      const testContainer = document.createElement('div');
      testContainer.style.position = 'absolute';
      testContainer.style.top = '-9999px';
      testContainer.style.left = '0';
      testContainer.style.width = `${actualWidth}px`;
      testContainer.style.visibility = 'hidden';

      // Create the content div with the same structure as the real tab content
      const testContent = document.createElement('div');
      testContent.style.padding = '20px';
      testContent.style.position = 'relative'; // Use relative instead of absolute for measurement
      testContent.style.width = '100%';
      testContent.style.boxSizing = 'border-box';
      testContent.innerHTML = tab.content;

      testContainer.appendChild(testContent);
      document.body.appendChild(testContainer);

      // Force layout and measure
      testContainer.offsetHeight;
      const testHeight = testContent.scrollHeight;

      document.body.removeChild(testContainer);

      heights.push({ id: tab.id, height: testHeight });
    });

    return heights;
  }

  calculateOptimalHeight() {
    if (!this.modal) return null;

    // Get fixed elements heights
    const header = this.modal.querySelector('.welcome-modal-header');
    const footer = this.modal.querySelector('.welcome-modal-footer');
    const tabs = this.modal.querySelector('.welcome-tabs');

    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;
    const tabsHeight = tabs ? tabs.offsetHeight : 0;

    // Find the tallest tab content
    const tabHeights = this.measureAllTabHeights();
    const maxContentHeight = Math.max(...tabHeights.map(t => t.height), 0);

    // The measured content height already includes padding (20px), so we don't need to add extra
    // Just add a minimal buffer for any spacing between tabs and content
    const buffer = 5;

    return headerHeight + footerHeight + tabsHeight + maxContentHeight + buffer;
  }

  applyDynamicHeight() {
    const optimalHeight = this.calculateOptimalHeight();

    if (optimalHeight) {
      const isMobile = window.innerWidth <= 768;
      const maxHeightRatio = isMobile ? 0.90 : 0.85;
      const maxHeight = window.innerHeight * maxHeightRatio;
      const finalHeight = Math.min(optimalHeight, maxHeight);

      const modalContent = this.modal.querySelector('.welcome-modal-content');
      const header = this.modal.querySelector('.welcome-modal-header');
      const footer = this.modal.querySelector('.welcome-modal-footer');
      const modalBody = this.modal.querySelector('.welcome-modal-body');

      // Get current header and footer heights before changing modal height
      const headerHeight = header ? header.offsetHeight : 0;
      const footerHeight = footer ? footer.offsetHeight : 0;

      // Set the total modal height
      modalContent.style.height = `${finalHeight}px`;

      // Calculate the body height by subtracting header and footer
      const bodyHeight = finalHeight - headerHeight - footerHeight;

      modalBody.style.height = `${bodyHeight}px`;
      modalBody.style.minHeight = 'auto'; // Override the CSS min-height constraint

      // If content is taller than max height, enable scrolling
      if (optimalHeight > maxHeight) {
        modalBody.style.overflowY = 'auto';
      }
    }
  }

  destroy() {
    if (this.modal) {
      this.hide();
      setTimeout(() => {
        if (this.modal && this.modal.parentNode) {
          this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
      }, 300);
    }
  }

  // Static method to check if this is first visit
  static isFirstVisit() {
    return !localStorage.getItem('welcomeModalShown');
  }

  // Static method to mark welcome modal as shown
  static markAsShown() {
    localStorage.setItem('welcomeModalShown', 'true');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WelcomeModal;
} 