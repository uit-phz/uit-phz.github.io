const CONTACT_LINKS = {
  messenger: 'https://m.me/your-page-id',
  telegram: 'https://t.me/your_bot_username',
};

const postcards = [
  {
    title: 'ရေသေအိုင်',
    year: '2019',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2019/08/yay-thay-e.png',
    summary: 'youth, memory, and social pressure in one emotionally heavy arc.',
    href: 'https://www.goodreads.com/book/show/52725373',
  },
  {
    title: 'စမ်းရေကြည်နု',
    year: '2020',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu.png',
    summary: 'a portrait of everyday struggle, family, and quiet collapse.',
    href: 'https://www.pannsattlann.com/product/sann-yay-kyi-nu/',
  },
  {
    title: 'ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ',
    year: '2025',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2025/02/phan-palin.png',
    summary: 'coming-of-age tenderness with jagged edges.',
    href: 'https://www.pannsattlann.com/product/athael-kwal-pasin-pyan/',
  },
  {
    title: 'လေပုရဝုဏ်',
    year: 'Upcoming',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2025/02/phan-palin-600x600.png',
    summary: 'current pre-order campaign with messenger + telegram checkout.',
    href: '#preorder',
  },
];

const photos = [
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2019/08/yay-thay-e.png',
    alt: 'ရေသေအိုင် cover photo',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu.png',
    alt: 'စမ်းရေကြည်နု cover photo',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2025/02/phan-palin.png',
    alt: 'ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ cover photo',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu-1.jpg',
    alt: 'စမ်းရေကြည်နု additional photo',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu-2.jpg',
    alt: 'စမ်းရေကြည်နု interior image',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2021/06/Shelf-1-6.png',
    alt: 'book shelf mood image',
  },
];

const reviews = [
  {
    quote: 'A mixture of realistic and minimal style of writing yet it was emotionally provocative.',
    meta: 'Goodreads reader on ရေသေအိုင်',
  },
  {
    quote: 'ဆရာ လင်းခါးရဲ့ ဖတ်ဖူးသမျှဝတ္ထုတွေထဲ အကြိုက်ဆုံး စာအုပ်ပါ။',
    meta: 'Pann Satt Lann reader on စမ်းရေကြည်နု',
  },
  {
    quote: 'ဖတ်လို့ပြီးခါနီးကျမှ ဟောတော် ဆိုပြီး ကိုယ်ပါအံ့ဩပြီး ငိုလိုက်ရတာ။',
    meta: 'Pann Satt Lann reader on ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ',
  },
];

function renderPostcards() {
  const root = document.getElementById('postcard-grid');
  if (!root) return;

  root.innerHTML = postcards
    .map((item, index) => {
      const angle = index % 2 === 0 ? '-2.8deg' : '2.8deg';
      return `
        <article class="postcard" style="--angle:${angle}">
          <img src="${item.image}" alt="${item.title} cover" loading="lazy" />
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
          <div class="pc-meta">
            <span>${item.year}</span>
            <a href="${item.href}" target="_blank" rel="noopener noreferrer">view</a>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderPhotos() {
  const root = document.getElementById('photo-wall');
  if (!root) return;

  root.innerHTML = photos
    .map(
      (item) => `
        <figure class="photo">
          <img src="${item.src}" alt="${item.alt}" loading="lazy" />
        </figure>
      `
    )
    .join('');
}

function renderReviews() {
  const root = document.getElementById('review-row');
  if (!root) return;

  root.innerHTML = reviews
    .map(
      (item) => `
        <article class="review">
          <p>"${item.quote}"</p>
          <small>${item.meta}</small>
        </article>
      `
    )
    .join('');
}

function wireCtas() {
  document.querySelectorAll('.js-cta-messenger').forEach((el) => {
    el.setAttribute('href', CONTACT_LINKS.messenger);
  });

  document.querySelectorAll('.js-cta-telegram').forEach((el) => {
    el.setAttribute('href', CONTACT_LINKS.telegram);
  });
}

function setupNav() {
  const navToggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!navToggle || !nav) return;

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open', !expanded);
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navToggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    });
  });
}

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  items.forEach((item) => obs.observe(item));
}

function setupHeroMotion() {
  const stack = document.getElementById('hero-stack');
  if (!stack || window.matchMedia('(max-width: 1020px)').matches) return;

  let rafId = null;
  const cards = stack.querySelectorAll('.hero-card');

  stack.addEventListener('mousemove', (event) => {
    const rect = stack.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      cards.forEach((card, index) => {
        const depth = (index + 1) * 7;
        card.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
      });
    });
  });

  stack.addEventListener('mouseleave', () => {
    cards.forEach((card) => {
      card.style.transform = 'translate(0, 0)';
    });
  });
}

function setYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}

function boot() {
  renderPostcards();
  renderPhotos();
  renderReviews();
  wireCtas();
  setupNav();
  setupReveal();
  setupHeroMotion();
  setYear();
}

boot();