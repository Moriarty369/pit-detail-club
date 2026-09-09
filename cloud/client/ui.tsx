import { useEffect, useRef, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Icon } from './icons';
export const number=(n:number)=>new Intl.NumberFormat('es-VE').format(n);
export const money=(cents:number)=>new Intl.NumberFormat('es-VE',{style:'currency',currency:'USD'}).format(cents/100);
export const date=(s:string)=>new Intl.DateTimeFormat('es-VE',{dateStyle:'medium',timeZone:'America/Caracas'}).format(new Date(s));
export function Brand({className=''}:{className?:string}){return <span className={`brand-image ${className}`}><img src="/pit-detail.jpg" alt="Logo PIT DETAIL" width="1200" height="630"/></span>;}
export function Stripes(){return <div className="member-stripes" aria-hidden="true"><span/><span/><span/></div>;}
export function QR({value,size=220}:{value:string;size?:number}){const ref=useRef<HTMLCanvasElement>(null);useEffect(()=>{let active=true;QRCode.toCanvas(ref.current,value,{width:size,margin:2}).catch(()=>{if(active&&ref.current)ref.current.setAttribute('aria-label','No se pudo generar el QR. Usa el identificador escrito.');});return()=>{active=false;};},[value,size]);return <canvas ref={ref} aria-label="Código QR" role="img"/>;}
export function Heading({eyebrow,title,subtitle,action}:{eyebrow:string;title:ReactNode;subtitle?:string;action?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>;}
export function Modal({children,onClose}:{children:ReactNode;onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus();};},[]);return <dialog ref={ref} aria-labelledby="modal-title" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><button className="close-button" aria-label="Cerrar ventana" onClick={onClose}><Icon name="close"/></button>{children}</dialog>;}
export function ErrorText({error}:{error:string}){return <div className="cloud-error" role="alert">{error}</div>;}
