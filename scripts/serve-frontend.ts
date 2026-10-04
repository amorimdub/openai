import { resolve, sep } from 'node:path';
const distRoot=resolve(process.env.FRONTEND_DIST??'src/frontend/dist');
const upstream=process.env.API_URL??'http://127.0.0.1:3080';
Bun.serve({hostname:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??5173),maxRequestBodySize:300*1024,
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
   const target=new URL(upstream);target.pathname=url.pathname.slice(4)||'/';target.search=url.search;
   const headers=new Headers(request.headers);headers.delete('host');headers.delete('content-length');
   try{return await fetch(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),signal:AbortSignal.timeout(65000)});}catch{return Response.json({error:'backend_unavailable'},{status:502});}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let path:string;try{path=resolve(distRoot,'.'+decodeURIComponent(url.pathname));}catch{return new Response('Invalid path',{status:400});}
  if(path!==distRoot&&!path.startsWith(distRoot+sep))return new Response('Not found',{status:404});
  const file=Bun.file(path);if(path!==distRoot&&await file.exists())return new Response(request.method==='HEAD'?null:file,{headers:{'content-type':file.type,'cache-control':'public, max-age=3600'}});
  return new Response(request.method==='HEAD'?null:Bun.file(resolve(distRoot,'index.html')),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 }
});
console.log(`React frontend ready on ${process.env.PORT??5173}`);
