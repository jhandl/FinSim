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
      const response = await fetch(`/src/frontend/web/assets/welcome-content.yml?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const yamlText = await response.text();
      this.contentData = jsyaml.load(yamlText);
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

    skipBtn.addEventListener('click', () => {
      this.hide();
      if (this.onSkipCallback) this.onSkipCallback();
    });
    tourBtn.addEventListener('click', () => {
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