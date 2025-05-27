// Simple JavaScript for smooth scrolling and SPA navigation
document.addEventListener("DOMContentLoaded", () => {
  // Handle scroll links
  document.querySelectorAll('[data-scroll-to]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('data-scroll-to');
      const targetElement = document.querySelector(`#${targetId}`);
      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80, // Offset for header
          behavior: 'smooth'
        });
      }
    });
  });

  // Handle navigation links (any link starting with /)
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      window.parent.postMessage({ type: 'navigate', href: this.getAttribute('href') }, '*');
    });
  });

  // Simple responsive menu toggle (if needed for smaller screens)
  const createResponsiveMenu = () => {
    const header = document.querySelector("header")
    const nav = document.querySelector("nav")

    if (window.innerWidth <= 768 && !document.querySelector(".menu-toggle")) {
      const menuToggle = document.createElement("button")
      menuToggle.classList.add("menu-toggle")
      menuToggle.innerHTML = '<i class="fas fa-bars"></i>'
      header.insertBefore(menuToggle, nav)

      nav.style.display = "none"

      menuToggle.addEventListener("click", () => {
        if (nav.style.display === "none") {
          nav.style.display = "block"
          menuToggle.innerHTML = '<i class="fas fa-times"></i>'
        } else {
          nav.style.display = "none"
          menuToggle.innerHTML = '<i class="fas fa-bars"></i>'
        }
      })
    } else if (window.innerWidth > 768) {
      const menuToggle = document.querySelector(".menu-toggle")
      if (menuToggle) {
        menuToggle.remove()
      }
      nav.style.display = "block"
    }
  }

  // Call on load and resize
  createResponsiveMenu()
  window.addEventListener("resize", createResponsiveMenu)

  // Fix iOS Safari zoom on orientation change
  function preventZoomOnOrientationChange() {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      // Force viewport reset on orientation change
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      
      // Additional fix: force a slight zoom reset
      setTimeout(() => {
        if (window.visualViewport) {
          window.scrollTo(0, 0);
        }
      }, 100);
    }
  }

  // Listen for orientation changes
  window.addEventListener('orientationchange', preventZoomOnOrientationChange);
  
  // Also listen for resize events as a fallback
  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(preventZoomOnOrientationChange, 100);
  });

  // Newsletter form handling
  const newsletterForm = document.getElementById("newsletter-form")
  const formMessage = document.getElementById("form-message")

  if (newsletterForm) {
    newsletterForm.addEventListener("submit", (e) => {
      e.preventDefault()

      const email = document.getElementById("email").value

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        formMessage.textContent = "Please enter a valid email address."
        formMessage.className = "error-message"
        return
      }

      // In a real implementation, you would send this to your backend or a newsletter service API
      // For this static demo, we'll just show a success message

      formMessage.textContent = "Thank you for subscribing!"
      formMessage.className = "success-message"
      newsletterForm.reset()

      // Optional: You could redirect to a thank you page or show a modal
      // window.location.href = 'thank-you.html';
    })
  }
})


