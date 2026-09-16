import type { SVGProps } from "react";

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.4" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.4" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.4" />
    </svg>
  );
}

export function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M3.5 13.5h4.5l1.8 2.7h4.4l1.8-2.7h4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.2 6.2 3.5 13.5v5.3a1.7 1.7 0 0 0 1.7 1.7h13.6a1.7 1.7 0 0 0 1.7-1.7v-5.3l-2.7-7.3a1.7 1.7 0 0 0-1.6-1.1H7.8a1.7 1.7 0 0 0-1.6 1.1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.7v6.6l5.5-3.3Z" strokeLinejoin="round" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RegistryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M4 6.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5-3.6 2.5-8 2.5-8-1.1-8-2.5Z" />
      <path d="M4 6.5V17c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6.5" />
      <path d="M4 11.75c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
    </svg>
  );
}

export function AuditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m19.5 19.5-4.2-4.2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M19.4 13.6a1.7 1.7 0 0 0 .34 1.87l.06.06a2.1 2.1 0 1 1-2.97 2.97l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56v.17a2.1 2.1 0 0 1-4.2 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2.1 2.1 0 1 1-2.97-2.97l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.6a2.1 2.1 0 0 1 0-4.2h.09A1.7 1.7 0 0 0 6.24 7.3a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.1 2.1 0 1 1 2.97-2.97l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 12.03 1.2v-.17a2.1 2.1 0 0 1 4.2 0v.09c.02.68.42 1.3 1.03 1.56.61.26 1.32.14 1.87-.34l.06-.06a2.1 2.1 0 1 1 2.97 2.97l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08c.26.61.88 1.02 1.56 1.03h.17a2.1 2.1 0 0 1 0 4.2h-.09a1.7 1.7 0 0 0-1.56 1.03Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path
        d="M6 9.5a6 6 0 1 1 12 0c0 4.2 1.5 5.7 1.5 5.7H4.5S6 13.7 6 9.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.2 18.5a1.9 1.9 0 0 0 3.6 0" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m19.5 19.5-4.05-4.05" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2.2" />
      <circle cx="12" cy="12" r="1.6" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M12 2.5 4.5 5.3v6c0 5 3.2 8.4 7.5 10.2 4.3-1.8 7.5-5.2 7.5-10.2v-6L12 2.5Z" strokeLinejoin="round" />
      <path d="m9 12 2.2 2.2L15.5 9.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TicketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a1.9 1.9 0 0 0 0 3.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a1.9 1.9 0 0 0 0-3.6Z" />
      <path d="M9.5 6.5v11" strokeDasharray="1.6 2" />
    </svg>
  );
}

export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M4 12h15.5M13.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
