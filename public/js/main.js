// ============================================
// ELLA RISES - CLIENT-SIDE JAVASCRIPT
// ============================================

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Ella Rises application loaded');

  // Add smooth scrolling to all links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Form validation for password matching
  const signupForm = document.querySelector('form[action="/signup"]');
  if (signupForm) {
    signupForm.addEventListener('submit', function(e) {
      const password = document.getElementById('password');
      const confirmPassword = document.getElementById('confirmPassword');

      if (password && confirmPassword && password.value !== confirmPassword.value) {
        e.preventDefault();
        alert('Passwords do not match!');
        confirmPassword.focus();
      }
    });
  }

  // Password change form validation
  const passwordChangeForm = document.querySelector('form[action*="change-password"]');
  if (passwordChangeForm) {
    passwordChangeForm.addEventListener('submit', function(e) {
      const newPassword = document.getElementById('newPassword');
      const confirmPassword = document.getElementById('confirmPassword');

      if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
        e.preventDefault();
        alert('Passwords do not match!');
        confirmPassword.focus();
      }
    });
  }

  // Auto-dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert-success, .alert-info');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.5s ease';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });

  // Add active class to current nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href === '#') return;
    if (
      currentPath === href ||
      (href !== '/' && currentPath.startsWith(href + '/'))
    ) {
      link.classList.add('active');
    }
  });

  // Contact form UX: disable submit while sending
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    const submitButton = document.getElementById('contactSubmit');
    contactForm.addEventListener('submit', () => {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }
    });
  }
});
