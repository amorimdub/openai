import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { Store } from './store';
import { criteriaRegistry, parsePreferences, layers, assess } from './engine';
export function createApp(store: Store) {
  const app=new Hono();
  app.use('*',bodyLimit({maxSize:256*1024}));
  app.onError((error,c)=>{
    if (error instanceof ZodError) return c.json({error:'invalid_request',issues:error.issues},400);
    if (error instanceof SyntaxError || error.message.startsWith('Unknown criterion:') || error.message.includes('incompatible with')) return c.json({error:'invalid_request',message:error.message},400);
    console.error('Backend error:',error.name);
    return c.json({error:'internal_error'},500);
  });
  app.get('/health',c=>c.json({status:'ok',version:1,mode:'local_backend_prototype'}));
  app.get('/criteria',c=>c.json(criteriaRegistry));
  app.get('/data-status',c=>c.json({version:1,totalRecords:store.records().length,sources:store.manifests(),missingDataMeans:'unknown_not_absent'}));
  app.get('/places',c=>{
    const q=(c.req.query('q')??'').toLocaleLowerCase(), raw=store.records('place').filter(r=>r.name.toLocaleLowerCase().includes(q));
    return c.json({version:1,total:raw.length,truncated:raw.length>100,places:raw.slice(0,100),coverage:'CSO urban areas are not all rural localities.'});
  });
  app.get('/market-context',c=>{
    const placeId=c.req.query('placeId');
    if(!placeId) return c.json({error:'placeId_required'},400);
    return c.json({version:1,records:store.records('market_context').filter(r=>r.kind==='market_context' && r.attributes.placeId===placeId),evidenceStatus:'context_only',limitation:'Area statistics do not prove dwelling availability or affordability.'});
  });
  app.post('/layers',async c=>c.json(layers(store,parsePreferences(await c.req.json()))));
  app.post('/assess',async c=>c.json(assess(store,parsePreferences(await c.req.json()))));
  return app;
}
