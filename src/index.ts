import { Store } from './store';
import { createApp } from './app';
let fetchHandler: (request: Request) => Response | Promise<Response>;
if (process.env.DATABASE_URL) {
  const [{ PostgisRepository }, { createCommonApp }] = await Promise.all([
    import('./common/postgis'), import('./common/app'),
  ]);
  const repository = new PostgisRepository(process.env.DATABASE_URL);
  await repository.initialize();
  fetchHandler = createCommonApp(repository).fetch;
} else {
  const store = new Store(process.env.DB_PATH ?? './data/ireland.prototype.sqlite');
  fetchHandler = createApp(store).fetch;
}
export default {hostname:process.env.HOST ?? '127.0.0.1',port:Number(process.env.PORT??3000),fetch:fetchHandler};
