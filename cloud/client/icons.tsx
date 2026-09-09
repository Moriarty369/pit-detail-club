import type { ReactNode } from 'react';
const paths: Record<string,string> = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  car: '<path d="m5 7 2-4h10l2 4 2 3v8H3v-8zm-2 3h18M6 18v3m12-3v3M6 14h2m8 0h2M5 7h14"/>',
  moto: '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m5 17 4-7h5l5 7M8 17h5l3-7-2-4h-3M7 10H4m5 0 4 7"/>',
  boat: '<path d="m3 14 9-3 9 3-3 5H6zM7 12V7h10v5M12 7V3m0 0h4M2 21q2-2 5 0 2 2 5 0 2-2 5 0 2 2 5 0"/>',
  fleet: '<path d="m3 10 2-4h8l2 4v7H3zm0 1h12M5 17v2m8-2v2M6 14h1m4 0h1M16 5h3l2 4v7h-3M18 12h1"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  oil: '<path d="M5 8h11v3l4-2 2 6-4 2-4 3H5L2 10h3zM7 8V4h6v4m7 12v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h3v3h-6zm-3-3h3m6 0v3M3 12h3m6-9v3m0 12v3"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
  tool: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
};
export function Icon({name,className=""}:{name:string;className?:string}) { return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:paths[name]||paths.sparkles}}/>; }
