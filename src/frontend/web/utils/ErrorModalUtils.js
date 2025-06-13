/* Error modal utility functions */

class ErrorModalUtils {

  constructor() {
    this.modal = document.getElementById('errorModal');
    this.errorMessage = document.getElementById('errorMessage');
    this.closeButton = document.getElementById('errorModalClose');
    this.closeX = document.querySelector('.modal-close');
    this.statusElement = document.getElementById('progress');
    this.currentErrorMessage = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Click handler for status element when it shows an error
    this.statusElement.addEventListener('click', () => {
      if (this.statusElement.classList.contains('error') && this.currentErrorMessage) {
        this.showModal(this.currentErrorMessage);
      }
    });
  }

  showModal(message, title = 'Error', buttons = false) {
    return new Promise((resolve) => {
      // JIT lookup for all elements to ensure we have the latest from the DOM
      const modal = document.getElementById('errorModal');
      const errorMessage = document.getElementById('errorMessage');
      const closeButton = document.getElementById('errorModalClose');
      const cancelBtn = document.getElementById('errorModalCancel');
      const closeX = document.querySelector('.modal-close');
      const modalTitle = document.querySelector('#errorModal .modal-header h3');

      if (!modal || !errorMessage || !closeButton || !cancelBtn || !closeX || !modalTitle) {
        console.error('One or more error modal elements are missing from the DOM at the time of showModal.');
        alert(message); // Fallback to native alert
        resolve(false);
        return;
      }

      modalTitle.textContent = title;
      errorMessage.textContent = message;
      modal.style.display = 'block';

      if (buttons) {
        cancelBtn.style.display = '';
      } else {
        cancelBtn.style.display = 'none';
      }

      // Remove any previous listeners to avoid duplicates
      this._clearModalListeners && this._clearModalListeners();

      const okHandler = () => {
        this.hideModal();
        resolve(true);
      };
      const cancelHandler = () => {
        this.hideModal();
        resolve(false);
      };
      const closeHandler = () => {
        this.hideModal();
        resolve(false);
      };

      closeButton.addEventListener('click', okHandler);
      cancelBtn.addEventListener('click', cancelHandler);
      closeX.addEventListener('click', closeHandler);

      const escHandler = (event) => {
        if (event.key === 'Escape' && modal.style.display === 'block') {
          closeHandler();
        }
      };
      document.addEventListener('keydown', escHandler);

      // Close modal when clicking outside of it
      const outsideClickHandler = (event) => {
        if (event.target === modal) {
          closeHandler();
        }
      };
      modal.addEventListener('click', outsideClickHandler);

      // Store cleanup function
      this._clearModalListeners = () => {
        closeButton.removeEventListener('click', okHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        closeX.removeEventListener('click', closeHandler);
        document.removeEventListener('keydown', escHandler);
        modal.removeEventListener('click', outsideClickHandler);
        this._clearModalListeners = null;
      };

      setTimeout(() => {
        closeButton.focus();
      }, 100);
    });
  }

  hideModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Clean up listeners to prevent memory leaks if the modal is shown again.
    if (this._clearModalListeners) {
        this._clearModalListeners();
    }
  }

  setError(message) {
    // Store the error message
    this.currentErrorMessage = message;
    
    // Update status element to show "Error" with clickable indicator
    this.statusElement.innerHTML = 'Error';
    this.statusElement.style.backgroundColor = STATUS_COLORS.ERROR;
    this.statusElement.classList.add('error');
    
    // Automatically show the modal
    this.showModal(message, 'Error', false);
  }

  clearError() {
    this.currentErrorMessage = null;
    this.statusElement.classList.remove('error');
    this.hideModal();
  }
} 