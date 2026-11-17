// Windows PDF native dependencies are isolated in an OS process: a native
// crash must not terminate the acquisition parent or its later source checks.
import { normalize, chunkUnits } from './normalize.mjs';
process.once('message', async ({bytes,source,retrievedAt,rawHash}) => {
  try {
    const normalized=await normalize(Buffer.from(bytes),source);
    const chunks=chunkUnits(normalized,source,retrievedAt,rawHash);
    process.send({ok:true,result:{normalized,chunks}});
  } catch(error) {
    process.send({ok:false,code:error?.code==='normalization_limit_exceeded'?error.code:'source_processing_failed'});
  }
});
