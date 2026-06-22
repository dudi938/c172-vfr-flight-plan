/**
 * C172 VFR Flight Planning Application
 * A comprehensive flight planning tool for Israeli pilots flying in the US
 * Hebrew RTL support with full accessibility
 *
 * @version 1.0.0
 * @author AI Suite
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS & CONFIGURATION
  // ============================================================================

  const CONFIG = {
    ANIMATION_DURATION: 300,
    TOAST_DURATION: 3000,
    SCROLL_THRESHOLD: 300,
    FUEL_DEFAULTS: {
      burnRate: 8.5, // GPH for C172
      groundSpeed: 110, // knots
      fuelPrice: 7.50 // USD per gallon
    },
    EMERGENCY_FREQUENCIES: [
      { name: 'חירום - Emergency', freq: '121.5 MHz', type: 'radio' },
      { name: 'חירום - Emergency Squawk', freq: '7700', type: 'squawk' },
      { name: 'כשל תקשורת - Comm Failure', freq: '7600', type: 'squawk' },
      { name: 'חטיפה - Hijack', freq: '7500', type: 'squawk' }
    ],
    STORAGE_KEYS: {
      favorites: 'vfr_favorites',
      filters: 'vfr_active_filters'
    }
  };

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const state = {
    favorites: new Set(),
    activeFilters: new Set(),
    searchIndex: window.SEARCH_INDEX || [],
    currentLightboxIndex: 0,
    lightboxImages: [],
    isMenuOpen: false,
    isSearchOpen: false,
    isEmergencyPanelOpen: false
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Debounce function to limit rate of function calls
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function to ensure function is called at most once per interval
   */
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Get data from localStorage with error handling
   */
  function getFromStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading from localStorage: ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * Save data to localStorage with error handling
   */
  function saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error saving to localStorage: ${key}`, error);
      return false;
    }
  }

  /**
   * Trap focus within a container (for modals/overlays)
   */
  function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    });

    // Focus first element
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  // ============================================================================
  // 1. MOBILE NAVIGATION
  // ============================================================================

  class MobileNavigation {
    constructor() {
      this.menuToggle = document.querySelector('.mobile-menu-toggle');
      this.mobileMenu = document.querySelector('.mobile-menu');
      this.menuOverlay = document.querySelector('.menu-overlay');
      this.body = document.body;

      if (this.menuToggle && this.mobileMenu) {
        this.init();
      }
    }

    init() {
      this.menuToggle.addEventListener('click', () => this.toggle());

      if (this.menuOverlay) {
        this.menuOverlay.addEventListener('click', () => this.close());
      }

      // Close menu on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isMenuOpen) {
          this.close();
        }
      });

      // Close menu when clicking menu links
      const menuLinks = this.mobileMenu.querySelectorAll('a');
      menuLinks.forEach(link => {
        link.addEventListener('click', () => this.close());
      });

      // Update ARIA label
      this.updateAriaLabel();
    }

    toggle() {
      state.isMenuOpen ? this.close() : this.open();
    }

    open() {
      state.isMenuOpen = true;
      this.mobileMenu.classList.add('active');
      if (this.menuOverlay) {
        this.menuOverlay.classList.add('active');
      }
      this.body.style.overflow = 'hidden';
      this.menuToggle.setAttribute('aria-expanded', 'true');

      // Trap focus in menu
      trapFocus(this.mobileMenu);
    }

    close() {
      state.isMenuOpen = false;
      this.mobileMenu.classList.remove('active');
      if (this.menuOverlay) {
        this.menuOverlay.classList.remove('active');
      }
      this.body.style.overflow = '';
      this.menuToggle.setAttribute('aria-expanded', 'false');
      this.menuToggle.focus();
    }

    updateAriaLabel() {
      const label = state.isMenuOpen ? 'סגור תפריט' : 'פתח תפריט';
      this.menuToggle.setAttribute('aria-label', label);
    }
  }

  // ============================================================================
  // 2. GLOBAL SEARCH
  // ============================================================================

  class GlobalSearch {
    constructor() {
      this.searchTrigger = document.querySelector('.search-trigger');
      this.searchOverlay = document.querySelector('.search-overlay');
      this.searchInput = document.querySelector('.search-input');
      this.searchResults = document.querySelector('.search-results');
      this.searchClose = document.querySelector('.search-close');
      this.selectedIndex = -1;

      if (this.searchTrigger && this.searchOverlay) {
        this.init();
      }
    }

    init() {
      this.searchTrigger.addEventListener('click', () => this.open());

      if (this.searchClose) {
        this.searchClose.addEventListener('click', () => this.close());
      }

      this.searchOverlay.addEventListener('click', (e) => {
        if (e.target === this.searchOverlay) {
          this.close();
        }
      });

      // Search input with debounce
      this.searchInput.addEventListener('input', debounce((e) => {
        this.performSearch(e.target.value);
      }, 200));

      // Keyboard navigation
      this.searchInput.addEventListener('keydown', (e) => this.handleKeyboard(e));

      // Global keyboard shortcut (Ctrl/Cmd + K)
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          this.open();
        }
        if (e.key === 'Escape' && state.isSearchOpen) {
          this.close();
        }
      });
    }

    open() {
      state.isSearchOpen = true;
      this.searchOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Focus input after animation
      setTimeout(() => {
        this.searchInput.focus();
      }, 100);
    }

    close() {
      state.isSearchOpen = false;
      this.searchOverlay.classList.remove('active');
      document.body.style.overflow = '';
      this.searchInput.value = '';
      this.searchResults.innerHTML = '';
      this.selectedIndex = -1;
    }

    performSearch(query) {
      if (!query || query.length < 2) {
        this.searchResults.innerHTML = '<p class="search-empty">הקלד לפחות 2 תווים לחיפוש</p>';
        return;
      }

      const normalizedQuery = query.toLowerCase();
      const results = state.searchIndex.filter(item => {
        return (
          item.title?.toLowerCase().includes(normalizedQuery) ||
          item.keywords?.toLowerCase().includes(normalizedQuery) ||
          item.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery)) ||
          item.region?.toLowerCase().includes(normalizedQuery)
        );
      });

      this.displayResults(results, query);
    }

    displayResults(results, query) {
      if (results.length === 0) {
        this.searchResults.innerHTML = `
          <p class="search-empty">
            לא נמצאו תוצאות עבור "${this.escapeHtml(query)}"
          </p>
        `;
        return;
      }

      // Group by region
      const grouped = results.reduce((acc, item) => {
        const region = item.region || 'אחר';
        if (!acc[region]) acc[region] = [];
        acc[region].push(item);
        return acc;
      }, {});

      let html = `<p class="search-count">נמצאו ${results.length} תוצאות</p>`;

      Object.keys(grouped).forEach(region => {
        html += `
          <div class="search-group">
            <h3 class="search-group-title">${this.escapeHtml(region)}</h3>
            <ul class="search-group-items" role="listbox">
        `;

        grouped[region].forEach((item, index) => {
          html += `
            <li class="search-result-item" role="option">
              <a href="${this.escapeHtml(item.url)}" class="search-result-link">
                <span class="search-result-title">${this.highlightMatch(item.title, query)}</span>
                ${item.tags ? `
                  <span class="search-result-tags">
                    ${item.tags.map(tag => `<span class="tag-mini">${this.escapeHtml(tag)}</span>`).join('')}
                  </span>
                ` : ''}
              </a>
            </li>
          `;
        });

        html += `</ul></div>`;
      });

      this.searchResults.innerHTML = html;
    }

    highlightMatch(text, query) {
      if (!text) return '';
      const escaped = this.escapeHtml(text);
      const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
      return escaped.replace(regex, '<mark>$1</mark>');
    }

    handleKeyboard(e) {
      const items = this.searchResults.querySelectorAll('.search-result-link');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection(items);
      } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
        e.preventDefault();
        items[this.selectedIndex].click();
      }
    }

    updateSelection(items) {
      items.forEach((item, index) => {
        if (index === this.selectedIndex) {
          item.classList.add('selected');
          item.focus();
        } else {
          item.classList.remove('selected');
        }
      });

      if (this.selectedIndex === -1) {
        this.searchInput.focus();
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    escapeRegex(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  // ============================================================================
  // 3. TAG FILTERING
  // ============================================================================

  class TagFilter {
    constructor() {
      this.tagButtons = document.querySelectorAll('.tag-filter');
      this.clearButton = document.querySelector('.clear-filters');
      this.tripCards = document.querySelectorAll('.trip-card');
      this.noResults = document.querySelector('.no-results');

      if (this.tagButtons.length > 0) {
        this.init();
      }
    }

    init() {
      // Load filters from URL hash
      this.loadFiltersFromHash();

      // Tag button click handlers
      this.tagButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const tag = button.dataset.tag;
          this.toggleFilter(tag);
        });
      });

      // Clear filters button
      if (this.clearButton) {
        this.clearButton.addEventListener('click', () => this.clearAllFilters());
      }

      // Apply initial filters
      this.applyFilters();
    }

    toggleFilter(tag) {
      if (state.activeFilters.has(tag)) {
        state.activeFilters.delete(tag);
      } else {
        state.activeFilters.add(tag);
      }

      this.updateUI();
      this.applyFilters();
      this.updateHash();
    }

    clearAllFilters() {
      state.activeFilters.clear();
      this.updateUI();
      this.applyFilters();
      this.updateHash();
    }

    applyFilters() {
      let visibleCount = 0;

      this.tripCards.forEach(card => {
        if (state.activeFilters.size === 0) {
          card.style.display = '';
          visibleCount++;
          return;
        }

        // Get card tags
        const cardTags = (card.dataset.tags || '').split(',').map(t => t.trim());

        // AND logic: card must have ALL active filters
        const hasAllTags = Array.from(state.activeFilters).every(filter =>
          cardTags.includes(filter)
        );

        if (hasAllTags) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Show/hide no results message
      if (this.noResults) {
        this.noResults.style.display = visibleCount === 0 ? 'block' : 'none';
      }

      // Show/hide clear button
      if (this.clearButton) {
        this.clearButton.style.display = state.activeFilters.size > 0 ? 'inline-flex' : 'none';
      }
    }

    updateUI() {
      this.tagButtons.forEach(button => {
        const tag = button.dataset.tag;
        if (state.activeFilters.has(tag)) {
          button.classList.add('active');
          button.setAttribute('aria-pressed', 'true');
        } else {
          button.classList.remove('active');
          button.setAttribute('aria-pressed', 'false');
        }
      });
    }

    updateHash() {
      if (state.activeFilters.size > 0) {
        const filters = Array.from(state.activeFilters).join(',');
        window.location.hash = `filters=${encodeURIComponent(filters)}`;
      } else {
        history.replaceState(null, null, ' ');
      }
    }

    loadFiltersFromHash() {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const filters = params.get('filters');

      if (filters) {
        filters.split(',').forEach(tag => {
          state.activeFilters.add(decodeURIComponent(tag.trim()));
        });
      }
    }
  }

  // ============================================================================
  // 4. SHARE FUNCTIONALITY
  // ============================================================================

  class ShareManager {
    constructor() {
      this.shareButtons = document.querySelectorAll('[data-share]');

      if (this.shareButtons.length > 0) {
        this.init();
      }
    }

    init() {
      this.shareButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const type = button.dataset.share;
          const title = button.dataset.title || document.title;
          const url = button.dataset.url || window.location.href;

          this.share(type, title, url);
        });
      });
    }

    share(type, title, url) {
      switch (type) {
        case 'whatsapp':
          this.shareWhatsApp(title, url);
          break;
        case 'email':
          this.shareEmail(title, url);
          break;
        case 'copy':
          this.copyLink(url);
          break;
        case 'native':
          this.shareNative(title, url);
          break;
      }
    }

    shareWhatsApp(title, url) {
      const text = encodeURIComponent(`${title}\n${url}`);
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    }

    shareEmail(title, url) {
      const subject = encodeURIComponent(title);
      const body = encodeURIComponent(`${title}\n\n${url}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    async copyLink(url) {
      try {
        await navigator.clipboard.writeText(url);
        showToast('הקישור הועתק!', 'success');
      } catch (error) {
        // Fallback for older browsers
        this.copyLinkFallback(url);
      }
    }

    copyLinkFallback(url) {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        showToast('הקישור הועתק!', 'success');
      } catch (error) {
        showToast('שגיאה בהעתקת הקישור', 'error');
      }

      document.body.removeChild(textarea);
    }

    async shareNative(title, url) {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('Share failed:', error);
          }
        }
      } else {
        // Fallback to copy link
        this.copyLink(url);
      }
    }
  }

  // ============================================================================
  // 5. TOAST NOTIFICATIONS
  // ============================================================================

  function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="סגור הודעה">&times;</button>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => hideToast(toast));

    // Auto dismiss
    setTimeout(() => hideToast(toast), CONFIG.TOAST_DURATION);
  }

  function hideToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), CONFIG.ANIMATION_DURATION);
  }

  // ============================================================================
  // 6. IMAGE LIGHTBOX
  // ============================================================================

  class ImageLightbox {
    constructor() {
      this.lightboxTriggers = document.querySelectorAll('.lightbox-trigger, [data-lightbox]');
      this.lightbox = null;
      this.currentIndex = 0;
      this.images = [];
      this.touchStartX = 0;
      this.touchEndX = 0;

      if (this.lightboxTriggers.length > 0) {
        this.init();
      }
    }

    init() {
      this.createLightbox();

      this.lightboxTriggers.forEach((trigger, index) => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const group = trigger.dataset.lightboxGroup || 'default';
          this.open(index, group);
        });
      });
    }

    createLightbox() {
      this.lightbox = document.createElement('div');
      this.lightbox.className = 'lightbox';
      this.lightbox.setAttribute('role', 'dialog');
      this.lightbox.setAttribute('aria-modal', 'true');
      this.lightbox.innerHTML = `
        <div class="lightbox-overlay"></div>
        <div class="lightbox-content">
          <button class="lightbox-close" aria-label="סגור">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="lightbox-prev" aria-label="תמונה קודמת">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button class="lightbox-next" aria-label="תמונה הבאה">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <img class="lightbox-image" src="" alt="">
          <div class="lightbox-caption"></div>
          <div class="lightbox-counter"></div>
        </div>
      `;

      document.body.appendChild(this.lightbox);

      // Event listeners
      this.lightbox.querySelector('.lightbox-close').addEventListener('click', () => this.close());
      this.lightbox.querySelector('.lightbox-overlay').addEventListener('click', () => this.close());
      this.lightbox.querySelector('.lightbox-prev').addEventListener('click', () => this.prev());
      this.lightbox.querySelector('.lightbox-next').addEventListener('click', () => this.next());

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!this.lightbox.classList.contains('active')) return;

        if (e.key === 'Escape') this.close();
        if (e.key === 'ArrowLeft') this.next(); // RTL: left goes next
        if (e.key === 'ArrowRight') this.prev(); // RTL: right goes prev
      });

      // Touch support
      this.lightbox.addEventListener('touchstart', (e) => {
        this.touchStartX = e.changedTouches[0].screenX;
      });

      this.lightbox.addEventListener('touchend', (e) => {
        this.touchEndX = e.changedTouches[0].screenX;
        this.handleSwipe();
      });
    }

    open(index, group = 'default') {
      // Collect images from the same group
      this.images = Array.from(this.lightboxTriggers)
        .filter(trigger => (trigger.dataset.lightboxGroup || 'default') === group)
        .map(trigger => ({
          src: trigger.dataset.lightbox || trigger.href || trigger.src,
          caption: trigger.dataset.caption || trigger.alt || '',
          alt: trigger.alt || ''
        }));

      this.currentIndex = index;
      this.show();
    }

    show() {
      const image = this.images[this.currentIndex];
      const imgElement = this.lightbox.querySelector('.lightbox-image');
      const caption = this.lightbox.querySelector('.lightbox-caption');
      const counter = this.lightbox.querySelector('.lightbox-counter');

      imgElement.src = image.src;
      imgElement.alt = image.alt;
      caption.textContent = image.caption;
      counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;

      // Show/hide navigation buttons
      const prevBtn = this.lightbox.querySelector('.lightbox-prev');
      const nextBtn = this.lightbox.querySelector('.lightbox-next');
      prevBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
      nextBtn.style.display = this.images.length > 1 ? 'flex' : 'none';

      this.lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Focus close button
      setTimeout(() => {
        this.lightbox.querySelector('.lightbox-close').focus();
      }, 100);
    }

    close() {
      this.lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }

    next() {
      this.currentIndex = (this.currentIndex + 1) % this.images.length;
      this.show();
    }

    prev() {
      this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
      this.show();
    }

    handleSwipe() {
      const swipeThreshold = 50;
      const diff = this.touchStartX - this.touchEndX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          this.next(); // Swipe left = next in RTL
        } else {
          this.prev(); // Swipe right = prev in RTL
        }
      }
    }
  }

  // ============================================================================
  // 7. MAP POPUPS
  // ============================================================================

  class MapPopup {
    constructor() {
      this.mapTriggers = document.querySelectorAll('.map-popup-trigger, [data-map-popup]');
      this.popup = null;

      if (this.mapTriggers.length > 0) {
        this.init();
      }
    }

    init() {
      this.createPopup();

      this.mapTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const mapId = trigger.dataset.mapId || trigger.dataset.mapPopup;
          this.open(mapId);
        });
      });
    }

    createPopup() {
      this.popup = document.createElement('div');
      this.popup.className = 'map-popup';
      this.popup.setAttribute('role', 'dialog');
      this.popup.setAttribute('aria-modal', 'true');
      this.popup.innerHTML = `
        <div class="map-popup-overlay"></div>
        <div class="map-popup-content">
          <button class="map-popup-close" aria-label="סגור מפה">&times;</button>
          <div class="map-popup-container"></div>
        </div>
      `;

      document.body.appendChild(this.popup);

      this.popup.querySelector('.map-popup-close').addEventListener('click', () => this.close());
      this.popup.querySelector('.map-popup-overlay').addEventListener('click', () => this.close());

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.popup.classList.contains('active')) {
          this.close();
        }
      });
    }

    open(mapId) {
      const originalMap = document.getElementById(mapId);
      if (!originalMap) return;

      const container = this.popup.querySelector('.map-popup-container');
      const clone = originalMap.cloneNode(true);
      clone.id = mapId + '-popup';

      container.innerHTML = '';
      container.appendChild(clone);

      this.popup.classList.add('active');
      document.body.style.overflow = 'hidden';

      // If using Leaflet, reinitialize the map
      if (window.L && originalMap._leaflet_id) {
        this.initLeafletMap(clone, originalMap);
      }
    }

    close() {
      this.popup.classList.remove('active');
      document.body.style.overflow = '';
    }

    initLeafletMap(clone, original) {
      // Get original map center and zoom
      const originalMap = original._leaflet_map || window.L.map(original);
      const center = originalMap.getCenter();
      const zoom = originalMap.getZoom();

      // Initialize new map
      setTimeout(() => {
        const newMap = window.L.map(clone).setView([center.lat, center.lng], zoom);

        // Copy tile layer
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(newMap);

        // Copy markers if any
        originalMap.eachLayer((layer) => {
          if (layer instanceof window.L.Marker) {
            window.L.marker(layer.getLatLng())
              .bindPopup(layer.getPopup() ? layer.getPopup().getContent() : '')
              .addTo(newMap);
          }
        });
      }, 100);
    }
  }

  // ============================================================================
  // 8. ACCORDION/COLLAPSIBLE LEGS
  // ============================================================================

  class Accordion {
    constructor() {
      this.accordions = document.querySelectorAll('.accordion-item');

      if (this.accordions.length > 0) {
        this.init();
      }
    }

    init() {
      this.accordions.forEach(item => {
        const trigger = item.querySelector('.accordion-trigger');
        const content = item.querySelector('.accordion-content');

        if (!trigger || !content) return;

        // Set initial ARIA attributes
        const id = 'accordion-' + Math.random().toString(36).substr(2, 9);
        trigger.setAttribute('aria-controls', id);
        content.id = id;

        const isOpen = item.classList.contains('active');
        trigger.setAttribute('aria-expanded', isOpen);
        content.setAttribute('aria-hidden', !isOpen);

        // Set max-height for animation
        if (isOpen) {
          content.style.maxHeight = content.scrollHeight + 'px';
        }

        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggle(item);
        });
      });
    }

    toggle(item) {
      const trigger = item.querySelector('.accordion-trigger');
      const content = item.querySelector('.accordion-content');
      const isOpen = item.classList.contains('active');

      if (isOpen) {
        this.close(item);
      } else {
        this.open(item);
      }
    }

    open(item) {
      const trigger = item.querySelector('.accordion-trigger');
      const content = item.querySelector('.accordion-content');

      item.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      content.setAttribute('aria-hidden', 'false');
      content.style.maxHeight = content.scrollHeight + 'px';
    }

    close(item) {
      const trigger = item.querySelector('.accordion-trigger');
      const content = item.querySelector('.accordion-content');

      item.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
      content.setAttribute('aria-hidden', 'true');
      content.style.maxHeight = '0';
    }
  }

  // ============================================================================
  // 9. SMOOTH SCROLL
  // ============================================================================

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');

        // Skip empty hashes and javascript: links
        if (href === '#' || href === '#!' || href.startsWith('javascript:')) {
          return;
        }

        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();

          const headerHeight = document.querySelector('header')?.offsetHeight || 0;
          const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;

          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });

          // Update focus for accessibility
          target.setAttribute('tabindex', '-1');
          target.focus();
        }
      });
    });
  }

  // ============================================================================
  // 10. BACK TO TOP
  // ============================================================================

  class BackToTop {
    constructor() {
      this.button = document.querySelector('.back-to-top');

      if (!this.button) {
        this.createButton();
      }

      if (this.button) {
        this.init();
      }
    }

    createButton() {
      this.button = document.createElement('button');
      this.button.className = 'back-to-top';
      this.button.setAttribute('aria-label', 'חזרה לראש העמוד');
      this.button.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      `;
      document.body.appendChild(this.button);
    }

    init() {
      // Show/hide on scroll
      const toggleVisibility = throttle(() => {
        if (window.pageYOffset > CONFIG.SCROLL_THRESHOLD) {
          this.button.classList.add('visible');
        } else {
          this.button.classList.remove('visible');
        }
      }, 100);

      window.addEventListener('scroll', toggleVisibility);

      // Scroll to top on click
      this.button.addEventListener('click', () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });
    }
  }

  // ============================================================================
  // 11. FUEL COST ESTIMATOR
  // ============================================================================

  class FuelEstimator {
    constructor() {
      this.triggers = document.querySelectorAll('.fuel-estimator-trigger, [data-fuel-estimator]');
      this.modal = null;

      if (this.triggers.length > 0) {
        this.init();
      }
    }

    init() {
      this.createModal();

      this.triggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const distance = parseFloat(trigger.dataset.distance) || 0;
          this.open(distance);
        });
      });
    }

    createModal() {
      this.modal = document.createElement('div');
      this.modal.className = 'fuel-estimator-modal';
      this.modal.setAttribute('role', 'dialog');
      this.modal.setAttribute('aria-labelledby', 'fuel-estimator-title');
      this.modal.innerHTML = `
        <div class="fuel-estimator-overlay"></div>
        <div class="fuel-estimator-content">
          <button class="fuel-estimator-close" aria-label="סגור">&times;</button>
          <h2 id="fuel-estimator-title">מחשבון דלק</h2>

          <form class="fuel-estimator-form">
            <div class="form-group">
              <label for="fuel-distance">מרחק (NM)</label>
              <input type="number" id="fuel-distance" step="0.1" min="0" required>
            </div>

            <div class="form-group">
              <label for="fuel-burn-rate">קצב שריפת דלק (GPH)</label>
              <input type="number" id="fuel-burn-rate" step="0.1" min="0" value="${CONFIG.FUEL_DEFAULTS.burnRate}" required>
            </div>

            <div class="form-group">
              <label for="fuel-ground-speed">מהירות קרקע (knots)</label>
              <input type="number" id="fuel-ground-speed" step="1" min="0" value="${CONFIG.FUEL_DEFAULTS.groundSpeed}" required>
            </div>

            <div class="form-group">
              <label for="fuel-price">מחיר דלק ($/gallon)</label>
              <input type="number" id="fuel-price" step="0.01" min="0" value="${CONFIG.FUEL_DEFAULTS.fuelPrice}" required>
            </div>

            <button type="submit" class="btn btn-primary">חשב</button>
          </form>

          <div class="fuel-estimator-results" style="display: none;">
            <h3>תוצאות</h3>
            <div class="fuel-result-item">
              <span class="fuel-result-label">זמן טיסה:</span>
              <span class="fuel-result-value" id="result-time"></span>
            </div>
            <div class="fuel-result-item">
              <span class="fuel-result-label">דלק נדרש:</span>
              <span class="fuel-result-value" id="result-fuel"></span>
            </div>
            <div class="fuel-result-item">
              <span class="fuel-result-label">דלק עם רזרבה (45 דקות):</span>
              <span class="fuel-result-value" id="result-fuel-reserve"></span>
            </div>
            <div class="fuel-result-item fuel-result-total">
              <span class="fuel-result-label">עלות כוללת:</span>
              <span class="fuel-result-value" id="result-cost"></span>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.modal);

      // Event listeners
      this.modal.querySelector('.fuel-estimator-close').addEventListener('click', () => this.close());
      this.modal.querySelector('.fuel-estimator-overlay').addEventListener('click', () => this.close());
      this.modal.querySelector('.fuel-estimator-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.calculate();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal.classList.contains('active')) {
          this.close();
        }
      });
    }

    open(distance = 0) {
      const distanceInput = this.modal.querySelector('#fuel-distance');
      distanceInput.value = distance;

      this.modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        distanceInput.focus();
      }, 100);
    }

    close() {
      this.modal.classList.remove('active');
      document.body.style.overflow = '';
      this.modal.querySelector('.fuel-estimator-results').style.display = 'none';
    }

    calculate() {
      const distance = parseFloat(this.modal.querySelector('#fuel-distance').value);
      const burnRate = parseFloat(this.modal.querySelector('#fuel-burn-rate').value);
      const groundSpeed = parseFloat(this.modal.querySelector('#fuel-ground-speed').value);
      const fuelPrice = parseFloat(this.modal.querySelector('#fuel-price').value);

      // Calculations
      const timeHours = distance / groundSpeed;
      const timeMinutes = timeHours * 60;
      const fuelNeeded = timeHours * burnRate;
      const reserveFuel = (45 / 60) * burnRate; // 45 minutes reserve
      const totalFuel = fuelNeeded + reserveFuel;
      const totalCost = totalFuel * fuelPrice;

      // Display results
      const results = this.modal.querySelector('.fuel-estimator-results');
      results.style.display = 'block';

      this.modal.querySelector('#result-time').textContent =
        `${Math.floor(timeMinutes)} דקות (${timeHours.toFixed(1)} שעות)`;

      this.modal.querySelector('#result-fuel').textContent =
        `${fuelNeeded.toFixed(1)} גלונים`;

      this.modal.querySelector('#result-fuel-reserve').textContent =
        `${totalFuel.toFixed(1)} גלונים`;

      this.modal.querySelector('#result-cost').textContent =
        `$${totalCost.toFixed(2)}`;

      // Scroll to results
      results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ============================================================================
  // 12. FAVORITES
  // ============================================================================

  class FavoritesManager {
    constructor() {
      this.favoriteButtons = document.querySelectorAll('.favorite-toggle, [data-favorite]');
      this.filterButton = document.querySelector('.filter-favorites');
      this.showingFavorites = false;

      // Load favorites from storage
      const saved = getFromStorage(CONFIG.STORAGE_KEYS.favorites, []);
      state.favorites = new Set(saved);

      if (this.favoriteButtons.length > 0) {
        this.init();
      }
    }

    init() {
      // Initialize button states
      this.updateAllButtons();

      // Favorite toggle buttons
      this.favoriteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const id = button.dataset.favorite || button.dataset.tripId;
          this.toggle(id);
        });
      });

      // Filter button
      if (this.filterButton) {
        this.filterButton.addEventListener('click', () => this.toggleFilter());
      }
    }

    toggle(id) {
      if (state.favorites.has(id)) {
        state.favorites.delete(id);
      } else {
        state.favorites.add(id);
      }

      this.save();
      this.updateAllButtons();

      // Reapply filter if showing favorites
      if (this.showingFavorites) {
        this.applyFilter();
      }
    }

    toggleFilter() {
      this.showingFavorites = !this.showingFavorites;
      this.applyFilter();

      if (this.filterButton) {
        this.filterButton.classList.toggle('active', this.showingFavorites);
        this.filterButton.setAttribute('aria-pressed', this.showingFavorites);
      }
    }

    applyFilter() {
      const tripCards = document.querySelectorAll('.trip-card');

      tripCards.forEach(card => {
        const id = card.dataset.tripId;

        if (this.showingFavorites) {
          card.style.display = state.favorites.has(id) ? '' : 'none';
        } else {
          card.style.display = '';
        }
      });
    }

    updateAllButtons() {
      this.favoriteButtons.forEach(button => {
        const id = button.dataset.favorite || button.dataset.tripId;
        const isFavorite = state.favorites.has(id);

        button.classList.toggle('active', isFavorite);
        button.setAttribute('aria-pressed', isFavorite);
        button.setAttribute('aria-label', isFavorite ? 'הסר ממועדפים' : 'הוסף למועדפים');
      });
    }

    save() {
      saveToStorage(CONFIG.STORAGE_KEYS.favorites, Array.from(state.favorites));
    }
  }

  // ============================================================================
  // 13. EMERGENCY FREQUENCIES FAB
  // ============================================================================

  class EmergencyPanel {
    constructor() {
      this.fab = document.querySelector('.emergency-fab');
      this.panel = null;

      if (!this.fab) {
        this.createFab();
      }

      if (this.fab) {
        this.init();
      }
    }

    createFab() {
      this.fab = document.createElement('button');
      this.fab.className = 'emergency-fab';
      this.fab.setAttribute('aria-label', 'תדרי חירום');
      this.fab.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
          <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">!</text>
        </svg>
      `;
      document.body.appendChild(this.fab);
    }

    init() {
      this.createPanel();

      this.fab.addEventListener('click', () => this.toggle());
    }

    createPanel() {
      this.panel = document.createElement('div');
      this.panel.className = 'emergency-panel';
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-labelledby', 'emergency-panel-title');

      let html = `
        <div class="emergency-panel-header">
          <h3 id="emergency-panel-title">תדרי חירום</h3>
          <button class="emergency-panel-close" aria-label="סגור">&times;</button>
        </div>
        <div class="emergency-panel-content">
      `;

      CONFIG.EMERGENCY_FREQUENCIES.forEach(freq => {
        html += `
          <div class="emergency-item">
            <div class="emergency-name">${freq.name}</div>
            <div class="emergency-freq">${freq.freq}</div>
          </div>
        `;
      });

      html += `</div>`;
      this.panel.innerHTML = html;

      document.body.appendChild(this.panel);

      this.panel.querySelector('.emergency-panel-close').addEventListener('click', () => this.close());

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isEmergencyPanelOpen) {
          this.close();
        }
      });
    }

    toggle() {
      state.isEmergencyPanelOpen ? this.close() : this.open();
    }

    open() {
      state.isEmergencyPanelOpen = true;
      this.panel.classList.add('active');
      this.fab.classList.add('active');
    }

    close() {
      state.isEmergencyPanelOpen = false;
      this.panel.classList.remove('active');
      this.fab.classList.remove('active');
    }
  }

  // ============================================================================
  // 14. KNEEBOARD PRINT
  // ============================================================================

  class KneeboardPrint {
    constructor() {
      this.printButtons = document.querySelectorAll('.print-kneeboard, [data-print-kneeboard]');

      if (this.printButtons.length > 0) {
        this.init();
      }
    }

    init() {
      this.printButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          this.print();
        });
      });

      // Add print styles if not already present
      this.addPrintStyles();
    }

    print() {
      // Add print class to body
      document.body.classList.add('printing-kneeboard');

      // Trigger print
      window.print();

      // Remove class after print dialog closes
      setTimeout(() => {
        document.body.classList.remove('printing-kneeboard');
      }, 1000);
    }

    addPrintStyles() {
      if (document.getElementById('kneeboard-print-styles')) return;

      const style = document.createElement('style');
      style.id = 'kneeboard-print-styles';
      style.textContent = `
        @media print {
          body.printing-kneeboard header,
          body.printing-kneeboard footer,
          body.printing-kneeboard .hero,
          body.printing-kneeboard .tag-filters,
          body.printing-kneeboard .share-buttons,
          body.printing-kneeboard .back-to-top,
          body.printing-kneeboard .emergency-fab,
          body.printing-kneeboard .mobile-menu-toggle {
            display: none !important;
          }

          body.printing-kneeboard {
            background: white;
            font-size: 10pt;
          }

          body.printing-kneeboard .trip-card,
          body.printing-kneeboard .flight-leg {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          body.printing-kneeboard .accordion-content {
            max-height: none !important;
            display: block !important;
          }
        }
      `;

      document.head.appendChild(style);
    }
  }

  // ============================================================================
  // 15. SCROLL ANIMATIONS
  // ============================================================================

  class ScrollAnimations {
    constructor() {
      this.elements = document.querySelectorAll('[data-animate], .animate-on-scroll');

      if (this.elements.length > 0 && 'IntersectionObserver' in window) {
        this.init();
      } else {
        // Fallback: show all elements
        this.elements.forEach(el => el.classList.add('visible'));
      }
    }

    init() {
      const observerOptions = {
        root: null,
        rootMargin: '0px 0px -100px 0px',
        threshold: 0.1
      };

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');

            // Optional: stop observing after animation
            const once = entry.target.dataset.animateOnce !== 'false';
            if (once) {
              this.observer.unobserve(entry.target);
            }
          } else {
            // Remove class if not "once"
            const once = entry.target.dataset.animateOnce !== 'false';
            if (!once) {
              entry.target.classList.remove('visible');
            }
          }
        });
      }, observerOptions);

      this.elements.forEach(el => {
        this.observer.observe(el);
      });
    }
  }

  // ============================================================================
  // 16. LAZY LOADING
  // ============================================================================

  class LazyLoader {
    constructor() {
      this.images = document.querySelectorAll('img[loading="lazy"], img[data-src]');

      if (this.images.length > 0) {
        this.init();
      }
    }

    init() {
      // Native lazy loading support
      const supportsNativeLazy = 'loading' in HTMLImageElement.prototype;

      if (supportsNativeLazy) {
        // Just handle error fallbacks
        this.images.forEach(img => {
          this.addErrorHandler(img);
        });
      } else {
        // IntersectionObserver fallback
        this.initIntersectionObserver();
      }
    }

    initIntersectionObserver() {
      const observerOptions = {
        root: null,
        rootMargin: '50px',
        threshold: 0.01
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            this.loadImage(img);
            observer.unobserve(img);
          }
        });
      }, observerOptions);

      this.images.forEach(img => {
        observer.observe(img);
      });
    }

    loadImage(img) {
      const src = img.dataset.src || img.src;

      // Create a new image to test loading
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = src;
        img.classList.add('loaded');
      };
      tempImg.onerror = () => {
        this.handleError(img);
      };
      tempImg.src = src;

      this.addErrorHandler(img);
    }

    addErrorHandler(img) {
      img.addEventListener('error', () => this.handleError(img));
    }

    handleError(img) {
      // Set fallback image or placeholder
      const fallback = img.dataset.fallback || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23eee" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EImage not available%3C/text%3E%3C/svg%3E';

      img.src = fallback;
      img.classList.add('error');
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  function initApp() {
    // Initialize all components
    new MobileNavigation();
    new GlobalSearch();
    new TagFilter();
    new ShareManager();
    new ImageLightbox();
    new MapPopup();
    new Accordion();
    new BackToTop();
    new FuelEstimator();
    new FavoritesManager();
    new EmergencyPanel();
    new KneeboardPrint();
    new ScrollAnimations();
    new LazyLoader();

    // Initialize standalone features
    initSmoothScroll();

    // Expose utilities to global scope
    window.vfrApp = {
      showToast,
      state,
      CONFIG
    };

    // Log initialization
    console.log('VFR Flight Planning App initialized');
  }

  // Start the app
  init();

})();
