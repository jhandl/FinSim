/* AccordionSorter utility – provides FLIP-animated sorting for accordion items */
(function (global) {
  
  /**
   * Extract value from accordion item for a specific column
   * Maps accordion item data to the same column structure as table
   */
  function getAccordionValue(accordionItem, col, accordionManager) {
    // Get the event data from the accordion manager
    const accordionId = accordionItem.dataset.accordionId;

    if (!accordionManager) {
      console.warn('AccordionManager not provided for sorting');
      return '';
    }

    const event = accordionManager.events.find(e => e.accordionId === accordionId);
    if (!event) return '';

    switch (col) {
      case 'event-type':
        return event.type || '';
      case 'event-name':
        return event.name || '';
      case 'event-amount':
        // Clean amount like table does
        const amount = event.amount || '';
        return amount.replace(/[^0-9\.]/g, '');
      case 'from-age':
        return event.fromAge || '';
      case 'to-age':
        return event.toAge || '';
      case 'event-rate':
        return event.rate || '';
      case 'event-match':
        return event.match || '';
      default:
        return '';
    }
  }

  /**
   * Sort accordion items with FLIP animation
   */
  function sortAccordionItems(container, sortKeys, accordionManager, options = {}) {
    if (!container || !Array.isArray(sortKeys) || sortKeys.length === 0) return;

    const items = Array.from(container.querySelectorAll('.events-accordion-item'));

    if (items.length === 0) return;

    // Create a wrapper function that includes the accordion manager
    const getValueWithManager = (item, col) => getAccordionValue(item, col, accordionManager);

    // Use shared sorting utility
    if (window.SortingUtils) {
      window.SortingUtils.sortElements(container, items, sortKeys, getValueWithManager, {
        duration: 350,
        easing: 'ease',
        ...options
      });
    } else {
      console.warn('SortingUtils not available, accordion sorting disabled');
    }
  }

  /**
   * Find and highlight newly created accordion item
   * @returns {HTMLElement|null} The found item or null if not found
   */
  function highlightNewItem(container, isNewItemFn) {
    const items = Array.from(container.querySelectorAll('.events-accordion-item'));
    let foundItem = null;
    
    for (const item of items) {
      if (isNewItemFn && isNewItemFn(item)) {
        foundItem = item;
        
        // Add highlight animation class
        item.classList.add('new-event-highlight');

        // Scroll the new event into view
        item.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

        // Remove highlight after animation completes
        setTimeout(() => {
          item.classList.remove('new-event-highlight');
        }, 800);
        
        break;
      }
    }
    
    return foundItem;
  }

  // Export utilities
  global.AccordionSorter = {
    sortAccordionItems,
    highlightNewItem,
    getAccordionValue
  };

})(window);
