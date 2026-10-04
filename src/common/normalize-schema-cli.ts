import { z } from 'zod';
import { commonManifestSchema, commonRecordSchema } from './schema';
for(const [name,schema] of Object.entries({record:commonRecordSchema,manifest:commonManifestSchema})) {
  await Bun.write(`schemas/common-${name}.schema.json`,JSON.stringify(z.toJSONSchema(schema),null,2)+'\n');
}
