const CONTACT_LINKS = {
  messenger: 'https://www.facebook.com/lynnkhar.poetry.story',
  telegram: 'https://t.me/lynnkhar_preorder_bot',
};

const books = [
  {
    title: 'ရေသေအိုင်',
    year: '2019 (First published)',
    pages: '228 pages',
    tags: ['Novel', 'Realist Drama'],
    description: 'လူငယ်ဘဝရုန်းကန်မှုနဲ့ အခြေခံလူတန်းစားဘဝထဲက အမှန်တရားများကို ခံစားချက်နက်နက်နဲနဲနဲ့ ရေးဖွဲ့ထားတဲ့ ဝတ္ထု။',
    links: [
      { label: 'Goodreads 3.98 (48 ratings)', url: 'https://www.goodreads.com/book/show/52725373' },
      { label: 'Pann Satt Lann 4.75 (4 reviews)', url: 'https://www.pannsattlann.com/product/yay-thay-eain/' },
    ],
  },
  {
    title: 'စမ်းရေကြည်နု',
    year: '2020 (June print)',
    pages: '239 pages',
    tags: ['Novel', 'Social Life'],
    description: 'မိသားစု၊ ဆင်းရဲရုန်းကန်မှုနဲ့ လူမှုဘဝပြောင်းလဲမှုအတွင်း ခံစားချက်အမျိုးမျိုးကို ထိမိစေသည့် ဖတ်ရှုရမယ့်စာအုပ်။',
    links: [
      { label: 'Goodreads 4.07 (27 ratings)', url: 'https://www.goodreads.com/author/list/19507238._' },
      { label: 'Pann Satt Lann 5.00 (3 reviews)', url: 'https://www.pannsattlann.com/product/sann-yay-kyi-nu/' },
    ],
  },
  {
    title: 'ဖန်ပုလင်းထဲက အသည်းကွဲပုစဉ်းပျံ',
    year: '2025 (3rd print listed)',
    pages: '240 pages',
    tags: ['Coming-of-age', 'Youth Story'],
    description: 'ဆယ်ကျော်သက်ကာလအတွင်း မိတ်ဆွေမှု၊ အချစ်နဲ့ နာကျင်မှုတို့ကို ပေါင်းစပ်ထားတဲ့ coming-of-age သဘောတရားပါဝင်သည့် ဝတ္ထု။',
    links: [
      { label: 'Goodreads 3.87 (23 ratings)', url: 'https://www.goodreads.com/author/list/19507238._' },
      { label: 'Pann Satt Lann 4.50 (2 reviews)', url: 'https://www.pannsattlann.com/product/athael-kwal-pasin-pyan/' },
    ],
  },
  {
    title: 'လေပရဝုဏ်',
    year: 'Upcoming',
    pages: 'Pre-order campaign',
    tags: ['New Release', 'Pre-Order'],
    description: 'လက်ရှိ campaign အဖြစ် pre-order ဖွင့်ထားသော title အသစ်။ Messenger နှင့် Telegram bot မှာ တိုက်ရိုက် order တင်နိုင်ပါသည်။',
    links: [],
  },
];

function renderBooks() {
  const root = document.getElementById('books-grid');
  if (!root) return;

  root.innerHTML = books
    .map((book) => {
      const linksMarkup = (book.links || [])
        .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
        .join('');

      const tagsMarkup = (book.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join('');

      return `
        <article class="book-card">
          <div class="book-head">
            <h3 class="book-title">${book.title}</h3>
            <span class="book-year">${book.year}</span>
          </div>
          <div class="book-meta">
            <span class="tag">${book.pages}</span>
            ${tagsMarkup}
          </div>
          <p class="book-desc">${book.description}</p>
          ${linksMarkup ? `<div class="book-links">${linksMarkup}</div>` : ''}
        </article>
      `;
    })
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

function setupNavigation() {
  const navToggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');

  if (navToggle && nav) {
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
}

function setupReveal() {
  const revealItems = document.querySelectorAll('.section-reveal');
  if (!revealItems.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function setYear() {
  const yearEl = document.getElementById('year');
  if (!yearEl) return;
  yearEl.textContent = String(new Date().getFullYear());
}

function boot() {
  renderBooks();
  wireCtas();
  setupNavigation();
  setupReveal();
  setYear();
}

boot();