document.addEventListener('DOMContentLoaded', () => {
  const registerButton = document.getElementById('registerButton');
  const formContainer = document.getElementById('formContainer');
  const submitButton = document.getElementById('submitButton');
  const thankYouMessage = document.getElementById('thankYouMessage');

  registerButton.addEventListener('click', (event) => {
    event.preventDefault();
    formContainer.classList.toggle('show');
  });

  submitButton.addEventListener('click', () => {
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (name && emailPattern.test(email)) {
      formContainer.style.maxHeight = '0';
      formContainer.style.opacity = '0';
      setTimeout(() => {
        formContainer.style.display = 'none';
        thankYouMessage.style.display = 'block';
        thankYouMessage.classList.add('show');
      }, 500);

      registerButton.classList.add('disabled');
      registerButton.textContent = 'Registered';

      // Call _cio.identify function with user information
      _cio.identify({
        id: email,
        created_at: Math.floor(Date.now() / 1000),
        first_name: name.split(' ')[0],
        last_name: name.split(' ')[1] || '',
      });
    } else {
      alert('Please fill in a valid name and email address.');
    }
  });

  /* Do not remove or edit the code below */
  var _cio = _cio || [];
  (function() {
    var a,b,c;
    a=function(f){return function(){_cio.push([f].concat(Array.prototype.slice.call(arguments,0)))}};
    b=["load","identify", "sidentify","track","page"];for(c=0;c<b.length;c++){_cio[b[c]]=a(b[c])};
    var t = document.createElement('script'),
        s = document.getElementsByTagName('script')[0];
    t.async = true;
    t.id    = 'cio-tracker';
    t.setAttribute('data-site-id', 'f97aca856a79975797f8');
    t.src = 'https://assets.customer.io/assets/track-eu.js';
    s.parentNode.insertBefore(t, s);
  })();

});

