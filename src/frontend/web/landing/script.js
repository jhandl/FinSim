// Simple JavaScript for smooth scrolling and SPA navigation

// Setup podcast button immediately
setTimeout(() => {
  setupPodcastButton()
}, 100)

// Simple podcast button setup outside DOMContentLoaded
function setupPodcastButton() {
  const podcastBtn = document.getElementById("podcast-btn")
  const podcastAudio = document.getElementById("podcast-audio")
  const podcastIcon = document.getElementById("podcast-icon")
  const progressFill = document.getElementById("progress-fill")
  const podcastText = document.getElementById("podcast-text")

  let userHasInteracted = false

  if (podcastBtn && podcastAudio && podcastText) {
    const handlePlayPause = () => {
      
      // Prime audio on first interaction for mobile
      if (!userHasInteracted) {
        userHasInteracted = true
        podcastAudio.load()
        // Small delay to let audio load, then try to play
        setTimeout(() => {
          attemptPlay()
        }, 100)
        return
      }
      
      attemptPlay()
    }
    
    const attemptPlay = () => {
      if (podcastAudio.paused) {
        podcastText.textContent = "Playing..."
        const playPromise = podcastAudio.play()
        
        if (playPromise !== undefined) {
          playPromise.then(() => {
            podcastBtn.classList.add("playing")
            podcastIcon.className = "fas fa-pause"
            podcastText.textContent = "0:00 / 0:00"
          }).catch((error) => {
            if (error.name === 'NotAllowedError') {
              // Mobile autoplay restriction - user needs to interact first
              podcastText.textContent = "Tap again to play"
              setTimeout(() => {
                podcastText.textContent = "Listen"
              }, 2000)
            } else {
              podcastText.textContent = `Failed: ${error.name}`
              setTimeout(() => {
                podcastText.textContent = "Listen"
              }, 3000)
            }
          })
        } else {
          podcastBtn.classList.add("playing")
          podcastIcon.className = "fas fa-pause"
          podcastText.textContent = "0:00 / 0:00"
        }
      } else {
        podcastAudio.pause()
        podcastBtn.classList.remove("playing")
        podcastIcon.className = "fas fa-play"
        podcastText.textContent = "Listen"
      }
    }

    // Add both touch and click events - let the browser handle the conflicts
    podcastBtn.addEventListener("click", handlePlayPause)
    podcastBtn.addEventListener("touchstart", (e) => {
      e.preventDefault()
      e.stopPropagation()
      handlePlayPause()
    })

    // Helper function to format time
    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Update progress and time display
    podcastAudio.addEventListener("timeupdate", () => {
      if (podcastAudio.duration) {
        const progress = (podcastAudio.currentTime / podcastAudio.duration) * 100
        progressFill.style.width = `${progress}%`
        
        if (podcastBtn.classList.contains("playing")) {
          const currentTime = formatTime(podcastAudio.currentTime)
          const duration = formatTime(podcastAudio.duration)
          podcastText.textContent = `${currentTime} / ${duration}`
        }
      }
    })

    // Initialize duration display when metadata loads
    podcastAudio.addEventListener("loadedmetadata", () => {
      const duration = formatTime(podcastAudio.duration)
      podcastBtn.title = `Listen to podcast about the simulator (${duration})`
    })

    // Reset button when audio ends
    podcastAudio.addEventListener("ended", () => {
      podcastBtn.classList.remove("playing")
      podcastIcon.className = "fas fa-play"
      progressFill.style.width = "0%"
      podcastText.textContent = "Listen"
    })

    // Handle audio loading errors gracefully
    podcastAudio.addEventListener("error", () => {
      console.warn("Podcast audio could not be loaded")
      podcastBtn.style.display = "none" // Hide button if audio fails to load
    })
    
  }
}

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

  // Podcast player functionality
  const podcastBtn = document.getElementById("podcast-btn")
  const podcastAudio = document.getElementById("podcast-audio")
  const podcastIcon = document.getElementById("podcast-icon")
  const progressFill = document.getElementById("progress-fill")
  const podcastText = document.getElementById("podcast-text")



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


