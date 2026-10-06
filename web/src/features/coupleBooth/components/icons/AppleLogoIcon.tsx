/** Official-style Apple logo mark (simple path silhouette). */
export function AppleLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="oauth-provider-icon"
    >
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.415 2.21-1.24 3.06-.95.98-2.1 1.55-3.34 1.46-.05-1.08.4-2.23 1.23-3.08.95-.98 2.22-1.55 3.35-1.44zM20.76 17.4c-.58 1.34-.86 1.93-1.61 3.11-1.05 1.63-2.53 3.66-4.36 3.68-1.62.03-2.04-1.06-4.25-1.05-2.2.01-2.67 1.08-4.3 1.05-1.83-.03-3.23-1.85-4.28-3.48C-.1 17.3-1.3 12.3.84 8.94c1.05-1.67 2.72-2.73 4.33-2.73 1.61 0 2.62 1.07 4.43 1.07 1.76 0 2.53-1.08 4.42-1.08 1.4 0 2.88.76 3.93 2.07-3.46 1.9-2.9 6.86.81 9.13z"
      />
    </svg>
  );
}
