
      var targetNumber = "963945083365"; 
      var apiURL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec"; 

      // جلب البيانات فور تحميل الصفحة
      document.addEventListener("DOMContentLoaded", function() {
        fetch(apiURL)
          .then(response => response.json())
          .then(data => {
              document.getElementById('loader').remove();
              renderData(data);
          })
          .catch(error => {
              document.getElementById('loader').innerHTML = "⚠️ عذراً، فشل تحميل البيانات. يرجى إعادة المحاولة.";
              console.error('Error:', error);
          });
      });

      function renderData(data) {
        const chipsWrapper = document.getElementById('category-chips');
        const mainContainer = document.getElementById('main-container');

        for (var category in data) {
          // إضافة الـ Chips
          let chipHtml = `<div class="chip" onclick="scrollToCategory('${category}', this)">${category}</div>`;
          chipsWrapper.insertAdjacentHTML('beforeend', chipHtml);

          // إضافة أقسام المنتجات
          let sectionHtml = `
            <div class="category-section" id="section-${category}">
              <div class="category-header">${category}</div>
            </div>`;
          mainContainer.insertAdjacentHTML('beforeend', sectionHtml);
          
          let sectionElement = document.getElementById(`section-${category}`);

          // إضافة كروت المنتجات داخل القسم الحالي
          data[category].forEach(item => {
            let productHtml = `
              <div class="product-card" data-name="${item.name}" data-price="${item.price}" data-stock="${item.stock}">
                <img class="product-image" src="${item.imageUrl}" onerror="this.src='https://via.placeholder.com/600x400?text=Aleppo+Delivery'">
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
          });
        }
      }

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
        var message = "🛍️ *طلب جديد - Aleppo Delivery*\n";
        message += "--------------------------\n";
        
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
          message += `🔹 *${productName}*\n`;
          message += `   ${q} × ${p.toLocaleString()} = ${sub.toLocaleString()} ل.س\n`;
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
