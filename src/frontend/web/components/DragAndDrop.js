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
      item.addEventListener('dragstart', e => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', item.dataset.priorityId);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      })
      item.addEventListener('dragover', e => {
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
          this.updatePriorityValues();
        }
      });

      item.addEventListener('dragenter', e => {
        e.preventDefault();
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('drag-over');
      });
    });
  }

  updatePriorityValues() {
    const items = document.querySelectorAll('.priority-item');
    items.forEach((item, index) => {
      const input = item.querySelector('input');
      if (input) {
        input.value = index + 1;
        // Add animation class
        item.classList.add('inserted');
        setTimeout(() => item.classList.remove('inserted'), 300);
      }
    });
  }

} 