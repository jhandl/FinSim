// Define the initialization function
function initLandingPage() {  
  const registerButton = document.getElementById('registerButton');
  const formContainer = document.getElementById('formContainer');
  const submitButton = document.getElementById('submitButton');
  const thankYouMessage = document.getElementById('thankYouMessage');

  // If any of these elements don't exist, return early
  if (!registerButton || !formContainer || !submitButton || !thankYouMessage) {
    console.log('[Debug] Missing required elements, initialization aborted');
    return;
  }

  // Check if user is already registered
  const isRegistered = localStorage.getItem('isRegistered');
  if (isRegistered) {
    thankYouMessage.style.display = 'block';
    thankYouMessage.classList.add('show');
    registerButton.classList.add('disabled');
    registerButton.textContent = 'Registered';
  }

  // Clean up any existing handlers by replacing the button
  const newRegisterButton = registerButton.cloneNode(true);
  registerButton.parentNode.replaceChild(newRegisterButton, registerButton);
  
  // Use a named function for the click handler
  function handleRegisterClick(event) {
    event.preventDefault();
    formContainer.classList.toggle('show');
  }
  
  // Attach the click handler to the new button
  newRegisterButton.addEventListener('click', handleRegisterClick);

  submitButton.addEventListener('click', () => {
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (name && emailPattern.test(email)) {
      formContainer.classList.remove('show');
      setTimeout(() => {
        thankYouMessage.style.display = 'block';
        thankYouMessage.classList.add('show');
      }, 500);

      newRegisterButton.classList.add('disabled');
      newRegisterButton.textContent = 'Registered';

      // Call _cio.identify function with user information
      if (typeof window._cio !== 'undefined') {
        window._cio.identify({
          id: email,
          created_at: Math.floor(Date.now() / 1000),
          first_name: name.split(' ')[0],
          last_name: name.split(' ')[1] || '',
        });
      }

      // Store registration state
      localStorage.setItem('isRegistered', 'true');
      localStorage.setItem('registeredEmail', email);
      localStorage.setItem('registeredName', name);
    } else {
      alert('Please fill in a valid name and email address.');
    }
  });
}

// Track if we've already initialized
let hasInitialized = false;

function safeInitialize() {
  if (!hasInitialized) {
    hasInitialized = true;
    initLandingPage();
  }
}

// Only initialize once when the document is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  safeInitialize();
} else {
  document.addEventListener('DOMContentLoaded', safeInitialize);
}

// Make the init function globally available as a fallback
window.initLandingPage = safeInitialize;

/* Do not remove or edit the code below */
// Ensure _cio is defined in the global scope
window._cio = window._cio || [];
(function() {
  var a,b,c;
  a=function(f){return function(){window._cio.push([f].concat(Array.prototype.slice.call(arguments,0)))}};
  b=["load","identify", "sidentify","track","page"];for(c=0;c<b.length;c++){window._cio[b[c]]=a(b[c])};
  var t = document.createElement('script');
  t.async = true;
  t.id    = 'cio-tracker';
  t.setAttribute('data-site-id', 'f97aca856a79975797f8');
  t.src = 'https://assets.customer.io/assets/track-eu.js';
  t.onload = function() {
  };
  document.head.appendChild(t);
})();

