
      var targetNumber = "963945083365"; 
      var apiURL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec"; 
// 1. فتح أو إنشاء قاعدة البيانات المحلية في الموبايل لـ الكاش
const dbName = "RogvenImageCache";
const storeName = "images";
let db;

const request = indexedDB.open(dbName, 1);
request.onupgradeneeded = (e) => {
  e.target.result.createObjectStore(storeName);
};
request.onsuccess = (e) => {
  db = e.target.result;
};

// 2. دالة جلب الصورة من الكاش أو تحميلها وحفظها
async function getCachedImage(url, imgElement) {
  if (!db) {
    // إذا لم تكن قاعدة البيانات جاهزة بعد، نعرض الرابط المباشر
    imgElement.src = url;
    return;
  }

  // المحاولة الأولى: البحث عن الصورة في الذاكرة الدائمة للموبايل
  const transaction = db.transaction([storeName], "readonly");
  const store = transaction.objectStore(storeName);
  const getRequest = store.get(url);

  getRequest.onsuccess = async () => {
    if (getRequest.result) {
      // الروعة هنا: الصورة موجودة بالذاكرة ونعرضها فوراً بدون إنترنت!
      imgElement.src = getRequest.result;
    } else {
      // الصورة غير موجودة، نقوم بتحميلها وحفظها للمستقبل
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          
          // حفظ الصورة في الذاكرة الدائمة باستخدام الرابط كمفتاح
          const writeTransaction = db.transaction([storeName], "readwrite");
          const writeStore = writeTransaction.objectStore(storeName);
          writeStore.put(base64data, url);
          
          // عرض الصورة
          imgElement.src = base64data;
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        // في حال حدوث أي خطأ بالتحميل أو ضعف إنترنت، نعود للرابط الافتراضي
        imgElement.src = url;
      }
    }
  };
}

// 3. الدالة الأساسية المعدلة لعرض البيانات
function renderData(data) {
  const chipsWrapper = document.getElementById('category-chips');
  const mainContainer = document.getElementById('main-container');

  for (var category in data) {
    let chipHtml = `<div class="chip" onclick="scrollToCategory('${category}', this)">${category}</div>`;
    chipsWrapper.insertAdjacentHTML('beforeend', chipHtml);

    let sectionHtml = `
      <div class="category-section" id="section-${category}">
        <div class="category-header">${category}</div>
      </div>`;
    mainContainer.insertAdjacentHTML('beforeend', sectionHtml);
    
    let sectionElement = document.getElementById(`section-${category}`);

    data[category].forEach(item => {
      // نضع معرف فريد (ID) مؤقت لكل صورة حتى نتحكم بها عبر الدالة الذكية
      let uniqueId = "img-" + Math.random().toString(36).substr(2, 9);
      
      let productHtml = `
        <div class="product-card" data-name="${item.name}" data-price="${item.price}" data-stock="${item.stock}">
          <img class="product-image" id="${uniqueId}" src="" onerror="this.src='https://via.placeholder.com/600x400?text=Aleppo+Delivery'">
          <div class="product-info">
            <div class="product-name">${item.name}</div>
            <div class="product-price">${item.price.toLocaleString()} ل.س </div>
            <div class="item-subtotal" style="display: none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>
            <div class="quantity-controls">
              <button class="btn-qty" style="background: var(--primary)" onclick="updateQty(this, 1)">+</button>
              <input type="number" class="qty-input" value="0" readonly>
              <button class="btn-qty" onclick="updateQty(this, -1)">-</button>
            </div>
          </div>
        </div>`;
      sectionElement.insertAdjacentHTML('beforeend', productHtml);
      
      // تشغيل دالة الكاش الذكية بعد إضافة الكرت مباشرة
      const imgEl = document.getElementById(uniqueId);
      getCachedImage(item.imageUrl, imgEl);
    });
  }
}
      // ??? ???????? ??? ????? ??????
      document.addEventListener("DOMContentLoaded", function() {
        fetch(apiURL)
          .then(response => response.json())
          .then(data => {
              document.getElementById('loader').remove();
              renderData(data);
          })
          .catch(error => {
              document.getElementById('loader').innerHTML = "?? ?????? ??? ????? ????????. ???? ????? ????????.";
              console.error('Error:', error);
          });
      });

      

      function toggleTheme() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        body.setAttribute('data-theme', isDark ? 'light' : 'dark');
        document.getElementById('theme-icon').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
      }

      function toggleView() {
        const container = document.getElementById('main-container');
        const icon = document.getElementById('view-icon');
        
        if (container.classList.contains('hero-view')) {
          container.classList.replace('hero-view', 'list-view');
          icon.className = 'fas fa-square';
        } else {
          container.classList.replace('list-view', 'hero-view');
          icon.className = 'fas fa-list';
        }
        filterProducts();
      }

      function updateQty(btn, delta) {
        var card = btn.closest('.product-card');
        var input = card.querySelector('.qty-input');
        var subtotalRow = card.querySelector('.item-subtotal');
        var subtotalVal = card.querySelector('.subtotal-val');
        
        var price = parseFloat(card.getAttribute('data-price'));
        var val = parseInt(input.value) + delta;

        if (val >= 0 && val <= (parseInt(card.getAttribute('data-stock')) || 999)) {
          input.value = val;
          
          if (val > 0) {
            subtotalRow.style.display = 'block';
            subtotalVal.innerText = (val * price).toLocaleString();
          } else {
            subtotalRow.style.display = 'none';
          }
          calculateTotal();
        }
      }

      function calculateTotal() {
        var total = 0, count = 0;
        document.querySelectorAll('.product-card').forEach(card => {
          var qty = parseInt(card.querySelector('.qty-input')?.value || 0);
          total += qty * parseFloat(card.getAttribute('data-price'));
          if(qty > 0) count++;
        });
        document.getElementById('grand-total').innerText = total.toLocaleString();
        document.getElementById('footer-cart').classList.toggle('show', count > 0);
      }

      function sendWhatsApp() {
        var message = "";
        
        var cartData = {}; 
        var prices = {};

        document.querySelectorAll('.product-card').forEach(card => {
          var name = card.getAttribute('data-name');
          var qty = parseInt(card.querySelector('.qty-input')?.value || 0);
          var price = parseFloat(card.getAttribute('data-price'));
          
          if (qty > 0) {
            if (cartData[name]) {
              cartData[name] += qty;
            } else {
              cartData[name] = qty;
              prices[name] = price;
            }
          }
        });

        for (var productName in cartData) {
          var q = cartData[productName];
          var p = prices[productName];
          var sub = q * p;
          message += `?? *${productName}*\n`;
          message += `   ${q} � ${p.toLocaleString()} = ${sub.toLocaleString()} ?.?\n`;
        }

       message += "--------------------------\n";
        message += `💰 *الإجمالي النهائي: ${document.getElementById('grand-total').innerText} ل.س*`;
        
        window.open("https://wa.me/" + targetNumber + "?text=" + encodeURIComponent(message));
      }

      function filterProducts() {
        var query = document.getElementById('search-input').value.toLowerCase();
        document.querySelectorAll('.product-card').forEach(card => {
          var name = card.getAttribute('data-name').toLowerCase();
          var isVisible = name.includes(query);
          if (document.getElementById('main-container').classList.contains('list-view')) {
             card.style.display = isVisible ? "flex" : "none";
          } else {
             card.style.display = isVisible ? "block" : "none";
          }
        });
      }

      function scrollToCategory(catName, chip) {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (catName === 'all') { window.scrollTo({top: 0, behavior: 'smooth'}); return; }
        const el = document.getElementById('section-' + catName);
        window.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' });
      }
