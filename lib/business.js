// Public business contact details. Rebuild the static site after editing.
const business = Object.freeze({
  email: 'cfahmedezzat0@gmail.com',
  phone: '+201012858954',
  address: 'Pending confirmation',
});

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emailLink = `<a href="mailto:${escape(business.email)}"><bdi dir="ltr">${escape(business.email)}</bdi></a>`;
const phoneLink = `<a href="tel:${escape(business.phone)}"><bdi dir="ltr">${escape(business.phone)}</bdi></a>`;
const footer = `<div class="business-footer">
  <div class="business-contact"><span>Email: ${emailLink}</span><span>Phone: ${phoneLink}</span></div>
  <nav class="business-links" aria-label="Contact and policies">
    <a href="/contact">Contact</a>
    <a href="/terms#terms">Terms</a>
    <a href="/terms#refund-policy">Refund Policy</a>
    <a href="/terms#privacy-policy">Privacy Policy</a>
  </nav>
</div>`;

// Render at build time and in the optional server: visible without JavaScript.
function renderBusiness(html) {
  const values = { BUSINESS_EMAIL: emailLink, BUSINESS_PHONE: phoneLink, BUSINESS_ADDRESS_EN: escape(business.address), BUSINESS_FOOTER: footer };
  return html.replace(/\{\{(BUSINESS_[A-Z_]+)\}\}/g, (token, key) => values[key] ?? token);
}

module.exports = { business, renderBusiness };
