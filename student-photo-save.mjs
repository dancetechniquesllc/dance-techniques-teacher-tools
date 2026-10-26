const confirmedRequest = async request => {
 let timer;
 try {return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Photo saving timed out. Keep this page open and retry.')),20000);})]);}
 finally {clearTimeout(timer);}
};
// Confirm the durable path, not a temporary preview or expiring signed URL.
export async function uploadStudentPhoto(client, studentId, dataUrl, {fetchImpl=globalThis.fetch,createId=()=>globalThis.crypto.randomUUID()}={}) {
 if (!client || !/^[0-9a-f-]{36}$/i.test(studentId||'') || !/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl||'')) throw new Error('Open this dancer’s connected profile before saving a photo.');
 const before=await confirmedRequest(client.from('students').select('id,photo_path').eq('id',studentId).single());
 if(before.error || before.data?.id!==studentId) throw new Error('The photo was not saved. Reconnect and try again.');
 const response=await fetchImpl(dataUrl);if(!response.ok)throw new Error('The selected photo could not be read.');
 const blob=await response.blob();if(!blob.size || blob.size>5*1024*1024)throw new Error('Choose a photo smaller than 5 MB.');
 const suffix=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[blob.type];if(!suffix)throw new Error('Choose a JPG, PNG or WebP photo.');
 const path=`${studentId}/${createId()}.${suffix}`;
 const uploaded=await confirmedRequest(client.storage.from('student-photos').upload(path,blob,{contentType:blob.type,upsert:false}));
 if(uploaded.error || uploaded.data?.path!==path)throw new Error('The photo was not uploaded. Keep this page open and retry.');
 let update=client.from('students').update({photo_path:path}).eq('id',studentId);
 update=before.data.photo_path==null ? update.is('photo_path',null) : update.eq('photo_path',before.data.photo_path);
 const attached=await confirmedRequest(update.select('id,photo_path').single());
 if(attached.error || attached.data?.id!==studentId || attached.data.photo_path!==path)throw new Error('The photo could not be attached. Another save may have changed this profile; retry to keep this photo.');
 const verified=await confirmedRequest(client.from('students').select('id,photo_path').eq('id',studentId).single());
 if(verified.error || verified.data?.photo_path!==path)throw new Error('Photo confirmation failed. Keep this page open and retry.');
 return {path};
}
