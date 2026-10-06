import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './marketing.css';
import './brand.css';
import './redesign.css';
import { LOCALES, marketingCopy, redesignCopy, useI18n, widgetCopy } from '../../lib/i18n';

export const MARKETING_ASSETS = {
  today: '/landing/product/today-moment.png', room: '/landing/product/our-room.png', gameRoom: '/landing/product/game-room.png', drawing: '/landing/drawing.png',
  us: '/landing/product/us.png', handwritten: '/landing/product/letter-handwritten.png', together: '/landing/product/together.png',
  boothOne: '/landing/booth-1.png', boothTwo: '/landing/booth-2.png', widgetShare: '/landing/widget-share.png', photoShare: '/landing/share-photo.png',
} as const;

export const APP_STORE_URL = 'https://apps.apple.com/kr/app/jongjong/id6791495392';

function AppStoreBadge({ className = '' }: { className?: string }) {
  const { locale } = useI18n(); const c = marketingCopy[locale];
  return <a className={`app-store-badge ${className}`} href={APP_STORE_URL} aria-label={c.download}><img src="/landing/download-on-the-app-store.svg" alt="Download on the App Store" /></a>;
}

function ProductShot({ src, alt, className = '', children }: { src: string; alt: string; className?: string; children?: ReactNode }) {
  return <figure className={`product-shot ${className}`}><img src={src} alt={alt} loading="lazy" />{children}</figure>;
}

function BrandMark() { return <><img className="brand-app-icon" src="/brand/jongjong-app-icon.png" alt="" aria-hidden="true" />jongjong<span>.</span></>; }

export function MarketingPage() {
  const { locale, setLocale } = useI18n(); const c = marketingCopy[locale]; const chapter = redesignCopy[locale]; const widgets = widgetCopy[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.title = `jongjong — ${typeof c.heroTitle === 'string' ? c.heroTitle : c.footer}`; document.querySelector('meta[name="description"]')?.setAttribute('content', c.heroLead); document.querySelector('meta[property="og:title"]')?.setAttribute('content', `jongjong — ${c.footer}`); document.querySelector('meta[property="og:description"]')?.setAttribute('content', c.heroLead); }, [c]);
  const closeMenu = () => setMenuOpen(false);

  return <main className="marketing redesign">
    <a className="marketing-skip" href="#main-content">Skip to content</a>
    <header className="site-header"><Link className="wordmark" to="/" aria-label="jongjong home"><BrandMark /></Link><button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><i /><i /></button><nav className={menuOpen ? 'site-nav is-open' : 'site-nav'} aria-label="Primary navigation"><a href="#everyday" onClick={closeMenu}>{c.explore}</a><Link to="/booth" onClick={closeMenu}>{c.booth}</Link><label className="locale-select"><span className="sr-only">Language</span><select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>{LOCALES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><AppStoreBadge className="header-store" /></nav></header>
    <div id="main-content">
      <section className="hero section-shell"><div className="hero-copy reveal"><p className="eyebrow">{c.heroEyebrow}</p><h1>{c.heroTitle}</h1><p className="hero-lead">{c.heroLead}</p><div className="hero-actions"><AppStoreBadge /><a className="text-cta" href="#everyday">{c.see} <span>↓</span></a></div></div><div className="hero-art reveal"><ProductShot className="hero-phone" src={MARKETING_ASSETS.today} alt="jongjong Today" /><ProductShot className="hero-room-peek" src={MARKETING_ASSETS.room} alt="jongjong Our Room" /><img className="hero-tiger" src="/brand/jongjong-tiger-in-app.png" alt="" aria-hidden="true" /></div></section>

      <section className="everyday-chapter section-shell" id="everyday"><div className="chapter-copy"><p className="eyebrow">{chapter.everydayEyebrow}</p><h2>{chapter.everydayTitle}</h2><p>{chapter.everydayLead}</p></div><div className="everyday-visual"><ProductShot className="everyday-photo" src={MARKETING_ASSETS.photoShare} alt="A shared jongjong photo moment" /><ProductShot className="everyday-today" src={MARKETING_ASSETS.today} alt="jongjong Today" /><span className="memory-caption">{c.momentNote}</span></div></section>

      <section className="moment-chapter" id="moments"><div className="section-shell moment-inner"><div className="moment-copy chapter-copy"><p className="eyebrow">{chapter.momentEyebrow}</p><h2>{chapter.momentTitle}</h2><p>{chapter.momentLead}</p></div><div className="moment-scrapbook"><ProductShot className="scrap-moment" src={MARKETING_ASSETS.photoShare} alt="jongjong shared photo" /><ProductShot className="scrap-drawing" src={MARKETING_ASSETS.drawing} alt="jongjong shared drawing" /><ProductShot className="scrap-widget" src={MARKETING_ASSETS.widgetShare} alt={widgets.imageAlt} /><span className="scrap-note">{widgets.eyebrow}</span></div></div></section>

      <section className="world-chapter" id="room"><div className="section-shell world-inner"><div className="world-copy chapter-copy"><p className="eyebrow">{chapter.worldEyebrow}</p><h2>{chapter.worldTitle}</h2><p>{chapter.worldLead}</p></div><div className="world-visual"><ProductShot className="world-room" src={MARKETING_ASSETS.room} alt="jongjong Our Room" /><ProductShot className="world-detail" src={MARKETING_ASSETS.us} alt="jongjong shared space details" /><img className="world-pet" src="/pets/yorkie-dog.png" alt="" aria-hidden="true" /></div></div></section>

      <section className="close-chapter section-shell"><div className="close-heading"><p className="eyebrow">{chapter.moreEyebrow}</p><h2>{chapter.moreTitle}</h2></div><div className="close-stories"><article className="close-story letters-story"><ProductShot src={MARKETING_ASSETS.handwritten} alt="jongjong handwritten letter" /><div><h3>{chapter.letters}</h3><p>{chapter.lettersLead}</p></div></article><article className="close-story dates-story"><div><h3>{chapter.dates}</h3><p>{chapter.datesLead}</p></div><ProductShot src={MARKETING_ASSETS.together} alt="jongjong plans together" /></article><article className="close-story games-story"><ProductShot src={MARKETING_ASSETS.gameRoom} alt="jongjong Game Room" /><div><h3>{chapter.games}</h3><p>{chapter.gamesLead}</p></div></article><article className="close-story memories-story"><div><h3>{chapter.memories}</h3><p>{chapter.memoriesLead}</p></div><ProductShot src={MARKETING_ASSETS.us} alt="jongjong Memories" /></article></div></section>

      <section className="booth-teaser section-shell"><div className="booth-copy"><p className="eyebrow">{c.booth}</p><h2>{c.boothTitle}</h2><p>{c.boothLead}</p><Link className="text-cta booth-link" to="/booth">{c.openBooth} <span>→</span></Link></div><div className="booth-visual"><img className="booth-shot one" src={MARKETING_ASSETS.boothOne} alt="jongjong Couple Booth" loading="lazy" /><img className="booth-shot two" src={MARKETING_ASSETS.boothTwo} alt="jongjong Couple Booth" loading="lazy" /></div></section>
      <section className="final-cta section-shell"><h2>{c.finalTitle}</h2><p>{c.finalLead}</p><AppStoreBadge /></section>
    </div>
    <footer className="site-footer"><div><Link className="wordmark" to="/"><BrandMark /></Link><p>{c.footer}</p></div><nav aria-label="Footer navigation"><Link to="/booth">{c.booth}</Link><a href="/privacy">{c.privacy}</a><a href="/terms">{c.terms}</a><a href="/support">{c.support}</a></nav><p className="copyright">© 2026 jongjong</p></footer>
  </main>;
}
