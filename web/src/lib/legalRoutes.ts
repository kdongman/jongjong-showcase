export const LEGAL_PUBLIC_PATHS = ['/support', '/privacy', '/terms'] as const;

export type LegalPublicPath = (typeof LEGAL_PUBLIC_PATHS)[number];

export const LEGAL_DOCUMENT_FILES: Record<LegalPublicPath, string> = {
  '/support': '/support/index.html',
  '/privacy': '/privacy/index.html',
  '/terms': '/terms/index.html',
};

export const LEGAL_CANONICAL_ORIGIN = 'https://jongjong.app';
