import { useEffect, useRef, type ReactNode } from "react";
export function Overlay({label,children}:{label:string;children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const first=ref.current?.querySelector<HTMLElement>('button,input,textarea,select,[tabindex="0"]');first?.focus();return()=>previous?.focus();},[]);
 return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={label} ref={ref} onKeyDown={e=>{if(e.key!=="Tab")return;const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}>{children}</div>;
}
