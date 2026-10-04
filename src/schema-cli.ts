import { z } from 'zod';
import { recordSchema, manifestSchema, preferencesSchema } from './schema';
for (const [name,schema] of Object.entries({record:recordSchema,manifest:manifestSchema,preferences:preferencesSchema})) {
  await Bun.write(`schemas/${name}.schema.json`,JSON.stringify(z.toJSONSchema(schema),null,2)+'\n');
}
