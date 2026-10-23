# Puente de perfil QRZ abierto → LogBook eQSL Express

Este bookmarklet solo lee texto y enlaces **visibles en la página QRZ que el usuario ya abrió**. No lee cookies, no envía credenciales, no hace peticiones a endpoints privados y no intenta mostrar datos ocultos. Si el email está oculto por QRZ, se importa el indicativo y el nombre si están visibles, sin inventar el correo.

## Instalación manual como marcador

1. En el navegador, crea un marcador/favorito cualquiera.
2. Edita el marcador y ponle el nombre **Enviar perfil QRZ a LogBook**.
3. En el campo URL/dirección, pega la línea completa que empieza con `javascript:` de abajo.
4. Guarda el marcador. En algunos navegadores móviles es más fácil crear primero el marcador y luego editarlo desde la lista de favoritos.

## Uso

1. Inicia sesión en QRZ.com en el mismo navegador.
2. Abre la ficha del indicativo que estás registrando.
3. Pulsa el marcador **Enviar perfil QRZ a LogBook**.
4. Se abrirá LogBook con el indicativo y los datos visibles encontrados. Verifica el correo antes de guardar el QSO.

## Bookmarklet

```text
javascript:(()=>{try{const p=location.pathname.match(/\/db\/([^/?#]+)/i);const call=(p?.[1]||"").toUpperCase();if(!/^[A-Z0-9/]{3,20}$/.test(call)){alert("Abrí primero el perfil de un indicativo en QRZ.com.");return}const root=document.querySelector("main")||document.querySelector("#content")||document.body;const norm=s=>(s||"").replace(/\s+/g," ").trim();const valid=s=>/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(s||"");const emails=new Set;const nodes=[...root.querySelectorAll("td,th,dt,dd,div,span,li,p")];for(const el of nodes){const t=norm(el.innerText||el.textContent);if(!/^e-?mail\s*:?(?:\s|$)/i.test(t))continue;let n=el;for(let i=0;i<3&&n;i++,n=n.parentElement){const row=norm(n.innerText||n.textContent);for(const a of n.querySelectorAll('a[href^="mailto:"]')){const e=decodeURIComponent(a.getAttribute("href").replace(/^mailto:/i,"").split("?")[0]).trim();if(valid(e))emails.add(e)}for(const m of row.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[])if(valid(m))emails.add(m);if(emails.size)break}if(emails.size)break}let email="";if(emails.size===1)email=[...emails][0];else if(emails.size>1)email=prompt("Hay varios correos visibles. Pegá el que corresponde al perfil "+call+" (o dejá vacío):",[...emails][0])||"";const heads=[...root.querySelectorAll("h1,h2")].map(e=>norm(e.innerText||e.textContent)).find(s=>s.toUpperCase().includes(call)&&s.length<120)||"";const name=heads.replace(new RegExp(call,"ig")," ").replace(/[|,:-]+/g," ").replace(/\s+/g," ").trim();const url="https://logbook-eqsl-express-lu-1-tsb.vercel.app/#qrz_call="+encodeURIComponent(call)+"&qrz_email="+encodeURIComponent(email)+"&qrz_name="+encodeURIComponent(name);if(!email)alert("No encontré un correo visible junto al campo Email. Se pasará solo el indicativo y el nombre, sin inventar dirección.");window.open(url,"_blank","noopener");}catch(e){alert("No se pudo leer el perfil visible de QRZ: "+e.message)}})();
```

## Limitaciones

- Funciona solo si el navegador permite ejecutar bookmarklets.
- Solo puede transferir datos que estén visibles en la ficha QRZ abierta.
- No elude suscripciones ni restricciones de QRZ.
- El puente usa el fragmento de URL (#) para transferir el correo; ese fragmento no se envía al servidor web. Evita usarlo en dispositivos compartidos y verifica el destino antes de guardar.
- La aplicación debe estar publicada con soporte para los parámetros del fragmento `#qrz_call`, `#qrz_email` y `#qrz_name` para que la importación funcione.
