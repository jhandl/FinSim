/* Drag and drop functionality */

export default class DragAndDrop {

  constructor() {
    this.dragSrcEl = null;
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
        // Optional: Set drag data if needed for complex scenarios
        // e.dataTransfer.setData('text/plain', item.dataset.priorityId);
      });

      item.addEventListener('dragend', () => {
        // Check if dragSrcEl exists before removing class (safety check)
        if (this.dragSrcEl) {
            this.dragSrcEl.classList.remove('dragging');
        }
        this.updatePriorityValues();
        this.dragSrcEl = null; // Clear reference
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow drop
        e.dataTransfer.dropEffect = 'move'; // Indicate valid drop target
        const dragging = container.querySelector('.dragging');
        // Ensure we are dragging an element and it's not the element being hovered over
        if (dragging && dragging !== item) {
          const rect = item.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          // Determine if dragging above or below the midpoint of the target item
          if (e.clientY < midpoint) {
            // Insert before the target item
            container.insertBefore(dragging, item);
          } else {
            // Insert after the target item
            container.insertBefore(dragging, item.nextSibling);
          }
        }
      });

       // Drop event is implicitly handled by dragover reordering and dragend update
       // No explicit drop handler needed for this implementation

    });
  }

  updatePriorityValues() {
    const items = document.querySelectorAll('.priorities-container .priority-item'); // Ensure selector is specific
    items.forEach((item, index) => {
      const input = item.querySelector('input[type="hidden"]'); // Be more specific
      if (input) {
        const newValue = index + 1;
        // Only update and dispatch event if value actually changed
        if (input.value !== newValue.toString()) {
            input.value = newValue;
            // Dispatch a change event so other parts of the app can react if needed
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }

}