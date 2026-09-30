/**
 * Golden Cannoli: website and brand proposal (drafted 2026-09-29).
 * Source of the words: the Claude Doc "Golden Cannoli: Website and Brand
 * Proposal". Edit here, push, and /proposals/golden-cannoli updates.
 * Rendered inside .pr on the page; class names are styled there.
 */

export const subtitle = 'website and brand.';

export const lede =
  'A new website for the largest cannoli manufacturer in the country, designed and built start to finish by the same people, targeting February or March 2027.';

/* Timeline: bars placed by date between Nov 1, 2026 and Mar 31, 2027. */
const T0 = Date.parse('2026-11-01'), T1 = Date.parse('2027-03-31');
const pct = (d) => (((Date.parse(d) - T0) / (T1 - T0)) * 100).toFixed(2);
const MONTHS = [['2026-11-01', 'Nov'], ['2026-12-01', 'Dec'], ['2027-01-01', 'Jan'], ['2027-02-01', 'Feb'], ['2027-03-01', 'Mar']];
const bar = (name, a, b, cls = '') => `<div class="tl-row"><span class="tl-name">${name}</span><span class="tl-track"><span class="tl-bar ${cls}" style="left:${pct(a)}%;width:${(pct(b) - pct(a)).toFixed(2)}%"></span></span></div>`;
const ms = (name, d, label, cls = '') => `<div class="tl-row tl-ms"><span class="tl-name">${name}</span><span class="tl-track"><span class="tl-dia ${cls}" style="left:${pct(d)}%"></span><span class="tl-date ${cls}" style="left:${pct(d)}%">${label}</span></span></div>`;
const axis = `<div class="tl-axis"><span class="tl-name"></span><span class="tl-track">${MONTHS.map(([d, m]) => `<span class="tl-tick" style="left:${pct(d)}%">${m}</span>`).join('')}</span></div>`;
const grid = `<span class="tl-grid" aria-hidden="true">${MONTHS.map(([d]) => `<i style="left:${pct(d)}%"></i>`).join('')}</span>`;

const timeline = `
<div class="tl" role="img" aria-label="Ideal case. Option A targets the week of February 22, 2027. Option B targets the week of March 22, 2027.">
  ${axis}
  <div class="tl-body">${grid}
    <div class="tl-group">Option A: website</div>
    ${bar('Discovery', '2026-11-02', '2026-11-13')}
    ${bar('Design', '2026-11-16', '2026-12-18')}
    ${bar('Build', '2026-12-14', '2027-02-05')}
    ${bar('QA, accessibility, content load', '2027-02-08', '2027-02-19')}
    ${ms('Launch', '2027-02-22', 'Feb 22')}
    <div class="tl-group">Option B: website and brand</div>
    ${bar('Brand identity', '2026-11-02', '2026-12-18', 'a')}
    ${bar('Site discovery', '2026-11-09', '2026-11-27', 'a')}
    ${bar('Site design', '2026-12-07', '2027-01-22', 'a')}
    ${bar('Build', '2027-01-11', '2027-03-05', 'a')}
    ${bar('QA, accessibility, content load', '2027-03-08', '2027-03-19', 'a')}
    ${ms('Launch', '2027-03-22', 'Mar 22', 'a')}
  </div>`;

export const html = `
<section class="pr-sec" id="summary">
  <p class="pr-label">01 · Summary</p>
  <h2>A site that reads like the category leader.</h2>
  <p>Golden Cannoli is the largest cannoli manufacturer in the country, with a family story that starts local and spans nearly six decades of growth. The website should read that way. We propose a new site, designed and built start to finish by the same people, with nothing outsourced, targeting February or March 2027.</p>
  <p>The site drops the Shopify store in favor of a custom store finder, connects to HubSpot, and adds what sales, brokers and HR have asked for: a password-protected document area, the catalog, and a bilingual job application. It is simpler to navigate, easier for your team to update, and built to meet ADA standards.</p>
  <p>Because a rebrand may also be on the table, we lay out two paths below. We know you are eager to get the site done, and Option A is the fastest way there. We still want to make the case for Option B, doing both together: the new brand and the new site launch as one, and the site is designed once, on the brand it will carry. It is the better path and the better value.</p>
</section>

<section class="pr-sec" id="paths">
  <p class="pr-label">02 · Two paths</p>
  <h2>Site first, or brand and site together.</h2>
  <div class="pr-options">
    <article class="pr-opt">
      <p class="pr-opt-k">Option A</p>
      <h3>Website, brand-ready</h3>
      <p>The site is rebuilt on the current identity, cleaned up and made consistent. A later rebrand swaps in without a rebuild.</p>
      <p class="pr-why">Fastest route to a better site. Brand work can follow on its own schedule.</p>
      <dl><div><dt>Target launch</dt><dd>February 2027</dd></div><div><dt>Brand</dt><dd>Not included</dd></div></dl>
    </article>
    <article class="pr-opt is-rec">
      <span class="pr-pill">Recommended</span>
      <p class="pr-opt-k">Option B</p>
      <h3>Website and brand together</h3>
      <p>A brand engagement runs first; the site is designed on the new identity. Both launch together.</p>
      <p class="pr-why">One launch, one story. Everything new arrives at once, instead of in two rounds.</p>
      <dl><div><dt>Target launch</dt><dd>March 2027</dd></div><div><dt>Brand</dt><dd>Identity system</dd></div></dl>
    </article>
  </div>
  <p class="pr-note">Either way, the site is built on a token system: color, type, spacing and logo live in one place, so brand changes are a settings change, not a redesign.</p>
</section>

<section class="pr-sec" id="scope">
  <p class="pr-label">03 · Website scope</p>
  <h2>Organized by who is visiting.</h2>
  <p>The site keeps roughly the structure you have now, adds a few pages, and is organized by who is visiting: shoppers, trade buyers, brokers, and job applicants.</p>
  <table class="pr-table">
    <tbody>
      <tr><th scope="row">Design</th><td>Custom design for the homepage and every page template, desktop and mobile. Storytelling-led: heritage, the family, the category.</td></tr>
      <tr><th scope="row">Products</th><td>A product catalog by family (shells, fillings and dips, chips, chocolate shells, crumbs and inclusions) with a detail template. No cart.</td></tr>
      <tr><th scope="row">Store finder</th><td>A searchable map of where to buy. Data source to be confirmed in discovery.</td></tr>
      <tr><th scope="row">Partner area</th><td>One shared login for customers and brokers to view and download spec sheets, sell sheets and similar documents. Your team uploads and replaces files themselves.</td></tr>
      <tr><th scope="row">Catalog</th><td>The current catalog, viewable and downloadable on the site.</td></tr>
      <tr><th scope="row">Careers</th><td>A job application in English and Spanish that routes to HR.</td></tr>
      <tr><th scope="row">HubSpot</th><td>Every form (contact, wholesale inquiry, careers) feeds HubSpot. Tracking installed. Links to HubSpot and social throughout.</td></tr>
      <tr><th scope="row">Accessibility</th><td>Built and tested to WCAG 2.1 AA, compatible with your existing annual monitoring service.</td></tr>
      <tr><th scope="row">Shopify sunset</th><td>Store closed, old URLs redirected so search rankings and bookmarks carry over.</td></tr>
      <tr><th scope="row">Handoff</th><td>A short training session and written guide so your team can update pages, products and documents without us.</td></tr>
    </tbody>
  </table>
</section>

<section class="pr-sec" id="platform">
  <p class="pr-label">04 · Platform</p>
  <h2>A custom site, with HubSpot as the CRM.</h2>
  <p>We can build on HubSpot's own CMS, which keeps the website and marketing in one login. We recommend a custom site on Vercel instead, with HubSpot as the CRM: faster, more flexible, and not tied to one platform.</p>
  <div class="pr-scroll"><table class="pr-table pr-compare">
    <thead><tr><th></th><th>HubSpot CMS</th><th><span class="pr-pill">Recommended</span>Custom site on Vercel + HubSpot</th></tr></thead>
    <tbody>
      <tr><th scope="row">How it works</th><td data-label="HubSpot CMS">Site built as a custom HubSpot theme. Pages, forms, contacts and the partner login all live in HubSpot.</td><td data-label="Custom site on Vercel + HubSpot" class="is-rec-col">Site built in <span class="term" tabindex="0" aria-describedby="tip-astro">Astro<span class="term-tip" role="tooltip" id="tip-astro">A modern web framework that ships pages as plain HTML, so the site loads fast and search engines read it cleanly.</span></span>, hosted on <span class="term" tabindex="0" aria-describedby="tip-vercel">Vercel<span class="term-tip" role="tooltip" id="tip-vercel">Hosting that serves the site from a global network, so it is fast everywhere and needs no server upkeep.</span></span>, content managed in a simple editor. HubSpot handles forms, contacts and tracking.</td></tr>
      <tr><th scope="row">Strengths</th><td data-label="HubSpot CMS">One login for marketing and the website. Partner area and bilingual pages are built-in features.</td><td data-label="Custom site on Vercel + HubSpot" class="is-rec-col">Fastest load times, most design freedom, strongest accessibility and SEO baseline. No platform lock-in.</td></tr>
      <tr><th scope="row">Tradeoffs</th><td data-label="HubSpot CMS">Design is shaped by HubSpot's templating. Ongoing subscription cost is higher.</td><td data-label="Custom site on Vercel + HubSpot" class="is-rec-col">Two tools for your team (site editor and HubSpot). Partner login is custom built.</td></tr>
      <tr><th scope="row">HubSpot plan</th><td data-label="HubSpot CMS">Content Hub Professional or higher, <a href="https://knowledge.hubspot.com/website-pages/require-member-registration-to-access-private-content" target="_blank" rel="noopener">required for private member pages</a></td><td data-label="Custom site on Vercel + HubSpot" class="is-rec-col">Any tier</td></tr>
    </tbody>
  </table></div>
  <p class="pr-scroll-hint" aria-hidden="true">Swipe to compare &rarr;</p>
  <p class="pr-note">Hosting and software subscriptions are billed to Golden Cannoli directly. We confirm the exact plans during discovery.</p>
</section>

<section class="pr-sec" id="brand">
  <p class="pr-label">05 · Brand scope (Option B)</p>
  <h2>One identity system, <span class="keep">built on your discovery work.</span></h2>
  <p>Your discovery work already points the way: "Golden" as the master brand, the star as its shorthand, gold and hunter green at the core. The brand work builds on that rather than starting over, and gives the new site everything it is designed on.</p>
  <ul class="pr-list">
    <li>A working session with leadership to set positioning and voice.</li>
    <li>A full logo system: master brand, star, and the Golden Cannoli lockup.</li>
    <li>Color, type, photography direction and graphic elements.</li>
    <li>Complete brand guidelines.</li>
  </ul>
  <p class="pr-note">Packaging would come next. Your team flagged packaging consistency as the largest brand weakness; once the identity is set, we could scope a packaging system on it as its own separate phase, so it does not hold up the site launch.</p>
</section>

<section class="pr-sec" id="timeline">
  <p class="pr-label">06 · Timeline</p>
  <h2>Targeting late February or late March.</h2>
  <p class="pr-caveat"><strong>These dates are the ideal case, not a commitment.</strong> It assumes a November 2 start, quick turnarounds on reviews and approvals, and content delivered on time. Schedules like this often shift. We will confirm dates at kickoff and keep them current as the work moves.</p>
  <p>On that basis, Option A targets the week of February 22 and Option B the week of March 22.</p>
  ${timeline}
  <p class="pr-note">In Option B, site discovery runs alongside the brand work, and site design starts once the brand direction is approved in early December. Content (photos, copy, Spanish text) is needed by the start of build to hold these dates.</p>
</section>

<section class="pr-sec" id="investment">
  <p class="pr-label">07 · Investment</p>
  <h2>Fixed fees by phase.</h2>
  <div class="pr-totals">
    <div class="pr-total"><p class="pr-opt-k">Option A</p><p class="pr-num">$74,000</p><p class="pr-sub">Website</p></div>
    <div class="pr-total is-rec"><span class="pr-pill">Recommended</span><p class="pr-opt-k">Option B</p><p class="pr-num">$102,000</p><p class="pr-sub">Website with the identity system</p></div>
  </div>
  <h3 class="pr-h3">Website, both options</h3>
  <table class="pr-table pr-money">
    <tbody>
      <tr><th scope="row"><span class="term term--left" tabindex="0" aria-describedby="tip-disc">Discovery and site structure<span class="term-tip" role="tooltip" id="tip-disc">Kickoff, audit of the current site, sitemap and content plan.</span></span></th><td>$5,600</td></tr>
      <tr><th scope="row"><span class="term term--left" tabindex="0" aria-describedby="tip-design">Design<span class="term-tip" role="tooltip" id="tip-design">Homepage, every page template, mobile and the design system.</span></span></th><td>$17,600</td></tr>
      <tr><th scope="row"><span class="term term--left" tabindex="0" aria-describedby="tip-build">Build<span class="term-tip" role="tooltip" id="tip-build">Site templates, store finder, partner area, HubSpot forms and HR routing, bilingual careers, and content editor setup.</span></span></th><td>$40,000</td></tr>
      <tr><th scope="row"><span class="term term--left" tabindex="0" aria-describedby="tip-qa">Accessibility, QA, launch and training<span class="term-tip" role="tooltip" id="tip-qa">Accessibility testing, redirects from Shopify, cross-browser QA, launch, training and a written guide.</span></span></th><td>$10,800</td></tr>
      <tr class="is-sum"><th scope="row">Website total</th><td>$74,000</td></tr>
    </tbody>
  </table>
  <p class="pr-note">Built on HubSpot CMS instead, the website total is $70,000, since the partner area and bilingual pages use HubSpot's built-in features.</p>
  <h3 class="pr-h3">Brand, Option B only</h3>
  <table class="pr-table pr-money">
    <tbody>
      <tr><th scope="row"><span class="term term--left" tabindex="0" aria-describedby="tip-brand">Brand identity system<span class="term-tip" role="tooltip" id="tip-brand">Positioning session, full logo system, color, type, photography direction and complete guidelines.</span></span></th><td>$28,000</td></tr>
      <tr class="is-sum"><th scope="row">Option B total, website and brand</th><td>$102,000</td></tr>
    </tbody>
  </table>
  <p class="pr-note">Work outside this scope is billed at $200 per hour, with an estimate agreed before it starts.</p>
</section>

<section class="pr-sec" id="terms">
  <p class="pr-label">08 · Not included, and open questions</p>
  <h2>What stays with Golden Cannoli, and what we settle in discovery.</h2>
  <div class="pr-cols">
    <div>
      <h3 class="pr-h3">Not included</h3>
      <ul class="pr-list">
        <li>Photography. We provide art direction and a shot list; Golden Cannoli supplies or commissions the photos.</li>
        <li>Copywriting and Spanish translation. We edit and fit copy to the design; Golden Cannoli supplies the text.</li>
        <li>Hosting, HubSpot and other software subscriptions.</li>
        <li>Packaging design. Scoped as its own phase once the identity is set.</li>
      </ul>
    </div>
    <div>
      <h3 class="pr-h3">Open questions for discovery</h3>
      <ul class="pr-list">
        <li>Store finder data: do you keep a list of retail locations, or would a syndicated retail locator service (a paid feed built from retailer data) be the better fit? We will price either path once known.</li>
        <li>Which HubSpot plan are you on today?</li>
        <li>Who on your team will own site updates after launch?</li>
        <li>Which documents go in the partner area at launch, and who needs access?</li>
      </ul>
    </div>
  </div>
</section>

<section class="pr-sec" id="next">
  <p class="pr-label">09 · Team and next steps</p>
  <h2>The same hands, start to finish.</h2>
  <p>COGNAK is a design and development studio. The same people design and build the work, start to finish. Nothing is outsourced, and nothing is handed off between agency layers.</p>
  <ul class="pr-people">
    <li><strong>Pierce Liefeld</strong><span>Project, design and build lead</span></li>
    <li><strong>Michael Wachs</strong><span>Brand strategy and identity lead</span></li>
  </ul>
  <ol class="pr-steps">
    <li>Choose Option A or B.</li>
    <li>Countersign NDA and agreement.</li>
    <li>Kickoff call and discovery questionnaire the following week.</li>
    <li>Build the site together, and tell the real Golden Cannoli story.</li>
  </ol>
</section>
`;
