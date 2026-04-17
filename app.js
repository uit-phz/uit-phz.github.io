const CONTACT_LINKS = {
  messenger: 'https://m.me/your-page-id',
  telegram: 'https://t.me/your_bot_username',
};

const books = [
  {
    title: 'ရေသေအိုင်',
    year: '2019',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2019/08/yay-thay-e.png',
    summary: 'လူငယ်ဘဝ၊ မှတ်ဉာဏ်နှင့် လူမှုဖိအားကြားက စိတ်ပိုင်းဆိုင်ရာရေစီးကြောင်း။',
    page: 'books/yay-thay-e.html',
    source: 'https://www.goodreads.com/book/show/52725373',
    hot: false,
  },
  {
    title: 'စမ်းရေကြည်နု',
    year: '2020',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu.png',
    summary: 'မိသားစုဘဝအက်ကြောင်း၊ နေ့စဉ်တိတ်ဆိတ်မှုနှင့် ရင်ထဲက မပြောဖြစ်သေးသော အသံများ။',
    page: 'books/san-yay-kyi-nu.html',
    source: 'https://www.pannsattlann.com/product/sann-yay-kyi-nu/',
    hot: false,
  },
  {
    title: 'ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ',
    year: '2025',
    image: 'https://www.pannsattlann.com/wp-content/uploads/2025/02/phan-palin.png',
    summary: 'နူးညံ့သော်လည်း ကိုက်ခဲနေသည့် coming-of-age စာရေးသံစဉ်။',
    page: 'books/phan-palin.html',
    source: 'https://www.pannsattlann.com/product/athael-kwal-pasin-pyan/',
    hot: false,
  },
  {
    title: 'လေပုရဝုဏ်',
    year: '2026 Pre-Order',
    image: 'lay-pa-ya-wun.png',
    summary: 'Dedicated pre-order landing page with 15% and 30% bulk-order promo.',
    page: 'preorder.html',
    source: 'books/lay-pu-ya-wun.html',
    hot: true,
  },
];

const photos = [
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2019/08/yay-thay-e.png',
    alt: 'ရေသေအိုင် cover photo',
    span: 'span-4',
    angle: '-2.5deg',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu.png',
    alt: 'စမ်းရေကြည်နု cover photo',
    span: 'span-3',
    angle: '1.8deg',
  },
  {
    src: 'lay-pa-ya-wun.png',
    alt: 'လေပုရဝုဏ် official cover photo',
    span: 'span-5',
    angle: '-1.4deg',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu-1.jpg',
    alt: 'စမ်းရေကြည်နု additional photo one',
    span: 'span-6',
    angle: '2.2deg',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2020/07/San-yay-kyi-nu-2.jpg',
    alt: 'စမ်းရေကြည်နု additional photo two',
    span: 'span-6',
    angle: '-2deg',
  },
  {
    src: 'assets/images/author-profile.jpg',
    alt: 'author portrait artwork',
    span: 'span-4',
    angle: '1.6deg',
  },
  {
    src: 'lay-pa-ya-wun.png',
    alt: 'lay-pa-ya-wun promo cover art',
    span: 'span-4',
    angle: '-1.2deg',
  },
  {
    src: 'https://www.pannsattlann.com/wp-content/uploads/2025/02/phan-palin-600x600.png',
    alt: 'companion cover artwork',
    span: 'span-4',
    angle: '2.2deg',
  },
];

const reviews = [
  {
    quote: 'A mixture of realistic and minimal style of writing, yet deeply provocative.',
    meta: 'Goodreads reader on ရေသေအိုင်',
  },
  {
    quote: 'ဆရာ လင်းခါးရဲ့ ဖတ်ဖူးသမျှဝတ္ထုတွေထဲ အကြိုက်ဆုံး စာအုပ်ပါ။',
    meta: 'Pann Satt Lann reader on စမ်းရေကြည်နု',
  },
  {
    quote: 'ဖတ်ပြီးခါနီးမှာ လုံးဝအံ့ဩပြီး မျက်ရည်ပါကျသွားတယ်။',
    meta: 'Pann Satt Lann reader on ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ',
  },
];

function renderPostcards() {
  const root = document.getElementById('postcard-grid');
  if (!root) return;

  root.innerHTML = books
    .map((item, index) => {
      const angle = index % 2 === 0 ? '-2.6deg' : '2.6deg';
      const hotChip = item.hot ? '<a class="link-chip hot" href="preorder.html">Promo</a>' : '';
      return `
        <article class="postcard reveal-item" style="--angle:${angle}">
          <img src="${item.image}" alt="${item.title} cover" loading="lazy" />
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
          <div class="pc-meta">
            <span>${item.year}</span>
          </div>
          <div class="pc-links">
            <a class="link-chip" href="${item.page}">Landing page</a>
            <a class="link-chip" href="${item.source}" target="_blank" rel="noopener noreferrer">Source</a>
            ${hotChip}
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
        <figure class="photo ${item.span} reveal-item" style="--photo-angle:${item.angle}">
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
        <article class="review reveal-item">
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
  const items = [...document.querySelectorAll('.reveal, .reveal-item')];
  if (!items.length) return;

  items.forEach((item, index) => {
    item.style.setProperty('--delay', `${index * 28}ms`);
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
    { threshold: 0.14 }
  );

  items.forEach((item) => obs.observe(item));
}

function setupHeroMotion() {
  const stack = document.getElementById('hero-stack');
  if (!stack || window.matchMedia('(max-width: 1020px)').matches) return;

  const nodes = stack.querySelectorAll('.portrait-card, .floating-cover, .sticker');
  let rafId = null;

  stack.addEventListener('mousemove', (event) => {
    const rect = stack.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      nodes.forEach((node, index) => {
        const depth = (index + 1) * 4;
        node.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
      });
    });
  });

  stack.addEventListener('mouseleave', () => {
    nodes.forEach((node) => {
      node.style.transform = 'translate(0, 0)';
    });
  });
}

function setupCardTilt() {
  if (window.matchMedia('(max-width: 960px)').matches) return;
  const cards = document.querySelectorAll('.postcard');

  cards.forEach((card) => {
    card.addEventListener('mousemove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `rotateX(${y * -4}deg) rotateY(${x * 6}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
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
  setupCardTilt();
  setYear();
}

boot();