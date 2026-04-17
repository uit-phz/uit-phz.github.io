const CONTACT_LINKS = {
  messenger: 'https://www.facebook.com/lynnkhar.poetry.story',
  telegram: 'https://t.me/lynnkhar_preorder_bot',
};

function wireCtas() {
  document.querySelectorAll('.js-cta-messenger').forEach((el) => {
    el.setAttribute('href', CONTACT_LINKS.messenger);
  });

  document.querySelectorAll('.js-cta-telegram').forEach((el) => {
    el.setAttribute('href', CONTACT_LINKS.telegram);
  });
}

function setupReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  items.forEach((item, index) => {
    item.style.setProperty('--delay', `${index * 70}ms`);
  });

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  items.forEach((item) => obs.observe(item));
}

function setupCoverMotion() {
  const cover = document.querySelector('.book-cover');
  if (!cover || window.matchMedia('(max-width: 860px)').matches) return;

  cover.addEventListener('mousemove', (event) => {
    const rect = cover.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cover.style.transform = `rotate(-2.2deg) translate(${x * 8}px, ${y * 8}px)`;
  });

  cover.addEventListener('mouseleave', () => {
    cover.style.transform = 'rotate(-2.2deg)';
  });
}

function setYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}

function boot() {
  wireCtas();
  setupReveal();
  setupCoverMotion();
  setYear();
}

boot();
