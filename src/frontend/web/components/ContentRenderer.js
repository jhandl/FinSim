/**
 * ContentRenderer - Converts meta-descriptions to HTML for welcome modal content
 * 
 * This class provides a centralized system for rendering different types of content
 * from structured data rather than raw HTML, improving maintainability and consistency.
 */
class ContentRenderer {
  
  /**
   * Main rendering method that dispatches to appropriate content type renderer
   * @param {string} contentType - Type of content (workflow, list, accordion, etc.)
   * @param {Object} content - Content data structure
   * @param {Object} options - Additional rendering options
   * @param {string} options.context - Rendering context ('wizard', 'modal', etc.)
   * @param {boolean} options.compact - Whether to use compact rendering for space-constrained environments
   * @returns {string} Generated HTML string
   */
  static render(contentType, content, options = {}) {
    if (!contentType || !content) {
      return this.renderError('Missing content type or content data');
    }

    // Apply wizard-specific rendering adjustments
    const processedOptions = this.processRenderingOptions(options);

    try {
      switch (contentType) {
        case 'workflow':
          return this.renderWorkflow(content, processedOptions);
        case 'list':
          return this.renderList(content, processedOptions);
        case 'bullets':
          return this.renderBullets(content, processedOptions);
        case 'accordion':
          return this.renderAccordion(content, processedOptions);
        case 'text':
          return this.renderText(content, processedOptions);
        case 'html':
          // Backward compatibility: direct HTML content
          return typeof content === 'string' ? content : content.html || '';
        default:
          console.warn(`Unknown content type: ${contentType}, falling back to plain text`);
          return this.renderPlainText(content, processedOptions);
      }
    } catch (error) {
      console.error('ContentRenderer error:', error);
      return this.renderError(`Failed to render ${contentType} content`);
    }
  }

  /**
   * Processes rendering options and applies context-specific defaults
   * @param {Object} options - Raw rendering options
   * @returns {Object} Processed options with context-specific defaults
   */
  static processRenderingOptions(options = {}) {
    const processed = { ...options };
    const isWizard = options.context === 'wizard';
    const compact = options.compact || false;

    if (isWizard) {
      // Wizard-specific defaults
      processed.showTitles = processed.showTitles !== false; // Default true for wizard
      processed.compactSpacing = compact;
      processed.cssPrefix = 'wizard';
      processed.includeDescription = processed.includeDescription !== false; // Default true
    } else {
      // Modal/welcome defaults
      processed.cssPrefix = 'welcome';
      processed.showTitles = processed.showTitles !== false;
      processed.compactSpacing = false;
    }

    return processed;
  }

  /**
   * Renders workflow-style content with numbered steps
   * @param {Object} content - Content with steps array
   * @param {Object} options - Rendering options
   * @returns {string} HTML for workflow content
   */
  static renderWorkflow(content, options = {}) {
    if (!content.steps || !Array.isArray(content.steps)) {
      return this.renderError('Workflow content must have a steps array');
    }

    const cssPrefix = options.cssPrefix || 'welcome';
    const compactSpacing = options.compactSpacing || false;
    const spacingClass = compactSpacing ? ' compact' : '';

    const stepsHtml = content.steps.map((step, index) => {
      const stepNumber = index + 1;
      const title = this.escapeHtml(step.title || '');
      const description = this.processText(step.description || '');

      return `
        <div class="workflow-step${spacingClass}">
          <div class="step-number">${stepNumber}</div>
          <div class="step-content">
            <strong>${title}</strong>
            <p>${description}</p>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="${cssPrefix}-workflow">
        <div class="workflow-steps">
          ${stepsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Renders bullet-style content for wizard popovers (traditional bullet points)
   * @param {Object} content - Content with items array
   * @param {Object} options - Rendering options
   * @returns {string} HTML for bullet content
   */
  static renderBullets(content, options = {}) {
    if (!content.items || !Array.isArray(content.items)) {
      return this.renderError('Bullets content must have an items array');
    }

    const cssPrefix = options.cssPrefix || 'welcome';

    // Add optional description before the list
    const descriptionHtml = content.description ? `
      <p>${this.processText(content.description)}</p>
    ` : '';

    const itemsHtml = content.items.map(item => {
      const title = this.escapeHtml(item.title || '');
      const description = this.processText(item.description || '');

      // Format as "Title – description" on same line with bullet point
      return `<li><strong>${title}</strong> – ${description}</li>`;
    }).join('');

    // Add footnote if present
    const footnoteHtml = content.footnote ? `
      <p>${this.processText(content.footnote)}</p>
    ` : '';

    return `
      <div class="${cssPrefix}-bullets">
        ${descriptionHtml}
        <ul>
          ${itemsHtml}
        </ul>
        ${footnoteHtml}
      </div>
    `;
  }

  /**
   * Renders list-style content with optional icons
   * @param {Object} content - Content with items array
   * @param {Object} options - Rendering options
   * @returns {string} HTML for list content
   */
  static renderList(content, options = {}) {
    if (!content.items || !Array.isArray(content.items)) {
      return this.renderError('List content must have an items array');
    }

    const cssPrefix = options.cssPrefix || 'welcome';
    const compactSpacing = options.compactSpacing || false;
    const spacingClass = compactSpacing ? ' compact' : '';
    const includeDescription = options.includeDescription !== false;

    // Add optional description before the list
    const descriptionHtml = content.description ? `
      <p class="list-description">${this.processText(content.description)}</p>
    ` : '';

    const itemsHtml = content.items.map(item => {
      const title = this.escapeHtml(item.title || '');
      const description = includeDescription ? this.processText(item.description || '') : '';

      return `
        <div class="list-item${spacingClass}">
          <strong>${title}</strong>
          ${description ? `<p>${description}</p>` : ''}
        </div>
      `;
    }).join('');

    // Add footnote if present
    const footnoteHtml = content.footnote ? `
      <div class="footnote-item${spacingClass}">
        ${this.processText(content.footnote)}
      </div>
    ` : '';

    return `
      <div class="${cssPrefix}-list">
        ${descriptionHtml}
        ${itemsHtml}
        ${footnoteHtml}
      </div>
    `;
  }

  /**
   * Renders accordion-style content (FAQ)
   * @param {Object} content - Content with items array
   * @param {Object} options - Rendering options
   * @returns {string} HTML for accordion content
   */
  static renderAccordion(content, options = {}) {
    if (!content.items || !Array.isArray(content.items)) {
      return this.renderError('Accordion content must have an items array');
    }

    const cssPrefix = options.cssPrefix || 'welcome';
    const compactSpacing = options.compactSpacing || false;
    const spacingClass = compactSpacing ? ' compact' : '';

    const itemsHtml = content.items.map((item, index) => {
      const question = this.escapeHtml(item.question || '');
      const answerId = `faq-${index}`;

      // Handle answer as array of paragraphs or single string
      let answerHtml = '';
      if (Array.isArray(item.answer)) {
        answerHtml = item.answer.map(paragraph =>
          `<p>${this.processText(paragraph)}</p>`
        ).join('');
      } else {
        answerHtml = `<p>${this.processText(item.answer || '')}</p>`;
      }

      return `
        <div class="faq-item${spacingClass}">
          <div class="faq-question" data-faq="${answerId}">
            <i class="faq-icon">+</i>
            <span>${question}</span>
          </div>
          <div class="faq-answer">
            ${answerHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="${cssPrefix}-faq-container">
        ${itemsHtml}
      </div>
    `;
  }

  /**
   * Renders simple text content
   * @param {Object} content - Content with text field
   * @param {Object} options - Rendering options
   * @returns {string} HTML for text content
   */
  static renderText(content, options = {}) {
    const cssPrefix = options.cssPrefix || 'welcome';
    const text = content.text || content.description || '';

    if (!text) {
      return this.renderError('Text content must have a text or description field');
    }

    return `<div class="${cssPrefix}-text"><p>${this.processText(text)}</p></div>`;
  }

  /**
   * Renders plain text content as fallback
   * @param {Object|string} content - Content data
   * @param {Object} options - Rendering options
   * @returns {string} HTML for plain text content
   */
  static renderPlainText(content, options = {}) {
    const cssPrefix = options.cssPrefix || 'welcome';
    const text = typeof content === 'string' ? content :
                 content.text || content.description ||
                 JSON.stringify(content);

    return `<div class="${cssPrefix}-text"><p>${this.escapeHtml(text)}</p></div>`;
  }

  /**
   * Renders error message for debugging
   * @param {string} message - Error message
   * @returns {string} HTML for error display
   */
  static renderError(message) {
    return `<div class="welcome-error" style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #fff5f5;">
      <strong>Content Rendering Error:</strong> ${this.escapeHtml(message)}
    </div>`;
  }

  /**
   * Renders icons based on icon type
   * @param {string} iconType - Type of icon to render
   * @returns {string} HTML for icon
   */
  static renderIcon(iconType) {
    // Inline icons for all types
    const iconMap = {
      'user-toggle': '<i class="fas fa-user"></i> / <i class="fas fa-user-friends"></i>',
      'chart-line': '<svg width="18" height="14" viewBox="0 0 20 16" style="vertical-align: middle;"><line x1="2" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1"/><line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1"/><line x1="3" y1="12" x2="19" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      'chart-variable': '<svg width="18" height="14" viewBox="0 0 20 16" style="vertical-align: middle;"><line x1="2" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1"/><line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1"/><path d="M3 12 L6 9 L9 11 L12 7 L15 10 L19 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
      'palette': '<i class="fas fa-palette" style="background: linear-gradient(45deg,#fe0000 0%,#f34201 20%,#eda600 40%,#e0cd00 60%,#94ac29 80%,#00e000 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;"></i>',
      'user': '<i class="fas fa-user"></i>',
      'user-friends': '<i class="fas fa-user-friends"></i>',
      'demo': '<i class="fas fa-play-circle"></i>',
      'save': '<i class="fas fa-save"></i>',
      'load': '<i class="fas fa-folder-open"></i>',
      'help': '<span style="display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-family: \'Georgia\', \'Times New Roman\', serif; color: #0077cc; background: white; border: 1px solid #0077cc; border-radius: 50%; width: 16px; height: 16px; font-weight: bold; font-style: italic; vertical-align: middle; margin: 0 2px;">i</span>',
      'info': '<span style="display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-family: \'Georgia\', \'Times New Roman\', serif; color: #0077cc; background: white; border: 1px solid #0077cc; border-radius: 50%; width: 16px; height: 16px; font-weight: bold; font-style: italic; vertical-align: middle; margin: 0 2px;">i</span>',
      'run': '<i class="fas fa-calculator"></i>'
    };

    return iconMap[iconType] || '<i class="fas fa-circle"></i>';
  }

  /**
   * Processes text with inline icons and markdown links
   * @param {string} text - Text to process
   * @returns {string} Processed HTML
   */
  static processText(text) {
    if (!text) return '';

    // Handle arrays of text paragraphs
    if (Array.isArray(text)) {
      return text.map(para => this.processText(para)).join(' ');
    }

    // Process inline icon markers first: {icon:icon-type}
    let processed = this.processInlineIcons(text);

    // Process markdown-style links
    if (typeof FormatUtils !== 'undefined' && FormatUtils.processMarkdownLinks) {
      processed = FormatUtils.processMarkdownLinks(processed);
    }

    // Note: We don't escape HTML here since processMarkdownLinks may have created valid HTML
    // The original text should be safe since it comes from our YAML configuration
    return processed;
  }

  /**
   * Processes inline icon markers in text
   * @param {string} text - Text with potential icon markers
   * @returns {string} Text with icon markers replaced by HTML
   */
  static processInlineIcons(text) {
    if (!text || typeof text !== 'string') return text;

    // Replace {icon:icon-type} with rendered icon HTML
    return text.replace(/\{icon:([^}]+)\}/g, (_, iconType) => {
      return this.renderIcon(iconType.trim());
    });
  }

  /**
   * Escapes HTML to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  static escapeHtml(text) {
    if (typeof text !== 'string') return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Validates content structure for a given content type
   * @param {string} contentType - Type of content to validate
   * @param {Object} content - Content data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  static validateContent(contentType, content) {
    const errors = [];
    
    if (!contentType) {
      errors.push('Content type is required');
    }
    
    if (!content) {
      errors.push('Content data is required');
    }
    
    switch (contentType) {
      case 'workflow':
        if (!content.steps || !Array.isArray(content.steps)) {
          errors.push('Workflow content must have a steps array');
        } else {
          content.steps.forEach((step, index) => {
            if (!step.title) errors.push(`Step ${index + 1} missing title`);
            if (!step.description) errors.push(`Step ${index + 1} missing description`);
          });
        }
        break;
        
      case 'list':
        if (!content.items || !Array.isArray(content.items)) {
          errors.push('List content must have an items array');
        } else {
          content.items.forEach((item, index) => {
            if (!item.title) errors.push(`List item ${index + 1} missing title`);
            if (!item.description) errors.push(`List item ${index + 1} missing description`);
          });
        }
        break;
        
      case 'accordion':
        if (!content.items || !Array.isArray(content.items)) {
          errors.push('Accordion content must have an items array');
        } else {
          content.items.forEach((item, index) => {
            if (!item.question) errors.push(`FAQ item ${index + 1} missing question`);
            if (!item.answer) errors.push(`FAQ item ${index + 1} missing answer`);
          });
        }
        break;
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentRenderer;
}
