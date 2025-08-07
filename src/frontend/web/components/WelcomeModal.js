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

      // Convert markdown links inside tab content (only for legacy string content)
      tabsArray.forEach(tab => {
        if (tab.content && typeof tab.content === 'string') {
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
      // Re-enable pointer events in case they were disabled by a previous hide()
      this.modal.style.pointerEvents = 'auto';
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
          <button class="welcome-demo-btn welcome-modal-button secondary">Demo</button>
          <button class="welcome-tour-btn welcome-modal-button primary">Quick Tour</button>
          <button class="welcome-skip-btn welcome-modal-button secondary">Full Tour</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    // Temporarily hide FAQ content so it doesn't influence initial rendering / measurement
    const faqPanel = this.modal.querySelector('.welcome-tab-content[data-tab="faq"]');
    if (faqPanel) {
      faqPanel.dataset.originalDisplay = faqPanel.style.display || '';
      faqPanel.style.display = 'none';
    }

    // Measure and apply dynamic height while invisible
    this.applyDynamicHeight();

    // Restore FAQ visibility (kept scrollable, will not affect height)
    if (faqPanel) {
      faqPanel.style.display = faqPanel.dataset.originalDisplay;
      delete faqPanel.dataset.originalDisplay;
    }

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

    return this.contentData.tabs.map((tab, index) => {
      const isFAQ = tab.id === 'faq';
      const scrollableClass = (tab.excludeFromHeightCalculation || isFAQ) ? ' scrollable-tab' : '';
      const renderedContent = this.renderTabContent(tab);

      return `
        <div class="welcome-tab-content${scrollableClass} ${index === 0 ? 'active' : ''}"
             data-tab="${tab.id}"
             role="tabpanel">
          ${renderedContent}
        </div>
      `;
    }).join('');
  }

  renderTabContent(tab) {
    // Check if tab has contentType (new meta-description format)
    if (tab.contentType && typeof ContentRenderer !== 'undefined') {
      try {
        return ContentRenderer.render(tab.contentType, tab.content);
      } catch (error) {
        console.error('Error rendering tab content with ContentRenderer:', error);
        // Fall back to direct content rendering
      }
    }

    // Backward compatibility: use direct content (HTML string)
    return tab.content || '';
  }

  setupEventListeners() {
    // Close modal events
    const closeBtn = this.modal.querySelector('.welcome-modal-close');
    const skipBtn = this.modal.querySelector('.welcome-skip-btn');
    const tourBtn = this.modal.querySelector('.welcome-tour-btn');
    const demoBtn = this.modal.querySelector('.welcome-demo-btn');

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
    
    demoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      // Emulate clicking the header demo button
      const headerDemoBtn = document.getElementById('loadDemoScenarioHeader');
      if (headerDemoBtn) {
        headerDemoBtn.click();
      }
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

    // FAQ accordion functionality
    this.setupFAQAccordion();
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

    // Re-setup FAQ accordion if switching to FAQ tab
    if (tabId === 'faq') {
      setTimeout(() => this.setupFAQAccordion(), 50);
    }
  }

  setupFAQAccordion() {
    const faqQuestions = this.modal.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
      // Remove existing listeners to prevent duplicates
      const newQuestion = question.cloneNode(true);
      question.parentNode.replaceChild(newQuestion, question);

      newQuestion.addEventListener('click', () => {
        const faqItem = newQuestion.closest('.faq-item');
        const answer = faqItem.querySelector('.faq-answer');

        const isOpen = faqItem.classList.contains('open');

        if (isOpen) {
          // Close this item
          faqItem.classList.remove('open');
          answer.style.maxHeight = '0';
        } else {
          // Close all other items first
          this.modal.querySelectorAll('.faq-item.open').forEach(openItem => {
            openItem.classList.remove('open');
            openItem.querySelector('.faq-answer').style.maxHeight = '0';
          });

          // Open this item
          faqItem.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
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

    // Immediately disable pointer events to ensure the overlay no longer blocks interactions even if CSS transitions are still running
    this.modal.style.pointerEvents = 'none';
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
    const panels = Array.from(this.modal.querySelectorAll('.welcome-tab-content'));

    const heights = [];

    panels.forEach(panel => {
      const tabId = panel.getAttribute('data-tab');

      // Ignore FAQ or any tab explicitly marked for exclusion via YAML
      const isExcluded = tabId === 'faq' || panel.classList.contains('scrollable-tab');
      if (isExcluded) {
        heights.push({ id: tabId, height: 0, excluded: true });
        return;
      }

      // Preserve original inline styles so we can restore them after measurement
      const originalStyles = {
        position: panel.style.position,
        visibility: panel.style.visibility,
        display: panel.style.display,
        top: panel.style.top,
        bottom: panel.style.bottom,
        left: panel.style.left,
        right: panel.style.right
      };

      // Temporarily show the panel in normal flow for accurate measurement
      panel.style.position = 'relative';
      panel.style.visibility = 'hidden';
      panel.style.display = 'block';
      panel.style.top = panel.style.bottom = panel.style.left = panel.style.right = 'auto';

      const height = panel.scrollHeight;

      // Restore original styles
      Object.keys(originalStyles).forEach(key => {
        panel.style[key] = originalStyles[key] || '';
      });

      heights.push({ id: tabId, height });
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

    // Find the tallest tab content, excluding tabs marked for exclusion
    const tabHeights = this.measureAllTabHeights();
    const includedHeights = tabHeights.filter(t => !t.excluded).map(t => t.height);
    const maxContentHeight = Math.max(...includedHeights, 0);

    // The measured content height already includes padding (20px), so we don't need to add extra
    return headerHeight + footerHeight + tabsHeight + maxContentHeight;
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

      // Calculate exact body height (space between header and footer)
      const bodyHeight = finalHeight - headerHeight - footerHeight;

      modalBody.style.height = `${bodyHeight}px`;
      modalBody.style.minHeight = 'auto'; // override CSS min-height
      modalBody.style.flex = '0 0 auto'; // prevent unwanted stretching

      // Ensure tab content containers align with real tabs height instead of hard-coded 38px
      const tabsElement = this.modal.querySelector('.welcome-tabs');
      const tabsHeightActual = tabsElement ? tabsElement.offsetHeight : 0;
      const tabContents = this.modal.querySelectorAll('.welcome-tab-content');
      tabContents.forEach(tc => {
        tc.style.top = `${tabsHeightActual}px`;
        if (tc.classList.contains('scrollable-tab')) {
          // For FAQ/scrollable tabs keep bottom 0 so it fills the remaining space and becomes scrollable
          tc.style.bottom = '0';
          tc.style.overflowY = 'auto';
        } else {
          tc.style.bottom = 'auto'; // natural height for non-scrollable tabs
        }
        tc.style.height = 'auto';
      });

      // If content is taller than max height, enable scrolling
      if (optimalHeight > maxHeight) {
        modalBody.style.overflowY = 'auto';
      }

      // Final sanity check: if our computed body height still leaves blank space, trim it
      // No further adjustment needed; modal body now sizes naturally
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