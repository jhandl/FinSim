/* Drag and drop functionality */

class DragAndDrop {

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

} 