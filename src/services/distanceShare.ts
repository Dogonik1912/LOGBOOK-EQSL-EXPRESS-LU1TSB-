import { supabase } from './supabaseClient';
const marker=/^\[\[DISTANCE_IMAGE:(https:\/\/[^\]\s]+)\]\]$/;
export function parseDistanceShareImage(body:string|null|undefined):string|null{return String(body||'').trim().match(marker)?.[1]||null;}
let rendererPromise:Promise<any>|null=null;
async function renderer(){
  const w=window as any;
  if(w.htmlToImage?.toCanvas)return w.htmlToImage;
  if(!rendererPromise)rendererPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js';
    script.async=true;
    script.crossOrigin='anonymous';
    script.onload=()=>w.htmlToImage?.toCanvas?resolve(w.htmlToImage):reject(new Error('No se pudo preparar el capturador de mapas.'));
    script.onerror=()=>reject(new Error('No se pudo cargar el capturador de mapas.'));
    document.head.appendChild(script);
  }).catch(error=>{rendererPromise=null;throw error;});
  return rendererPromise;
}
export async function captureDistanceShareImage(element:HTMLElement):Promise<Blob>{
  if(!element?.isConnected)throw new Error('El mapa ya no está disponible.');
  const imageRenderer=await renderer();
  await new Promise(resolve=>window.setTimeout(resolve,500));
  let canvas:HTMLCanvasElement;
  try{
    canvas=await imageRenderer.toCanvas(element,{
      backgroundColor:'#0f172a',
      pixelRatio:Math.min(2,window.devicePixelRatio||1),
      cacheBust:true,
      filter:(node:Node)=>!(node instanceof Element&&node.hasAttribute('data-share-ignore'))
    });
  }catch(error){
    console.error('[Distance share] map capture failed:',error);
    throw new Error('No se pudo convertir el mapa en imagen. Comprobá la conexión y volvé a intentarlo.');
  }
  const toBlob=(source:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>source.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo generar la imagen.')),'image/jpeg',quality));
  let blob=await toBlob(canvas,.84);
  if(blob.size<=1900000)return blob;
  const reduced=document.createElement('canvas');
  const ratio=Math.min(1,1300/canvas.width);
  reduced.width=Math.max(1,Math.round(canvas.width*ratio));
  reduced.height=Math.max(1,Math.round(canvas.height*ratio));
  const context=reduced.getContext('2d');
  if(!context)throw new Error('No se pudo comprimir la imagen.');
  context.drawImage(canvas,0,0,reduced.width,reduced.height);
  blob=await toBlob(reduced,.70);
  if(blob.size>2000000)throw new Error('La imagen del mapa supera el tamaño permitido. Reducí el zoom e intentá nuevamente.');
  return blob;
}
export async function uploadDistanceShareImage(blob:Blob):Promise<string>{const token=localStorage.getItem('community_chat_identity_token')||'';if(!token)throw new Error('Validá tu SD o indicativo antes de compartir.');const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=()=>reject(new Error('No se pudo leer la imagen.'));r.readAsDataURL(blob);});const response=await fetch('/api/distance-share',{method:'POST',headers:{'Content-Type':'application/json','x-identity-token':token},body:JSON.stringify({imageBase64:base64})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error(data.error||'No se pudo guardar la imagen.');return data.url;}
function identity(){return{callsign:String(localStorage.getItem('community_chat_active_callsign')||localStorage.getItem('community_chat_sd')||'').trim().toUpperCase(),token:String(localStorage.getItem('community_chat_identity_token')||'').trim()};}
export async function sendDistanceImageToCommunity(url:string){if(!supabase)throw new Error('El chat general no está disponible.');const {callsign,token}=identity();const {data,error}=await supabase.rpc('post_community_message',{p_callsign:callsign,p_token:token,p_body:'[[DISTANCE_IMAGE:'+url+']]',p_reply_to_callsign:null});if(error||!data?.ok)throw new Error('No se pudo enviar la imagen al chat general.');}
export async function sendDistanceImageToPrivate(url:string,recipient:string){if(!supabase)throw new Error('Los mensajes privados no están disponibles.');const {callsign,token}=identity();const {data,error}=await supabase.rpc('send_community_private_message',{p_callsign:callsign,p_token:token,p_recipient_callsign:recipient,p_body:'[[DISTANCE_IMAGE:'+url+']]'});if(error||!data?.ok)throw new Error(data?.reason==='recipient_not_found'?`${recipient.trim().toUpperCase()} no es usuario registrado de LogBook eQSL EXPRESS. No se puede enviar un mensaje privado a este indicativo.`:'No se pudo enviar la imagen al chat privado.');}
