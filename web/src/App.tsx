import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { I18nProvider, type Locale, useI18n } from './lib/i18n';
import { LEGAL_DOCUMENT_FILES, type LegalPublicPath } from './lib/legalRoutes';
import { MarketingPage } from './features/marketing/MarketingPage';

const BoothHomePage = lazy(() => import('./features/coupleBooth/pages/BoothHomePage').then((module) => ({ default: module.BoothHomePage })));
const BoothSessionPage = lazy(() => import('./features/coupleBooth/pages/BoothSessionPage').then((module) => ({ default: module.BoothSessionPage })));
const GuestBoothPage = lazy(() => import('./features/coupleBooth/pages/GuestBoothPage').then((module) => ({ default: module.GuestBoothPage })));
const GuestBoothDonePage = lazy(() => import('./features/coupleBooth/pages/GuestBoothPage').then((module) => ({ default: module.GuestBoothDonePage })));
const LoginPage = lazy(() => import('./features/coupleBooth/pages/LoginPage').then((module) => ({ default: module.LoginPage })));

function LegalDocumentRedirect({ path }: { path: LegalPublicPath }) {
  const href = LEGAL_DOCUMENT_FILES[path];
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <p className="app-shell">
      <a href={href}>Open {path}</a>
    </p>
  );
}

function LocaleGate({ children }: { children: React.ReactNode }) {
  const { locale } = useParams<{ locale: Locale }>();
  const { setLocale } = useI18n();
  useEffect(() => { if (locale === 'en' || locale === 'ko' || locale === 'es') setLocale(locale); }, [locale, setLocale]);
  return <>{children}</>;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Suspense fallback={<p className="app-shell">Loading…</p>}><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/booth/guest-done" element={<GuestBoothDonePage />} />
        <Route path="/booth/guest/:token" element={<GuestBoothPage />} />
        <Route path="/booth" element={<BoothHomePage />} />
        <Route path="/booth/:sessionId" element={<BoothSessionPage />} />
        <Route path="/support" element={<LegalDocumentRedirect path="/support" />} />
        <Route path="/privacy" element={<LegalDocumentRedirect path="/privacy" />} />
        <Route path="/terms" element={<LegalDocumentRedirect path="/terms" />} />
        <Route path="/" element={<MarketingPage />} />
        <Route path="/:locale(en|ko|es)" element={<LocaleGate><MarketingPage /></LocaleGate>} />
        <Route path="/:locale(en|ko|es)/booth" element={<LocaleGate><BoothHomePage /></LocaleGate>} />
        <Route path="/:locale(en|ko|es)/privacy" element={<LocaleGate><LegalDocumentRedirect path="/privacy" /></LocaleGate>} />
        <Route path="/:locale(en|ko|es)/terms" element={<LocaleGate><LegalDocumentRedirect path="/terms" /></LocaleGate>} />
        <Route path="/:locale(en|ko|es)/support" element={<LocaleGate><LegalDocumentRedirect path="/support" /></LocaleGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Suspense>
      </AuthProvider>
    </I18nProvider>
  );
}
