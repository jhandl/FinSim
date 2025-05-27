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
    // Close modal when clicking the X or OK button
    this.closeButton.addEventListener('click', () => this.hideModal());
    this.closeX.addEventListener('click', () => this.hideModal());
    
    // Close modal when clicking outside of it
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) {
        this.hideModal();
      }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modal.style.display === 'block') {
        this.hideModal();
      }
    });
    
    // Click handler for status element when it shows an error
    this.statusElement.addEventListener('click', () => {
      if (this.statusElement.classList.contains('error') && this.currentErrorMessage) {
        this.showModal(this.currentErrorMessage);
      }
    });
  }

  showModal(message) {
    this.errorMessage.textContent = message;
    this.modal.style.display = 'block';
    
    // Focus the close button for accessibility
    setTimeout(() => {
      this.closeButton.focus();
    }, 100);
  }

  hideModal() {
    this.modal.style.display = 'none';
  }

  setError(message) {
    // Store the error message
    this.currentErrorMessage = message;
    
    // Update status element to show "Error" with clickable indicator
    this.statusElement.innerHTML = 'Error';
    this.statusElement.style.backgroundColor = STATUS_COLORS.ERROR;
    this.statusElement.classList.add('error');
    
    // Automatically show the modal
    this.showModal(message);
  }

  clearError() {
    this.currentErrorMessage = null;
    this.statusElement.classList.remove('error');
    this.hideModal();
  }
} 